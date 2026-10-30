import { describe, expect, it } from 'vitest';
import {
  parseCriteriaSuggestion,
  prepareCriteriaRequest,
} from '../../../src/criteria/criteria-generation.js';

const draft = {
  draftRevision: 3,
  question: 'Build a timer',
  mode: 'prototype',
  expectedArtifact: 'Working app',
  criteria: [],
  grounding: ['Use TypeScript'],
  source: null,
};

describe('criteria generation', () => {
  it('binds an editable suggestion to the exact supplied setup', () => {
    const request = prepareCriteriaRequest(draft);
    const result = parseCriteriaSuggestion(
      request,
      '```json\n{"criteria":["Timer can be paused"]}\n```',
    );
    expect(result).toEqual({
      draftRevision: 3,
      fingerprint: request.fingerprint,
      criteria: ['Timer can be paused'],
    });
    expect(prepareCriteriaRequest({ ...draft, question: 'Build a clock' }).fingerprint).not.toBe(
      result.fingerprint,
    );
  });
  it('rejects missing questions and malformed or oversized model responses', () => {
    expect(() => prepareCriteriaRequest({ ...draft, question: ' ' })).toThrow(
      'Provide a valid setup draft with a debate question.',
    );
    const request = prepareCriteriaRequest(draft);
    expect(() => parseCriteriaSuggestion(request, 'Not JSON')).toThrow(
      'Maestro did not return criteria in the requested format. Try again.',
    );
    expect(() =>
      parseCriteriaSuggestion(request, JSON.stringify({ criteria: ['x'.repeat(501)] })),
    ).toThrow('Maestro returned invalid criteria. Try again.');
    expect(() => parseCriteriaSuggestion(request, JSON.stringify({ criteria: [] }))).toThrow(
      'Maestro returned invalid criteria. Try again.',
    );
  });
  it('rejects a valid draft when the complete Maestro prompt exceeds its limit', () => {
    const oversized = { ...draft, grounding: Array.from({ length: 16 }, () => 'x'.repeat(1000)) };
    expect(() => prepareCriteriaRequest(oversized)).toThrow('The setup draft is too long.');
    const withinLimit = { ...draft, grounding: Array.from({ length: 14 }, () => 'x'.repeat(1000)) };
    expect(prepareCriteriaRequest(withinLimit).prompt.length).toBeLessThanOrEqual(16000);
  });
});
