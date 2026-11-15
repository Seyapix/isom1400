import { nextStepKey } from '../domain/followup.ts';
import type { RankedFinding } from '../domain/priority.ts';
import { CHECK_HEADERS } from '../domain/types.ts';
import type { CaseRecord } from '../domain/types.ts';
import { useWorkspace } from '../workspace.ts';
import { DefinitionList } from './ui.tsx';

export function Evidence({ ranked }: { ranked: RankedFinding }) {
  const { d } = useWorkspace();
  const { finding } = ranked;
  return finding.evidence ? (
    <code className="evidence">{finding.evidence}</code>
  ) : (
    <span className="evidence font-sans italic">{d.findings.absentEvidence(CHECK_HEADERS[finding.check])}</span>
  );
}

export function FindingDetail({ ranked, caseRecord }: { ranked: RankedFinding; caseRecord: CaseRecord }) {
  const { d, lang } = useWorkspace();
  const { finding } = ranked;
  const text = finding.text[lang];
  const activities =
    finding.activities.length > 0 ? d.list(finding.activities.map((a) => d.activities[a])) : d.findings.siteWide;

  const items = [
    { term: d.findings.fields.pageContext, value: text.pageContext },
    { term: d.findings.fields.evidence, value: <Evidence ranked={ranked} /> },
    { term: d.findings.fields.configuration, value: d.configuration[finding.configuration] },
    { term: d.findings.fields.severity, value: d.severity[finding.severity] },
    { term: d.findings.fields.significance, value: text.significance },
    { term: d.findings.fields.limits, value: text.limits },
    { term: d.findings.fields.meaning, value: text.meaning },
    { term: d.findings.fields.activities, value: activities },
    { term: d.findings.fields.rationale, value: text.rationale },
    { term: d.findings.fields.request, value: text.request },
  ];
  if (finding.reviewRequired) {
    items.push(
      { term: d.findings.fields.owner, value: d.owners[caseRecord.changeManager] },
      { term: d.findings.fields.nextStep, value: d.nextSteps[nextStepKey(caseRecord.support)] },
    );
  }
  items.push({ term: d.findings.fields.dependencies, value: text.dependencies });

  return <DefinitionList items={items} />;
}
