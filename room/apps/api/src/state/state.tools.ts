import { z } from 'zod';
import type { RuntimeToolDefinition } from '../chat/runtime-tools.js';
import { proposalSchema } from './state.contract.js';
export const outcomeTools: RuntimeToolDefinition[] = [
  {
    name: 'get_session_state',
    description:
      'Read stored task revisions, exact model attribution, candidate turn IDs, usage metadata and outcome revisions. No private conversation is published. Use the current task revision and completed candidate IDs for propose_outcome.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'propose_outcome',
    description:
      "Publish a structured recommendation for explicit human review. Assess every task criterion by zero-based index and choose completed A/B turns within this request's captured evidence boundary. Ordinary Maestro analysis stays private. This tool never confirms an outcome.",
    inputSchema: z.toJSONSchema(proposalSchema),
  },
];
