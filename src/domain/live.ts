import { getScenario } from './fixtures.ts';
import { cspStateText, formatDuration, hstsStateText, LIVE_TEXT } from './liveText.ts';
import type { CspState, HstsState, PolicyFacts, ReferrerState, XctoState } from './liveText.ts';
import { CHECK_HEADERS, LIVE_SCENARIO_ID } from './types.ts';
import type { AppState, CaseRecord, CheckId, Configuration, Finding, FindingText, LiveCheck, Scenario, Severity } from './types.ts';

export const LIVE_FINDING_IDS = ['live-hsts', 'live-csp', 'live-xcto', 'live-referrer'] as const;
const ONE_DAY = 86400;

/** Browsers act on the first header when several are folded into one comma-separated value. */
const first = (value: string) => value.split(',')[0]!.trim();

/** The single max-age in seconds, or null when the header is missing or not a valid policy. */
export function hstsSeconds(value: string | null): number | null {
  if (value === null) return null;
  const maxAges = first(value)
    .split(';')
    .map((d) => d.trim())
    .filter((d) => /^max-age\s*=/i.test(d))
    .map((d) => /^max-age\s*=\s*"?(\d+)"?$/i.exec(d)?.[1]);
  if (maxAges.length !== 1 || maxAges[0] === undefined) return null;
  return Number(maxAges[0]);
}

export function classifyHsts(value: string | null, finalUrl: string): HstsState {
  if (!finalUrl.toLowerCase().startsWith('https:')) return 'httpOnly';
  if (value === null) return 'absent';
  const seconds = hstsSeconds(value);
  if (seconds === null) return 'invalid';
  if (seconds === 0) return 'disabled';
  return seconds < ONE_DAY ? 'short' : 'ok';
}

const BROAD_SOURCES = new Set(['*', 'http:', 'https:', 'data:', 'blob:', "'unsafe-inline'"]);

function directivesOf(policy: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().toLowerCase().split(/\s+/);
    if (name && !directives.has(name)) directives.set(name, sources);
  }
  return directives;
}

function scriptSources(policy: string): string[] | undefined {
  const directives = directivesOf(policy);
  return directives.get('script-src') ?? directives.get('default-src');
}

/** A policy restricts scripts when its effective script directive exists and allows none of the broad sources above. */
function restrictsScripts(policy: string): boolean {
  const sources = scriptSources(policy);
  if (!sources || sources.length === 0) return false;
  // Nonces, hashes and 'strict-dynamic' make browsers ignore 'unsafe-inline'.
  const inlineIgnored = sources.some((s) => /^'(nonce-|sha256-|sha384-|sha512-|strict-dynamic')/.test(s));
  return !sources.some((s) => BROAD_SOURCES.has(s) && !(inlineIgnored && s === "'unsafe-inline'"));
}

function hasScriptDirective(policy: string): boolean {
  const sources = scriptSources(policy);
  return Boolean(sources && sources.length > 0);
}

const policiesOf = (value: string) =>
  value
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

export interface CspRead {
  state: CspState;
  facts: PolicyFacts;
}

/** Multiple CSP header values are comma-joined and all apply. A script limit in any of them restricts scripts. */
export function readCsp(csp: string | null, reportOnly: string | null): CspRead {
  const enforced = csp === null ? [] : policiesOf(csp);
  const reporting = reportOnly === null ? [] : policiesOf(reportOnly);
  const relevant = enforced.length > 0 ? enforced : reporting;
  const facts: PolicyFacts = {
    frameAncestors: relevant.some((p) => directivesOf(p).has('frame-ancestors')),
    reports: relevant.some((p) => {
      const directives = directivesOf(p);
      return directives.has('report-uri') || directives.has('report-to');
    }),
    broadScripts: relevant.some((p) => hasScriptDirective(p) && !restrictsScripts(p)),
  };
  if (enforced.length === 0) {
    if (reporting.length === 0) return { state: 'absent', facts: { frameAncestors: false, reports: false, broadScripts: false } };
    return { state: reporting.some(restrictsScripts) ? 'reportOnlyScripts' : 'reportOnlyOther', facts };
  }
  if (enforced.some(restrictsScripts)) return { state: 'ok', facts };
  if (enforced.some(hasScriptDirective)) return { state: 'permissive', facts };
  return { state: 'noScript', facts };
}

export function classifyCsp(csp: string | null, reportOnly: string | null): CspState {
  return readCsp(csp, reportOnly).state;
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
  /** A question only when the charity can change the site. A missing low-value header is recorded and is not a question. */
  reviewRequired: boolean;
}

const ROUTINE: Assessment = { configuration: 'expected', severity: 'none', reviewRequired: false };
const NOTED: Assessment = { configuration: 'noted', severity: 'none', reviewRequired: false };
const QUESTION = (configuration: Configuration, severity: Severity): Assessment => ({
  configuration,
  severity,
  reviewRequired: true,
});

