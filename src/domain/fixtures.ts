import type { Finding, FixtureId, Scenario, ScenarioId } from './types.ts';

const ROUTINE_RATIONALE = {
  en: 'Routine in this sample, so it is recorded but not placed on the shortlist.',
  zh: '在這份樣本中屬於例行情況，因此只作記錄，不列入優先清單。',
};

const XCTO_EXPECTED = {
  en: {
    significance:
      'The recognised value nosniff asks browsers to respect the declared content type of scripts and styles rather than guessing.',
    limits: 'The header does not prove that every file is served with the correct MIME type; that is a separate server setting.',
    meaning: 'This setting is present with the expected value in the sample. No follow-up is suggested.',
    request: 'No request is needed. If the hosting setup changes, could you confirm this header is kept?',
    dependencies: 'None for now. Recheck after a hosting or platform change.',
  },
  zh: {
    significance: '認可的設定值 nosniff 要求瀏覽器依照程式碼及樣式檔案所聲明的內容類型處理，而不是自行猜測。',
    limits: '這個標頭不能證明每個檔案都以正確的 MIME 類型傳送；那是另一項伺服器設定。',
    meaning: '樣本中這項設定存在，而且是預期的設定值。不建議跟進。',
    request: '現時不需要提出要求。如寄存設定有變，可否確認會保留這個標頭？',
    dependencies: '暫時沒有。寄存或平台有變後再檢查。',
  },
};

