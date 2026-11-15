import type { Dictionary } from '../i18n/en.ts';
import { formatDateTime } from '../i18n/index.ts';
import { prioritise } from './priority.ts';
import type { Prioritisation, RankedFinding } from './priority.ts';
import { CHECK_HEADERS, CHECK_ORDER } from './types.ts';
import type { CaseRecord, Finding, Lang, Scenario } from './types.ts';

/** Traffic-light tone for the configuration remark beside a report observation. */
export type RemarkTone = 'ok' | 'caution' | 'alert';

/**
 * Expected and noted values are fine. A moderate severity is a confirmed concern.
 * Anything else needs a look, including an absent header, which is not treated as a flaw by itself.
 */
export function remarkTone(finding: Pick<Finding, 'configuration' | 'severity'>): RemarkTone {
  if (finding.configuration === 'expected' || finding.configuration === 'noted') return 'ok';
  if (finding.severity === 'moderate') return 'alert';
  return 'caution';
}

export function reasonLines(d: Dictionary, ranked: RankedFinding): string[] {
  if (ranked.finding.id.startsWith('live-')) return [d.reasons.liveQuestion];
  const { finding, matchedActivities } = ranked;
  const lines = [
    matchedActivities.length > 0
      ? d.reasons.matched(d.list(matchedActivities.map((a) => d.activities[a])))
      : d.reasons.unmatched,
  ];
  if (finding.configuration === 'concern') lines.push(d.reasons.concern);
  if (finding.configuration === 'absent') lines.push(d.reasons.absent);
  lines.push(d.reasons.order(CHECK_ORDER.indexOf(finding.check) + 1));
  return lines;
}

/** Live questions are shown only when the charity can change the site. A platform or an unknown host gets no shortlist. */
export function presentedFindings(c: CaseRecord, scenario: Scenario): Prioritisation {
  if (scenario.source === 'live' && c.siteControl !== 'charity') {
    return {
      priorities: [],
      others: scenario.findings.map((finding) => ({ finding, matchedActivities: [] })),
      overflow: 0,
    };
  }
  return prioritise(scenario.findings, scenario.source === 'live' ? [] : c.activities);
}

export function charityCanAsk(c: CaseRecord, scenario: Scenario): boolean {
  return scenario.source === 'fixture' || c.siteControl === 'charity';
}

/** The generated provider request. Conditional wording throughout. */
export function buildRequest(
  d: Dictionary,
  lang: Lang,
  c: CaseRecord,
  scenario: Scenario,
  priorities: readonly RankedFinding[],
): string {
  if (scenario.source === 'live' && c.siteControl === 'platform') return d.request.platform;
  if (scenario.source === 'live' && c.siteControl !== 'charity') return d.request.unsure;
  const intro = scenario.source === 'live' ? d.request.introLive : d.request.introFixture;
  const parts = [d.request.greeting, '', intro, ''];
  if (priorities.length === 0) {
    parts.push(scenario.source === 'live' ? d.request.noneLive : d.request.none, '');
  } else {
    priorities.forEach((p, i) => {
      const text = p.finding.text[lang];
      parts.push(d.request.item(i + 1, CHECK_HEADERS[p.finding.check]), text.meaning, text.request, '');
    });
  }
  if (!(scenario.source === 'live' && priorities.length === 0)) {
    parts.push(
      scenario.source === 'live' ? d.request.testingLive : d.request.testing(d.list(c.activities.map((a) => d.activities[a]))),
      '',
    );
  }
  parts.push(d.request.closing, c.displayName);
  return parts.join('\n');
}

export function scopeText(d: Dictionary, lang: Lang, c: CaseRecord, scenario: Scenario): string {
  return scenario.source === 'live' && c.liveCheck
    ? d.report.scopeLive(c.liveCheck.finalUrl, formatDateTime(c.liveCheck.checkedAt, lang))
    : d.report.scopeFixture;
}

export function buildCopyText(d: Dictionary, lang: Lang, c: CaseRecord, scenario: Scenario, draft: string): string {
  const scope =
    scenario.source === 'live' && c.liveCheck
      ? d.report.copyScopeLive(c.displayName, scenario.samplePage, formatDateTime(c.liveCheck.checkedAt, lang))
      : d.report.copyScopeFixture(c.displayName, scenario.organisation[lang], scenario.samplePage);
  return [scope, '', draft.trim()].join('\n');
}
