const modelNames = [
  { pattern: /^(?:claude-)?fable(?:-\d+)+(?:-(?:latest|preview))?$/i, name: 'Fable' },
  { pattern: /^(?:claude-)?opus(?:-\d+)+(?:-(?:latest|preview))?$/i, name: 'Opus' },
  { pattern: /^(?:claude-)?sonnet(?:-\d+)+(?:-(?:latest|preview))?$/i, name: 'Sonnet' },
  { pattern: /^(?:claude-)?haiku(?:-\d+)+(?:-(?:latest|preview))?$/i, name: 'Haiku' },
  { pattern: /^gpt-\d+(?:\.\d+)*-sol(?:-[a-z0-9]+)*$/i, name: 'Sol' },
  { pattern: /^gpt-\d+(?:\.\d+)*-luna(?:-[a-z0-9]+)*$/i, name: 'Luna' },
  { pattern: /^gpt-\d+(?:\.\d+)*-astra(?:-[a-z0-9]+)*$/i, name: 'Astra' },
  { pattern: /^gpt-\d+(?:\.\d+)*-terra(?:-[a-z0-9]+)*$/i, name: 'Terra' },
];

export function modelName(model: string): string {
  return modelNames.find(({ pattern }) => pattern.test(model.trim()))?.name ?? model;
}
