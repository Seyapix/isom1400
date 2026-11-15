import type { FindingText, Lang } from './types.ts';

export type HstsState = 'httpOnly' | 'absent' | 'disabled' | 'short' | 'invalid' | 'ok';
export type CspState = 'reportOnly' | 'absent' | 'permissive' | 'ok';
export type XctoState = 'absent' | 'invalid' | 'ok';
export type ReferrerState = 'absent' | 'unsafe' | 'invalid' | 'ok';

type StateText = Pick<FindingText, 'meaning' | 'rationale' | 'request' | 'dependencies'>;
interface CheckText<S extends string> {
  significance: string;
  limits: string;
  states: Record<S, StateText>;
}

export interface LiveText {
  pageContext: (finalUrl: string, status: number, redirects: number) => string;
  hsts: CheckText<HstsState>;
  csp: CheckText<CspState>;
  xcto: CheckText<XctoState>;
  referrer: CheckText<ReferrerState>;
}

const EN_ROUTINE = 'Routine in this response, so it is recorded but not placed on the shortlist.';
const ZH_ROUTINE = '在這次回應中屬於例行情況，因此只作記錄，不列入優先清單。';

const EN_HSTS_DEPS =
  'Provider confirms HTTPS coverage for every host and the certificate renewal process before any policy is enabled.';
const ZH_HSTS_DEPS = '在啟用任何政策前，供應商需確認所有主機的 HTTPS 覆蓋範圍及證書續期安排。';
const EN_CSP_DEPS =
  'A list of the third-party script sources the site needs, such as payment or form providers, and someone to test the forms after any change.';
const ZH_CSP_DEPS = '網站所需的第三方程式碼來源清單（例如付款或表格服務商），以及在任何更改後負責測試表格的人。';

