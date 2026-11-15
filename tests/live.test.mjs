import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyCsp,
  classifyHsts,
  classifyReferrer,
  classifyXcto,
  liveFindings,
  liveScenario,
  scenarioForCase,
  withoutLive,
} from '../src/domain/live.ts';
import { requestLiveCheck } from '../src/domain/liveClient.ts';
import { prioritise } from '../src/domain/priority.ts';
import { initialState } from '../src/domain/storage.ts';

const HTTPS = 'https://charity.example/';

test('HSTS is classified from the final address and max-age', () => {
  assert.equal(classifyHsts('max-age=31536000', 'http://charity.example/'), 'httpOnly');
  assert.equal(classifyHsts(null, HTTPS), 'absent');
  assert.equal(classifyHsts('max-age=0', HTTPS), 'disabled');
  assert.equal(classifyHsts('max-age=300', HTTPS), 'short');
  assert.equal(classifyHsts('max-age="86400"; includeSubDomains', HTTPS), 'ok');
  assert.equal(classifyHsts('MAX-AGE=31536000; preload', HTTPS), 'ok');
  for (const bad of ['includeSubDomains', 'max-age=abc', 'max-age=1; max-age=2', 'max-age=-5', '']) {
    assert.equal(classifyHsts(bad, HTTPS), 'invalid', bad);
  }
});

test('CSP distinguishes report-only, absent, permissive and restrictive policies', () => {
  assert.equal(classifyCsp(null, null), 'absent');
  assert.equal(classifyCsp(null, "default-src 'self'"), 'reportOnlyScripts');
  assert.equal(classifyCsp("default-src 'self'", null), 'ok');
  assert.equal(classifyCsp("script-src 'self' https://pay.example; object-src 'none'", "default-src 'none'"), 'ok');
  assert.equal(classifyCsp("frame-ancestors 'none'", null), 'noScript');
  assert.equal(classifyCsp(null, "frame-ancestors 'self' https://example.test"), 'reportOnlyOther');
  assert.equal(classifyCsp("default-src 'self'; script-src 'self' 'unsafe-inline'", null), 'permissive');
  assert.equal(classifyCsp("script-src 'self' 'unsafe-inline' 'nonce-abc123'", null), 'ok');
  assert.equal(classifyCsp('script-src https:', null), 'permissive');
  assert.equal(classifyCsp('default-src *', null), 'permissive');
  assert.equal(classifyCsp("frame-ancestors 'none', script-src 'self'", null), 'ok');
});

test('X-Content-Type-Options accepts only nosniff', () => {
  assert.equal(classifyXcto(null), 'absent');
  assert.equal(classifyXcto(' NoSniff '), 'ok');
  assert.equal(classifyXcto('nosniff, nosniff'), 'ok');
  assert.equal(classifyXcto('sniff'), 'invalid');
});

test('Referrer-Policy uses the last recognised token', () => {
  assert.equal(classifyReferrer(null), 'absent');
  assert.equal(classifyReferrer('strict-origin-when-cross-origin'), 'ok');
  assert.equal(classifyReferrer('unsafe-url'), 'unsafe');
  assert.equal(classifyReferrer('no-referrer-when-downgrade'), 'unsafe');
  assert.equal(classifyReferrer('unsafe-url, strict-origin'), 'ok');
  assert.equal(classifyReferrer('no-referrer, made-up'), 'ok');
  assert.equal(classifyReferrer('made-up'), 'invalid');
});

const check = (headers, finalUrl = 'https://www.charity.example/') => ({
  requestedUrl: 'https://charity.example/',
  finalUrl,
  status: 200,
  redirects: 1,
  checkedAt: '2026-11-15T03:00:00.000Z',
  headers: { hsts: null, csp: null, cspReportOnly: null, xcto: null, referrer: null, ...headers },
});

test('live findings carry literal header lines and feed the same priority rules', () => {
  const findings = liveFindings(
    check({ cspReportOnly: "default-src 'self'", xcto: 'nosniff', referrer: 'unsafe-url' }),
  );
  assert.deepEqual(
    findings.map((f) => [f.id, f.configuration, f.evidence]),
    [
      ['live-hsts', 'absent', null],
      ['live-csp', 'concern', "Content-Security-Policy-Report-Only: default-src 'self'"],
      ['live-xcto', 'expected', 'X-Content-Type-Options: nosniff'],
      ['live-referrer', 'concern', 'Referrer-Policy: unsafe-url'],
    ],
  );
  const result = prioritise(findings, ['donations']);
  assert.deepEqual(
    result.priorities.map((p) => p.finding.id),
    ['live-csp', 'live-referrer', 'live-hsts'],
  );
  assert.deepEqual(result.others.map((p) => p.finding.id), ['live-xcto']);
  assert.match(findings[0].text.en.pageContext, /www\.charity\.example.*after 1 redirect/);
  assert.match(findings[0].text.en.pageContext, /not a donation, sign-up, or payment flow/);
  assert.ok(findings.every((f) => f.activities.length === 0));
  assert.match(findings[1].text.en.meaning, /does not show that reports are sent/);
  assert.doesNotMatch(findings[1].text.en.meaning, /reports are reviewed|reports are being sent/);
});

