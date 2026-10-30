import { execFileSync } from 'node:child_process';
import type { AccountInfo } from '@anthropic-ai/claude-agent-sdk';
import type { ProviderConfig } from '../runs/run.contract.js';
import { protocolObject, providerEnvironment } from './provider-environment.js';

export function anthropicReady(): boolean {
  try {
    const status = protocolObject(
      JSON.parse(
        execFileSync(process.env.CLAUDE_BIN ?? 'claude', ['auth', 'status', '--json'], {
          encoding: 'utf8',
          timeout: 5000,
          env: providerEnvironment(),
          stdio: ['ignore', 'pipe', 'ignore'],
        }),
      ),
    );
    return (
      status.loggedIn === true &&
      (status.authMethod === 'oauth_token' || status.authMethod === 'claude.ai') &&
      status.apiProvider === 'firstParty'
    );
  } catch {
    return false;
  }
}

export function assertAnthropicSubscription(account: AccountInfo) {
  const source = account.tokenSource?.toLowerCase() ?? '';
  const apiKeySource = account.apiKeySource?.toLowerCase();
  const oauth = /oauth|claude[._-]?ai|subscription/.test(source);
  const subscription =
    !source && /\b(pro|max|team|enterprise)\b/i.test(account.subscriptionType ?? '');
  if (
    account.apiProvider !== 'firstParty' ||
    (!oauth && !subscription) ||
    (apiKeySource && apiKeySource !== 'none')
  )
    throw new Error(
      'Sign in with claude auth login using your Claude subscription. API-key and cloud routes are not supported.',
    );
}

export function anthropicEffort(effort: ProviderConfig['effort']) {
  if (
    effort === 'low' ||
    effort === 'medium' ||
    effort === 'high' ||
    effort === 'xhigh' ||
    effort === 'max'
  )
    return effort;
  throw new Error(`Claude does not support the selected effort ${effort}.`);
}
