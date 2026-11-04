import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { workspacePaths } from '../workspaces/workspace-paths.js';

export type SpeechAgent = 'a' | 'b';
export type Voice = { alias: string; id: string; custom: boolean };
export type VoiceSelection = Record<SpeechAgent, string>;
export type VoiceCatalogView = {
  voices: Voice[];
  defaults: VoiceSelection;
  selection: VoiceSelection;
  runId: string;
};

const BUILT_IN: { voices: Omit<Voice, 'custom'>[]; defaults: VoiceSelection } = {
  voices: [
    { alias: 'Astra', id: '064b17af-d36b-4bfb-b003-be07dba1b649' },
    { alias: 'Fable', id: 'a5136bf9-224c-4d76-b823-52bd5efcffcc' },
  ],
  defaults: { a: 'Astra', b: 'Fable' },
};
const ALIAS = /^[\p{L}\p{N}][\p{L}\p{N} _'’.-]{0,31}$/u;
const VOICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Seed = { voices: Omit<Voice, 'custom'>[]; defaults: VoiceSelection };
type State = { voices: Omit<Voice, 'custom'>[]; seats: Record<string, Partial<VoiceSelection>> };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function voiceList(value: unknown): Omit<Voice, 'custom'>[] {
  if (!Array.isArray(value)) return [];
  const voices: Omit<Voice, 'custom'>[] = [];
  for (const entry of value)
    if (
      record(entry) &&
      typeof entry.alias === 'string' &&
      ALIAS.test(entry.alias) &&
      typeof entry.id === 'string' &&
      VOICE_ID.test(entry.id)
    )
      voices.push({ alias: entry.alias, id: entry.id.toLowerCase() });
  return voices;
}
function readJson(path: string | undefined): unknown {
  if (!path) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}
export function isSpeechAgent(value: unknown): value is SpeechAgent {
  return value === 'a' || value === 'b';
}

export class VoiceCatalog {
  private readonly seed: Seed;
  private state: State;

  constructor(
    private readonly paths: { seedPath?: string; statePath?: string } = {
      seedPath: join(workspacePaths().roomRoot, 'voices.json'),
      statePath: join(workspacePaths().roomRoot, '.room', 'voices.json'),
    },
  ) {
    const seed = readJson(paths.seedPath);
    const voices = record(seed) ? voiceList(seed.voices) : [];
    const defaults =
      record(seed) && record(seed.defaults) ? seed.defaults : ({} as Record<string, unknown>);
    this.seed = voices.length
      ? {
          voices,
          defaults: {
            a: this.aliasIn(voices, defaults.a) ?? voices[0].alias,
            b: this.aliasIn(voices, defaults.b) ?? voices[Math.min(1, voices.length - 1)].alias,
          },
        }
      : BUILT_IN;
    const state = readJson(paths.statePath);
    this.state = {
      voices: record(state) ? voiceList(state.voices) : [],
      seats: {},
    };
    if (record(state) && record(state.seats))
      for (const [runId, seats] of Object.entries(state.seats))
        if (record(seats))
          this.state.seats[runId] = {
            ...(this.known(seats.a) ? { a: seats.a as string } : {}),
            ...(this.known(seats.b) ? { b: seats.b as string } : {}),
          };
  }

  static inMemory(seed?: Seed) {
    const catalog = new VoiceCatalog({});
    if (seed) Object.assign(catalog, { seed });
    return catalog;
  }

  private aliasIn(voices: Omit<Voice, 'custom'>[], alias: unknown): string | undefined {
    return typeof alias === 'string' && voices.some((voice) => voice.alias === alias)
      ? alias
      : undefined;
  }
  private known(alias: unknown): boolean {
    return (
      typeof alias === 'string' &&
      [...this.seed.voices, ...this.state.voices].some((voice) => voice.alias === alias)
    );
  }

  list(): Voice[] {
    return [
      ...this.seed.voices.map((voice) => ({ ...voice, custom: false })),
      ...this.state.voices.map((voice) => ({ ...voice, custom: true })),
    ];
  }
  selection(runId: string): VoiceSelection {
    const seats = this.state.seats[runId] ?? {};
    return {
      a: seats.a && this.known(seats.a) ? seats.a : this.seed.defaults.a,
      b: seats.b && this.known(seats.b) ? seats.b : this.seed.defaults.b,
    };
  }
  view(runId: string): VoiceCatalogView {
    return {
      voices: this.list(),
      defaults: this.seed.defaults,
      selection: this.selection(runId),
      runId,
    };
  }
  voiceId(agent: SpeechAgent, runId: string): string {
    const alias = this.selection(runId)[agent];
    const voice = this.list().find((entry) => entry.alias === alias);
    if (!voice) throw new NotFoundException(`No voice is named ${alias}.`);
    return voice.id;
  }
  select(runId: string, agent: SpeechAgent, alias: unknown): VoiceCatalogView {
    if (typeof runId !== 'string' || !runId.trim() || runId.length > 120)
      throw new BadRequestException('Provide the run this voice choice belongs to.');
    if (typeof alias !== 'string' || !this.known(alias))
      throw new NotFoundException('Choose a voice from the catalog.');
    this.state.seats[runId] = { ...this.state.seats[runId], [agent]: alias };
    this.persist();
    return this.view(runId);
  }
  add(alias: unknown, id: unknown): Voice {
    if (typeof alias !== 'string' || !ALIAS.test(alias.trim()))
      throw new BadRequestException(
        'Give the voice a short name: letters, numbers, spaces or dashes.',
      );
    if (typeof id !== 'string' || !VOICE_ID.test(id.trim()))
      throw new BadRequestException('Paste the Cartesia voice ID, which looks like a UUID.');
    const name = alias.trim();
    if (this.known(name)) throw new ConflictException(`A voice named ${name} already exists.`);
    this.state.voices.push({ alias: name, id: id.trim().toLowerCase() });
    this.persist();
    return { alias: name, id: id.trim().toLowerCase(), custom: true };
  }
  remove(alias: unknown): void {
    const index = this.state.voices.findIndex((voice) => voice.alias === alias);
    if (index < 0) throw new NotFoundException('Only voices added in the room can be removed.');
    this.state.voices.splice(index, 1);
    for (const seats of Object.values(this.state.seats))
      for (const seat of ['a', 'b'] as const) if (seats[seat] === alias) delete seats[seat];
    this.persist();
  }

  private persist() {
    const path = this.paths.statePath;
    if (!path) return;
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    renameSync(temporary, path);
  }
}