test('a platform-shaped response records the headers and asks nothing', () => {
  const findings = liveFindings(
    check({
      hsts: 'max-age=31536000; includeSubDomains',
      cspReportOnly: "frame-ancestors 'self' https://example.test",
    }),
  );
  assert.equal(findings[0].configuration, 'expected');
  assert.match(findings[0].text.en.meaning, /one year/);
  assert.doesNotMatch(findings[0].text.en.meaning, /at least a day/);
  assert.match(findings[0].text['zh-HK'].meaning, /一年/);
  assert.equal(findings[1].configuration, 'noted');
  assert.equal(findings[1].reviewRequired, false);
  assert.match(findings[1].text.en.meaning, /does not restrict scripts/);
  assert.match(findings[1].text.en.meaning, /embed the page/);
  assert.match(findings[1].text.en.meaning, /does not show that reports are sent/);
  assert.doesNotMatch(findings[1].text.en.request, /enforce/);
  assert.equal(findings[2].configuration, 'absent');
  assert.equal(findings[2].reviewRequired, false);
  assert.match(findings[2].text.en.meaning, /does not show an exploitable flaw/);
  assert.equal(findings[3].reviewRequired, false);
  assert.match(findings[3].text.en.meaning, /strict-origin-when-cross-origin/);
  assert.match(findings[3].text.en.meaning, /not an urgent fix/);
  for (const activities of [['donations'], ['information'], ['donations', 'volunteer']]) {
    assert.equal(prioritise(findings, activities).priorities.length, 0, activities.join(','));
  }
});

test('a fully configured site gives no priorities', () => {
  const findings = liveFindings(
    check({
      hsts: 'max-age=31536000',
      csp: "default-src 'self'",
      xcto: 'nosniff',
      referrer: 'strict-origin-when-cross-origin',
    }),
  );
  assert.ok(findings.every((f) => f.configuration === 'expected' && !f.reviewRequired));
  assert.equal(prioritise(findings, ['donations']).priorities.length, 0);
});

test('the case resolves to the live scenario only when a check exists', () => {
  const base = { displayName: 'Real', activities: ['donations'], scenarioId: 'live', liveCheck: null };
  assert.equal(scenarioForCase(base), null);
  const withCheck = { ...base, liveCheck: check({}) };
  assert.equal(scenarioForCase(withCheck).source, 'live');
  assert.equal(liveScenario(withCheck).samplePage, 'https://www.charity.example/');
  assert.equal(scenarioForCase({ ...base, scenarioId: 'hillpath-reading' }).source, 'fixture');
});

test('withoutLive drops only live records for the case', () => {
  const state = {
    ...initialState(),
    actions: { 'c|live|live-hsts': 1, 'c|harbour-lantern|harbour-csp': 2, 'd|live|live-hsts': 3 },
    drafts: { 'c|live|en': 'x', 'c|banyan-neighbours|en': 'y' },
    handover: { 'c|live': {}, 'c|hillpath-reading': {} },
  };
  const next = withoutLive(state, 'c');
  assert.deepEqual(Object.keys(next.actions), ['c|harbour-lantern|harbour-csp', 'd|live|live-hsts']);
  assert.deepEqual(Object.keys(next.drafts), ['c|banyan-neighbours|en']);
  assert.deepEqual(Object.keys(next.handover), ['c|hillpath-reading']);
});

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('the client accepts only well-formed results and known error codes', async () => {
  const good = check({ hsts: 'max-age=300' });
  let sent;
  const ok = await requestLiveCheck('https://charity.example', async (url, init) => {
    sent = { url, init };
    return json({ ok: true, result: good });
  });
  assert.deepEqual(ok, { ok: true, result: good });
  assert.equal(sent.url, '/api/header-check');
  assert.equal(sent.init.method, 'POST');
  assert.deepEqual(JSON.parse(sent.init.body), { url: 'https://charity.example' });

  assert.deepEqual(await requestLiveCheck('x', async () => json({ ok: false, error: 'dns' }, 502)), { ok: false, error: 'dns' });
  assert.deepEqual(await requestLiveCheck('x', async () => json({ ok: false, error: 'weird' }, 500)), {
    ok: false,
    error: 'unavailable',
  });
  assert.deepEqual(await requestLiveCheck('x', async () => json({ ok: true, result: { ...good, status: 'x' } })), {
    ok: false,
    error: 'unavailable',
  });
  assert.deepEqual(await requestLiveCheck('x', async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } })), {
    ok: false,
    error: 'unavailable',
  });
  assert.deepEqual(
    await requestLiveCheck('x', async () => {
      throw new TypeError('Failed to fetch');
    }),
    { ok: false, error: 'unavailable' },
  );
});