const harbour: readonly Finding[] = [
  {
    id: 'harbour-hsts',
    check: 'hsts',
    evidence: null,
    configuration: 'absent',
    reviewRequired: true,
    severity: 'undetermined',
    activities: ['donations', 'volunteer', 'enquiries'],
    text: {
      en: {
        pageContext: 'Donation page served over HTTPS in the sample response.',
        significance:
          'Strict-Transport-Security (HSTS) lets an HTTPS response ask the browser to use HTTPS for future visits to this host. Without it, a visitor who types the address or follows an old http:// link relies on the site’s redirect each time.',
        limits:
          'A single response cannot show whether the site redirects HTTP to HTTPS, whether every host and subdomain has a valid certificate, or how certificates are renewed. Severity is undetermined from this sample.',
        meaning:
          'The donation page itself loaded securely in this sample, but browsers were not asked to remember to always use the secure version.',
        rationale:
          'Donors enter payment details after reaching this page, so a dependable HTTPS-only route is worth confirming.',
        request:
          'Could you check whether all our pages redirect to HTTPS and how certificate renewal is handled, and then advise whether an HSTS policy with a short initial duration would suit our donation page?',
        dependencies:
          'Provider confirms HTTPS coverage for every host and the certificate renewal process before any policy is enabled.',
      },
      'zh-HK': {
        pageContext: '捐款頁面，樣本回應經 HTTPS 傳送。',
        significance:
          'Strict-Transport-Security（HSTS）讓 HTTPS 回應要求瀏覽器日後瀏覽此主機時一律使用 HTTPS。若沒有這項設定，訪客輸入網址或點擊舊的 http:// 連結時，每次都要依賴網站本身的轉址。',
        limits:
          '單一回應無法顯示網站是否把 HTTP 轉址至 HTTPS、每個主機及子網域是否都有有效證書，或證書如何續期。從這份樣本無法判斷嚴重程度。',
        meaning: '在這份樣本中，捐款頁面本身以安全連線載入，但網站沒有要求瀏覽器記住日後一律使用安全版本。',
        rationale: '捐款人到達此頁後會輸入付款資料，因此值得確認網站能穩定地只經 HTTPS 存取。',
        request:
          '可否協助檢查我們所有頁面是否都會轉址至 HTTPS，以及證書如何續期，然後建議以較短的初始期限設定 HSTS 是否適合我們的捐款頁面？',
        dependencies: '在啟用任何政策前，供應商需確認所有主機的 HTTPS 覆蓋範圍及證書續期安排。',
      },
    },
  },
  {
    id: 'harbour-csp',
    check: 'csp',
    evidence:
      "Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' https://pay.example; report-uri /csp-report",
    configuration: 'concern',
    reviewRequired: true,
    severity: 'moderate',
    activities: ['donations'],
    text: {
      en: {
        pageContext: 'Donation page that loads a script from the fictional payment provider pay.example.',
        significance:
          'Content-Security-Policy can restrict where a page loads scripts and other resources from. In report-only mode the browser reports what would have been blocked but does not block anything.',
        limits:
          'The sample shows only the header. It cannot show whether a policy is also delivered in the page HTML, whether reports are received or reviewed, or whether enforcing this policy would break the payment form.',
        meaning:
          'Someone has started a protective policy for the donation page, but it is in monitoring mode, so it does not yet stop unexpected scripts.',
        rationale:
          'The donation form depends on scripts from the payment provider, so any change to enforcement needs testing with a sample donation first.',
        request:
          'Could you confirm which policy is actually in effect on our donation page and whether the monitoring reports are reviewed, and test the donation workflow before recommending whether to enforce it?',
        dependencies:
          'Payment provider’s list of required script and frame sources; a volunteer to run a test donation after any change.',
      },
      'zh-HK': {
        pageContext: '捐款頁面，會從虛構付款服務商 pay.example 載入程式碼。',
        significance:
          'Content-Security-Policy（內容安全政策）可限制頁面從哪些來源載入程式碼及其他資源。在「只報告」（report-only）模式下，瀏覽器只會報告原本會被阻擋的內容，不會實際阻擋。',
        limits:
          '樣本只顯示這個標頭，無法顯示頁面 HTML 內是否另有政策、報告是否有人接收或檢視，或強制執行此政策會否影響付款表格。',
        meaning: '已有人為捐款頁面開始設定保護政策，但目前只屬監察模式，尚未阻止不明程式碼。',
        rationale: '捐款表格依賴付款服務商的程式碼，因此任何更改強制執行的安排，都應先以模擬捐款測試。',
        request:
          '可否協助確認我們捐款頁面實際生效的政策、監察報告是否有人檢視，並在建議是否改為強制執行前先測試捐款流程？',
        dependencies: '付款服務商所需的程式碼及框架來源清單；任何更改後由一位義工進行測試捐款。',
      },
    },
  },
  {
    id: 'harbour-xcto',
    check: 'xcto',
    evidence: 'X-Content-Type-Options: nosniff',
    configuration: 'expected',
    reviewRequired: false,
    severity: 'none',
    activities: [],
    text: {
      en: { pageContext: 'Donation page and its script and style files.', rationale: ROUTINE_RATIONALE.en, ...XCTO_EXPECTED.en },
      'zh-HK': { pageContext: '捐款頁面及其程式碼和樣式檔案。', rationale: ROUTINE_RATIONALE.zh, ...XCTO_EXPECTED.zh },
    },
  },
  {
    id: 'harbour-referrer',
    check: 'referrer',
    evidence: 'Referrer-Policy: unsafe-url',
    configuration: 'concern',
    reviewRequired: true,
    severity: 'undetermined',
    activities: ['donations'],
    text: {
      en: {
        pageContext: 'Donation page with a link to the fictional payment provider pay.example.',
        significance:
          'Referrer-Policy controls how much of the current page address is sent when a visitor follows a link or loads a resource. unsafe-url sends the full address, including any path and query string, even to other sites.',
        limits:
          'Browser defaults, page-level settings and individual links can change the result. This sample alone cannot show whether the donation page address contains anything personal, so it cannot establish that information was disclosed.',
        meaning:
          'When a donor moves to the payment provider, the full donation page address may travel with them. Whether that matters depends on what the address contains.',
        rationale:
          'It applies directly to the donation journey and is an explicit setting rather than a browser default, so it can usually be reviewed quickly.',
        request:
          'Could you check what the payment provider needs from the referring address, and whether a more limited setting such as strict-origin-when-cross-origin would be appropriate for our donation page?',
        dependencies: 'Payment provider confirms whether it relies on the full referring address; test donation after any change.',
      },
      'zh-HK': {
        pageContext: '捐款頁面，設有前往虛構付款服務商 pay.example 的連結。',
        significance:
          'Referrer-Policy（來源網址政策）控制訪客點擊連結或載入資源時，會傳送多少目前頁面的網址資料。unsafe-url 會把完整網址（包括路徑及查詢字串）傳送給其他網站。',
        limits:
          '瀏覽器預設、頁面層面的設定及個別連結都可能改變結果。單憑這份樣本無法顯示捐款頁面的網址是否含有個人資料，因此不能斷定曾經洩露資料。',
        meaning: '捐款人轉往付款服務商時，捐款頁面的完整網址可能會一併傳送。這是否重要，取決於網址包含甚麼內容。',
        rationale: '這直接關乎捐款流程，而且是明確設定而非瀏覽器預設，通常可以較快檢視。',
        request:
          '可否協助了解付款服務商需要哪些來源網址資料，以及較有限度的設定（例如 strict-origin-when-cross-origin）是否適合我們的捐款頁面？',
        dependencies: '付款服務商確認是否依賴完整來源網址；任何更改後進行測試捐款。',
      },
    },
  },
];

