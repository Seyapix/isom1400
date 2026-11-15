import { FIXTURE_IDS, getScenario } from './fixtures.ts';
import { LIVE_FINDING_IDS } from './live.ts';
import {
  ACTION_STATUSES,
  ACTIVITIES,
  CHANGE_MANAGERS,
  LANGS,
  LIVE_SCENARIO_ID,
  RECHECK_OUTCOMES,
  SCREENS,
  SITE_CONTROLS,
  SUPPORT_LEVELS,
} from './types.ts';
import type { ActionRecord, AppState, CaseRecord, HandoverRecord, Lang, LiveCheck, ObservedHeaders, ScenarioId, SiteControl } from './types.ts';
import { NAME_MAX, TEXT_MAX, validateExampleUrl } from './validation.ts';

export const STORAGE_PREFIX = 'isom1400.charityWorkspace';
export const STORAGE_KEY = `${STORAGE_PREFIX}.state`;
export const STATE_VERSION = 3;
const SCENARIO_IDS: readonly ScenarioId[] = [...FIXTURE_IDS, LIVE_SCENARIO_ID];
const HEADER_MAX = 4000;
const PROBE_KEY = `${STORAGE_PREFIX}.probe`;

export function initialState(uiLanguage: Lang = 'en'): AppState {
  return { version: STATE_VERSION, uiLanguage, screen: 'intake', case: null, actions: {}, drafts: {}, handover: {} };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max = TEXT_MAX): v is string => typeof v === 'string' && v.length <= max;
const isDateOrEmpty = (v: unknown) => v === '' || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v));
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && list.includes(v as T);

const isHeader = (v: unknown) => v === null || isStr(v, HEADER_MAX);
const isTimestamp = (v: unknown) => isStr(v, 40) && !Number.isNaN(Date.parse(v));

export function readLiveCheck(v: unknown): LiveCheck | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isObj(v.headers)) return undefined;
  const h = v.headers;
  const ok =
    isStr(v.requestedUrl) &&
    validateExampleUrl(v.requestedUrl) === null &&
    isStr(v.finalUrl) &&
    /^https?:\/\//i.test(v.finalUrl) &&
    Number.isInteger(v.status) &&
    (v.status as number) >= 100 &&
    (v.status as number) <= 599 &&
    Number.isInteger(v.redirects) &&
    (v.redirects as number) >= 0 &&
    (v.redirects as number) <= 10 &&
    isTimestamp(v.checkedAt) &&
    isHeader(h.hsts) &&
    isHeader(h.csp) &&
    isHeader(h.cspReportOnly) &&
    isHeader(h.xcto) &&
    isHeader(h.referrer);
  if (!ok) return undefined;
  const headers: ObservedHeaders = {
    hsts: h.hsts as string | null,
    csp: h.csp as string | null,
    cspReportOnly: h.cspReportOnly as string | null,
    xcto: h.xcto as string | null,
    referrer: h.referrer as string | null,
  };
  return {
    requestedUrl: v.requestedUrl as string,
    finalUrl: v.finalUrl as string,
    status: v.status as number,
    redirects: v.redirects as number,
    checkedAt: v.checkedAt as string,
    headers,
  };
}

/** Version 1 cases predate the live check and simply have none. */
function readCase(v: unknown, version: number): CaseRecord | null | undefined {
  if (v === null) return null;
  if (!isObj(v)) return undefined;
  const activities = v.activities;
  const ok =
    isStr(v.id, 64) &&
    v.id.length > 0 &&
    isStr(v.createdAt, 40) &&
    isStr(v.displayName, NAME_MAX) &&
    v.displayName.trim().length > 0 &&
    isStr(v.exampleUrl) &&
    validateExampleUrl(v.exampleUrl) === null &&
    oneOf(LANGS, v.language) &&
    Array.isArray(activities) &&
    activities.length > 0 &&
    activities.every((a) => oneOf(ACTIVITIES, a)) &&
    new Set(activities).size === activities.length &&
    oneOf(CHANGE_MANAGERS, v.changeManager) &&
    oneOf(SUPPORT_LEVELS, v.support) &&
    (v.siteControl === undefined || oneOf(SITE_CONTROLS, v.siteControl)) &&
    v.acknowledged === true &&
    (v.scenarioId === null || oneOf(SCENARIO_IDS, v.scenarioId));
  if (!ok) return undefined;
  const storedCheck = version === 1 ? null : readLiveCheck(v.liveCheck);
  if (storedCheck === undefined) return undefined;
  const liveCheck = storedCheck?.requestedUrl === new URL((v.exampleUrl as string).trim()).href ? storedCheck : null;
  return {
    id: v.id as string,
    createdAt: v.createdAt as string,
    displayName: v.displayName as string,
    exampleUrl: v.exampleUrl as string,
    language: v.language as Lang,
    activities: [...(activities as CaseRecord['activities'])],
    siteControl: (v.siteControl === undefined ? 'unsure' : v.siteControl) as SiteControl,
    changeManager: v.changeManager as CaseRecord['changeManager'],
    support: v.support as CaseRecord['support'],
    acknowledged: true,
    scenarioId: v.scenarioId === LIVE_SCENARIO_ID && !liveCheck ? null : (v.scenarioId as ScenarioId | null),
    liveCheck,
  };
}

