export type Lang = 'en' | 'zh-HK';
export const LANGS: readonly Lang[] = ['en', 'zh-HK'];

export type Activity = 'donations' | 'volunteer' | 'enquiries' | 'information';
export const ACTIVITIES: readonly Activity[] = ['donations', 'volunteer', 'enquiries', 'information'];

export type ChangeManager = 'provider' | 'staff' | 'volunteer' | 'unsure';
export const CHANGE_MANAGERS: readonly ChangeManager[] = ['provider', 'staff', 'volunteer', 'unsure'];

export type SupportLevel = 'none' | 'occasional' | 'contract' | 'inhouse';
export const SUPPORT_LEVELS: readonly SupportLevel[] = ['none', 'occasional', 'contract', 'inhouse'];

export type CheckId = 'hsts' | 'csp' | 'xcto' | 'referrer';
/** Fixed check order, used as the final ranking key before stable IDs. */
export const CHECK_ORDER: readonly CheckId[] = ['hsts', 'csp', 'xcto', 'referrer'];

export const CHECK_HEADERS: Record<CheckId, string> = {
  hsts: 'Strict-Transport-Security',
  csp: 'Content-Security-Policy',
  xcto: 'X-Content-Type-Options',
  referrer: 'Referrer-Policy',
};

/** expected: recognised, suitable value. concern: an explicit setting worth reviewing. absent: no header in the sample. */
export type Configuration = 'expected' | 'concern' | 'absent';

/** Qualitative only. A missing header alone never establishes an exploitable weakness. */
export type Severity = 'none' | 'low' | 'moderate' | 'undetermined';

export interface FindingText {
  pageContext: string;
  significance: string;
  limits: string;
  meaning: string;
  rationale: string;
  request: string;
  dependencies: string;
}

export interface Finding {
  id: string;
  check: CheckId;
  /** Literal fictional header line, or null when the header is absent from the sample. */
  evidence: string | null;
  configuration: Configuration;
  reviewRequired: boolean;
  severity: Severity;
  activities: readonly Activity[];
  text: Record<Lang, FindingText>;
}

export type FixtureId = 'harbour-lantern' | 'banyan-neighbours' | 'hillpath-reading';
export type ScenarioId = FixtureId | 'live';
export const LIVE_SCENARIO_ID = 'live';

export interface Scenario {
  id: ScenarioId;
  source: 'fixture' | 'live';
  organisation: Record<Lang, string>;
  focus: Activity;
  samplePage: string;
  pageLabel: Record<Lang, string>;
  findings: readonly Finding[];
}

/** Only these response headers are ever returned by the local check. */
export interface ObservedHeaders {
  hsts: string | null;
  csp: string | null;
  cspReportOnly: string | null;
  xcto: string | null;
  referrer: string | null;
}

export interface LiveCheck {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  redirects: number;
  checkedAt: string;
  headers: ObservedHeaders;
}

export const LIVE_CHECK_ERRORS = [
  'badRequest',
  'invalidUrl',
  'credentials',
  'scheme',
  'port',
  'blockedAddress',
  'dns',
  'timeout',
  'tooManyRedirects',
  'tls',
  'network',
  'busy',
  'unavailable',
] as const;
/** `unavailable` is client-side only: no local endpoint answered, as on a static host. */
export type LiveCheckError = (typeof LIVE_CHECK_ERRORS)[number];

export interface CaseRecord {
  id: string;
  createdAt: string;
  displayName: string;
  exampleUrl: string;
  language: Lang;
  activities: Activity[];
  changeManager: ChangeManager;
  support: SupportLevel;
  acknowledged: true;
  scenarioId: ScenarioId | null;
  /** Most recent check of exampleUrl. Cleared when the address changes. */
  liveCheck: LiveCheck | null;
}

export type ActionStatus = 'awaiting' | 'accepted' | 'deferred' | 'implemented' | 'rechecked';
export const ACTION_STATUSES: readonly ActionStatus[] = ['awaiting', 'accepted', 'deferred', 'implemented', 'rechecked'];

export type RecheckOutcome = 'changed' | 'unchanged' | 'inconclusive';
export const RECHECK_OUTCOMES: readonly RecheckOutcome[] = ['changed', 'unchanged', 'inconclusive'];

export interface ActionRecord {
  status: ActionStatus;
  role: string;
  notes: string;
  followUpDate: string;
  deferralReason: string;
  recheckDate: string;
  recheckEvidence: string;
  recheckOutcome: RecheckOutcome | '';
  updatedAt: string;
}

export interface HandoverRecord {
  flowTester: string;
  recordKeeper: string;
}

export type Screen = 'intake' | 'findings' | 'report' | 'followup';
export const SCREENS: readonly Screen[] = ['intake', 'findings', 'report', 'followup'];

export interface AppState {
  version: 2;
  uiLanguage: Lang;
  screen: Screen;
  case: CaseRecord | null;
  /** Keyed by caseId|scenarioId|findingId. */
  actions: Record<string, ActionRecord>;
  /** Keyed by caseId|scenarioId|lang. Absent means the generated request is shown. */
  drafts: Record<string, string>;
  /** Keyed by caseId|scenarioId. */
  handover: Record<string, HandoverRecord>;
}

export const actionKey = (caseId: string, scenarioId: ScenarioId, findingId: string) =>
  `${caseId}|${scenarioId}|${findingId}`;
export const draftKey = (caseId: string, scenarioId: ScenarioId, lang: Lang) => `${caseId}|${scenarioId}|${lang}`;
export const handoverKey = (caseId: string, scenarioId: ScenarioId) => `${caseId}|${scenarioId}`;
