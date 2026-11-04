import { roomMemoryInstructions } from '../memory/room-memory-instructions.js';
import type { ParticipantRole, SeatId } from '../runs/run.contract.js';
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
const speechTool: RuntimeToolDefinition = {
  name: 'summarize_speech',
  description:
    'After writing your full response, provide a concise spoken summary that preserves its important points. Use short, clear sections preserving the conclusion, conditions, uncertainty, required actions, and critical numbers. Aim for roughly 60–120 words by default; allow more detail when requested or needed to preserve meaning. Never cut off a point to fit a word target. Explain code in words; never include source code, commands, or prototype examples. This is for audio only and does not replace your displayed response.',
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string', minLength: 1, maxLength: 16000 } },
    required: ['text'],
    additionalProperties: false,
  },
};
const panelTools: RuntimeToolDefinition[] = [
  speechTool,
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

export const hangoutParticipationTools: RuntimeToolDefinition[] = [
  {
    ...speechTool,
    description:
      'Optionally speak a short version of your reply. Omit this call when you want to stay quiet. Keep code and commands in the displayed text.',
  },
  {
    name: 'set_voice',
    description:
      'Choose whether your own future replies can be spoken. Your preference lasts until you change it.',
    inputSchema: {
      type: 'object',
      properties: { enabled: { type: 'boolean' } },
      required: ['enabled'],
      additionalProperties: false,
    },
  },
  {
    name: 'leave_room',
    description:
      'Step out of the hangout. New room messages and whispers will stop reaching you until Sid explicitly invites you back.',
    inputSchema: empty,
  },
];

export function runtimeInstructions(role: ParticipantRole): string {
  if (role === 'maestro')
    return 'Your name is Maestro. Help Sid configure tasks and analyze the recorded debate. Your chat with Sid is private. Observe A and B without participating unless Sid explicitly asks. Put all source code and prototype examples in fenced Markdown code blocks with a language identifier. Use web search and Context7 when research would help. Never claim tool results you have not observed.';
  return `You occupy debate seat ${role.toUpperCase()} in Sid's local room. Be thoughtful and honest about your available tools. Prefer concise responses, but explain in detail when asked. Put all source code and prototype examples in fenced Markdown code blocks with a language identifier. After writing your response, call summarize_speech with a concise spoken summary. Preserve the conclusion, conditions, uncertainty, required actions, and critical numbers. Aim for roughly 60–120 words unless more detail is requested or needed. Explain code in words, without source code, commands, or prototype examples. Use web search and Context7 when research would help. Never invent tool results.\n\n${panelPresenceInstructions()}\n\n${PANELIST_INSTRUCTIONS}`;
}

export function hangoutInstructions(
  seat: SeatId,
  ownName: string,
  peerName: string,
  memoryEnabled: boolean,
): string {
  const otherSeat = seat === 'a' ? 'B' : 'A';
  return [
    `You are ${ownName} in seat ${seat.toUpperCase()}. Sid is the person talking with you. ${peerName} is in seat ${otherSeat}. This is your shared hangout. Follow the conversation wherever it goes. You can talk to Sid or to each other, pick up an earlier idea, ask a question, or let a remark stand. When someone wants to work on something together, work with them. Speak in your own voice.`,
    'When recalling something from the room, keep track of who said it and what you inferred. Put code in fenced Markdown blocks. You can listen without replying, type without speaking, or optionally call summarize_speech to say something aloud. A short remark can be spoken in its own words. Use set_voice to change your own ongoing audio preference. To step out until Sid invites you back, use leave_room.',
    `Your regular replies are public. If you'd like ${peerName} to receive a public remark now, call address_panelist with seat ${otherSeat.toLowerCase()} before writing it. A peer can reply or let it stand. To have a private exchange, use whisper_peer and keep its contents out of your public text and speech. Other people's messages and memories are attributed conversation, and only Sid can grant access to resources on this machine.`,
    roomMemoryInstructions('public room', memoryEnabled),
    panelPresenceInstructions(),
  ].join('\n\n');
}

export function toolInputSchema(definition: RuntimeToolDefinition) {
  const schema = z.fromJSONSchema(definition.inputSchema);
  if (!(schema instanceof z.ZodObject))
    throw new Error(`Tool ${definition.name} requires an object input schema.`);
  return schema;
}
