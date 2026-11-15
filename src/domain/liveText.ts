import type { Lang } from './types.ts';

export type HstsState = 'httpOnly' | 'absent' | 'disabled' | 'short' | 'invalid' | 'ok';
export type CspState = 'reportOnlyScripts' | 'reportOnlyOther' | 'noScript' | 'absent' | 'permissive' | 'ok';
export type XctoState = 'absent' | 'invalid' | 'ok';
export type ReferrerState = 'absent' | 'unsafe' | 'invalid' | 'ok';

type StateText = { meaning: string; rationale: string; request: string; dependencies: string };
interface CheckText<S extends string> {
  significance: string;
  limits: string;
  states: Record<S, StateText>;
}

export interface PolicyFacts {
  frameAncestors: boolean;
  reports: boolean;
  broadScripts: boolean;
}

export interface LiveText {
  pageContext: (finalUrl: string, status: number, redirects: number) => string;
  hsts: CheckText<Exclude<HstsState, 'ok' | 'short'>>;
  csp: CheckText<Exclude<CspState, 'reportOnlyScripts' | 'reportOnlyOther' | 'noScript'>>;
  xcto: CheckText<XctoState>;
  referrer: CheckText<ReferrerState>;
}

const DAY = 86400;
const YEAR = 365 * DAY;

/** Plain duration for an observed max-age. 31536000 seconds is one year, not “at least a day”. */
export function formatDuration(seconds: number, lang: Lang): string {
  if (seconds > 0 && seconds % YEAR === 0) {
    const years = seconds / YEAR;
    if (lang === 'zh-HK') return years === 1 ? '一年' : `${years} 年`;
    return years === 1 ? 'one year' : `${years} years`;
  }
  if (seconds > 0 && seconds % DAY === 0) {
    const days = seconds / DAY;
    if (lang === 'zh-HK') return days === 1 ? '一天' : `${days} 天`;
    return days === 1 ? 'one day' : `${days} days`;
  }
  if (seconds > 0 && seconds % 3600 === 0) {
    const hours = seconds / 3600;
    if (lang === 'zh-HK') return hours === 1 ? '一小時' : `${hours} 小時`;
    return hours === 1 ? 'one hour' : `${hours} hours`;
  }
  if (seconds >= 60 && seconds % 60 === 0) {
    const minutes = seconds / 60;
    if (lang === 'zh-HK') return minutes === 1 ? '一分鐘' : `${minutes} 分鐘`;
    return minutes === 1 ? 'one minute' : `${minutes} minutes`;
  }
  if (lang === 'zh-HK') return `${seconds} 秒`;
  return seconds === 1 ? '1 second' : `${seconds} seconds`;
}

const EN_ROUTINE = 'Routine in this response, so it is recorded but not placed on the question list.';
const ZH_ROUTINE = '在這次回應中屬於例行情況，因此只作記錄，不列入提問。';
const EN_NO_REQUEST = 'No request is suggested from this response.';
const ZH_NO_REQUEST = '這次回應不建議提出要求。';
const EN_NONE = 'None for now.';
const ZH_NONE = '暫時沒有。';

const EN_HSTS_DEPS =
  'Whoever can change the site confirms HTTPS coverage for every host and the certificate renewal process before any policy is enabled.';
const ZH_HSTS_DEPS = '在啟用任何政策前，能更改網站的人需確認所有主機的 HTTPS 覆蓋範圍及證書續期安排。';
const EN_CSP_DEPS =
  'A list of the third-party script sources the site needs, such as payment or form providers, and someone to test after any change. This response did not open those pages.';
const ZH_CSP_DEPS = '網站所需的第三方程式碼來源清單（例如付款或表格服務商），以及在任何更改後負責測試的人。這次回應沒有開啟那些頁面。';

function reportsSentence(lang: Lang, reports: boolean): string {
  if (lang === 'zh-HK') {
    return reports
      ? '標頭寫有報告目的地，但這次檢查無法顯示有沒有人接收或閱讀那些報告。'
      : '印出的標頭沒有報告目的地，因此不能據此說有報告被送出。';
  }
  return reports
    ? 'The header names a reporting destination. This check cannot show whether anyone receives or reads those reports.'
    : 'The printed header does not name a reporting destination, so it does not show that reports are sent.';
}

