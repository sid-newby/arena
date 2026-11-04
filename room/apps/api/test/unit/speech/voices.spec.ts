import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VoiceCatalog } from '../../../src/speech/voices.js';

const ID_A = '064b17af-d36b-4bfb-b003-be07dba1b649';
const ID_B = 'a5136bf9-224c-4d76-b823-52bd5efcffcc';
const ID_C = '11111111-2222-4333-8444-555555555555';

it('falls back to the built-in voices and seat defaults', () => {
  const catalog = VoiceCatalog.inMemory();
  expect(catalog.voiceId('a', 'hangout')).toBe(ID_A);
  expect(catalog.voiceId('b', 'hangout')).toBe(ID_B);
  expect(catalog.view('hangout').selection).toEqual({ a: 'Astra', b: 'Fable' });
});

it('selects voices per run and seat, adds and removes custom voices, and persists state', () => {
  const directory = mkdtempSync(join(tmpdir(), 'room-voices-'));
  try {
    const seedPath = join(directory, 'voices.json');
    const statePath = join(directory, '.room', 'voices.json');
    writeFileSync(
      seedPath,
      JSON.stringify({
        voices: [
          { alias: 'Astra', id: ID_A },
          { alias: 'Fable', id: ID_B },
        ],
        defaults: { a: 'Astra', b: 'Fable' },
      }),
    );
    const catalog = new VoiceCatalog({ seedPath, statePath });
    expect(() => catalog.add('Ralph', 'nope')).toThrow('UUID');
    expect(() => catalog.add('', ID_C)).toThrow('short name');
    expect(catalog.add('Ralph', ID_C.toUpperCase())).toEqual({
      alias: 'Ralph',
      id: ID_C,
      custom: true,
    });
    expect(() => catalog.add('Ralph', ID_C)).toThrow('already exists');
    catalog.select('hangout', 'b', 'Ralph');
    expect(catalog.voiceId('b', 'hangout')).toBe(ID_C);
    expect(catalog.voiceId('b', 'another-run')).toBe(ID_B);
    expect(() => catalog.select('hangout', 'a', 'Nobody')).toThrow('Choose a voice');

    const reloaded = new VoiceCatalog({ seedPath, statePath });
    expect(reloaded.view('hangout').selection).toEqual({ a: 'Astra', b: 'Ralph' });
    expect(reloaded.list().map((voice) => voice.alias)).toEqual(['Astra', 'Fable', 'Ralph']);

    expect(() => reloaded.remove('Astra')).toThrow('added in the room');
    reloaded.remove('Ralph');
    expect(reloaded.voiceId('b', 'hangout')).toBe(ID_B);
    expect(JSON.parse(readFileSync(statePath, 'utf8'))).toEqual({
      voices: [],
      seats: { hangout: {} },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
