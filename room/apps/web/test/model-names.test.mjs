import assert from 'node:assert/strict';
import test from 'node:test';
import { modelPanelName, panelistName, panelistDeliveryLabel } from '../src/lib/agents.ts';

test('uses short names for the configured model families and version variants', () => {
  for (const [model, name] of [
    ['opus-5-5', 'Opus'],
    ['claude-opus-5-5', 'Opus'],
    ['claude-opus-5-5-20261030', 'Opus'],
    ['claude-sonnet-5-5', 'Sonnet'],
    ['claude-haiku-5-5', 'Haiku'],
    ['gpt-6.1-sol', 'Sol'],
    ['gpt-6.2-sol-preview', 'Sol'],
    ['gpt-6-luna', 'Luna'],
    ['gpt-6-astra', 'Astra'],
    ['gpt-6.1-terra', 'Terra'],
    [' GPT-6.1-SOL ', 'Sol'],
  ]) {
    assert.equal(modelPanelName(model, 'a'), name, model);
    assert.equal(modelPanelName(model, 'b'), name, model);
  }
});

test('keeps unrecognized model IDs intact instead of guessing from substrings', () => {
  for (const model of [
    'custom-model-20261030',
    'gpt-6.1-solstice',
    'custom-opus-5-5',
    'claude-opus-5-5-custom',
    'gpt-6.1-sol/other',
    '  unfamiliar-model  ',
    `custom-${'x'.repeat(120)}`,
  ]) {
    assert.equal(modelPanelName(model, 'a'), model);
  }
});

test('falls back to the stable seat while model information is unavailable', () => {
  for (const model of [undefined, '', '   ']) {
    assert.equal(modelPanelName(model, 'a'), 'A');
    assert.equal(modelPanelName(model, 'b'), 'B');
  }
});

test('reflects a model change without changing seat or historical delivery labels', () => {
  assert.equal(modelPanelName('claude-opus-5-5', 'a'), 'Opus');
  assert.equal(modelPanelName('gpt-6.1-sol', 'a'), 'Sol');
  assert.equal(modelPanelName('gpt-6.1-sol', 'b'), 'Sol');
  assert.equal(panelistName('a'), 'A');
  assert.equal(panelistName('b'), 'B');
  assert.equal(
    panelistDeliveryLabel({ id: 'old-delivery', recipient: 'a', status: 'completed' }),
    'A replied',
  );
});
