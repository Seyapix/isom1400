import { CHECK_ORDER } from './types.ts';
import type { Activity, Finding } from './types.ts';

export const SHORTLIST_LIMIT = 3;

export interface RankedFinding {
  finding: Finding;
  /** Selected activities this observation directly affects; empty when it is site-wide or unrelated. */
  matchedActivities: Activity[];
}

export interface Prioritisation {
  priorities: RankedFinding[];
  /** Every observation not on the shortlist, in fixed check order. */
  others: RankedFinding[];
  /** Observations needing review that did not fit on the shortlist. */
  overflow: number;
}

function match(finding: Finding, selected: readonly Activity[]): Activity[] {
  return selected.filter((a) => finding.activities.includes(a));
}

/**
 * Deterministic order: activity match, then explicit configuration concern before
 * an absent header, then fixed check order, then stable ID. Routine observations
 * with nothing to review never enter the shortlist.
 */
export function compareActionable(a: RankedFinding, b: RankedFinding): number {
  const byMatch = Number(b.matchedActivities.length > 0) - Number(a.matchedActivities.length > 0);
  if (byMatch !== 0) return byMatch;
  const stateRank = (f: Finding) => (f.configuration === 'concern' ? 0 : f.configuration === 'absent' ? 1 : 2);
  const byState = stateRank(a.finding) - stateRank(b.finding);
  if (byState !== 0) return byState;
  const byCheck = CHECK_ORDER.indexOf(a.finding.check) - CHECK_ORDER.indexOf(b.finding.check);
  if (byCheck !== 0) return byCheck;
  return a.finding.id < b.finding.id ? -1 : a.finding.id > b.finding.id ? 1 : 0;
}

export function prioritise(findings: readonly Finding[], selected: readonly Activity[]): Prioritisation {
  const ranked = findings.map((finding) => ({ finding, matchedActivities: match(finding, selected) }));
  const actionable = ranked.filter((r) => r.finding.reviewRequired).sort(compareActionable);
  const priorities = actionable.slice(0, SHORTLIST_LIMIT);
  const chosen = new Set(priorities.map((p) => p.finding.id));
  const others = ranked
    .filter((r) => !chosen.has(r.finding.id))
    .sort(
      (a, b) =>
        CHECK_ORDER.indexOf(a.finding.check) - CHECK_ORDER.indexOf(b.finding.check) ||
        (a.finding.id < b.finding.id ? -1 : 1),
    );
  return { priorities, others, overflow: actionable.length - priorities.length };
}
