import type { Dictionary } from '../i18n/en.ts';
import { formatDateTime } from '../i18n/index.ts';
import type { RankedFinding } from './priority.ts';
import { CHECK_HEADERS, CHECK_ORDER } from './types.ts';
import type { CaseRecord, Lang, Scenario } from './types.ts';

export function reasonLines(d: Dictionary, ranked: RankedFinding): string[] {
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

/** The generated provider request. Conditional wording throughout. */
export function buildRequest(
  d: Dictionary,
  lang: Lang,
  c: CaseRecord,
  scenario: Scenario,
  priorities: readonly RankedFinding[],
): string {
  const intro = scenario.source === 'live' ? d.request.introLive : d.request.introFixture;
  const parts = [d.request.greeting, '', intro, ''];
  if (priorities.length === 0) {
    parts.push(d.request.none, '');
  } else {
    priorities.forEach((p, i) => {
      const text = p.finding.text[lang];
      parts.push(d.request.item(i + 1, CHECK_HEADERS[p.finding.check]), text.meaning, text.request, '');
    });
  }
  parts.push(d.request.testing(d.list(c.activities.map((a) => d.activities[a]))), '', d.request.closing, c.displayName);
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