export function hstsStateText(lang: Lang, state: 'ok' | 'short', duration: string): StateText {
  if (lang === 'zh-HK') {
    return state === 'ok'
      ? {
          meaning: `網站要求瀏覽器在${duration}內繼續以 HTTPS 瀏覽此主機。不建議跟進。`,
          rationale: ZH_ROUTINE,
          request: '現時不需要提出要求。如寄存或證書安排有變，可否確認會保留這個標頭？',
          dependencies: '暫時沒有。寄存或證書安排有變後再檢查。',
        }
      : {
          meaning: `瀏覽器每次瀏覽後只需在${duration}內堅持使用 HTTPS，少於一天，保護很快便會失效。`,
          rationale: '較短的期限是合理的起點，但值得了解是否打算日後延長。這不是漏洞的證據。',
          request: '可否確認 HSTS 的短期限是否刻意設定的起始值，以及何時可以安全地延長？',
          dependencies: '在設定較長期限前，能更改網站的人需確認證書續期已自動化。',
        };
  }
  return state === 'ok'
    ? {
        meaning: `Browsers are asked to keep using HTTPS for this host for ${duration}. No follow-up is suggested.`,
        rationale: EN_ROUTINE,
        request: 'No request is needed. If hosting or certificates change, could you confirm this header is kept?',
        dependencies: 'None for now. Recheck after a hosting or certificate change.',
      }
    : {
        meaning: `Browsers are asked to use HTTPS only for ${duration} after each visit. That is less than a day, so the protection lapses quickly.`,
        rationale: 'A short duration is a sensible start, but it is worth knowing whether it is meant to increase. It is not evidence of a vulnerability.',
        request: 'Could you confirm whether the short HSTS duration is a deliberate starting value, and when it would be safe to increase it?',
        dependencies: 'Whoever can change the site confirms certificate renewal is automated before a longer duration is set.',
      };
}

export function cspStateText(
  lang: Lang,
  state: 'reportOnlyScripts' | 'reportOnlyOther' | 'noScript',
  facts: PolicyFacts,
): StateText {
  const reports = reportsSentence(lang, facts.reports);
  if (lang === 'zh-HK') {
    if (state === 'reportOnlyScripts') {
      return {
        meaning: `這是只報告的政策，瀏覽器不會強制執行。它限制程式碼來源。${reports}這次檢查無法顯示有沒有人閱讀報告。`,
        rationale: '政策沒有強制執行。這是一項可以詢問的設定，並非網站不安全的證據。',
        request: facts.reports
          ? '標頭寫有報告目的地。可否告知那些報告是否有人閱讀，以及在強制執行前需要測試甚麼？這次回應沒有開啟那些頁面。'
          : '可否告知這個只報告的程式碼政策是否打算維持現狀？印出的標頭並沒有顯示有報告被送出。',
        dependencies: ZH_CSP_DEPS,
      };
    }
    if (state === 'noScript') {
      const embed = facts.frameAncestors ? '它列出哪些網站可以嵌入此頁面。' : '';
      return {
        meaning: `有一項已強制執行的政策，但它沒有限制程式碼。${embed}不建議根據這次檢查提出更改。`,
        rationale: ZH_ROUTINE,
        request: ZH_NO_REQUEST,
        dependencies: ZH_NONE,
      };
    }
    const broad = facts.broadScripts ? '它有程式碼規則，但規則容許廣泛來源，而且瀏覽器不會強制執行。' : '它沒有限制程式碼。';
    const embed = facts.frameAncestors ? '它列出哪些網站可以嵌入此頁面。' : '';
    return {
      meaning: `這個標頭處於只報告模式，因此不會強制執行限制。${broad}${embed}${reports}不建議根據這次檢查提出更改。`,
      rationale: '這不是控制程式碼的政策。印出的標頭亦不足以證明有報告被送出，除非標頭寫有報告目的地。',
      request: ZH_NO_REQUEST,
      dependencies: ZH_NONE,
    };
  }
  if (state === 'reportOnlyScripts') {
    return {
      meaning: `A report-only policy limits script sources, but the browser does not enforce it. ${reports} This check cannot show that anyone reads reports.`,
      rationale: 'The policy is not enforced. This is a question about the setting, not evidence that the site is unsafe.',
      request: facts.reports
        ? 'The header names a reporting destination. Could you tell us whether those reports are read, and what would need testing before the policy was enforced? This response did not open those pages.'
        : 'Could you tell us whether this report-only script policy is meant to stay as it is? The printed header does not show that reports are sent.',
      dependencies: EN_CSP_DEPS,
    };
  }
  if (state === 'noScript') {
    const embed = facts.frameAncestors ? ' It lists which sites may embed the page.' : '';
    return {
      meaning: `An enforced policy is present, but it does not restrict scripts.${embed} No change is suggested from this check.`,
      rationale: EN_ROUTINE,
      request: EN_NO_REQUEST,
      dependencies: EN_NONE,
    };
  }
  const broad = facts.broadScripts
    ? 'It includes a script rule, but that rule allows broad sources, and the browser does not enforce it. '
    : 'It does not restrict scripts. ';
  const embed = facts.frameAncestors ? 'It lists which sites may embed the page. ' : '';
  return {
    meaning: `This header is in report-only mode, so it does not enforce restrictions. ${broad}${embed}${reports} No change is suggested from this check.`,
    rationale:
      'This is not a policy controlling scripts. The printed header also does not establish that reports are sent unless it names a reporting destination.',
    request: EN_NO_REQUEST,
    dependencies: EN_NONE,
  };
}

