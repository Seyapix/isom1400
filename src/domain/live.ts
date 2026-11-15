import { getScenario } from './fixtures.ts';
import { LIVE_TEXT } from './liveText.ts';
import type { CspState, HstsState, ReferrerState, XctoState } from './liveText.ts';
import { CHECK_HEADERS, LIVE_SCENARIO_ID } from './types.ts';
import type { Activity, AppState, CaseRecord, CheckId, Configuration, Finding, FindingText, LiveCheck, Scenario, Severity } from './types.ts';

export const LIVE_FINDING_IDS = ['live-hsts', 'live-csp', 'live-xcto', 'live-referrer'] as const;
const ONE_DAY = 86400;

/** Browsers act on the first header when several are folded into one comma-separated value. */
const first = (value: string) => value.split(',')[0]!.trim();

export function classifyHsts(value: string | null, finalUrl: string): HstsState {
  if (!finalUrl.toLowerCase().startsWith('https:')) return 'httpOnly';
  if (value === null) return 'absent';
  const maxAges = first(value)
    .split(';')
    .map((d) => d.trim())
    .filter((d) => /^max-age\s*=/i.test(d))
    .map((d) => /^max-age\s*=\s*"?(\d+)"?$/i.exec(d)?.[1]);
  if (maxAges.length !== 1 || maxAges[0] === undefined) return 'invalid';
  const seconds = Number(maxAges[0]);
  if (seconds === 0) return 'disabled';
  return seconds < ONE_DAY ? 'short' : 'ok';
}

const BROAD_SOURCES = new Set(['*', 'http:', 'https:', 'data:', 'blob:', "'unsafe-inline'"]);

/** A policy restricts scripts when its effective script directive exists and allows none of the broad sources above. */
function restrictsScripts(policy: string): boolean {
  const directives = new Map<string, string[]>();
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().toLowerCase().split(/\s+/);
    if (name && !directives.has(name)) directives.set(name, sources);
  }
  const sources = directives.get('script-src') ?? directives.get('default-src');
  if (!sources || sources.length === 0) return false;
  // Nonces, hashes and 'strict-dynamic' make browsers ignore 'unsafe-inline'.
  const inlineIgnored = sources.some((s) => /^'(nonce-|sha256-|sha384-|sha512-|strict-dynamic')/.test(s));
  return !sources.some((s) => BROAD_SOURCES.has(s) && !(inlineIgnored && s === "'unsafe-inline'"));
}

export function classifyCsp(csp: string | null, reportOnly: string | null): CspState {
  if (csp === null) return reportOnly === null ? 'absent' : 'reportOnly';
  return csp.split(',').some(restrictsScripts) ? 'ok' : 'permissive';
}

export function classifyXcto(value: string | null): XctoState {
  if (value === null) return 'absent';
  return first(value).toLowerCase() === 'nosniff' ? 'ok' : 'invalid';
}

const REFERRER_POLICIES = new Set([
  'no-referrer',
  'no-referrer-when-downgrade',
  'origin',
  'origin-when-cross-origin',
  'same-origin',
  'strict-origin',
  'strict-origin-when-cross-origin',
  'unsafe-url',
]);

/** The last recognised token wins, so sites can list a fallback before a newer value. */
export function classifyReferrer(value: string | null): ReferrerState {
  if (value === null) return 'absent';
  const recognised = value
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => REFERRER_POLICIES.has(t));
  const policy = recognised[recognised.length - 1];
  if (!policy) return 'invalid';
  return policy === 'unsafe-url' || policy === 'no-referrer-when-downgrade' ? 'unsafe' : 'ok';
}

interface Assessment {
  configuration: Configuration;
  severity: Severity;
  activities: readonly Activity[];
}

const FORMS: readonly Activity[] = ['donations', 'volunteer', 'enquiries'];
const PAYMENT_AND_SIGNUP: readonly Activity[] = ['donations', 'volunteer'];
const ROUTINE: Assessment = { configuration: 'expected', severity: 'none', activities: [] };