function readAction(v: unknown): ActionRecord | undefined {
  if (!isObj(v)) return undefined;
  const ok =
    oneOf(ACTION_STATUSES, v.status) &&
    isStr(v.role) &&
    isStr(v.notes) &&
    isDateOrEmpty(v.followUpDate) &&
    isStr(v.deferralReason) &&
    isDateOrEmpty(v.recheckDate) &&
    isStr(v.recheckEvidence) &&
    (v.recheckOutcome === '' || oneOf(RECHECK_OUTCOMES, v.recheckOutcome)) &&
    isStr(v.updatedAt, 40);
  if (!ok) return undefined;
  if (v.status === 'deferred' && !(v.deferralReason as string).trim()) return undefined;
  if (v.status === 'rechecked' && (!v.recheckDate || !(v.recheckEvidence as string).trim() || !v.recheckOutcome)) {
    return undefined;
  }
  return {
    status: v.status as ActionRecord['status'],
    role: v.role as string,
    notes: v.notes as string,
    followUpDate: v.followUpDate as string,
    deferralReason: v.deferralReason as string,
    recheckDate: v.recheckDate as string,
    recheckEvidence: v.recheckEvidence as string,
    recheckOutcome: v.recheckOutcome as ActionRecord['recheckOutcome'],
    updatedAt: v.updatedAt as string,
  };
}

/** Accepts keys only for the stored case and for findings that exist in the named scenario. */
function ownedKey(key: string, caseId: string, parts: 2 | 3, lastPart?: (scenarioId: ScenarioId, last: string) => boolean) {
  const segments = key.split('|');
  if (segments.length !== parts || segments[0] !== caseId) return false;
  const scenarioId = segments[1];
  if (!oneOf(SCENARIO_IDS, scenarioId)) return false;
  return parts === 2 || (lastPart?.(scenarioId, segments[2]!) ?? false);
}

export type ParseResult = { ok: true; state: AppState } | { ok: false; reason: 'json' | 'version' | 'shape' };

export function parseState(raw: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'json' };
  }
  if (!isObj(data)) return { ok: false, reason: 'shape' };
  if (data.version !== 1 && data.version !== 2 && data.version !== STATE_VERSION) return { ok: false, reason: 'version' };
  const caseRecord = readCase(data.case, data.version);
  if (caseRecord === undefined || !oneOf(LANGS, data.uiLanguage) || !oneOf(SCREENS, data.screen)) {
    return { ok: false, reason: 'shape' };
  }
  if (!isObj(data.actions) || !isObj(data.drafts) || !isObj(data.handover)) return { ok: false, reason: 'shape' };

  const state = initialState(data.uiLanguage);
  state.case = caseRecord;
  state.screen = caseRecord ? data.screen : 'intake';
  if (!caseRecord) return { ok: true, state };

  const findingExists = (scenarioId: ScenarioId, findingId: string) =>
    scenarioId === LIVE_SCENARIO_ID
      ? (LIVE_FINDING_IDS as readonly string[]).includes(findingId)
      : (getScenario(scenarioId)?.findings.some((f) => f.id === findingId) ?? false);

  for (const [key, value] of Object.entries(data.actions)) {
    const action = readAction(value);
    if (!action) return { ok: false, reason: 'shape' };
    if (ownedKey(key, caseRecord.id, 3, findingExists)) state.actions[key] = action;
  }
  for (const [key, value] of Object.entries(data.drafts)) {
    if (!isStr(value, TEXT_MAX * 4)) return { ok: false, reason: 'shape' };
    if (ownedKey(key, caseRecord.id, 3, (_s, lang) => oneOf(LANGS, lang))) state.drafts[key] = value;
  }
  for (const [key, value] of Object.entries(data.handover)) {
    if (!isObj(value) || !isStr(value.flowTester) || !isStr(value.recordKeeper)) return { ok: false, reason: 'shape' };
    const record: HandoverRecord = { flowTester: value.flowTester, recordKeeper: value.recordKeeper };
    if (ownedKey(key, caseRecord.id, 2)) state.handover[key] = record;
  }
  return { ok: true, state };
}

export interface KeyValueStore {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LoadIssue = 'unreadable' | null;

export interface StorageAdapter {
  readonly mode: 'local' | 'memory';
  load(): { state: AppState; issue: LoadIssue };
  /** Returns false when the write failed; the caller then continues in memory. */
  save(state: AppState): boolean;
  clear(): void;
}

function memoryAdapter(): StorageAdapter {
  return {
    mode: 'memory',
    load: () => ({ state: initialState(), issue: null }),
    save: () => true,
    clear: () => {},
  };
}

export function createStorage(resolve: () => KeyValueStore | undefined | null): StorageAdapter {
  let store: KeyValueStore | undefined | null;
  try {
    store = resolve();
    store?.setItem(PROBE_KEY, '1');
    store?.removeItem(PROBE_KEY);
  } catch {
    store = null;
  }
  if (!store) return memoryAdapter();
  const local = store;

  return {
    mode: 'local',
    load() {
      let raw: string | null;
      try {
        raw = local.getItem(STORAGE_KEY);
      } catch {
        return { state: initialState(), issue: 'unreadable' };
      }
      if (raw === null) return { state: initialState(), issue: null };
      const result = parseState(raw);
      return result.ok ? { state: result.state, issue: null } : { state: initialState(), issue: 'unreadable' };
    },
    save(state) {
      try {
        local.setItem(STORAGE_KEY, JSON.stringify(state));
        return true;
      } catch {
        return false;
      }
    },
    clear() {
      const owned: string[] = [];
      for (let i = 0; i < local.length; i += 1) {
        const key = local.key(i);
        if (key !== null && (key === STORAGE_PREFIX || key.startsWith(`${STORAGE_PREFIX}.`))) owned.push(key);
      }
      for (const key of owned) local.removeItem(key);
    },
  };
}