const banyan: readonly Finding[] = [
  {
    id: 'banyan-hsts',
    check: 'hsts',
    evidence: 'Strict-Transport-Security: max-age=0',
    configuration: 'concern',
    reviewRequired: true,
    severity: 'moderate',
    activities: ['volunteer', 'donations', 'enquiries'],
    text: {
      en: {
        pageContext: 'Volunteer sign-up page served over HTTPS in the sample response.',
        significance:
          'max-age=0 tells browsers to forget any earlier HSTS instruction for this host, so future visits depend on the site’s redirect each time.',
        limits:
          'This may be deliberate, for example during a migration. A single response cannot show redirect behaviour, other hosts or certificate status.',
        meaning:
          'The site is actively telling browsers not to remember to use the secure version. That may be intentional, but it is worth asking why.',
        rationale:
          'Volunteers type contact details into this form and the setting is explicit, so asking the reason first is a small, practical step.',
        request:
          'Could you let us know whether max-age=0 was set deliberately? If not, could you review HTTPS coverage and certificate renewal before recommending a suitable duration?',
        dependencies: 'Provider explains the history of the setting and confirms HTTPS coverage before any change.',
      },
      'zh-HK': {
        pageContext: '義工登記頁面，樣本回應經 HTTPS 傳送。',
        significance: 'max-age=0 要求瀏覽器忘記此主機先前的 HSTS 指示，因此日後每次瀏覽都要依賴網站的轉址。',
        limits: '這可能是刻意設定，例如在搬遷網站期間。單一回應無法顯示轉址行為、其他主機或證書狀況。',
        meaning: '網站正明確要求瀏覽器不要記住使用安全版本。這可能是有意為之，但值得問清原因。',
        rationale: '義工會在這份表格輸入聯絡資料，而且這是明確設定，因此先詢問原因是簡單實際的一步。',
        request: '可否告訴我們 max-age=0 是否刻意設定？如果不是，可否先檢視 HTTPS 覆蓋範圍及證書續期安排，再建議合適的期限？',
        dependencies: '在任何更改前，供應商說明這項設定的由來並確認 HTTPS 覆蓋範圍。',
      },
    },
  },
  {
    id: 'banyan-csp',
    check: 'csp',
    evidence: null,
    configuration: 'absent',
    reviewRequired: true,
    severity: 'undetermined',
    activities: ['volunteer', 'donations'],
    text: {
      en: {
        pageContext: 'Volunteer sign-up form, which collects names and availability.',
        significance:
          'Without a Content-Security-Policy, the browser applies no extra restriction on where the page loads scripts and other resources from.',
        limits: 'An absent header does not rule out a policy delivered in the page HTML, and it does not show that any script is unsafe.',
        meaning:
          'There is no visible policy limiting which outside scripts the sign-up page can load. This is common, and a policy needs careful testing to avoid breaking the form.',
        rationale:
          'The form is the main way new volunteers join, so a provider review of the form’s scripts is useful, but changes should wait for testing.',
        request:
          'Could you confirm whether a content security policy is in effect on our volunteer form, and if not, advise whether starting in report-only mode and testing the form would be suitable?',
        dependencies: 'List of third-party services the form uses; a volunteer to test sign-up after any change.',
      },
      'zh-HK': {
        pageContext: '義工登記表格，會收集姓名及可服務時間。',
        significance: '沒有 Content-Security-Policy 時，瀏覽器不會額外限制頁面從哪些來源載入程式碼及其他資源。',
        limits: '沒有這個標頭，不代表頁面 HTML 內沒有政策，也不表示任何程式碼不安全。',
        meaning: '登記頁面沒有可見的政策限制可載入哪些外來程式碼。這情況很常見，而設定政策需要小心測試，以免影響表格運作。',
        rationale: '這份表格是新義工加入的主要途徑，請供應商檢視表格所用的程式碼有用處，但更改應等測試後才進行。',
        request: '可否協助確認我們的義工表格是否有內容安全政策生效？如果沒有，可否建議先以只報告模式開始並測試表格是否合適？',
        dependencies: '表格所用第三方服務的清單；任何更改後由一位義工測試登記流程。',
      },
    },
  },
  {
    id: 'banyan-xcto',
    check: 'xcto',
    evidence: 'X-Content-Type-Options: no-sniff',
    configuration: 'concern',
    reviewRequired: true,
    severity: 'low',
    activities: [],
    text: {
      en: {
        pageContext: 'Volunteer sign-up page and its script and style files.',
        significance:
          'Browsers recognise only the value nosniff. The value no-sniff is not recognised, so browsers behave as if the header were absent.',
        limits: 'Correct MIME types still matter whether or not the header works. The sample does not show the types served for each file.',
        meaning: 'Someone intended to switch this protection on, but a small spelling difference means browsers probably ignore it.',
        rationale:
          'Likely a simple correction, but it applies site-wide rather than to a selected activity, so it ranks after activity-specific items.',
        request:
          'Could you check the X-Content-Type-Options value, which appears as no-sniff in our sample, and the content types served for scripts and styles before changing the configuration?',
        dependencies: 'Access to the server or hosting configuration.',
      },
      'zh-HK': {
        pageContext: '義工登記頁面及其程式碼和樣式檔案。',
        significance: '瀏覽器只認可 nosniff 這個設定值。no-sniff 不獲認可，瀏覽器會當作沒有這個標頭。',
        limits: '無論這個標頭是否生效，正確的 MIME 類型仍然重要。樣本沒有顯示每個檔案所傳送的類型。',
        meaning: '有人原本打算啟用這項保護，但拼寫上的細微差異令瀏覽器很可能忽略它。',
        rationale: '很可能只需簡單修正，但它適用於整個網站，並非針對所選活動，因此排在與活動直接相關的項目之後。',
        request:
          '我們的樣本顯示 X-Content-Type-Options 的設定值為 no-sniff。可否在更改設定前，協助檢查這個設定值，以及程式碼和樣式檔案所傳送的內容類型？',
        dependencies: '需要伺服器或寄存設定的存取權限。',
      },
    },
  },
  {
    id: 'banyan-referrer',
    check: 'referrer',
    evidence: null,
    configuration: 'absent',
    reviewRequired: true,
    severity: 'low',
    activities: ['volunteer'],
    text: {
      en: {
        pageContext: 'Volunteer sign-up page that links to a fictional external scheduling service, rota.example.',
        significance:
          'Without a Referrer-Policy header, the browser’s default applies. Current major browsers default to strict-origin-when-cross-origin, which sends only the site origin to other sites.',
        limits: 'Older browsers, page-level settings and individual links can differ. The sample alone cannot establish that any information was disclosed.',
        meaning:
          'The browser’s own default probably limits what is shared with the scheduling service, but the site has not stated a choice.',
        rationale: 'Low effort to confirm and related to the volunteer journey, but it ranks after explicit configuration concerns.',
        request:
          'Could you check what the scheduling service needs, and whether setting an explicit referrer policy would be appropriate for our volunteer pages?',
        dependencies: 'Scheduling service documentation; test sign-up after any change.',
      },
      'zh-HK': {
        pageContext: '義工登記頁面，設有前往虛構外部排班服務 rota.example 的連結。',
        significance:
          '沒有 Referrer-Policy 標頭時，會採用瀏覽器預設。現時主要瀏覽器預設為 strict-origin-when-cross-origin，只會把網站來源傳送給其他網站。',
        limits: '舊版瀏覽器、頁面層面的設定及個別連結可能有所不同。單憑樣本不能斷定曾經洩露任何資料。',
        meaning: '瀏覽器本身的預設很可能已限制與排班服務分享的資料，但網站沒有明確表明選擇。',
        rationale: '確認所需功夫不多，而且與義工流程相關，但排在明確設定的關注事項之後。',
        request: '可否協助了解排班服務需要甚麼資料，以及為我們的義工頁面明確設定來源網址政策是否合適？',
        dependencies: '排班服務的說明文件；任何更改後測試登記流程。',
      },
    },
  },
];

