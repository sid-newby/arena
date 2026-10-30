import type { ParticipantRole } from '../runs/run.contract.js';
import { z } from 'zod';
import { ADDRESS_PANELIST_DESCRIPTION, PANELIST_INSTRUCTIONS } from './panelist-delivery.js';
import {
  EXPRESS_DESCRIPTION,
  CLEAR_EXPRESSION_DESCRIPTION,
  EXPRESSION_MOODS,
} from './panel-expression.js';
import {
  FACE_PANEL_DESCRIPTION,
  PANEL_TARGETS,
  SET_POSE_DESCRIPTION,
  panelPresenceInstructions,
} from './panel-presence.js';

export interface RuntimeToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const empty = { type: 'object', properties: {}, additionalProperties: false };
const panelTools: RuntimeToolDefinition[] = [
  {
    name: 'summarize_speech',
    description:
      'After writing your full response, provide a concise spoken summary that preserves its important points. Use short, clear sections preserving the conclusion, conditions, uncertainty, required actions, and critical numbers. Aim for roughly 60–120 words by default; allow more detail when requested or needed to preserve meaning. Never cut off a point to fit a word target. Explain code in words; never include source code, commands, or prototype examples. This is for audio only and does not replace your displayed response.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', minLength: 1, maxLength: 16000 } },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'address_panelist',
    description: ADDRESS_PANELIST_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: { recipient: { type: 'string', enum: ['a', 'b'] } },
      required: ['recipient'],
      additionalProperties: false,
    },
  },
  {
    name: 'express',
    description: EXPRESS_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        mood: { type: 'string', enum: EXPRESSION_MOODS },
        intensity: { type: 'number', minimum: 0, maximum: 1 },
        duration: { type: 'integer', minimum: 150, maximum: 1500 },
      },
      required: ['mood'],
      additionalProperties: false,
    },
  },
  { name: 'clear_expression', description: CLEAR_EXPRESSION_DESCRIPTION, inputSchema: empty },
  {
    name: 'face_panel',
    description: FACE_PANEL_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: { target: { type: 'string', enum: PANEL_TARGETS } },
      required: ['target'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_pose',
    description: SET_POSE_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: { pose: { type: 'string', enum: ['front', 'left', 'right'] } },
      required: ['pose'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_workspace',
    description: 'List top-level non-hidden workspace names. No file contents.',
    inputSchema: empty,
  },
];

export function runtimeTools(role: ParticipantRole): RuntimeToolDefinition[] {
  return role === 'maestro' ? [] : panelTools;
}

export function runtimeInstructions(role: ParticipantRole): string {
  if (role === 'maestro')
    return 'Your name is Maestro. Help Sid configure tasks and analyze the recorded debate. Your chat with Sid is private. Observe A and B without participating unless Sid explicitly asks. Put all source code and prototype examples in fenced Markdown code blocks with a language identifier. Use web search and Context7 when research would help. Never claim tool results you have not observed.';
  return `You occupy debate seat ${role.toUpperCase()} in Sid's local room. Be thoughtful and honest about your available tools. Prefer concise responses, but explain in detail when asked. Put all source code and prototype examples in fenced Markdown code blocks with a language identifier. After writing your response, call summarize_speech with a concise spoken summary. Preserve the conclusion, conditions, uncertainty, required actions, and critical numbers. Aim for roughly 60–120 words unless more detail is requested or needed. Explain code in words, without source code, commands, or prototype examples. Use web search and Context7 when research would help. Never invent tool results.\n\n${panelPresenceInstructions()}\n\n${PANELIST_INSTRUCTIONS}`;
}

export function toolInputSchema(definition: RuntimeToolDefinition) {
  const schema = z.fromJSONSchema(definition.inputSchema);
  if (!(schema instanceof z.ZodObject))
    throw new Error(`Tool ${definition.name} requires an object input schema.`);
  return schema;
}