const HSTS: Record<HstsState, Assessment> = {
  httpOnly: { configuration: 'concern', severity: 'undetermined', activities: FORMS },
  absent: { configuration: 'absent', severity: 'undetermined', activities: FORMS },
  disabled: { configuration: 'concern', severity: 'undetermined', activities: FORMS },
  short: { configuration: 'concern', severity: 'low', activities: FORMS },
  invalid: { configuration: 'concern', severity: 'undetermined', activities: FORMS },
  ok: ROUTINE,
};
const CSP: Record<CspState, Assessment> = {
  reportOnly: { configuration: 'concern', severity: 'undetermined', activities: PAYMENT_AND_SIGNUP },
  absent: { configuration: 'absent', severity: 'undetermined', activities: PAYMENT_AND_SIGNUP },
  permissive: { configuration: 'concern', severity: 'undetermined', activities: PAYMENT_AND_SIGNUP },
  ok: ROUTINE,
};
const XCTO: Record<XctoState, Assessment> = {
  absent: { configuration: 'absent', severity: 'low', activities: [] },
  invalid: { configuration: 'concern', severity: 'low', activities: [] },
  ok: ROUTINE,
};
const REFERRER: Record<ReferrerState, Assessment> = {
  absent: { configuration: 'absent', severity: 'low', activities: [] },
  unsafe: { configuration: 'concern', severity: 'undetermined', activities: PAYMENT_AND_SIGNUP },
  invalid: { configuration: 'concern', severity: 'low', activities: [] },
  ok: ROUTINE,
};

function finding(check: CheckId, state: string, assessment: Assessment, evidence: string | null, live: LiveCheck): Finding {
  const textFor = (lang: 'en' | 'zh-HK') => {
    const checkText = LIVE_TEXT[lang][check] as {
      significance: string;
      limits: string;
      states: Record<string, Pick<FindingText, 'meaning' | 'rationale' | 'request' | 'dependencies'>>;
    };
    return {
      pageContext: LIVE_TEXT[lang].pageContext(live.finalUrl, live.status, live.redirects),
      significance: checkText.significance,
      limits: checkText.limits,
      ...checkText.states[state]!,
    };
  };
  return {
    id: `live-${check}`,
    check,
    evidence,
    configuration: assessment.configuration,
    reviewRequired: assessment.configuration !== 'expected',
    severity: assessment.severity,
    activities: assessment.activities,
    text: { en: textFor('en'), 'zh-HK': textFor('zh-HK') },
  };
}

const line = (name: string, value: string | null) => (value === null ? null : `${name}: ${value}`);

export function liveFindings(live: LiveCheck): Finding[] {
  const h = live.headers;
  const hsts = classifyHsts(h.hsts, live.finalUrl);
  const csp = classifyCsp(h.csp, h.cspReportOnly);
  const xcto = classifyXcto(h.xcto);
  const referrer = classifyReferrer(h.referrer);
  const cspEvidence =
    csp === 'reportOnly' ? line(`${CHECK_HEADERS.csp}-Report-Only`, h.cspReportOnly) : line(CHECK_HEADERS.csp, h.csp);
  return [
    finding('hsts', hsts, HSTS[hsts], line(CHECK_HEADERS.hsts, h.hsts), live),
    finding('csp', csp, CSP[csp], cspEvidence, live),
    finding('xcto', xcto, XCTO[xcto], line(CHECK_HEADERS.xcto, h.xcto), live),
    finding('referrer', referrer, REFERRER[referrer], line(CHECK_HEADERS.referrer, h.referrer), live),
  ];
}

export function liveScenario(c: CaseRecord): Scenario | null {
  if (!c.liveCheck) return null;
  return {
    id: LIVE_SCENARIO_ID,
    source: 'live',
    organisation: { en: c.displayName, 'zh-HK': c.displayName },
    focus: c.activities[0] ?? 'information',
    samplePage: c.liveCheck.finalUrl,
    pageLabel: { en: 'Checked address', 'zh-HK': '已檢查的地址' },
    findings: liveFindings(c.liveCheck),
  };
}

/** Removes actions, drafts and handover recorded against an earlier live check of this case. */
export function withoutLive(state: AppState, caseId: string): AppState {
  const prefix = `${caseId}|${LIVE_SCENARIO_ID}|`;
  const keep = <T,>(record: Record<string, T>) =>
    Object.fromEntries(Object.entries(record).filter(([key]) => !key.startsWith(prefix) && key !== prefix.slice(0, -1)));
  return { ...state, actions: keep(state.actions), drafts: keep(state.drafts), handover: keep(state.handover) };
}

/** The scenario the case currently points at: the live check of its address, or a fictional example. */
export function scenarioForCase(c: CaseRecord): Scenario | null {
  return c.scenarioId === LIVE_SCENARIO_ID ? liveScenario(c) : getScenario(c.scenarioId);
}
