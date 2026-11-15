// End-to-end acceptance check: builds the app, serves it with the real Vite dev
// and preview servers, verifies response headers, then drives the full workflow
// in Chromium while recording network destinations, CSP violations and colours.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build, createServer, preview } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${root}test-results/`;
const PREVIEW = 'http://127.0.0.1:4173';
const DEV = 'http://127.0.0.1:5173';
const STORAGE_KEY = 'isom1400.charityWorkspace.state';

const PREVIEW_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'none'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const DEV_CSP = PREVIEW_CSP.replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:5173");

const results = [];
const recorded = { headers: {}, browser: '' };

async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✔ ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error?.message ?? error) });
    console.log(`✖ ${name}\n  ${String(error?.message ?? error).split('\n').join('\n  ')}`);
  }
}

async function launch() {
  try {
    const browser = await chromium.launch();
    recorded.browser = `Playwright Chromium ${browser.version()}`;
    return browser;
  } catch {
    const browser = await chromium.launch({ channel: 'chrome' });
    recorded.browser = `Google Chrome ${browser.version()} (Playwright chrome channel; bundled Chromium not installed)`;
    return browser;
  }
}

async function headersFor(base, paths) {
  const out = {};
  for (const path of paths) {
    const res = await fetch(base + path);
    await res.arrayBuffer();
    out[path] = {
      status: res.status,
      'content-security-policy': res.headers.get('content-security-policy'),
      'x-content-type-options': res.headers.get('x-content-type-options'),
      'referrer-policy': res.headers.get('referrer-policy'),
      'strict-transport-security': res.headers.get('strict-transport-security'),
    };
  }
  return out;
}

function assertHeaders(map, csp) {
  for (const [path, h] of Object.entries(map)) {
    assert.equal(h.status, 200, `${path} status`);
    assert.equal(h['content-security-policy'], csp, `${path} CSP`);
    assert.equal(h['x-content-type-options'], 'nosniff', `${path} X-Content-Type-Options`);
    assert.equal(h['referrer-policy'], 'strict-origin-when-cross-origin', `${path} Referrer-Policy`);
    assert.equal(h['strict-transport-security'], null, `${path} must not send HSTS over HTTP`);
  }
}

/** Collects every request, CSP violation and page error for one page. */
function monitor(page, origin) {
  const log = { external: [], images: [], requests: [], console: [], errors: [] };
  page.on('request', (req) => {
    const url = req.url();
    log.requests.push(url);
    if (!url.startsWith(`${origin}/`) && !url.startsWith(`${origin.replace('http', 'ws')}/`)) log.external.push(url);
    if (['image', 'font', 'media'].includes(req.resourceType())) log.images.push(url);
  });
  page.on('console', (msg) => log.console.push(`${msg.type()}: ${msg.text()}`));
  page.on('pageerror', (err) => log.errors.push(String(err)));
  return log;
}