const en: LiveText = {
  pageContext: (finalUrl, status, redirects) =>
    `Response from ${finalUrl} (HTTP ${status})${
      redirects === 0 ? '' : redirects === 1 ? ' after 1 redirect' : ` after ${redirects} redirects`
    }, checked from this computer. This is one response from that address, not a donation, sign-up, or payment flow.`,
  hsts: {
    significance:
      'Strict-Transport-Security (HSTS) lets an HTTPS response ask the browser to use HTTPS for future visits to this host. Without it, a visitor who types the address or follows an old http:// link relies on the site’s redirect each time.',
    limits:
      'One response cannot show whether every host and subdomain redirects HTTP to HTTPS, whether certificates are valid everywhere, or how they are renewed. Browsers ignore this header on plain HTTP responses. It does not by itself establish a vulnerability.',
    states: {
      httpOnly: {
        meaning:
          'The final page was delivered over plain HTTP, so it was not encrypted on the way to the visitor, and any HSTS header would be ignored.',
        rationale: 'A page reached over plain HTTP is worth a question when the charity can change the site. This is not proof of a broader flaw.',
        request:
          'Could you check whether the site can be served only over HTTPS with a valid certificate, with HTTP addresses redirecting to HTTPS, and let us know the steps and any cost?',
        dependencies: 'A valid certificate for every host, and someone who can set up the redirect.',
      },
      absent: {
        meaning: 'The page loaded over HTTPS, but this response did not ask browsers to remember to keep using HTTPS.',
        rationale: 'Worth a question when the charity can change the site. One response does not show that the site is unsafe.',
        request:
          'Could you check whether pages on the website redirect to HTTPS and how certificate renewal is handled, and then advise whether an HSTS policy with a short initial duration would suit the site?',
        dependencies: EN_HSTS_DEPS,
      },
      disabled: {
        meaning: 'The header is present, but max-age=0 tells browsers to forget any earlier HTTPS-only instruction.',
        rationale: 'An explicit setting that switches the instruction off. It may be deliberate or left over from testing. It is not proof of a vulnerability.',
        request:
          'Could you tell us why Strict-Transport-Security is set to max-age=0, and whether it could be given a short positive duration once HTTPS coverage is confirmed?',
        dependencies: EN_HSTS_DEPS,
      },
      invalid: {
        meaning:
          'The header could not be read as a valid policy because max-age is missing, repeated or malformed, so browsers are likely to ignore it.',
        rationale: 'Someone set this header, but the value may not be taking effect. That is a question, not a finding of a flaw.',
        request: 'Could you check the Strict-Transport-Security value? It does not appear to contain a single valid max-age.',
        dependencies: 'Access to the server or hosting settings for someone who can change the site.',
      },
    },
  },
  csp: {
    significance:
      'Content-Security-Policy can restrict where a page loads scripts and other resources from, which limits the damage if unexpected code is injected. A policy can also do other jobs, such as listing which sites may embed the page, without restricting scripts.',
    limits:
      'Only the response header was read. A policy can also be set in the page HTML. The header cannot show whether a stricter policy would break a form, and it cannot show that anyone reads reports unless the question asks about a reporting destination that is actually named.',
    states: {
      absent: {
        meaning: 'No policy header was returned, so this response applies no header-based limit on where scripts load from.',
        rationale: 'Worth a question when the charity can change the site. A missing policy is not itself an exploitable flaw, and adding one needs testing.',
        request:
          'Could you check whether a Content-Security-Policy is set anywhere for the website, and advise whether a policy, perhaps starting in report-only mode, would suit it?',
        dependencies: EN_CSP_DEPS,
      },
      permissive: {
        meaning:
          'A policy is enforced, but its script rules allow broad sources such as any host, any HTTPS site or inline scripts, so it gives limited protection against injected code.',
        rationale: 'The policy exists but may not restrict scripts in practice. That is a question, not proof of an exploitable flaw.',
        request:
          'Could you review the script rules in the Content-Security-Policy and advise whether they can be narrowed without breaking the pages that would be affected?',
        dependencies: EN_CSP_DEPS,
      },
      ok: {
        meaning: 'An enforced policy limits script sources without the broad allowances checked here. No follow-up is suggested.',
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
    limits: 'The header does not prove that every file is served with the correct MIME type; that is a separate server setting. Its absence is not an exploitable flaw.',
    states: {
      absent: {
        meaning:
          'This response did not include X-Content-Type-Options. Adding nosniff can be sensible hardening. Its absence does not show an exploitable flaw, so no change is suggested.',
        rationale: 'A low-value note. It is recorded, and it is not a question.',
        request: EN_NO_REQUEST,
        dependencies: EN_NONE,
      },
      invalid: {
        meaning: 'The header is present, but its value is not nosniff, the only recognised value, so browsers ignore it.',
        rationale: 'An explicit value browsers ignore. Worth a question when the charity can change the site. It is usually a small correction, not evidence of a flaw.',
        request: 'Could you change the X-Content-Type-Options value to nosniff, after confirming that files are served with the correct content types?',
        dependencies: 'Whoever can change the site confirms content types are set correctly.',
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
          'No Referrer-Policy header was returned. Current browsers already use strict-origin-when-cross-origin, which is the value an explicit header would otherwise repeat. Setting it is a low-value note, not an urgent fix.',
        rationale: 'Recorded so the result can be read. Not a question.',
        request: EN_NO_REQUEST,
        dependencies: EN_NONE,
      },
      unsafe: {
        meaning:
          'This setting can send the full page address, including any path and query string, to other sites (unsafe-url) or to plain-HTTP sites (no-referrer-when-downgrade).',
        rationale: 'An explicit setting worth a question when the charity can change the site. It does not prove that personal information was disclosed.',
        request:
          'Could you check whether any service needs the full referring address, and whether a more limited setting such as strict-origin-when-cross-origin would be appropriate?',
        dependencies: 'Payment or form providers confirm what they need. This response did not open those pages.',
      },
      invalid: {
        meaning:
          'The value is not a recognised policy, so browsers ignore it and use their default, strict-origin-when-cross-origin. No change is suggested from this check.',
        rationale: 'The explicit value has no effect. Browsers already use the recommended default, so this is not a question.',
        request: EN_NO_REQUEST,
        dependencies: EN_NONE,
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
    `從這部電腦檢查 ${finalUrl} 的回應（HTTP ${status}）${redirects === 0 ? '' : `，經 ${redirects} 次轉址`}。這是該地址的一次回應，並非捐款、登記或付款流程。`,
  hsts: {
    significance:
      'Strict-Transport-Security（HSTS）讓 HTTPS 回應要求瀏覽器日後瀏覽此主機時一律使用 HTTPS。若沒有這項設定，訪客輸入網址或點擊舊的 http:// 連結時，每次都要依賴網站本身的轉址。',
    limits:
      '單一回應無法顯示每個主機及子網域是否都把 HTTP 轉址至 HTTPS、證書是否全部有效，或證書如何續期。瀏覽器會忽略經普通 HTTP 傳送的這個標頭。這本身不能確定存在漏洞。',
    states: {
      httpOnly: {
        meaning: '最終頁面經普通 HTTP 傳送，傳送途中沒有加密，而且任何 HSTS 標頭都會被忽略。',
        rationale: '若慈善機構能夠更改網站，經普通 HTTP 到達的頁面值得詢問。這不是更廣泛缺陷的證據。',
        request: '可否協助檢查網站能否只經 HTTPS 提供並配備有效證書，同時把 HTTP 地址轉址至 HTTPS，並告知所需步驟及費用？',
        dependencies: '每個主機都有有效證書，以及能設定轉址的人。',
      },
      absent: {
        meaning: '頁面以 HTTPS 載入，但這次回應沒有要求瀏覽器記住日後繼續使用 HTTPS。',
        rationale: '若慈善機構能夠更改網站，這值得詢問。一次回應並不能顯示網站不安全。',
        request: '可否協助檢查網站的頁面是否都會轉址至 HTTPS，以及證書如何續期，然後建議以較短的初始期限設定 HSTS 是否適合這個網站？',
        dependencies: ZH_HSTS_DEPS,
      },
      disabled: {
        meaning: '標頭存在，但 max-age=0 會要求瀏覽器忘記之前「只用 HTTPS」的指示。',
        rationale: '這是一項明確關閉指示的設定，可能是刻意的，也可能是測試時遺留下來。這不是漏洞的證據。',
        request: '可否告知為何 Strict-Transport-Security 設為 max-age=0，以及在確認 HTTPS 覆蓋範圍後，能否改為較短的正數期限？',
        dependencies: ZH_HSTS_DEPS,
      },
      invalid: {
        meaning: '這個標頭無法讀作有效政策，因為 max-age 缺少、重複或格式錯誤，瀏覽器很可能會忽略它。',
        rationale: '有人設定了這個標頭，但設定值可能沒有生效。這是一項提問，並非已發現缺陷。',
        request: '可否協助檢查 Strict-Transport-Security 的設定值？它似乎沒有包含單一而有效的 max-age。',
        dependencies: '能更改網站的人可存取伺服器或寄存設定。',
      },
    },
  },
  csp: {
    significance:
      'Content-Security-Policy（內容安全政策）可限制頁面從哪些來源載入程式碼及其他資源，萬一有不明程式碼被注入，也能減低影響。政策亦可以做其他事情，例如列出哪些網站可以嵌入頁面，而完全不限制程式碼。',
    limits: '這次只讀取了回應標頭。政策亦可在頁面 HTML 內設定。標頭無法顯示較嚴格的政策會否影響表格；除非提問所指的報告目的地確實寫在標頭上，否則亦無法顯示有沒有人閱讀報告。',
    states: {
      absent: {
        meaning: '回應沒有政策標頭，因此這次回應不會按標頭限制程式碼的載入來源。',
        rationale: '若慈善機構能夠更改網站，這值得詢問。缺少政策本身不是可被利用的缺陷，而新增政策需要測試。',
        request: '可否協助檢查這個網站有否在任何地方設定 Content-Security-Policy，並建議是否適合設定政策（例如先以「只報告」模式開始）？',
        dependencies: ZH_CSP_DEPS,
      },
      permissive: {
        meaning: '政策已強制執行，但程式碼規則容許廣泛來源，例如任何主機、任何 HTTPS 網站或內嵌程式碼，因此對注入程式碼的保護有限。',
        rationale: '政策雖然存在，但實際上可能沒有限制程式碼。這是一項提問，並非已證明存在可被利用的缺陷。',
        request: '可否檢視 Content-Security-Policy 中的程式碼規則，並建議能否在不影響相關頁面的情況下收窄？',
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
    limits: '這個標頭不能證明每個檔案都以正確的 MIME 類型傳送；那是另一項伺服器設定。缺少它並不是可被利用的缺陷。',
    states: {
      absent: {
        meaning: '這次回應沒有 X-Content-Type-Options。加上 nosniff 可以是合理的加固。缺少它並不能顯示可被利用的缺陷，因此不建議更改。',
        rationale: '這是一項低價值的記錄，只作備存，並非提問。',
        request: ZH_NO_REQUEST,
        dependencies: ZH_NONE,
      },
      invalid: {
        meaning: '標頭存在，但設定值不是唯一認可的 nosniff，因此瀏覽器會忽略它。',
        rationale: '這是瀏覽器會忽略的明確設定值。若慈善機構能夠更改網站，值得詢問。這通常只是小修正，並非缺陷的證據。',
        request: '可否在確認檔案以正確內容類型傳送後，把 X-Content-Type-Options 的設定值改為 nosniff？',
        dependencies: '能更改網站的人確認內容類型設定正確。',
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
        meaning:
          '回應沒有 Referrer-Policy 標頭。現今瀏覽器已經使用 strict-origin-when-cross-origin，這正是明確標頭本來會重複的設定值。把它寫出來只是低價值的記錄，並非急切修正。',
        rationale: '只作紀錄，以便閱讀結果。這不是提問。',
        request: ZH_NO_REQUEST,
        dependencies: ZH_NONE,
      },
      unsafe: {
        meaning:
          '這項設定可能會把完整頁面地址（包括路徑及查詢字串）傳送至其他網站（unsafe-url），或傳送至普通 HTTP 網站（no-referrer-when-downgrade）。',
        rationale: '若慈善機構能夠更改網站，這項明確設定值得詢問。它不能證明個人資料已經外洩。',
        request: '可否協助檢查是否有服務需要完整的來源地址，以及較有限的設定（例如 strict-origin-when-cross-origin）是否合適？',
        dependencies: '付款或表格服務商確認所需資料。這次回應沒有開啟那些頁面。',
      },
      invalid: {
        meaning: '設定值不是認可的政策，因此瀏覽器會忽略它，並使用預設的 strict-origin-when-cross-origin。不建議根據這次檢查提出更改。',
        rationale: '這個明確設定值沒有作用。瀏覽器已經使用建議的預設值，因此這不是提問。',
        request: ZH_NO_REQUEST,
        dependencies: ZH_NONE,
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
