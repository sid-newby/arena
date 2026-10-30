import { BadRequestException } from '@nestjs/common';
import { isEffort, type ProviderConfig } from './run.contract.js';
export function parseProviderConfig(value: unknown): ProviderConfig {
  if (
    !value ||
    typeof value !== 'object' ||
    !('provider' in value) ||
    !('model' in value) ||
    !('effort' in value) ||
    (value.provider !== 'codex' && value.provider !== 'anthropic') ||
    typeof value.model !== 'string' ||
    !value.model.trim() ||
    value.model.length > 128 ||
    !isEffort(value.effort)
  )
    throw new BadRequestException('Choose a provider, exact model ID, and supported effort.');
  return { provider: value.provider, model: value.model, effort: value.effort };
}