const INIT = () => {
  window.__csp = [];
  document.addEventListener('securitypolicyviolation', (e) =>
    window.__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`),
  );
};

/** Every computed colour must be white, dark gray, teal, or a mix of those.
 *  Report observation remarks may also use these three traffic-light hues. */
const PALETTE_CHECK = () => {
  const anchors = [
    [255, 255, 255],
    [36, 48, 56],
    [15, 110, 106],
  ];
  const remarks = [
    [27, 122, 69],
    [154, 103, 0],
    [180, 35, 24],
  ];
  const parse = (value) => {
    const m = value.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = '1'] = m[1].split(/[ ,/]+/).filter(Boolean);
    return { rgb: [Number(r), Number(g), Number(b)], a: Number(a) };
  };
  const onSegment = (c, p, q) => {
    const d = q.map((v, i) => v - p[i]);
    const len = d.reduce((s, v) => s + v * v, 0);
    const t = Math.max(0, Math.min(1, d.reduce((s, v, i) => s + v * (c[i] - p[i]), 0) / len));
    return Math.hypot(...c.map((v, i) => v - (p[i] + t * d[i]))) <= 4;
  };
  const nearRemark = (c) => remarks.some((p) => Math.hypot(...c.map((v, i) => v - p[i])) <= 4);
  const allowed = (c) =>
    onSegment(c, anchors[0], anchors[1]) ||
    onSegment(c, anchors[0], anchors[2]) ||
    onSegment(c, anchors[1], anchors[2]) ||
    nearRemark(c);
  const bad = new Set();
  const props = ['color', 'background-color', 'border-top-color', 'border-bottom-color', 'border-left-color', 'border-right-color', 'outline-color', 'accent-color'];
  for (const el of document.querySelectorAll('*')) {
    const style = getComputedStyle(el);
    for (const prop of props) {
      const parsed = parse(style.getPropertyValue(prop));
      if (parsed && parsed.a > 0 && !allowed(parsed.rgb)) bad.add(`${prop} ${style.getPropertyValue(prop)} on <${el.tagName.toLowerCase()} class="${el.className}">`);
    }
    if (style.backgroundImage !== 'none') bad.add(`background-image on <${el.tagName.toLowerCase()}>`);
  }
  const media = document.querySelectorAll('img, svg, picture, canvas, video, object, embed, iframe').length;
  return { bad: [...bad], media };
};

async function paletteOk(page, label) {
  const { bad, media } = await page.evaluate(PALETTE_CHECK);
  assert.equal(media, 0, `${label}: image or media elements present`);
  assert.deepEqual(bad, [], `${label}: colours outside the white, dark gray and teal palette, apart from the three report-remark hues`);
}

async function noOverflow(page, label) {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  assert.ok(scroll <= inner, `${label}: horizontal overflow ${scroll} > ${inner}`);
}

/** Step buttons are matched inside the step bar by their short visible label. */
const navButton = (page, label) => page.locator('nav').getByRole('button', { name: new RegExp(`${label}$`) });
const activeId = (page) => page.evaluate(() => document.activeElement?.id ?? '');
const text = (page) => page.locator('main').innerText();
const priorityIds = (page) => page.locator('[data-priority-list] > li').evaluateAll((els) => els.map((e) => e.dataset.findingId));

async function tabUntil(page, predicate, max = 60) {
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(predicate)) return;
  }
  throw new Error(`Focus never reached target: ${predicate}`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  console.log('Building production bundle…');
  await build({ root, logLevel: 'warn' });

  const previewServer = await preview({ root, logLevel: 'warn' });
  let devServer = await createServer({ root, logLevel: 'warn' });
  try {
    await devServer.listen();
  } catch (error) {
    // A developer's own `pnpm dev` already holds the fixed port; test against it instead.
    await devServer.close();
    devServer = null;
    const res = await fetch(`${DEV}/`).catch(() => null);
    if (!res?.headers.get('content-security-policy')) {
      await new Promise((resolve) => previewServer.httpServer.close(resolve));
      throw error;
    }
    recorded.devServer = 'reused an already running dev server on port 5173';
    console.log('Dev server port in use; reusing the running dev server.');
  }
  const browser = await launch();
  console.log(`Browser: ${recorded.browser}`);

  try {
    await step('preview serves the production headers on HTML and bundled assets, without HSTS', async () => {
      const html = await (await fetch(`${PREVIEW}/`)).text();
      const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
      assert.ok(assets.some((a) => a.endsWith('.js')) && assets.some((a) => a.endsWith('.css')), 'bundled JS and CSS referenced');
      assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>|<style|style=/, 'no inline script or style in built HTML');
      recorded.headers.preview = await headersFor(PREVIEW, ['/', ...assets]);
      assertHeaders(recorded.headers.preview, PREVIEW_CSP);
    });

    await step('dev server serves the same headers, with only the loopback hot-reload connection added', async () => {
      recorded.headers.dev = await headersFor(DEV, ['/', '/src/main.tsx', '/src/index.css', '/@vite/client']);
      assertHeaders(recorded.headers.dev, DEV_CSP);
    });

    await step('header-check endpoint refuses other methods, origins, content types and this machine', async () => {
      const endpoint = `${PREVIEW}/api/header-check`;
      const post = (body, headers = {}) =>
        fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
      const get = await fetch(endpoint);
      assert.equal(get.status, 405);
      assert.equal(get.headers.get('cache-control'), 'no-store');
      assert.equal((await post({ url: 'https://charity.example' }, { Origin: 'https://evil.example' })).status, 403);
      assert.equal((await post({ url: 'https://charity.example' }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
      assert.equal((await post({ url: 'https://charity.example' }, { 'Content-Type': 'text/plain' })).status, 415);
      const refused = {};
      for (const url of ['http://127.0.0.1/', 'http://localhost/', 'http://[::1]/', 'http://169.254.169.254/', 'http://192.168.0.1/']) {
        const res = await post({ url });
        refused[url] = [res.status, (await res.json()).error];
      }
      recorded.endpointRefusals = refused;
      for (const [url, [status, error]] of Object.entries(refused)) {
        assert.deepEqual([status, error], [403, 'blockedAddress'], url);
      }
      assert.deepEqual(await (await post({ url: 'http://127.0.0.1:4173/' })).json(), { ok: false, error: 'port' });
      assert.deepEqual(await (await post({ url: 'https://a:b@charity.example' })).json(), { ok: false, error: 'credentials' });
      const dev = await fetch(`${DEV}/api/header-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'http://127.0.0.1/' }),
      });
      assert.equal(dev.status, 403, 'dev server has the same endpoint');
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: 'en-GB',
      timezoneId: 'Asia/Hong_Kong',
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    await context.addInitScript(INIT);
    const page = await context.newPage();
    const log = monitor(page, PREVIEW);

    await page.goto(`${PREVIEW}/`);
    await page.evaluate(() => localStorage.setItem('unrelated-demo-key', 'keep'));
    await page.reload();

    await step('shell: Parapet wordmark, one-line bars in both languages, no sample banner', async () => {
      assert.equal(await page.title(), 'Website Security for Small Charities · Parapet');
      assert.equal(await page.locator('header').getByText('Parapet', { exact: true }).count(), 1);
      assert.doesNotMatch(await page.locator('body').innerText(), /ISOM1400|Sample data/);
      const measure = () =>
        page.evaluate(() => ({
          header: document.querySelector('header').getBoundingClientRect().height,
          nav: document.querySelector('nav').getBoundingClientRect().height,
          steps: [...document.querySelectorAll('nav button')].map((b) => b.getBoundingClientRect().height),
          wrapped: [...document.querySelectorAll('nav button')].some((b) => b.scrollWidth > b.clientWidth),
        }));
      const sizes = {};
      for (const width of [1280, 360]) {
        await page.setViewportSize({ width, height: 900 });
        for (const lang of ['English', '繁體中文']) {
          await page.getByRole('button', { name: lang }).click();
          sizes[`${width}-${lang}`] = await measure();
          await noOverflow(page, `${width} ${lang}`);
        }
        await page.getByRole('button', { name: 'English' }).click();
        const en = sizes[`${width}-English`];
        const zh = sizes[`${width}-繁體中文`];
        assert.equal(en.header, zh.header, `${width}: dark bar height matches`);
        assert.equal(en.nav, zh.nav, `${width}: step bar height matches`);
        assert.equal(new Set([...en.steps, ...zh.steps]).size, 1, `${width}: every step is the same height`);
        assert.ok(!en.wrapped && !zh.wrapped, `${width}: no step label overflows`);
      }
      recorded.barSizes = sizes;
      await page.setViewportSize({ width: 1280, height: 900 });
      assert.deepEqual(
        await page.locator('nav button').evaluateAll((els) => els.map((b) => [b.innerText.replace(/\s+/g, ' ').trim(), b.title])),
        [
          ['1 Intake', 'Charity intake'],
          ['2 Findings', 'Available after the intake is complete'],
          ['3 Report', 'Available after the intake is complete'],
          ['4 Follow-up', 'Available after the intake is complete'],
        ],
      );
      await page.screenshot({ path: `${OUT}shell-en.png` });
    });

    await step('intake: required fields and acknowledgement block the case, with errors in each language', async () => {
      await page.getByRole('button', { name: 'Start case' }).click();
      assert.equal(await activeId(page), 'intake-displayName');
      assert.match(await text(page), /Enter a fictional charity name\./);
      assert.match(await text(page), /Confirm the acknowledgement to start the case\./);
      await page.getByRole('button', { name: '繁體中文' }).click();
      await page.getByRole('button', { name: '開始個案' }).click();
      assert.match(await text(page), /請輸入虛構慈善機構名稱。/);
      assert.equal(await page.evaluate(() => document.documentElement.lang), 'zh-HK');
      await page.getByRole('button', { name: 'English' }).click();
      await paletteOk(page, 'intake with errors');
    });

    await step('intake: credentials and malformed URLs are rejected; markup is kept as text', async () => {
      await page.fill('#intake-displayName', '<b>Harbour</b> Lantern & Co');
      await page.fill('#intake-exampleUrl', 'https://user:secret@donate.example.org');
      await page.check('#intake-siteControl-0');
      await page.check('#intake-activities-0');
      await page.check('#intake-changeManager-0');
      await page.check('#intake-support-0');
      await page.getByRole('button', { name: 'Start case' }).click();
      assert.equal(await activeId(page), 'intake-exampleUrl');
      assert.match(await text(page), /Remove the user name or password/);
      await page.fill('#intake-exampleUrl', 'donate.example.org');
      await page.getByRole('button', { name: 'Start case' }).click();
      assert.match(await text(page), /Enter a complete address starting with http/);
      await page.fill('#intake-exampleUrl', 'https://donate.example.org/give');
      await page.getByRole('button', { name: 'Start case' }).click();
      assert.equal(await activeId(page), 'intake-acknowledged', 'missing acknowledgement focuses the checkbox');
      await page.check('#intake-acknowledged');
      await page.getByRole('button', { name: 'Start case' }).click();
      assert.equal(await activeId(page), 'screen-heading', 'focus moves to the new screen heading');
      assert.equal(await page.locator('h1').innerText(), 'Findings');
      assert.match(await text(page), /<b>Harbour<\/b> Lantern & Co/);
      assert.equal(await page.locator('main b').count(), 0, 'no markup rendered from user input');
      const hrefs = await page.locator('a[href]').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
      assert.deepEqual(hrefs, ['#main'], 'the example URL is never a link');
      assert.equal(await page.locator('[data-inert-url]').innerText(), 'https://donate.example.org/give');
    });

    await step('findings: Harbour Lantern gives three explained priorities and one other observation', async () => {
      assert.match(await text(page), /Check the address or choose a fictional example to see observations\./);
      await page.check('#scenario-harbour-lantern');
      assert.deepEqual(await priorityIds(page), ['harbour-csp', 'harbour-referrer', 'harbour-hsts']);
      for (const details of await page.locator('[data-priority-list] details').all()) {
        await details.locator('summary').click();
        assert.match(await details.innerText(), /Limits of this evidence/);
        assert.match(await details.innerText(), /Suggested provider question/);
      }
      assert.equal(await page.locator('[data-priority-list] li', { hasText: 'Why it was selected' }).count(), 3);
      const others = page.locator('[data-other-observations]');
      assert.match(await others.locator(':scope > summary').innerText(), /Other observations \(1\)/);
      await others.locator(':scope > summary').click();
      assert.deepEqual(await others.locator('li[data-finding-id]').evaluateAll((e) => e.map((x) => x.dataset.findingId)), ['harbour-xcto']);
      await page.screenshot({ path: `${OUT}findings-en.png`, fullPage: true });
      await paletteOk(page, 'findings');
    });

    await step('findings: the information-site sample shows the routine-only empty state', async () => {
      await page.check('#scenario-hillpath-reading');
      assert.equal(await page.locator('[data-priority-list]').count(), 0);
      assert.match(await text(page), /Nothing here needs follow-up/);
      assert.match(await page.locator('[data-other-observations] > summary').innerText(), /\(4\)/);
      assert.equal(await page.locator('[data-other-observations]').getAttribute('open'), '');
      // Donations is selected: the unmatched XCTO concern outranks the volunteer-only absent Referrer-Policy.
      await page.check('#scenario-banyan-neighbours');
      assert.deepEqual(await priorityIds(page), ['banyan-hsts', 'banyan-csp', 'banyan-xcto']);
      assert.match(await text(page), /One more observation needs review/);
      await page.check('#scenario-harbour-lantern');
    });

    await step('changing activities re-ranks priorities; switching language keeps IDs and order', async () => {
      await navButton(page, 'Intake').click();
      await page.uncheck('#intake-activities-0');
      await page.check('#intake-activities-2');
      await page.getByRole('button', { name: 'Save intake' }).click();
      await navButton(page, 'Findings').click();
      assert.deepEqual(await priorityIds(page), ['harbour-hsts', 'harbour-csp', 'harbour-referrer']);
      await navButton(page, 'Intake').click();
      await page.check('#intake-activities-0');
      await page.uncheck('#intake-activities-2');
      await page.getByRole('button', { name: 'Save intake' }).click();
      await navButton(page, 'Findings').click();
      const before = await priorityIds(page);
      await page.getByRole('button', { name: '繁體中文' }).click();
      assert.equal(await page.locator('h1').innerText(), '觀察結果');
      assert.deepEqual(await priorityIds(page), before);
      assert.match(await text(page), /直接影響已選網站用途：捐款。/);
      await page.screenshot({ path: `${OUT}findings-zh.png`, fullPage: true });
      await page.getByRole('button', { name: 'English' }).click();
    });

    const today = await page.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });

    for (const lang of ['en', 'zh-HK']) {
      const zh = lang === 'zh-HK';
      await step(`report (${lang}): edit, copy with the scope line, and print the active language`, async () => {
        await page.getByRole('button', { name: zh ? '繁體中文' : 'English' }).click();
        await navButton(page, zh ? '供應商報告' : 'Report').click();
        assert.equal(await activeId(page), 'screen-heading');
        const draft = page.locator('#request-draft');
        const generated = await draft.inputValue();
        assert.match(generated, zh ? /可否/ : /Could you/);
        assert.ok(generated.includes(zh ? '虛構樣本' : 'fictional sample'), 'fixture request says it is fictional');
        const marker = zh ? 'EDITED-ZH 請於十二月前回覆。' : 'EDITED-EN Please reply by December.';
        await draft.fill(`${generated}\n${marker}`);
        assert.match(await text(page), zh ? /已編輯草稿/ : /Edited draft/);
        await page.getByRole('button', { name: zh ? '複製要求' : 'Copy request' }).click();
        await page.getByText(zh ? '已複製要求' : 'Request copied').waitFor();
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        assert.ok(clip.startsWith(zh ? '範圍：' : 'Scope:'));
        assert.doesNotMatch(clip, /Sample data|模擬資料，並非/);
        assert.ok(clip.includes('https://harbour-lantern.example/donate'));
        assert.ok(clip.includes(marker));
        assert.ok(!clip.includes(zh ? 'EDITED-EN' : 'EDITED-ZH'));

        await page.emulateMedia({ media: 'print' });
        assert.equal(await draft.isVisible(), false, 'textarea hidden in print');
        assert.equal(await page.locator('nav').isVisible(), false, 'navigation hidden in print');
        assert.equal(await page.getByRole('button', { name: zh ? '複製要求' : 'Copy request' }).isVisible(), false);
        assert.ok((await page.locator('[data-print-draft]').innerText()).includes(marker));
        assert.doesNotMatch(await page.locator('body').innerText(), /Sample data|模擬資料，並非/, 'no sample banner in print');
        await page.screenshot({ path: `${OUT}report-${lang}-print.png`, fullPage: true });
        await page.pdf({ path: `${OUT}report-${lang}.pdf`, format: 'A4', preferCSSPageSize: true });
        await page.emulateMedia({ media: 'screen' });
        await paletteOk(page, `report ${lang}`);
      });
    }

    await step('report: language drafts are separate and the English edit survived', async () => {
      await page.getByRole('button', { name: 'English' }).click();
      assert.match(await page.locator('#request-draft').inputValue(), /EDITED-EN/);
      assert.doesNotMatch(await page.locator('#request-draft').inputValue(), /EDITED-ZH/);
    });

    await step('report: blocked clipboard offers selected text for manual copying', async () => {
      await page.evaluate(() => {
        navigator.clipboard.writeText = () => Promise.reject(new Error('blocked'));
      });
      await page.getByRole('button', { name: 'Copy request' }).click();
      await page.getByText('The browser blocked copying').waitFor();
      assert.equal(await activeId(page), 'manual-copy');
      const manual = await page.locator('#manual-copy').inputValue();
      assert.ok(manual.startsWith('Scope:') && manual.includes('EDITED-EN'));
      const selected = await page.evaluate(() => {
        const el = document.activeElement;
        return el.selectionEnd - el.selectionStart === el.value.length;
      });
      assert.ok(selected, 'manual copy text is pre-selected');
    });

    await step('follow-up: deferral without a reason is blocked in both languages', async () => {
      await navButton(page, 'Follow-up').click();
      const csp = page.locator('form[data-action-for="harbour-csp"]');
      await csp.locator('#harbour-csp-status').selectOption('deferred');
      await csp.getByRole('button', { name: 'Save action' }).click();
      assert.match(await csp.innerText(), /Give a reason for deferring this action\./);
      assert.equal(await activeId(page), 'harbour-csp-deferralReason');
      assert.equal(await csp.locator('[data-saved-status]').innerText(), 'Awaiting review');
      await page.getByRole('button', { name: '繁體中文' }).click();
      await csp.getByRole('button', { name: '儲存行動' }).click();
      assert.match(await csp.innerText(), /請說明延後此行動的原因。/);
      await page.getByRole('button', { name: 'English' }).click();
      await csp.locator('#harbour-csp-deferralReason').fill('Waiting for the payment provider’s list of script sources.');
      await csp.locator('#harbour-csp-followUpDate').fill('2026-12-01');
      await csp.getByRole('button', { name: 'Save action' }).click();
      assert.equal(await csp.locator('[data-saved-status]').innerText(), 'Deferred');
    });

    await step('follow-up: recheck needs a date, evidence and outcome; inconclusive stays outstanding', async () => {
      const ref = page.locator('form[data-action-for="harbour-referrer"]');
      await ref.locator('#harbour-referrer-status').selectOption('rechecked');
      await ref.getByRole('button', { name: 'Save action' }).click();
      const errors = await ref.innerText();
      assert.match(errors, /Enter the date of the recheck\./);
      assert.match(errors, /Describe the evidence seen at the recheck\./);
      assert.match(errors, /Choose the verification outcome\./);
      await page.getByRole('button', { name: '繁體中文' }).click();
      await ref.getByRole('button', { name: '儲存行動' }).click();
      assert.match(await ref.innerText(), /請輸入重新檢查的日期。/);
      await page.getByRole('button', { name: 'English' }).click();
      await ref.locator('#harbour-referrer-recheckDate').fill(today);
      await ref.locator('#harbour-referrer-recheckEvidence').fill('Simulated sample still shows Referrer-Policy: unsafe-url.');
      await ref.locator('#harbour-referrer-recheckOutcome').selectOption('inconclusive');
      await ref.getByRole('button', { name: 'Save action' }).click();
      assert.equal(await ref.locator('[data-saved-status]').innerText(), 'Rechecked · Inconclusive');
      await page.fill('#handover-flowTester', 'Volunteer lead for donations');
      await page.fill('#handover-recordKeeper', 'Charity coordinator');
      await page.getByRole('button', { name: 'Save handover details' }).click();
      const handover = await page.locator('[data-handover]').innerText();
      assert.deepEqual(
        await page.locator('[data-outstanding] > li').evaluateAll((e) => e.map((x) => x.dataset.findingId)),
        ['harbour-csp', 'harbour-referrer', 'harbour-hsts'],
      );
      assert.match(handover, /Deferred: Waiting for the payment provider/);
      assert.match(handover, /Rechecked · Inconclusive/);
      assert.match(handover, /Result inconclusive/);
      assert.match(handover, /Volunteer lead for donations/);
      assert.match(handover, /Charity coordinator/);
      assert.equal((handover.match(/Website provider/g) ?? []).length, 3, 'each outstanding action names its owner');
      await page.emulateMedia({ media: 'print' });
      assert.equal(await page.locator('form[data-action-for]').first().isVisible(), false, 'editors hidden in print');
      assert.ok(await page.locator('[data-handover]').isVisible());
      await page.screenshot({ path: `${OUT}handover-en-print.png`, fullPage: true });
      await page.pdf({ path: `${OUT}handover-en.pdf`, format: 'A4', preferCSSPageSize: true });
      await page.emulateMedia({ media: 'screen' });
      await page.screenshot({ path: `${OUT}followup-en.png`, fullPage: true });
      await paletteOk(page, 'follow-up');
    });

    await step('refresh and scenario switching preserve drafts, actions and handover for the case', async () => {
      await page.reload();
      assert.equal(await page.locator('h1').innerText(), 'Follow-up and handover');
      assert.equal(await page.locator('form[data-action-for="harbour-csp"] [data-saved-status]').innerText(), 'Deferred');
      assert.match(await page.locator('[data-handover]').innerText(), /Charity coordinator/);
      await navButton(page, 'Findings').click();
      await page.check('#scenario-banyan-neighbours');
      await navButton(page, 'Follow-up').click();
      assert.equal(await page.locator('[data-outstanding] > li').count(), 4, 'Banyan has its own untouched actions');
      assert.doesNotMatch(await page.locator('[data-handover]').innerText(), /Charity coordinator/);
      await navButton(page, 'Findings').click();
      await page.check('#scenario-harbour-lantern');
      await navButton(page, 'Report').click();
      assert.match(await page.locator('#request-draft').inputValue(), /EDITED-EN/);
    });

    const liveResult = {
      requestedUrl: 'https://donate.example.org/give',
      finalUrl: 'https://www.donate.example.org/give',
      status: 200,
      redirects: 1,
      checkedAt: new Date().toISOString(),
      headers: { hsts: null, csp: null, cspReportOnly: "default-src 'self'", xcto: 'nosniff', referrer: 'unsafe-url' },
    };

    await step('live check: the intake address is sent to the local endpoint and its headers drive priorities', async () => {
      const sent = [];
      await page.route('**/api/header-check', async (route) => {
        const req = route.request();
        sent.push({ method: req.method(), type: req.headers()['content-type'], body: req.postDataJSON() });
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result: liveResult }) });
      });
      await navButton(page, 'Findings').click();
      const panel = page.locator('[data-live-check]');
      assert.match(await panel.innerText(), /Not checked yet\./);
      assert.equal(await page.locator('#scenario-live').isDisabled(), true);
      await panel.getByRole('button', { name: 'Check this address' }).click();
      await page.getByText('Check complete.').waitFor();
      await page.unroute('**/api/header-check');
      assert.deepEqual(sent, [{ method: 'POST', type: 'application/json', body: { url: 'https://donate.example.org/give' } }]);
      assert.equal(await page.locator('[data-final-url]').innerText(), 'https://www.donate.example.org/give');
      assert.match(await panel.innerText(), /Checked /);
      assert.ok(await page.locator('#scenario-live').isChecked(), 'the live result is selected');
      assert.deepEqual(await priorityIds(page), ['live-csp', 'live-referrer', 'live-hsts']);
      const first = page.locator('[data-priority-list] > li').first();
      await first.locator('summary').click();
      assert.match(await first.innerText(), /Content-Security-Policy-Report-Only: default-src 'self'/);
      assert.match(await first.innerText(), /www\.donate\.example\.org\/give \(HTTP 200\) after 1 redirect/);
      assert.match(await page.locator('[data-priority-list] > li').nth(2).innerText(), /HTTPS/);
      assert.equal(await panel.getByRole('button', { name: 'Check again' }).count(), 1);
      await page.screenshot({ path: `${OUT}findings-live-en.png`, fullPage: true });
      await paletteOk(page, 'live findings');

      await navButton(page, 'Report').click();
      assert.match(await text(page), /Four response headers from one request to https:\/\/www\.donate\.example\.org\/give/);
      assert.match(await text(page), /Live check ·/);
      assert.match(await page.locator('#request-draft').inputValue(), /one response from our website/);
      assert.match(await page.locator('#request-draft').inputValue(), /not a ranking/);
      assert.doesNotMatch(await page.locator('#request-draft').inputValue(), /Donations pages/);
      assert.doesNotMatch(await page.locator('#request-draft').inputValue(), /EDITED-EN/, 'live draft is separate from the sample draft');

      await navButton(page, 'Follow-up').click();
      assert.deepEqual(
        await page.locator('[data-outstanding] > li').evaluateAll((e) => e.map((x) => x.dataset.findingId)),
        ['live-csp', 'live-referrer', 'live-hsts'],
      );
      const action = page.locator('form[data-action-for="live-csp"]');
      await action.locator('#live-csp-status').selectOption('accepted');
      await action.getByRole('button', { name: 'Save action' }).click();
      assert.equal(await action.locator('[data-saved-status]').innerText(), 'Accepted');

      await page.reload();
      await navButton(page, 'Findings').click();
      assert.deepEqual(await priorityIds(page), ['live-csp', 'live-referrer', 'live-hsts'], 'live result survives a reload');
      await page.getByRole('button', { name: '繁體中文' }).click();
      assert.match(await page.locator('[data-live-check]').innerText(), /檢查時間/);
      assert.match(await text(page), /此地址的即時檢查/);
      await page.getByRole('button', { name: 'English' }).click();
    });

    await step('live check: a platform answer explains the settings and drafts no change letter', async () => {
      await navButton(page, 'Intake').click();
      await page.check('#intake-siteControl-1');
      await page.getByRole('button', { name: 'Save intake' }).click();
      await navButton(page, 'Findings').click();
      assert.equal(await page.locator('[data-priority-list]').count(), 0);
      assert.match(await text(page), /platform/);
      await navButton(page, 'Report').click();
      const note = await page.locator('#request-draft').inputValue();
      assert.match(note, /belong to the platform/);
      assert.doesNotMatch(note, /our website|Dear website provider/);
      await navButton(page, 'Follow-up').click();
      assert.match(await text(page), /belong to the platform/);
      assert.equal(await page.locator('[data-outstanding] > li').count(), 0);
      await navButton(page, 'Intake').click();
      await page.check('#intake-siteControl-0');
      await page.getByRole('button', { name: 'Save intake' }).click();
      await navButton(page, 'Findings').click();
      assert.deepEqual(await priorityIds(page), ['live-csp', 'live-referrer', 'live-hsts']);
    });

    await step('live check: endpoint errors are announced and keep the last good result', async () => {
      const panel = page.locator('[data-live-check]');
      await page.route('**/api/header-check', (route) =>
        route.fulfill({ status: 504, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'timeout' }) }),
      );
      await panel.getByRole('button', { name: 'Check again' }).click();
      await panel.locator('[data-live-error="timeout"]').waitFor();
      assert.match(await panel.locator('[role="alert"]').innerText(), /did not respond within 8 seconds/);
      await page.unroute('**/api/header-check');
      await page.route('**/api/header-check', (route) => route.abort());
      await panel.getByRole('button', { name: 'Check again' }).click();
      await panel.locator('[data-live-error="unavailable"]').waitFor();
      await page.unroute('**/api/header-check');
      assert.deepEqual(await priorityIds(page), ['live-csp', 'live-referrer', 'live-hsts']);
    });

    await step('live check: changing the address clears the old result; the real endpoint refuses loopback', async () => {
      await navButton(page, 'Intake').click();
      await page.fill('#intake-exampleUrl', 'http://127.0.0.1/');
      await page.getByRole('button', { name: 'Save intake' }).click();
      const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
      assert.equal(stored.case.liveCheck, null);
      assert.equal(stored.case.scenarioId, null);
      assert.deepEqual(Object.keys(stored.actions).filter((k) => k.includes('|live|')), []);
      assert.ok(Object.keys(stored.actions).some((k) => k.includes('|harbour-lantern|')), 'sample actions are kept');
      await navButton(page, 'Findings').click();
      const panel = page.locator('[data-live-check]');
      assert.match(await panel.innerText(), /Not checked yet\./);
      assert.equal(await page.locator('#scenario-live').isDisabled(), true);
      await panel.getByRole('button', { name: 'Check this address' }).click();
      await panel.locator('[data-live-error="blockedAddress"]').waitFor();
      assert.match(await panel.innerText(), /points to this computer or a private network/);
      await navButton(page, 'Intake').click();
      await page.fill('#intake-exampleUrl', 'https://donate.example.org/give');
      await page.getByRole('button', { name: 'Save intake' }).click();
      await navButton(page, 'Findings').click();
      await page.check('#scenario-harbour-lantern');
    });

    await step('clear local data returns to an empty intake and keeps unrelated storage', async () => {
      await page.getByRole('button', { name: 'Clear local data' }).click();
      await page.getByRole('button', { name: 'Yes, clear demo data' }).click();
      assert.equal(await page.locator('h1').innerText(), 'Charity intake');
      assert.equal(await page.locator('#intake-displayName').inputValue(), '');
      assert.match(await page.locator('body').innerText(), /Local demo data cleared\./);
      const keys = await page.evaluate(() => Object.keys(localStorage));
      assert.deepEqual(keys, ['unrelated-demo-key']);
      await page.reload();
      assert.equal(await page.locator('h1').innerText(), 'Charity intake');
      assert.equal(await page.evaluate(() => localStorage.getItem('unrelated-demo-key')), 'keep');
      assert.equal(await navButton(page, 'Findings').isDisabled(), true);
    });

    await step('unreadable stored data shows a notice and an empty intake', async () => {
      await page.evaluate((key) => localStorage.setItem(key, '{"version":1,"case":{"broken'), STORAGE_KEY);
      await page.reload();
      assert.match(await page.locator('body').innerText(), /could not be read, so an empty workspace was started/);
      assert.equal(await page.locator('h1').innerText(), 'Charity intake');
      await page.getByRole('button', { name: 'Clear local data' }).click();
      await page.getByRole('button', { name: 'Yes, clear demo data' }).click();
      await page.reload();
      assert.doesNotMatch(await page.locator('body').innerText(), /could not be read/);
    });

    await step('keyboard only: complete intake and reach the report with visible teal focus', async () => {
      await page.reload();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link no-print');
      const ring = await page.evaluate(() => {
        const s = getComputedStyle(document.activeElement);
        return { color: s.outlineColor, style: s.outlineStyle, width: s.outlineWidth };
      });
      assert.deepEqual(ring, { color: 'rgb(15, 110, 106)', style: 'solid', width: '2px' });
      await tabUntil(page, () => document.activeElement.id === 'intake-displayName');
      await page.keyboard.type('Keyboard Test Charity');
      await page.keyboard.press('Tab');
      await page.keyboard.type('https://keyboard.example');
      await tabUntil(page, () => document.activeElement.id === 'intake-siteControl-0');
      await page.keyboard.press('Space');
      await tabUntil(page, () => document.activeElement.id === 'intake-activities-1');
      await page.keyboard.press('Space');
      await tabUntil(page, () => document.activeElement.name === 'intake-changeManager');
      await page.keyboard.press('Space');
      await tabUntil(page, () => document.activeElement.name === 'intake-support');
      await page.keyboard.press('ArrowDown');
      await tabUntil(page, () => document.activeElement.id === 'intake-acknowledged');
      await page.keyboard.press('Space');
      await tabUntil(page, () => document.activeElement.type === 'submit');
      const buttonRing = await page.evaluate(() => getComputedStyle(document.activeElement).outlineColor);
      assert.equal(buttonRing, 'rgb(15, 110, 106)');
      await page.keyboard.press('Enter');
      assert.equal(await activeId(page), 'screen-heading');
      await tabUntil(page, () => document.activeElement.id === 'scenario-harbour-lantern');
      await page.keyboard.press('ArrowDown');
      assert.ok(await page.locator('#scenario-banyan-neighbours').isChecked(), 'arrow keys move between samples');
      await tabUntil(page, () => document.activeElement.textContent === 'Continue to provider report');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('h1').innerText(), 'Provider report');
      assert.equal(await activeId(page), 'screen-heading');
      assert.match(await page.locator('#request-draft').inputValue(), /Volunteer registration|volunteer/i);
    });

    await step('narrow viewport: every screen fits 360px without horizontal scrolling', async () => {
      await page.setViewportSize({ width: 360, height: 760 });
      for (const [nav, label] of [
        ['Intake', 'intake'],
        ['Findings', 'findings'],
        ['Report', 'report'],
        ['Follow-up', 'followup'],
      ]) {
        await navButton(page, nav).click();
        await noOverflow(page, label);
        await page.screenshot({ path: `${OUT}narrow-${label}.png`, fullPage: true });
      }
      await page.getByRole('button', { name: '繁體中文' }).click();
      await navButton(page, '觀察結果').click();
      await noOverflow(page, 'findings zh-HK');
      await page.screenshot({ path: `${OUT}narrow-findings-zh.png`, fullPage: true });
      await page.setViewportSize({ width: 1280, height: 900 });
    });

    await step('preview session: loopback only, no images, no CSP violations, no page errors', async () => {
      const csp = await page.evaluate(() => window.__csp);
      const consoleCsp = log.console.filter((m) => /Content.Security.Policy/i.test(m));
      recorded.preview = { requests: [...new Set(log.requests)], csp, consoleCsp, errors: log.errors };
      assert.deepEqual(log.external, []);
      assert.deepEqual(log.images, []);
      assert.deepEqual(csp, []);
      assert.deepEqual(consoleCsp, []);
      assert.deepEqual(log.errors, []);
    });
    await context.close();

    await step('dev server: app loads under the dev CSP with hot reload connected and no violations', async () => {
      const devContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await devContext.addInitScript(INIT);
      const devPage = await devContext.newPage();
      const devLog = monitor(devPage, DEV);
      await devPage.goto(`${DEV}/`);
      await devPage.getByRole('heading', { name: 'Charity intake' }).waitFor();
      await devPage.waitForFunction(() => true);
      await devPage.waitForTimeout(500);
      await paletteOk(devPage, 'dev intake');
      const csp = await devPage.evaluate(() => window.__csp);
      recorded.dev = { requests: [...new Set(devLog.requests)].length, csp, console: devLog.console };
      assert.ok(devLog.console.some((m) => m.includes('[vite] connected')), 'HMR WebSocket connected');
      assert.deepEqual(devLog.external, []);
      assert.deepEqual(devLog.images, []);
      assert.deepEqual(csp, []);
      assert.deepEqual(devLog.errors, []);
      await devContext.close();
    });
  } finally {
    await browser.close();
    await devServer?.close();
    await new Promise((resolve) => previewServer.httpServer.close(resolve));
  }

  const failed = results.filter((r) => !r.ok);
  await writeFile(`${OUT}browser-summary.json`, JSON.stringify({ when: new Date().toISOString(), ...recorded, results }, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} browser checks passed. Artefacts in test-results/.`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
