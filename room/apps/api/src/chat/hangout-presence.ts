import type { DatabaseSync } from 'node:sqlite';
import { HANGOUT_ID } from '../memory/room-memory.js';
import { modelName } from '../runs/participant-name.js';
import type { ParticipantBinding } from '../runs/run.contract.js';

export interface HangoutSeatPresence {
  present: boolean;
  voiceEnabled: boolean;
}

export class HangoutPresence {
  constructor(private readonly db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS hangout_presence (
      seat TEXT NOT NULL, peer TEXT NOT NULL, present INTEGER NOT NULL DEFAULT 1,
      voice_enabled INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(seat, peer))`);
  }

  get(binding: ParticipantBinding): HangoutSeatPresence {
    const row = this.db
      .prepare('SELECT present,voice_enabled FROM hangout_presence WHERE seat=? AND peer=?')
      .get(binding.role, modelName(binding.config.model));
    return { present: row?.present !== 0, voiceEnabled: row?.voice_enabled !== 0 };
  }

  isPresent(binding: ParticipantBinding) {
    return binding.runId !== HANGOUT_ID || this.get(binding).present;
  }

  update(binding: ParticipantBinding, change: Partial<HangoutSeatPresence>) {
    const next = { ...this.get(binding), ...change };
    this.db
      .prepare(`INSERT INTO hangout_presence(seat,peer,present,voice_enabled) VALUES (?,?,?,?)
      ON CONFLICT(seat,peer) DO UPDATE SET present=excluded.present,voice_enabled=excluded.voice_enabled`)
      .run(
        binding.role,
        modelName(binding.config.model),
        Number(next.present),
        Number(next.voiceEnabled),
      );
    return next;
  }
}