const en: LiveText = {
  pageContext: (finalUrl, status, redirects) =>
    `Response from ${finalUrl} (HTTP ${status})${
      redirects === 0 ? '' : redirects === 1 ? ' after 1 redirect' : ` after ${redirects} redirects`
    }, checked from this computer.`,
  hsts: {
    significance:
      'Strict-Transport-Security (HSTS) lets an HTTPS response ask the browser to use HTTPS for future visits to this host. Without it, a visitor who types the address or follows an old http:// link relies on the site’s redirect each time.',
    limits:
      'One response cannot show whether every host and subdomain redirects HTTP to HTTPS, whether certificates are valid everywhere, or how they are renewed. Browsers ignore this header on plain HTTP responses.',
    states: {
      httpOnly: {
        meaning:
          'The final page was delivered over plain HTTP, so it was not encrypted on the way to the visitor, and any HSTS header would be ignored.',
        rationale: 'Visitors may type personal details into this site, and plain HTTP does not protect them in transit.',
        request:
          'Could you check whether the site can be served only over HTTPS with a valid certificate, with HTTP addresses redirecting to HTTPS, and let us know the steps and any cost?',
        dependencies: 'A valid certificate for every host, and a provider who can set up the redirect.',
      },
      absent: {
        meaning: 'The page loaded over HTTPS, but browsers were not asked to remember to always use the secure version.',
        rationale: 'Forms on the site rely on a dependable HTTPS-only route, so it is worth confirming.',
        request:
          'Could you check whether all our pages redirect to HTTPS and how certificate renewal is handled, and then advise whether an HSTS policy with a short initial duration would suit our site?',
        dependencies: EN_HSTS_DEPS,
      },
      disabled: {
        meaning: 'The header is present, but max-age=0 tells browsers to forget any earlier HTTPS-only instruction.',
        rationale: 'An explicit setting that switches the protection off. It may be deliberate or left over from testing.',
        request:
          'Could you tell us why Strict-Transport-Security is set to max-age=0, and whether it could be given a short positive duration once HTTPS coverage is confirmed?',
        dependencies: EN_HSTS_DEPS,
      },
      short: {
        meaning: 'Browsers are asked to use HTTPS only for less than a day after each visit, so the protection lapses quickly.',
        rationale: 'A short duration is a sensible start, but it is worth knowing whether it is meant to increase.',
        request:
          'Could you confirm whether the short HSTS duration is a deliberate starting value, and when it would be safe to increase it?',
        dependencies: 'Provider confirms certificate renewal is automated before a longer duration is set.',
      },
      invalid: {
        meaning:
          'The header could not be read as a valid policy because max-age is missing, repeated or malformed, so browsers are likely to ignore it.',
        rationale: 'Someone intended to enable this protection, but it may not be working.',
        request:
          'Could you check our Strict-Transport-Security value? It does not appear to contain a single valid max-age.',
        dependencies: 'Provider access to the server or hosting settings.',
      },
      ok: {
        meaning: 'Browsers are asked to keep using HTTPS for this host for at least a day. No follow-up is suggested.',
        rationale: EN_ROUTINE,
        request: 'No request is needed. If hosting or certificates change, could you confirm this header is kept?',
        dependencies: 'None for now. Recheck after a hosting or certificate change.',
      },
    },
  },
  csp: {
    significance:
      'Content-Security-Policy can restrict where a page loads scripts and other resources from, which limits the damage if unexpected code is injected.',
    limits:
      'Only the response header was read. A policy can also be set in the page HTML, and the header cannot show whether a stricter policy would break forms or payment widgets.',
    states: {
      reportOnly: {
        meaning:
          'A policy is sent in report-only mode: the browser reports what would have been blocked but does not block anything.',
        rationale:
          'Someone has started a policy, so the next step is to learn whether the reports are reviewed and whether it can be enforced.',
        request:
          'Could you confirm whether the report-only policy is being monitored, and test our main forms before advising whether to enforce it?',
        dependencies: EN_CSP_DEPS,
      },
      absent: {
        meaning: 'No policy header was returned, so the browser applies no header-based limit on where scripts load from.',
        rationale: 'Pages with forms benefit most from limiting script sources, but a policy needs careful testing.',
        request:
          'Could you check whether a Content-Security-Policy is set anywhere for our site, and advise whether a policy, perhaps starting in report-only mode, would suit our pages?',
        dependencies: EN_CSP_DEPS,
      },
      permissive: {
        meaning:
          'A policy is enforced, but its script rules allow broad sources such as any host, any HTTPS site or inline scripts, so it gives limited protection against injected code.',
        rationale: 'The policy exists but may not restrict scripts in practice.',
        request:
          'Could you review the script rules in our Content-Security-Policy and advise whether they can be narrowed without breaking our pages?',
        dependencies: EN_CSP_DEPS,
      },
      ok: {
        meaning:
          'An enforced policy limits script sources without the broad allowances checked here. No follow-up is suggested.',
        rationale: EN_ROUTINE,
        request:
          'No request is needed. When a third-party service is added or removed, could you confirm the policy is updated and tested?',
        dependencies: 'None for now. Recheck after adding or removing a third-party service.',
      },
    },
  },
  xcto: {
    significance:
      'The recognised value nosniff asks browsers to respect the declared content type of scripts and styles rather than guessing.',
    limits: 'The header does not prove that every file is served with the correct MIME type; that is a separate server setting.',
    states: {
      absent: {
        meaning: 'Browsers may guess the type of some files instead of following the declared type.',
        rationale: 'A small, low-risk setting that providers can usually add quickly.',
        request:
          'Could you add X-Content-Type-Options: nosniff to our responses, after confirming that files are served with the correct content types?',
        dependencies: 'Provider confirms content types are set correctly.',
      },
      invalid: {
        meaning: 'The header is present, but its value is not nosniff, the only recognised value, so browsers ignore it.',
        rationale: 'An explicit setting that is not having its intended effect, and is usually quick to correct.',
        request: 'Could you change our X-Content-Type-Options value to nosniff?',
        dependencies: 'Provider confirms content types are set correctly.',
      },
      ok: {
        meaning: 'This setting is present with the expected value in the response. No follow-up is suggested.',
        rationale: EN_ROUTINE,
        request: 'No request is needed. If the hosting setup changes, could you confirm this header is kept?',
        dependencies: 'None for now. Recheck after a hosting or platform change.',
      },
    },
  },
  referrer: {
    significance:
      'Referrer-Policy controls how much of the current page address is sent when a visitor follows a link or loads a resource from another site.',
    limits:
      'Browser defaults, page-level settings and individual links can change the result. The header alone cannot show whether page addresses contain anything personal, so it cannot establish that information was disclosed.',
    states: {
      absent: {
        meaning:
          'No policy header was returned, so current browsers use their default, which usually sends only the site name to other sites.',
        rationale: 'Usually low impact, but an explicit setting avoids depending on browser defaults.',
        request:
          'Could you advise whether setting Referrer-Policy: strict-origin-when-cross-origin explicitly would suit our site?',
        dependencies: 'Check that no payment or analytics provider relies on the full referring address.',
      },
      unsafe: {
        meaning:
          'This setting can send the full page address, including any path and query string, to other sites (unsafe-url) or to plain-HTTP sites (no-referrer-when-downgrade).',
        rationale: 'An explicit setting that affects pages with forms, and can usually be reviewed quickly.',
        request:
          'Could you check whether any service needs the full referring address, and whether a more limited setting such as strict-origin-when-cross-origin would be appropriate?',
        dependencies: 'Payment or form providers confirm what they need; test the forms after any change.',
      },
      invalid: {
        meaning: 'The value is not a recognised policy, so browsers ignore it and use their default.',
        rationale: 'An explicit setting that is not having its intended effect.',
        request: 'Could you check our Referrer-Policy value? It does not contain a recognised policy name.',
        dependencies: 'Provider access to the server or hosting settings.',
      },
      ok: {
        meaning: 'A recognised policy that limits what is sent to other sites. No follow-up is suggested.',
        rationale: EN_ROUTINE,
        request: 'No request is needed. If a payment or analytics provider is added, could you confirm this setting still suits it?',
        dependencies: 'None for now. Recheck after adding a third-party service.',
      },
    },
  },
};

