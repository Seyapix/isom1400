import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getScenario, SCENARIOS } from '../src/domain/fixtures.ts';
import { prioritise, SHORTLIST_LIMIT } from '../src/domain/priority.ts';
import { remarkTone } from '../src/domain/report.ts';

const ids = (list) => list.map((r) => r.finding.id);
const harbour = getScenario('harbour-lantern').findings;
const banyan = getScenario('banyan-neighbours').findings;
const hillpath = getScenario('hillpath-reading').findings;

test('report remarks are green for expected or noted, red for moderate, and amber otherwise', () => {
  const byId = Object.fromEntries([...harbour, ...banyan, ...hillpath].map((f) => [f.id, f]));
  assert.equal(remarkTone(byId['harbour-xcto']), 'ok');
  assert.equal(remarkTone(byId['hillpath-hsts']), 'ok');
  assert.equal(remarkTone({ configuration: 'noted', severity: 'none' }), 'ok');
  assert.equal(remarkTone({ configuration: 'expected', severity: 'moderate' }), 'ok');
  assert.equal(remarkTone(byId['harbour-csp']), 'alert');
  assert.equal(remarkTone(byId['banyan-hsts']), 'alert');
  assert.equal(remarkTone(byId['harbour-hsts']), 'caution');
  assert.equal(remarkTone(byId['harbour-referrer']), 'caution');
  assert.equal(remarkTone(byId['banyan-csp']), 'caution');
  assert.equal(remarkTone(byId['banyan-xcto']), 'caution');
  assert.equal(remarkTone(byId['banyan-referrer']), 'caution');
});

test('every fixture has four distinct observations in fixed check order', () => {
  for (const scenario of SCENARIOS) {
    assert.deepEqual(
      scenario.findings.map((f) => f.check),
      ['hsts', 'csp', 'xcto', 'referrer'],
    );
    assert.equal(new Set(scenario.findings.map((f) => f.id)).size, 4);
  }
});

test('Harbour Lantern with donations gives three explained priorities and one other observation', () => {
  const result = prioritise(harbour, ['donations']);
  assert.deepEqual(ids(result.priorities), ['harbour-csp', 'harbour-referrer', 'harbour-hsts']);
  assert.deepEqual(ids(result.others), ['harbour-xcto']);
  assert.equal(result.overflow, 0);
  for (const p of result.priorities) assert.deepEqual(p.matchedActivities, ['donations']);
});

test('activity match ranks before configuration state', () => {
  // Enquiries matches only HSTS, so the absent HSTS header outranks the two unmatched concerns.
  const result = prioritise(harbour, ['enquiries']);
  assert.deepEqual(ids(result.priorities), ['harbour-hsts', 'harbour-csp', 'harbour-referrer']);
  assert.deepEqual(result.priorities[0].matchedActivities, ['enquiries']);
  assert.deepEqual(result.priorities[1].matchedActivities, []);
});

test('explicit configuration concern ranks before an absent header, then fixed check order', () => {
  const result = prioritise(banyan, ['volunteer']);
  assert.deepEqual(ids(result.priorities), ['banyan-hsts', 'banyan-csp', 'banyan-referrer']);
});

test('the shortlist is capped at three and the remaining actionable observation is preserved', () => {
  const result = prioritise(banyan, ['volunteer']);
  assert.equal(result.priorities.length, SHORTLIST_LIMIT);
  assert.equal(result.overflow, 1);
  assert.deepEqual(ids(result.others), ['banyan-xcto']);
  assert.equal(result.others[0].finding.reviewRequired, true);
});

test('with no activity match, concerns precede absent headers and check order breaks ties', () => {
  const result = prioritise(banyan, ['information']);
  assert.deepEqual(ids(result.priorities), ['banyan-hsts', 'banyan-xcto', 'banyan-csp']);
  assert.deepEqual(ids(result.others), ['banyan-referrer']);
});

test('routine-only sample yields zero priorities and keeps every observation', () => {
  for (const activities of [['information'], ['donations', 'volunteer', 'enquiries', 'information']]) {
    const result = prioritise(hillpath, activities);
    assert.equal(result.priorities.length, 0);
    assert.equal(result.others.length, 4);
    assert.equal(result.overflow, 0);
  }
});

test('ties with identical keys fall back to stable IDs regardless of input order', () => {
  const base = harbour.find((f) => f.id === 'harbour-csp');
  const twinA = { ...base, id: 'twin-a' };
  const twinB = { ...base, id: 'twin-b' };
  const forward = prioritise([twinB, twinA], ['donations']);
  const reverse = prioritise([twinA, twinB], ['donations']);
  assert.deepEqual(ids(forward.priorities), ['twin-a', 'twin-b']);
  assert.deepEqual(ids(reverse.priorities), ['twin-a', 'twin-b']);
});

test('ordering is identical for every language because it never reads translated text', () => {
  const stripped = harbour.map((f) => ({ ...f, text: { en: f.text['zh-HK'], 'zh-HK': f.text.en } }));
  assert.deepEqual(ids(prioritise(stripped, ['donations']).priorities), ids(prioritise(harbour, ['donations']).priorities));
});

test('a missing header alone is never rated above moderate and no fixture claims a breach', () => {
  for (const scenario of SCENARIOS) {
    for (const f of scenario.findings) {
      if (f.configuration === 'absent') assert.ok(['low', 'undetermined'].includes(f.severity), f.id);
      for (const text of Object.values(f.text)) {
        assert.doesNotMatch(Object.values(text).join(' '), /\b(breach(ed)?|hacked|exploited|score|grade [A-F])\b/i, f.id);
      }
    }
  }
});