const hillpath: readonly Finding[] = [
  {
    id: 'hillpath-hsts',
    check: 'hsts',
    evidence: 'Strict-Transport-Security: max-age=86400',
    configuration: 'expected',
    reviewRequired: false,
    severity: 'none',
    activities: ['information', 'enquiries'],
    text: {
      en: {
        pageContext: 'About page with opening hours and enquiry details.',
        significance: 'The response asks browsers to use HTTPS for this host for one day (86,400 seconds) after each visit.',
        limits:
          'A longer duration is a decision for the provider after confirming HTTPS coverage. The sample does not show redirects or other hosts.',
        meaning: 'Browsers are asked to keep using the secure version for a day. No follow-up is suggested from this sample.',
        rationale: ROUTINE_RATIONALE.en,
        request: 'No request is needed now. If a longer duration is planned, could you let us know first?',
        dependencies: 'None for now.',
      },
      'zh-HK': {
        pageContext: '「關於我們」頁面，載有開放時間及查詢方法。',
        significance: '回應要求瀏覽器在每次瀏覽後的一天（86,400 秒）內，以 HTTPS 存取此主機。',
        limits: '是否延長期限，應由供應商在確認 HTTPS 覆蓋範圍後決定。樣本沒有顯示轉址或其他主機。',
        meaning: '網站要求瀏覽器在一天內繼續使用安全版本。根據這份樣本，不建議跟進。',
        rationale: ROUTINE_RATIONALE.zh,
        request: '現時不需要提出要求。如計劃延長期限，可否先通知我們？',
        dependencies: '暫時沒有。',
      },
    },
  },
  {
    id: 'hillpath-csp',
    check: 'csp',
    evidence: "Content-Security-Policy: default-src 'self'; img-src 'self' https://images.example",
    configuration: 'expected',
    reviewRequired: false,
    severity: 'none',
    activities: ['information'],
    text: {
      en: {
        pageContext: 'About page.',
        significance: 'This enforcing policy limits the page to resources from its own site, with a named exception for images.',
        limits: 'The sample cannot show whether the policy is reviewed when page content changes.',
        meaning: 'A protective policy is in place and enforced. No follow-up is suggested.',
        rationale: ROUTINE_RATIONALE.en,
        request: 'No request is needed now. Could you check the policy whenever new services are added to the site?',
        dependencies: 'Recheck when embedding new services.',
      },
      'zh-HK': {
        pageContext: '「關於我們」頁面。',
        significance: '這項強制執行的政策把頁面限制為只載入自身網站的資源，並為圖片列明一個例外來源。',
        limits: '樣本無法顯示頁面內容更改時，政策是否有人檢視。',
        meaning: '保護政策已經設定並強制執行。不建議跟進。',
        rationale: ROUTINE_RATIONALE.zh,
        request: '現時不需要提出要求。日後網站加入新服務時，可否一併檢查這項政策？',
        dependencies: '加入新服務時再檢查。',
      },
    },
  },
  {
    id: 'hillpath-xcto',
    check: 'xcto',
    evidence: 'X-Content-Type-Options: nosniff',
    configuration: 'expected',
    reviewRequired: false,
    severity: 'none',
    activities: [],
    text: {
      en: { pageContext: 'About page and its script and style files.', rationale: ROUTINE_RATIONALE.en, ...XCTO_EXPECTED.en },
      'zh-HK': { pageContext: '「關於我們」頁面及其程式碼和樣式檔案。', rationale: ROUTINE_RATIONALE.zh, ...XCTO_EXPECTED.zh },
    },
  },
  {
    id: 'hillpath-referrer',
    check: 'referrer',
    evidence: 'Referrer-Policy: strict-origin-when-cross-origin',
    configuration: 'expected',
    reviewRequired: false,
    severity: 'none',
    activities: ['information'],
    text: {
      en: {
        pageContext: 'About page with a link to a fictional library catalogue, catalogue.example.',
        significance:
          'This value sends the full address within the same site, only the site origin to other HTTPS sites, and nothing to HTTP sites.',
        limits: 'Individual links can still override the page setting.',
        meaning: 'Only the site name is shared when visitors follow links elsewhere. No follow-up is suggested.',
        rationale: ROUTINE_RATIONALE.en,
        request: 'No request is needed.',
        dependencies: 'None for now.',
      },
      'zh-HK': {
        pageContext: '「關於我們」頁面，設有前往虛構圖書目錄 catalogue.example 的連結。',
        significance: '這個設定值在同一網站內傳送完整網址，向其他 HTTPS 網站只傳送網站來源，向 HTTP 網站則不傳送。',
        limits: '個別連結仍可覆蓋頁面的設定。',
        meaning: '訪客點擊前往其他網站的連結時，只會分享網站名稱。不建議跟進。',
        rationale: ROUTINE_RATIONALE.zh,
        request: '不需要提出要求。',
        dependencies: '暫時沒有。',
      },
    },
  },
];

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'harbour-lantern',
    source: 'fixture',
    organisation: { en: 'Harbour Lantern Giving Circle', 'zh-HK': '海港燈籠捐助圈' },
    focus: 'donations',
    samplePage: 'https://harbour-lantern.example/donate',
    pageLabel: { en: 'Donation page', 'zh-HK': '捐款頁面' },
    findings: harbour,
  },
  {
    id: 'banyan-neighbours',
    source: 'fixture',
    organisation: { en: 'Banyan Neighbours', 'zh-HK': '榕樹鄰舍' },
    focus: 'volunteer',
    samplePage: 'https://banyan-neighbours.example/volunteer',
    pageLabel: { en: 'Volunteer sign-up page', 'zh-HK': '義工登記頁面' },
    findings: banyan,
  },
  {
    id: 'hillpath-reading',
    source: 'fixture',
    organisation: { en: 'Hillpath Reading Circle', 'zh-HK': '山徑讀書會' },
    focus: 'information',
    samplePage: 'https://hillpath-reading.example/about',
    pageLabel: { en: 'Information page', 'zh-HK': '資訊頁面' },
    findings: hillpath,
  },
];

export const FIXTURE_IDS: readonly FixtureId[] = ['harbour-lantern', 'banyan-neighbours', 'hillpath-reading'];

/** Fictional examples only; use scenarioForCase in live.ts to include the live check. */
export function getScenario(id: ScenarioId | null): Scenario | null {
  return SCENARIOS.find((s) => s.id === id) ?? null;
}
