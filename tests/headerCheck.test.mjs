import assert from 'node:assert/strict';
import http from 'node:http';
import { after, test } from 'node:test';
import {
  checkHeaders,
  CHECK_PATH,
  DEFAULT_POLICY,
  headerCheckMiddleware,
  isBlockedAddress,
  validateTarget,
} from '../server/headerCheck.ts';

const servers = [];
after(() => Promise.all(servers.map((s) => new Promise((r) => s.close(r)))));

async function serve(handler) {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  server.unref();
  return `127.0.0.1:${server.address().port}`;
}

/** Lets tests reach their own loopback servers. The real policy blocks loopback. */
const LOCAL = { isBlockedAddress: () => false, isAllowedPort: () => true, timeoutMs: 1000 };

async function failure(promise) {
  try {
    await promise;
  } catch (err) {
    return err.code;
  }
  return 'resolved';
}

test('loopback, private, link-local and special-use addresses are blocked', () => {
  const blocked = [
    '127.0.0.1',
    '127.255.0.9',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:10.0.0.1',
    '64:ff9b::a9fe:a9fe',
    '2002:c0a8:0101::1',
    'not-an-ip',
  ];
  for (const address of blocked) assert.equal(isBlockedAddress(address), true, address);
  for (const address of ['93.184.215.14', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(isBlockedAddress(address), false, address);
  }
});

test('targets must be plain http(s) on the default port with a public literal address', () => {
  const code = (url) => {
    try {
      validateTarget(url);
      return null;
    } catch (err) {
      return err.code;
    }
  };
  assert.equal(code('https://charity.example/path'), null);
  assert.equal(code('ftp://charity.example'), 'scheme');
  assert.equal(code('javascript:alert(1)'), 'scheme');
  assert.equal(code('https://user:pw@charity.example'), 'credentials');
  assert.equal(code('https://charity.example:8443/'), 'port');
  assert.equal(code('http://127.0.0.1/'), 'blockedAddress');
  assert.equal(code('http://[::1]/'), 'blockedAddress');
  assert.equal(code('http://2130706433/'), 'blockedAddress');
  assert.equal(code('http://0x7f.1/'), 'blockedAddress');
  assert.equal(code('http://169.254.169.254/latest/meta-data'), 'blockedAddress');
  assert.equal(code('not a url'), 'invalidUrl');
});

test('names that resolve to loopback are refused at connection time', async () => {
  assert.equal(await failure(checkHeaders('http://localhost/', { ...DEFAULT_POLICY, timeoutMs: 2000 })), 'blockedAddress');
});

test('only the four headers are returned, capped, after following redirects', async () => {
  const host = await serve((req, res) => {
    if (req.url === '/start') {
      res.writeHead(301, { Location: '/middle' });
      return res.end();
    }
    if (req.url === '/middle') {
      res.writeHead(302, { Location: `http://${req.headers.host}/final` });
      return res.end();
    }
    res.writeHead(200, {
      'Strict-Transport-Security': 'max-age=300',
      'Content-Security-Policy-Report-Only': "default-src 'self'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'x'.repeat(5000),
      'Set-Cookie': 'session=secret',
      Server: 'demo',
    });
    res.end('<html>body is never read</html>');
  });
  const result = await checkHeaders(`http://${host}/start`, LOCAL);
  assert.equal(result.requestedUrl, `http://${host}/start`);
  assert.equal(result.finalUrl, `http://${host}/final`);
  assert.equal(result.status, 200);
  assert.equal(result.redirects, 2);
  assert.ok(!Number.isNaN(Date.parse(result.checkedAt)));
  assert.deepEqual(Object.keys(result.headers), ['hsts', 'csp', 'cspReportOnly', 'xcto', 'referrer']);
  assert.equal(result.headers.hsts, 'max-age=300');
  assert.equal(result.headers.csp, null);
  assert.equal(result.headers.cspReportOnly, "default-src 'self'");
  assert.equal(result.headers.referrer.length, 4000);
  assert.ok(!JSON.stringify(result).includes('secret'));
});

test('redirect targets are validated again', async () => {
  const host = await serve((req, res) => {
    const to = { '/private': 'http://10.0.0.1/', '/ftp': 'ftp://charity.example/', '/creds': 'http://a:b@charity.example/' }[req.url];
    res.writeHead(302, { Location: to ?? '/loop' });
    res.end();
  });
  const policy = { ...LOCAL, isBlockedAddress: (a) => a !== '127.0.0.1' && isBlockedAddress(a) };
  assert.equal(await failure(checkHeaders(`http://${host}/private`, policy)), 'blockedAddress');
  assert.equal(await failure(checkHeaders(`http://${host}/ftp`, policy)), 'scheme');
  assert.equal(await failure(checkHeaders(`http://${host}/creds`, policy)), 'credentials');
  assert.equal(await failure(checkHeaders(`http://${host}/loop`, policy)), 'tooManyRedirects');
});

test('slow sites time out and unreachable ones report a network error', async () => {
  const host = await serve(() => {});
  assert.equal(await failure(checkHeaders(`http://${host}/`, { ...LOCAL, timeoutMs: 200 })), 'timeout');
  const closed = await serve(() => {});
  servers.at(-1).close();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(await failure(checkHeaders(`http://${closed}/`, LOCAL)), 'network');
});

async function endpoint(policy) {
  let middleware;
  const host = await serve((req, res) =>
    middleware(req, res, () => {
      res.statusCode = 404;
      res.end();
    }),
  );
  middleware = headerCheckMiddleware(host, policy);
  return host;
}

const post = (host, body, headers = {}) =>
  fetch(`http://${host}${CHECK_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

test('the endpoint accepts only same-origin JSON posts', async () => {
  const target = await serve((_req, res) => {
    res.writeHead(200, { 'X-Content-Type-Options': 'nosniff' });
    res.end();
  });
  const host = await endpoint(LOCAL);

  const ok = await post(host, { url: `http://${target}/` });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');
  const body = await ok.json();
  assert.equal(body.ok, true);
  assert.equal(body.result.headers.xcto, 'nosniff');

  const get = await fetch(`http://${host}${CHECK_PATH}`);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST');
  assert.equal((await post(host, { url: 'x' }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await post(host, { url: 'x' }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await post(host, { url: 'x' }, { 'Content-Type': 'text/plain' })).status, 415);
  assert.deepEqual(await (await post(host, '{bad')).json(), { ok: false, error: 'badRequest' });
  assert.deepEqual(await (await post(host, { url: 5 })).json(), { ok: false, error: 'badRequest' });
  assert.equal((await post(host, { url: 'x'.repeat(5000) })).status, 400);
  assert.equal((await fetch(`http://${host}/other`)).status, 404);
});

test('the endpoint uses the default policy to refuse this machine', async () => {
  const host = await endpoint(DEFAULT_POLICY);
  const cases = [
    ['http://127.0.0.1/', 403, 'blockedAddress'],
    ['http://localhost/', 403, 'blockedAddress'],
    [`http://${host}/`, 400, 'port'],
  ];
  for (const [url, status, error] of cases) {
    const res = await post(host, { url });
    assert.equal(res.status, status, url);
    assert.deepEqual(await res.json(), { ok: false, error }, url);
  }
});

test('the endpoint runs at most two checks at once', async () => {
  const slow = await serve(() => {});
  const host = await endpoint({ ...LOCAL, timeoutMs: 400 });
  const results = await Promise.all([1, 2, 3].map(() => post(host, { url: `http://${slow}/` }).then((r) => r.json())));
  const errors = results.map((r) => r.error).sort();
  assert.deepEqual(errors, ['busy', 'timeout', 'timeout']);
});
