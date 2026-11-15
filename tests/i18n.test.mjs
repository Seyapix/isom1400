import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getScenario, SCENARIOS } from '../src/domain/fixtures.ts';
import { liveScenario } from '../src/domain/live.ts';
import { prioritise } from '../src/domain/priority.ts';
import { buildCopyText, buildRequest, reasonLines } from '../src/domain/report.ts';
import { DICTIONARIES } from '../src/i18n/index.ts';

function shape(value) {
  if (typeof value === 'function') return `fn/${value.length}`;
  if (Array.isArray(value)) return `array/${value.length}`;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, shape(value[k])]));
  }
  return typeof value;
}

test('both dictionaries have identical keys, list lengths and function arities', () => {
  assert.deepEqual(shape(DICTIONARIES['zh-HK']), shape(DICTIONARIES.en));
});

test('the acknowledgement keeps its exact wording and the sample banner is gone', () => {
  assert.equal(
    DICTIONARIES.en.intake.ack,
    'I understand this demo uses fictional sample data, and that any future review of a live website would need separate permission and an agreed scope.',
  );
  assert.equal(DICTIONARIES['zh-HK'].intake.ack, '我明白此示範使用虛構模擬資料；日後如要檢視實際網站，須另行取得許可並議定範圍。');
  for (const d of Object.values(DICTIONARIES)) assert.equal('sampleNotice' in d, false);
});

const liveCase = {
  displayName: 'Real Charity',
  exampleUrl: 'https://charity.example',
  activities: ['donations'],
  changeManager: 'provider',
  support: 'none',
  liveCheck: {
    requestedUrl: 'https://charity.example/',
    finalUrl: 'https://www.charity.example/',
    status: 200,
    redirects: 1,
    checkedAt: '2026-11-15T03:00:00.000Z',
    headers: { hsts: null, csp: null, cspReportOnly: "default-src 'self'", xcto: 'nosniff', referrer: 'unsafe-url' },
  },
};

test('every fixture and live observation is translated in full, and Chinese text is not English', () => {
  for (const scenario of [...SCENARIOS, liveScenario(liveCase)]) {
    for (const f of scenario.findings) {
      const en = f.text.en;
      const zh = f.text['zh-HK'];
      assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort(), f.id);
      for (const key of Object.keys(en)) {
        assert.ok(en[key].trim().length > 0, `${f.id}.${key} en`);
        assert.match(zh[key], /[\u4e00-\u9fff]/, `${f.id}.${key} zh-HK`);
      }
    }
  }
});

test('provider requests use conditional wording and copied text carries the scope line only', () => {
  const caseRecord = {
    displayName: 'Harbour Lantern',
    activities: ['donations'],
    changeManager: 'provider',
    support: 'none',
  };
  const scenario = getScenario('harbour-lantern');
  const { priorities } = prioritise(scenario.findings, caseRecord.activities);
  for (const lang of ['en', 'zh-HK']) {
    const d = DICTIONARIES[lang];
    const draft = buildRequest(d, lang, caseRecord, scenario, priorities);
    assert.ok(draft.includes(d.request.introFixture), lang);
    assert.match(draft, lang === 'en' ? /Could you/ : /可否/);
    const copied = buildCopyText(d, lang, caseRecord, scenario, `${draft}\nEDITED`);
    assert.ok(copied.startsWith(lang === 'en' ? 'Scope:' : '範圍：'), lang);
    assert.ok(!/Sample data|模擬資料，並非/.test(copied), lang);
    assert.ok(copied.includes('EDITED'));
    assert.ok(copied.includes(scenario.samplePage));
    assert.ok(copied.includes(scenario.organisation[lang]));
    for (const p of priorities) assert.ok(reasonLines(d, p).length >= 2);
  }
});

test('a routine-only sample produces a request with no numbered items', () => {
  const caseRecord = { displayName: 'Hillpath', activities: ['information'], changeManager: 'volunteer', support: 'inhouse' };
  const draft = buildRequest(DICTIONARIES.en, 'en', caseRecord, getScenario('hillpath-reading'), []);
  assert.ok(draft.includes(DICTIONARIES.en.request.none));
  assert.doesNotMatch(draft, /^1\. /m);
});

test('a live request and copy describe the check rather than a fictional sample', () => {
  const scenario = liveScenario(liveCase);
  const { priorities } = prioritise(scenario.findings, liveCase.activities);
  for (const lang of ['en', 'zh-HK']) {
    const d = DICTIONARIES[lang];
    const draft = buildRequest(d, lang, liveCase, scenario, priorities);
    assert.ok(draft.includes(d.request.introLive), lang);
    assert.ok(!draft.includes(d.request.introFixture), lang);
    const copied = buildCopyText(d, lang, liveCase, scenario, draft);
    assert.ok(copied.includes('https://www.charity.example/'), lang);
    assert.match(copied, lang === 'en' ? /live header check/ : /即時標頭檢查/);
  }
});
