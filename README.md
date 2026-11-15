# Parapet

**Parapet: Website Security for Small Charities** is a bilingual case workspace for an HKUST ISOM1400 demonstration, in English and Hong Kong Traditional Chinese.

A coordinator records how a charity's website is run. They can then check four security headers on that website's address. Each observation is explained in plain language. The workspace shows up to three explained priorities, drafts a polite provider request, and leaves a handover for the next coordinator.

Three fictional example sites stay available for teaching. Each is labelled *Fictional example* where it is chosen.

Case data stays in this browser. The only outside request is the header check you start. It runs on the local Vite server on this computer, never in the page itself.

## Design

The interface uses three hues: white `#FFFFFF`, dark gray `#243038`, and teal `#0F6E6A`.
- Borders, quiet surfaces and muted text are mixes of those three.
- Tailwind's default palette is removed in [`src/index.css`](src/index.css), so no other hue can appear.
- Status, validation and priority are shown with words, weight and borders. Red, green and amber are not used, except for the remark beside each header under Report → Observations.
- That remark uses dark green `#1B7A45` for an expected or noted value, dark amber `#9A6700` when the setting needs a look, and dark red `#B42318` when the technical severity is moderate. The wording is unchanged. Those three hues appear nowhere else.

There are no images, icons, logos, background images or favicon, and no font files; the system font stack covers both languages.

The dark bar and the step bar are one line in both languages, with the same height in each. The English step names are short (*Intake*, *Findings*, *Report*, *Follow-up*), and each button's tooltip gives the full name.

## Commands

Tested with Node 24.22.3 and pnpm 11.28.5 on macOS.

| Command | What it does |
| --- | --- |
| `pnpm install` | Installs locked dependencies. esbuild's install script is explicitly declined in `pnpm-workspace.yaml`; the build does not need it. |
| `pnpm dev` | Development server at http://127.0.0.1:5173 (loopback only, fixed port), including the header check. |
| `pnpm build` | Type-checks with `tsc`, then builds to `dist/`. |
| `pnpm preview` | Serves the build at http://127.0.0.1:4173 with the production headers and the header check. |
| `pnpm test` | Unit tests for ranking, validation, storage, translations, live classification and the header-check guards (`node --test`). |
| `pnpm test:browser` | Builds, serves with preview and dev (reusing a dev server already running on 5173), checks headers and the endpoint, and runs the full walkthrough in Chrome. Writes screenshots, A4 PDFs and `browser-summary.json` to `test-results/`. |

## Class demonstration (about five minutes)

1. Run `pnpm build && pnpm preview` and open http://127.0.0.1:4173.
2. **Intake.** Fill in the form:
   - a charity name and the website address you have permission to check;
   - keep English, choose that the charity can change the website, tick *Donations*, and choose *A website provider or agency* and *No regular technical help*;
   - accept the acknowledgement.
3. **Findings.** Choose **Check this address**.
   - The panel shows when the check ran, the final address after redirects, the HTTP status and the number of redirects.
   - If the charity can change the site, the questions below come from that website's own headers. Their order is not a ranking of its biggest risks. Expand one to see the literal header line and its limits. A platform page explains the settings and does not draft a change letter.
   - To compare, choose *Harbour Lantern Giving Circle*, a fictional example, then switch back to *Live check of this address*.
4. Switch to **繁體中文**. The order and IDs stay the same.
5. **Report.** The scope gives the checked address and the time of the check. Edit the request, choose *Copy request* (the copied text starts with the scope line), then *Print report*.
6. **Follow-up.** Record the actions:
   - Defer one action; saving without a reason is blocked.
   - Mark another *Rechecked* with today's date, an evidence note and an outcome. **Check again** on Findings gives fresh evidence for that note.
   - Fill in the handover names and print the handover.
7. Refresh to show persistence, then use **Clear local data** in the footer.

## Why the intake asks what it asks

- **Can the charity change this website** decides whether a live check drafts a change request. The answer is not guessed from the address. A platform page, or an unknown host, is explained as someone else's settings. No letter says "our website", and no follow-up action is created.
- **What the website is used for** re-ranks a fictional example. For example, a donation page ranks a payment-related Referrer-Policy above a site-wide setting. It does not change which page a live check fetches, and a live observation is never described as specific to the selected activity.
- **Who makes changes** becomes the owner of each action and in the handover when the charity can change the site. It does not apply to a platform's headers.
- **Technical support** changes the next step: ask the provider, use the contract, or review in-house. It never changes severity.

## The header check

The browser cannot read another site's response headers, so the page sends the address to `POST /api/header-check` on the same loopback server. The server is in [`server/headerCheck.ts`](server/headerCheck.ts) and is added to both Vite servers by a plugin in [`vite.config.ts`](vite.config.ts).

The server requests the address once with `GET` and does not read the body. It returns only five values:
- `Strict-Transport-Security`
- `Content-Security-Policy`
- `Content-Security-Policy-Report-Only`
- `X-Content-Type-Options`
- `Referrer-Policy`