const HSTS: Record<HstsState, Assessment> = {
  httpOnly: QUESTION('concern', 'undetermined'),
  absent: QUESTION('absent', 'undetermined'),
  disabled: QUESTION('concern', 'undetermined'),
  short: QUESTION('concern', 'low'),
  invalid: QUESTION('concern', 'undetermined'),
  ok: ROUTINE,
};
const CSP: Record<CspState, Assessment> = {
  reportOnlyScripts: QUESTION('concern', 'undetermined'),
  reportOnlyOther: NOTED,
  noScript: NOTED,
  absent: QUESTION('absent', 'undetermined'),
  permissive: QUESTION('concern', 'undetermined'),
  ok: ROUTINE,
};
const XCTO: Record<XctoState, Assessment> = {
  absent: { configuration: 'absent', severity: 'none', reviewRequired: false },
  invalid: QUESTION('concern', 'low'),
  ok: ROUTINE,
};
const REFERRER: Record<ReferrerState, Assessment> = {
  absent: { configuration: 'absent', severity: 'none', reviewRequired: false },
  unsafe: QUESTION('concern', 'undetermined'),
  invalid: { configuration: 'concern', severity: 'none', reviewRequired: false },
  ok: ROUTINE,
};

function stateCopy(
  lang: 'en' | 'zh-HK',
  check: CheckId,
  state: string,
  duration: string,
  facts: PolicyFacts,
): Pick<FindingText, 'meaning' | 'rationale' | 'request' | 'dependencies'> {
  if (check === 'hsts' && (state === 'ok' || state === 'short')) return hstsStateText(lang, state, duration);
  if (check === 'csp' && (state === 'reportOnlyScripts' || state === 'reportOnlyOther' || state === 'noScript')) {
    return cspStateText(lang, state, facts);
  }
  const checkText = LIVE_TEXT[lang][check] as {
    states: Record<string, Pick<FindingText, 'meaning' | 'rationale' | 'request' | 'dependencies'>>;
  };
  return checkText.states[state]!;
}

function finding(
  check: CheckId,
  state: string,
  assessment: Assessment,
  evidence: string | null,
  live: LiveCheck,
  duration: string,
  facts: PolicyFacts,
): Finding {
  const textFor = (lang: 'en' | 'zh-HK') => {
    const checkText = LIVE_TEXT[lang][check];
    return {
      pageContext: LIVE_TEXT[lang].pageContext(live.finalUrl, live.status, live.redirects),
      significance: checkText.significance,
      limits: checkText.limits,
      ...stateCopy(lang, check, state, duration, facts),
    };
  };
  return {
    id: `live-${check}`,
    check,
    evidence,
    configuration: assessment.configuration,
    reviewRequired: assessment.reviewRequired,
    severity: assessment.severity,
    activities: [],
    text: { en: textFor('en'), 'zh-HK': textFor('zh-HK') },
  };
}

const line = (name: string, value: string | null) => (value === null ? null : `${name}: ${value}`);

const EMPTY_FACTS: PolicyFacts = { frameAncestors: false, reports: false, broadScripts: false };

export function liveFindings(live: LiveCheck): Finding[] {
  const h = live.headers;
  const hsts = classifyHsts(h.hsts, live.finalUrl);
  const csp = readCsp(h.csp, h.cspReportOnly);
  const xcto = classifyXcto(h.xcto);
  const referrer = classifyReferrer(h.referrer);
  const seconds = hstsSeconds(h.hsts);
  const duration = (lang: 'en' | 'zh-HK') => (seconds === null ? '' : formatDuration(seconds, lang));
  const cspEvidence =
    csp.state === 'reportOnlyScripts' || csp.state === 'reportOnlyOther'
      ? line(`${CHECK_HEADERS.csp}-Report-Only`, h.cspReportOnly)
      : line(CHECK_HEADERS.csp, h.csp);
  const one = (
    check: CheckId,
    state: string,
    assessment: Assessment,
    evidence: string | null,
    facts: PolicyFacts,
  ): Finding => {
    const built = finding(check, state, assessment, evidence, live, '', facts);
    if (check !== 'hsts' || (state !== 'ok' && state !== 'short')) return built;
    const named = state === 'short' ? 'short' : 'ok';
    return {
      ...built,
      text: {
        en: { ...built.text.en, ...hstsStateText('en', named, duration('en')) },
        'zh-HK': { ...built.text['zh-HK'], ...hstsStateText('zh-HK', named, duration('zh-HK')) },
      },
    };
  };
  return [
    one('hsts', hsts, HSTS[hsts], line(CHECK_HEADERS.hsts, h.hsts), EMPTY_FACTS),
    one('csp', csp.state, CSP[csp.state], cspEvidence, csp.facts),
    one('xcto', xcto, XCTO[xcto], line(CHECK_HEADERS.xcto, h.xcto), EMPTY_FACTS),
    one('referrer', referrer, REFERRER[referrer], line(CHECK_HEADERS.referrer, h.referrer), EMPTY_FACTS),
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
