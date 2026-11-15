import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyAction, isOutstanding, nextStepKey, normaliseAction } from '../src/domain/followup.ts';
import { validateAction, validateExampleUrl, validateIntake } from '../src/domain/validation.ts';

test('example URL accepts plain http(s) addresses', () => {
  for (const url of ['https://charity.example', 'http://donate.example.org/give?x=1', 'https://例子.example/']) {
    assert.equal(validateExampleUrl(url), null, url);
  }
});

test('example URL rejects malformed, non-web and credential-bearing values', () => {
  const cases = {
    '': 'urlRequired',
    '   ': 'urlRequired',
    'charity.example': 'urlMalformed',
    'https://': 'urlMalformed',
    'https:/charity.example': 'urlMalformed',
    'https://charity .example': 'urlMalformed',
    'javascript:alert(1)': 'urlScheme',
    'ftp://charity.example': 'urlScheme',
    'data:text/html,hi': 'urlScheme',
    'https://user:secret@charity.example': 'urlCredentials',
    'https://user@charity.example': 'urlCredentials',
    'https://:pw@charity.example': 'urlCredentials',
    [`https://charity.example/${'a'.repeat(200)}`]: 'urlTooLong',
  };
  for (const [url, expected] of Object.entries(cases)) assert.equal(validateExampleUrl(url), expected, url);
});

const goodIntake = {
  displayName: '<b>Harbour</b> Lantern',
  exampleUrl: 'https://charity.example',
  language: 'en',
  activities: ['donations'],
  changeManager: 'provider',
  support: 'none',
  acknowledged: true,
};

test('intake accepts markup-like names as text and requires every choice and the acknowledgement', () => {
  assert.deepEqual(validateIntake(goodIntake), {});
  assert.deepEqual(
    validateIntake({ ...goodIntake, displayName: ' ', activities: [], changeManager: '', support: '', acknowledged: false }),
    {
      displayName: 'nameRequired',
      activities: 'activitiesRequired',
      changeManager: 'changeManagerRequired',
      support: 'supportRequired',
      acknowledged: 'acknowledgementRequired',
    },
  );
  assert.equal(validateIntake({ ...goodIntake, displayName: 'x'.repeat(81) }).displayName, 'nameTooLong');
  assert.equal(validateIntake({ ...goodIntake, language: 'fr' }).language, 'languageRequired');
});

const today = '2026-11-15';

test('deferral requires a reason', () => {
  const action = { ...emptyAction('Website provider'), status: 'deferred' };
  assert.deepEqual(validateAction(action, today), { deferralReason: 'deferralReasonRequired' });
  assert.deepEqual(validateAction({ ...action, deferralReason: 'Waiting for budget' }, today), {});
});

test('recheck requires a past or present date, an evidence note and a separate outcome', () => {
  const action = { ...emptyAction('Website provider'), status: 'rechecked' };
  assert.deepEqual(validateAction(action, today), {
    recheckDate: 'recheckDateRequired',
    recheckEvidence: 'recheckEvidenceRequired',
    recheckOutcome: 'recheckOutcomeRequired',
  });
  assert.equal(validateAction({ ...action, recheckDate: '2026-11-16' }, today).recheckDate, 'recheckDateFuture');
  assert.equal(validateAction({ ...action, recheckDate: '2026-02-30' }, today).recheckDate, 'dateInvalid');
  const complete = { ...action, recheckDate: today, recheckEvidence: 'Header still absent', recheckOutcome: 'inconclusive' };
  assert.deepEqual(validateAction(complete, today), {});
});

test('role is required and optional follow-up dates must be valid', () => {
  assert.deepEqual(validateAction(emptyAction('  '), today), { role: 'roleRequired' });
  assert.equal(validateAction({ ...emptyAction('Owner'), followUpDate: '15/11/2026' }, today).followUpDate, 'dateInvalid');
});

test('only a recheck that observed the change closes an action', () => {
  const base = emptyAction('Owner');
  assert.equal(isOutstanding(base), true);
  assert.equal(isOutstanding({ ...base, status: 'deferred', deferralReason: 'r' }), true);
  assert.equal(isOutstanding({ ...base, status: 'rechecked', recheckOutcome: 'unchanged' }), true);
  assert.equal(isOutstanding({ ...base, status: 'rechecked', recheckOutcome: 'inconclusive' }), true);
  assert.equal(isOutstanding({ ...base, status: 'rechecked', recheckOutcome: 'changed' }), false);
});

test('normalising clears fields that do not belong to the saved status', () => {
  const stale = { ...emptyAction(' Owner '), status: 'accepted', deferralReason: 'old', recheckEvidence: 'old', recheckOutcome: 'changed' };
  const saved = normaliseAction(stale, '2026-11-15T00:00:00.000Z');
  assert.equal(saved.role, 'Owner');
  assert.equal(saved.deferralReason, '');
  assert.equal(saved.recheckEvidence, '');
  assert.equal(saved.recheckOutcome, '');
});

test('limited support yields a provider-directed next step without changing severity', () => {
  assert.equal(nextStepKey('none'), 'providerDirected');
  assert.equal(nextStepKey('occasional'), 'providerDirected');
  assert.equal(nextStepKey('contract'), 'contract');
  assert.equal(nextStepKey('inhouse'), 'inhouse');
});