Each value is capped at 4,000 characters. The result also records the requested address, the final address, the HTTP status, the number of redirects and the check time.

### Guards

The server refuses the following:
- schemes other than `http` and `https`, addresses with a user name or password, and non-default ports;
- loopback, private, link-local, shared, documentation and multicast addresses, including IPv4 written inside IPv6.

The address check runs in the DNS lookup used for the actual connection, so a name that resolves to `127.0.0.1` is refused as well. Each redirect target is validated again, with at most 5 redirects, and the whole check times out after 8 seconds.

The endpoint itself accepts only same-origin `POST` requests:
- the `Host` must be the exact loopback host, and `Origin` and `Sec-Fetch-Site` must match it;
- `Content-Type` must be `application/json`, and the body is capped at 4 KB;
- at most two checks run at once.

Responses are `no-store` and `nosniff`. Failures return one of these codes: `badRequest`, `invalidUrl`, `credentials`, `scheme`, `port`, `blockedAddress`, `dns`, `timeout`, `tooManyRedirects`, `tls`, `network` or `busy`. The page shows each code as a sentence in the active language. If no endpoint answers, as on a static host, the page says the check needs `pnpm dev` or `pnpm preview`.

### How observations are classified

[`src/domain/live.ts`](src/domain/live.ts) turns the headers into the same four observations the fictional examples use. The bilingual text is in [`src/domain/liveText.ts`](src/domain/liveText.ts).

| Header | Expected | Worth a question, if the charity can change the site | Recorded, not a question |
| --- | --- | --- | --- |
| HSTS | One valid `max-age` of at least one day on an HTTPS final address. The sentence states that duration: 31536000 seconds is one year, not "at least a day". | Final address over plain HTTP, `max-age=0`, under one day, missing on HTTPS, or no single valid `max-age` | — |
| CSP | Enforced policy whose `script-src` (or `default-src`) avoids `*`, `http:`, `https:`, `data:`, `blob:`, and `'unsafe-inline'` without a nonce or hash | No policy; an enforced policy whose script rule is broad; a report-only policy that does restrict scripts. Reports are mentioned only when `report-uri` or `report-to` is present, and the check never claims anyone reads them. | A policy with no script directive, including one that only lists who may embed the page. It is not called a permissive script policy. |
| X-Content-Type-Options | `nosniff` | Any other value | No header. Adding `nosniff` can be sensible hardening. Its absence is not an exploitable flaw. |
| Referrer-Policy | Last recognised token is a limiting policy | `unsafe-url` or `no-referrer-when-downgrade` | No header, or a value browsers ignore. Current browsers already use `strict-origin-when-cross-origin`. |

The evidence shown is the literal header line. Every observation keeps its limits: one response cannot show other hosts, certificate renewal, or a policy set inside the page HTML. Selecting an activity does not mean that activity's pages were checked.

If the intake address changes, the stored result is cleared, along with the actions, drafts and handover recorded against it. Results from the fictional examples are kept.

## How priorities are chosen

[`src/domain/priority.ts`](src/domain/priority.ts) is a pure function. It ranks the fictional examples. Observations with nothing to review are excluded. The rest are sorted by four keys in turn:

1. Whether the observation directly affects a selected activity.
2. An explicit setting to review before an absent header.
3. Fixed header order: HSTS, CSP, X-Content-Type-Options, Referrer-Policy.
4. Stable ID.

At most three are shown. Support level changes the owner and next step but never the technical severity. Severity is qualitative and can be *undetermined from this evidence*. There are no scores or grades.

A live check uses that shortlist only when the charity can change the website, and only for observations marked as questions. Live observations are not tagged with an activity, so the selected activities do not decide the order, and the screen calls them questions rather than priorities. The order is not a judgement of the website's biggest risks. When the page is a platform the charity does not control, or when that is unknown, the check lists the four observations and does not number questions, draft a change letter, or create follow-up actions.

## Browser storage

The app keeps one versioned, validated record in `localStorage` under `isom1400.charityWorkspace.state`. The key keeps its original name, so cases saved before the rename are not lost.
- Version 3 records who can change the website. A version 2 case loads with that answer set to *Not sure*, so it does not gain a letter that says "our website". Version 1 records load with no header-check result.
- Actions are keyed by case, observation source and finding; drafts by case, source and language.
- A stored result is kept only if it matches the current intake address.
- Unreadable or invalid data is set aside with a visible notice. If storage is unavailable, the session runs in memory and says so.
- **Clear local data** removes only keys that start with `isom1400.charityWorkspace`.

Browser storage suits non-sensitive demo data only.

## Response headers

The headers the app itself is served with are separate from the headers it checks. They are configured in [`vite.config.ts`](vite.config.ts).

| Header | Development (`pnpm dev`) | Preview (`pnpm preview`) |
| --- | --- | --- |
| Content-Security-Policy | Same as preview, except `connect-src 'self' ws://127.0.0.1:5173` | `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'none'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` |
| X-Content-Type-Options | `nosniff` | `nosniff` |
| Referrer-Policy | `strict-origin-when-cross-origin` | `strict-origin-when-cross-origin` |
| Strict-Transport-Security | Not sent (plain HTTP) | Not sent (plain HTTP) |

