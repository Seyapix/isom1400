import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStorage, initialState, parseState, STORAGE_KEY } from '../src/domain/storage.ts';

class MemoryStore {
  constructor(entries = {}) {
    this.map = new Map(Object.entries(entries));
  }
  get length() {
    return this.map.size;
  }
  key(i) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    this.map.set(k, String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
}

const caseRecord = {
  id: 'case-1',
  createdAt: '2026-11-15T00:00:00.000Z',
  displayName: 'Harbour Lantern',
  exampleUrl: 'https://charity.example',
  language: 'en',
  activities: ['donations'],
  siteControl: 'charity',
  changeManager: 'provider',
  support: 'none',
  acknowledged: true,
  scenarioId: 'harbour-lantern',
  liveCheck: null,
};

const liveCheck = {
  requestedUrl: 'https://charity.example/',
  finalUrl: 'https://www.charity.example/',
  status: 200,
  redirects: 1,
  checkedAt: '2026-11-15T03:00:00.000Z',
  headers: { hsts: 'max-age=300', csp: null, cspReportOnly: null, xcto: 'nosniff', referrer: null },
};

const action = {
  status: 'deferred',
  role: 'Website provider',
  notes: '',
  followUpDate: '2026-12-01',
  deferralReason: 'Budget review',
  recheckDate: '',
  recheckEvidence: '',
  recheckOutcome: '',
  updatedAt: '2026-11-15T00:00:00.000Z',
};

function stateWith(overrides = {}) {
  return {
    ...initialState('en'),
    screen: 'followup',
    case: caseRecord,
    actions: { 'case-1|harbour-lantern|harbour-csp': action },
    drafts: { 'case-1|harbour-lantern|zh-HK': '草稿' },
    handover: { 'case-1|harbour-lantern': { flowTester: 'Volunteer lead', recordKeeper: 'Coordinator' } },
    ...overrides,
  };
}

test('a saved state round-trips through the adapter', () => {
  const store = new MemoryStore();
  const adapter = createStorage(() => store);
  assert.equal(adapter.mode, 'local');
  assert.equal(adapter.save(stateWith()), true);
  const loaded = adapter.load();
  assert.equal(loaded.issue, null);
  assert.deepEqual(loaded.state, stateWith());
});

test('records for another case, unknown scenarios or unknown findings are dropped', () => {
  const parsed = parseState(
    JSON.stringify(
      stateWith({
        actions: {
          'case-1|harbour-lantern|harbour-csp': action,
          'case-2|harbour-lantern|harbour-csp': action,
          'case-1|harbour-lantern|banyan-csp': action,
          'case-1|nowhere|harbour-csp': action,
        },
        drafts: { 'case-1|harbour-lantern|en': 'ok', 'case-1|harbour-lantern|fr': 'no' },
      }),
    ),
  );
  assert.equal(parsed.ok, true);
  assert.deepEqual(Object.keys(parsed.state.actions), ['case-1|harbour-lantern|harbour-csp']);
  assert.deepEqual(Object.keys(parsed.state.drafts), ['case-1|harbour-lantern|en']);
});

test('unreadable, wrong-version or invalid data is reported and replaced by an empty workspace', () => {
  const bad = [
    '{not json',
    JSON.stringify({ ...stateWith(), version: 4 }),
    JSON.stringify(stateWith({ case: { ...caseRecord, liveCheck: { ...liveCheck, status: 'ok' } } })),
    JSON.stringify(stateWith({ case: { ...caseRecord, liveCheck: { ...liveCheck, headers: { hsts: 1 } } } })),
    JSON.stringify(stateWith({ case: { ...caseRecord, exampleUrl: 'https://u:p@charity.example' } })),
    JSON.stringify(stateWith({ case: { ...caseRecord, acknowledged: false } })),
    JSON.stringify(stateWith({ actions: { 'case-1|harbour-lantern|harbour-csp': { ...action, deferralReason: ' ' } } })),
    JSON.stringify(stateWith({ actions: { 'case-1|harbour-lantern|harbour-csp': { ...action, status: 'rechecked' } } })),
    JSON.stringify([]),
  ];
  for (const raw of bad) {
    const adapter = createStorage(() => new MemoryStore({ [STORAGE_KEY]: raw }));
    const loaded = adapter.load();
    assert.equal(loaded.issue, 'unreadable', raw.slice(0, 60));
    assert.deepEqual(loaded.state, initialState());
  }
});

test('clearing removes only project-owned keys', () => {
  const store = new MemoryStore({
    [STORAGE_KEY]: JSON.stringify(stateWith()),
    'isom1400.charityWorkspace.future': 'x',
    'isom1400.other-project': 'keep',
    'unrelated-key': 'keep',
  });
  createStorage(() => store).clear();
  assert.deepEqual([...store.map.keys()].sort(), ['isom1400.other-project', 'unrelated-key']);
});

test('unavailable or failing storage falls back to memory', () => {
  const throwing = createStorage(() => {
    throw new Error('SecurityError');
  });
  assert.equal(throwing.mode, 'memory');
  assert.equal(createStorage(() => null).mode, 'memory');

  const full = new MemoryStore();
  const adapter = createStorage(() => full);
  full.setItem = (k) => {
    if (k === STORAGE_KEY) throw new Error('QuotaExceededError');
  };
  assert.equal(adapter.save(stateWith()), false);
});

test('a version 2 case with no control answer loads as not sure', () => {
  const { siteControl: _omit, ...v2Case } = caseRecord;
  const parsed = parseState(JSON.stringify({ ...stateWith({ case: v2Case }), version: 2 }));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.state.version, 3);
  assert.equal(parsed.state.case.siteControl, 'unsure');
  assert.deepEqual(parsed.state.case.liveCheck, null);
});

test('a version 1 state migrates with no live check', () => {
  const { liveCheck: _omit, ...v1Case } = caseRecord;
  const parsed = parseState(JSON.stringify({ ...stateWith({ case: v1Case }), version: 1 }));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.state.version, 3);
  assert.equal(parsed.state.case.liveCheck, null);
  assert.equal(parsed.state.case.siteControl, 'charity');
  assert.deepEqual(Object.keys(parsed.state.actions), ['case-1|harbour-lantern|harbour-csp']);
});

test('live check records round-trip, and live findings keep their actions', () => {
  const state = stateWith({
    case: { ...caseRecord, scenarioId: 'live', liveCheck },
    actions: { 'case-1|live|live-hsts': action, 'case-1|live|live-other': action },
    drafts: { 'case-1|live|en': 'draft' },
    handover: { 'case-1|live': { flowTester: 'A', recordKeeper: 'B' } },
  });
  const parsed = parseState(JSON.stringify(state));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.state.case.liveCheck, liveCheck);
  assert.deepEqual(Object.keys(parsed.state.actions), ['case-1|live|live-hsts']);
  assert.deepEqual(Object.keys(parsed.state.drafts), ['case-1|live|en']);
  assert.deepEqual(Object.keys(parsed.state.handover), ['case-1|live']);
});

test('a live check for a different address, or a live choice without a check, is dropped', () => {
  const stale = parseState(
    JSON.stringify(stateWith({ case: { ...caseRecord, scenarioId: 'live', liveCheck: { ...liveCheck, requestedUrl: 'https://other.example/' } } })),
  );
  assert.equal(stale.ok, true);
  assert.equal(stale.state.case.liveCheck, null);
  assert.equal(stale.state.case.scenarioId, null);
});