const zhHK: LiveText = {
  pageContext: (finalUrl, status, redirects) =>
    `從這部電腦檢查 ${finalUrl} 的回應（HTTP ${status}）${redirects === 0 ? '' : `，經 ${redirects} 次轉址`}。`,
  hsts: {
    significance:
      'Strict-Transport-Security（HSTS）讓 HTTPS 回應要求瀏覽器日後瀏覽此主機時一律使用 HTTPS。若沒有這項設定，訪客輸入網址或點擊舊的 http:// 連結時，每次都要依賴網站本身的轉址。',
    limits:
      '單一回應無法顯示每個主機及子網域是否都把 HTTP 轉址至 HTTPS、證書是否全部有效，或證書如何續期。瀏覽器會忽略經普通 HTTP 傳送的這個標頭。',
    states: {
      httpOnly: {
        meaning: '最終頁面經普通 HTTP 傳送，傳送途中沒有加密，而且任何 HSTS 標頭都會被忽略。',
        rationale: '訪客可能在網站輸入個人資料，而普通 HTTP 無法在傳送途中保護這些資料。',
        request: '可否協助檢查網站能否只經 HTTPS 提供並配備有效證書，同時把 HTTP 地址轉址至 HTTPS，並告知所需步驟及費用？',
        dependencies: '每個主機都有有效證書，以及能設定轉址的供應商。',
      },
      absent: {
        meaning: '頁面以 HTTPS 載入，但網站沒有要求瀏覽器記住日後一律使用安全版本。',
        rationale: '網站上的表格依賴穩定地只經 HTTPS 存取，因此值得確認。',
        request:
          '可否協助檢查我們所有頁面是否都會轉址至 HTTPS，以及證書如何續期，然後建議以較短的初始期限設定 HSTS 是否適合我們的網站？',
        dependencies: ZH_HSTS_DEPS,
      },
      disabled: {
        meaning: '標頭存在，但 max-age=0 會要求瀏覽器忘記之前「只用 HTTPS」的指示。',
        rationale: '這是一項明確關閉保護的設定，可能是刻意的，也可能是測試時遺留下來。',
        request: '可否告知為何 Strict-Transport-Security 設為 max-age=0，以及在確認 HTTPS 覆蓋範圍後，能否改為較短的正數期限？',
        dependencies: ZH_HSTS_DEPS,
      },
      short: {
        meaning: '瀏覽器每次瀏覽後只需在不足一天內堅持使用 HTTPS，保護很快便會失效。',
        rationale: '較短的期限是合理的起點，但值得了解是否打算日後延長。',
        request: '可否確認 HSTS 的短期限是否刻意設定的起始值，以及何時可以安全地延長？',
        dependencies: '在設定較長期限前，供應商需確認證書續期已自動化。',
      },
      invalid: {
        meaning: '這個標頭無法讀作有效政策，因為 max-age 缺少、重複或格式錯誤，瀏覽器很可能會忽略它。',
        rationale: '有人打算啟用這項保護，但它可能沒有發揮作用。',
        request: '可否協助檢查我們的 Strict-Transport-Security 設定值？它似乎沒有包含單一而有效的 max-age。',
        dependencies: '供應商可存取伺服器或寄存設定。',
      },
      ok: {
        meaning: '網站要求瀏覽器在至少一天內繼續以 HTTPS 瀏覽此主機。不建議跟進。',
        rationale: ZH_ROUTINE,
        request: '現時不需要提出要求。如寄存或證書安排有變，可否確認會保留這個標頭？',
        dependencies: '暫時沒有。寄存或證書安排有變後再檢查。',
      },
    },
  },
  csp: {
    significance:
      'Content-Security-Policy（內容安全政策）可限制頁面從哪些來源載入程式碼及其他資源，萬一有不明程式碼被注入，也能減低影響。',
    limits: '這次只讀取了回應標頭。政策亦可在頁面 HTML 內設定，而標頭本身無法顯示較嚴格的政策會否影響表格或付款元件。',
    states: {
      reportOnly: {
        meaning: '政策以「只報告」（report-only）模式傳送：瀏覽器只會報告原本會被阻擋的內容，不會實際阻擋。',
        rationale: '已有人開始設定政策，下一步是了解報告是否有人檢視，以及能否改為強制執行。',
        request: '可否確認「只報告」政策是否有人監察，並在建議是否強制執行前，先測試我們的主要表格？',
        dependencies: ZH_CSP_DEPS,
      },
      absent: {
        meaning: '回應沒有政策標頭，因此瀏覽器不會按標頭限制程式碼的載入來源。',
        rationale: '設有表格的頁面最受惠於限制程式碼來源，但政策需要仔細測試。',
        request: '可否協助檢查我們的網站有否在任何地方設定 Content-Security-Policy，並建議是否適合設定政策（例如先以「只報告」模式開始）？',
        dependencies: ZH_CSP_DEPS,
      },
      permissive: {
        meaning: '政策已強制執行，但程式碼規則容許廣泛來源，例如任何主機、任何 HTTPS 網站或內嵌程式碼，因此對注入程式碼的保護有限。',
        rationale: '政策雖然存在，但實際上可能沒有限制程式碼。',
        request: '可否檢視我們 Content-Security-Policy 中的程式碼規則，並建議能否在不影響頁面的情況下收窄？',
        dependencies: ZH_CSP_DEPS,
      },
      ok: {
        meaning: '強制執行的政策限制了程式碼來源，沒有這裏檢查的廣泛容許設定。不建議跟進。',
        rationale: ZH_ROUTINE,
        request: '現時不需要提出要求。新增或移除第三方服務時，可否確認政策會一併更新及測試？',
        dependencies: '暫時沒有。新增或移除第三方服務後再檢查。',
      },
    },
  },
  xcto: {
    significance: '認可的設定值 nosniff 要求瀏覽器依照程式碼及樣式檔案所聲明的內容類型處理，而不是自行猜測。',
    limits: '這個標頭不能證明每個檔案都以正確的 MIME 類型傳送；那是另一項伺服器設定。',
    states: {
      absent: {
        meaning: '瀏覽器可能會自行猜測部分檔案的類型，而不是依照所聲明的類型處理。',
        rationale: '這是一項細小而低風險的設定，供應商通常可以很快加上。',
        request: '可否在確認檔案以正確內容類型傳送後，為我們的回應加上 X-Content-Type-Options: nosniff？',
        dependencies: '供應商確認內容類型設定正確。',
      },
      invalid: {
        meaning: '標頭存在，但設定值不是唯一認可的 nosniff，因此瀏覽器會忽略它。',
        rationale: '這是一項沒有發揮預期作用的明確設定，通常可以很快更正。',
        request: '可否把我們的 X-Content-Type-Options 設定值改為 nosniff？',
        dependencies: '供應商確認內容類型設定正確。',
      },
      ok: {
        meaning: '回應中這項設定存在，而且是預期的設定值。不建議跟進。',
        rationale: ZH_ROUTINE,
        request: '現時不需要提出要求。如寄存設定有變，可否確認會保留這個標頭？',
        dependencies: '暫時沒有。寄存或平台有變後再檢查。',
      },
    },
  },
  referrer: {
    significance: 'Referrer-Policy 控制訪客點擊連結或從其他網站載入資源時，會傳送多少目前頁面的地址。',
    limits:
      '瀏覽器預設值、頁面層面的設定及個別連結都可能改變結果。單憑這個標頭無法顯示頁面地址是否包含個人資料，因此不能確定有資料外洩。',
    states: {
      absent: {
        meaning: '回應沒有政策標頭，因此現今瀏覽器會採用預設值，通常只會向其他網站傳送網站名稱。',
        rationale: '影響通常較低，但明確設定可避免依賴瀏覽器預設值。',
        request: '可否建議明確設定 Referrer-Policy: strict-origin-when-cross-origin 是否適合我們的網站？',
        dependencies: '確認沒有付款或分析服務商依賴完整的來源地址。',
      },
      unsafe: {
        meaning: '這項設定可能會把完整頁面地址（包括路徑及查詢字串）傳送至其他網站（unsafe-url），或傳送至普通 HTTP 網站（no-referrer-when-downgrade）。',
        rationale: '這是一項影響表格頁面的明確設定，通常可以很快檢視。',
        request: '可否協助檢查是否有服務需要完整的來源地址，以及較有限的設定（例如 strict-origin-when-cross-origin）是否合適？',
        dependencies: '付款或表格服務商確認所需資料；任何更改後測試表格。',
      },
      invalid: {
        meaning: '設定值不是認可的政策，因此瀏覽器會忽略它並採用預設值。',
        rationale: '這是一項沒有發揮預期作用的明確設定。',
        request: '可否協助檢查我們的 Referrer-Policy 設定值？它沒有包含認可的政策名稱。',
        dependencies: '供應商可存取伺服器或寄存設定。',
      },
      ok: {
        meaning: '這是認可的政策，會限制傳送至其他網站的資料。不建議跟進。',
        rationale: ZH_ROUTINE,
        request: '現時不需要提出要求。如新增付款或分析服務商，可否確認這項設定仍然合適？',
        dependencies: '暫時沒有。新增第三方服務後再檢查。',
      },
    },
  },
};

export const LIVE_TEXT: Record<Lang, LiveText> = { en, 'zh-HK': zhHK };