- `connect-src 'self'` lets the page call the loopback header check. The page itself contacts no other origin.
- `img-src` is `'none'` rather than `'self'` because the interface has no images.
- The only development-only allowance is the hot-reload WebSocket on the loopback port.
- Development needs no `'unsafe-inline'` style exception. The stylesheet is linked from `index.html` instead of being injected by JavaScript.
- Production has no `unsafe-eval` and no inline script or style.

### HTTPS deployment example

[`deploy/_headers`](deploy/_headers) is an example for static hosts that read a `_headers` file, such as Netlify or Cloudflare Pages. It sends the production headers plus `Strict-Transport-Security: max-age=300`.
- The five-minute duration is deliberate, so a mistake expires quickly. `includeSubDomains` and `preload` are left out.
- Before raising the duration, confirm that every host and subdomain serves valid HTTPS, that HTTP redirects to HTTPS, and that certificate renewal is automated. Raise it in stages, for example a day, then a week, then longer.

A static host has no header-check endpoint, so on such a host the page reports that the check is unavailable. The fictional examples still work. This prototype has not been deployed.

## Verification results (15 November 2026)

- **Type check and build:** `pnpm build` passed. The output is `index.html`, one JavaScript file and one CSS file, with no inline script or style. No server code is bundled into the page.
- **Unit tests:** `pnpm test` passed 54 of 54. They cover:
  - priority ranking, URL validation and the deferral and recheck rules;
  - storage round-trips, the version 1 to version 3 migration, a version 2 case loading as *Not sure*, rejection of malformed results, and dropping a result for a different address;
  - the classification of each header state, including a one-year HSTS value and a report-only policy that only lists who may embed the page, and the use of live observations in questions;
  - the client accepting only well-formed results;
  - the server guards, tested against real local servers: blocked address ranges, blocked literal IP forms (decimal, hex, IPv6), refusal of `localhost` at lookup, the five returned headers, the 4,000-character cap, re-validated redirects, the redirect limit, timeouts, method, origin, content type and body-size checks, and the two-check limit;
  - matching dictionaries, full translation of fixture and live text, the exact acknowledgement wording, and the absence of the sample banner.
- **Browser checks:** `pnpm test:browser` passed 26 of 26:
  - Every header in the table above was observed in both modes. The preview endpoint refused `GET` (405), a foreign `Origin` or cross-site fetch (403), `text/plain` (415), and `127.0.0.1`, `localhost`, `[::1]`, `169.254.169.254` and `192.168.0.1` (403, `blockedAddress`). The dev server's endpoint refuses loopback too.
  - The *Parapet* wordmark and tab title, with no *ISOM1400* or *Sample data* text anywhere. The dark bar and step bar have identical heights in English and Chinese at 1280px and 360px, and no step label overflows.
  - In the live flow, the intake address is posted to the endpoint, and the result selects *Live check of this address*. When the charity can change the site, the mocked headers list CSP, Referrer-Policy, then HSTS as questions, without describing them as donation findings. It also shows the literal header line, the final address and the redirect count. The report describes one response, and the live follow-up actions save and survive a reload. Choosing the platform answer removes the questions and the change letter. Timeout and unavailable errors are announced while the last result is kept. Changing the address clears the result and its live actions, and a real in-page check of `http://127.0.0.1/` is refused.
  - The earlier walkthrough still passes: intake validation, the fictional examples, re-ranking, language switching, copy and print in both languages, follow-up rules, persistence, clearing, keyboard-only use, the 360px layout, the palette, and no images, CSP violations or page errors.
- **Real websites:** run with network access:
  - `http://example.com` stayed on plain HTTP, so HSTS was flagged, and it sent none of the other three headers.
  - `https://github.com` returned all four headers with expected values.

### Environment limits

- Playwright 1.61.1 expects Chromium build 1228, but only build 1208 was cached. The browser checks ran on the installed Google Chrome 158 through Playwright's `chrome` channel; `tests/browser.mjs` tries the bundled Chromium first. Launching Chrome required running outside the agent sandbox.
- A `pnpm dev` server was already running on port 5173, so the browser checks used it for the development steps.
- In the browser checks, successful live results are mocked with Playwright routes so the run does not depend on outside websites. The refusals use the real endpoint.
- The checks ran in headless Chrome on macOS only. Safari, Firefox, mobile devices and screen readers were not tested. The PDFs came from Chrome's print engine, not a physical printer.

## Scope

This is a teaching demonstration. The header check reads four response headers from one address, from the computer running the app. It is not a vulnerability scan: it does not crawl, log in, test forms or probe for weaknesses. Only check websites you are allowed to check. The intake acknowledgement still asks for separate permission and an agreed scope before any real review.

The app does not authenticate anyone, store sensitive records, send messages or use hosting. Partner pilots, user testing and impact evaluation are future work. This project makes no claims about participation, usability or impact.
