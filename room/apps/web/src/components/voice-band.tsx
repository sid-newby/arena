import { Mic, MicOff, Square, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { useMicrophone } from '@/hooks/use-microphone';
import type { useSpeech } from '@/hooks/use-speech';
import type { useVoices } from '@/hooks/use-voices';
import { useState } from 'react';
import { agentIds, type AgentId } from '@/lib/agents';
import type { VoiceTarget } from '@/lib/microphone';
import './voice-band.css';

type Conversation =
  | { status: 'idle' | 'stopping' | 'stopped' }
  | { status: 'error'; message: string };

export function VoiceBand({
  speech,
  microphone,
  voices,
  preview,
  hangout,
  names,
  target,
  setTarget,
  toggleSpeech,
  toggleMicrophone,
  conversation,
  conversationActive,
  stopConversation,
  health,
  pinging,
  ping,
  reconnect,
}: {
  speech: ReturnType<typeof useSpeech>;
  microphone: ReturnType<typeof useMicrophone>;
  voices: ReturnType<typeof useVoices>;
  preview: boolean;
  hangout: boolean;
  names: Record<AgentId, string>;
  target: VoiceTarget;
  setTarget: (target: VoiceTarget) => void;
  toggleSpeech: () => void;
  toggleMicrophone: () => void;
  conversation: Conversation;
  conversationActive: boolean;
  stopConversation: () => void;
  health?: string;
  pinging: boolean;
  ping: () => void;
  reconnect?: () => void;
}) {
  const [newAlias, setNewAlias] = useState('');
  const [newId, setNewId] = useState('');
  const options: { value: VoiceTarget; label: string }[] = [
    { value: 'room', label: 'Everyone' },
    { value: 'a', label: names.a },
    { value: 'b', label: names.b },
  ];
  const error =
    microphone.error ||
    speech.error ||
    (conversation.status === 'error' ? conversation.message : undefined);
  const status = error
    ? error
    : microphone.interim
      ? `“${microphone.interim}”`
      : preview
        ? 'Preview · speech and microphone off'
        : speech.starting || microphone.starting
          ? 'Starting audio · allow the microphone or click the room if prompted'
          : conversation.status === 'stopped' && !conversationActive
            ? 'Conversation stopped'
            : [
                `Speech: ${speech.enabled ? speech.status.replace(/^Speech on · /, '') : speech.ready ? 'off' : speech.detail}`,
                `Mic: ${
                  microphone.enabled
                    ? microphone.status
                    : microphone.supported
                      ? microphone.ready
                        ? 'off'
                        : microphone.detail
                      : 'not available in this browser'
                }`,
              ].join('   ');
  return (
    <div className="voice-band" aria-label="Voice controls">
      <div className="band-group">
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={speech.enabled}
          disabled={
            speech.testing ||
            (!speech.enabled && (!speech.ready || preview || !speech.connectionsReady))
          }
          title={preview ? 'Leave preview before enabling speech.' : speech.detail}
          onClick={toggleSpeech}
        >
          {speech.enabled ? <Volume2 /> : <VolumeX />}
          {speech.starting ? 'Starting…' : 'Speech'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={microphone.enabled}
          data-listening={microphone.listening || undefined}
          disabled={!microphone.enabled && (!microphone.supported || !microphone.ready || preview)}
          title={
            !microphone.supported
              ? 'This browser cannot capture microphone audio.'
              : preview
                ? 'Leave preview before enabling the microphone.'
                : microphone.detail
          }
          onClick={toggleMicrophone}
        >
          {microphone.enabled ? <Mic /> : <MicOff />}
          {microphone.starting ? 'Starting…' : 'Microphone'}
        </Button>
      </div>
      <fieldset className="band-group voice-target" disabled={preview}>
        <legend>To</legend>
        {options.map((option) => (
          <label key={option.value} data-selected={target === option.value || undefined}>
            <input
              type="radio"
              name="voice-target"
              value={option.value}
              checked={target === option.value}
              onChange={() => setTarget(option.value)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      <div className="band-group">
        <Button
          size="sm"
          variant="ghost"
          disabled={!speech.enabled && !speech.busy && !speech.starting}
          onClick={speech.stop}
        >
          <Square /> Stop audio
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={preview || !conversationActive || conversation.status === 'stopping'}
          aria-busy={conversation.status === 'stopping'}
          onClick={stopConversation}
        >
          <Square />
          {conversation.status === 'stopping' ? 'Stopping…' : 'Stop conversation'}
        </Button>
      </div>
      <output
        className="band-status"
        aria-live="polite"
        data-error={Boolean(error) || undefined}
        data-listening={microphone.listening || undefined}
        title={status}
      >
        {status}
      </output>
      {(microphone.lastIgnored || microphone.lastSent) && !microphone.interim && (
        <output
          className="you-said"
          aria-live="polite"
          data-ignored={Boolean(microphone.lastIgnored) || undefined}
          title={
            microphone.lastIgnored
              ? 'The echo guard treated this as our own voice coming back through the speakers. Say it again and it will send.'
              : 'Your last spoken turn, as it left the browser.'
          }
        >
          <span className="you-said-label">
            {microphone.lastIgnored ? 'Ignored as echo' : 'You said'}
          </span>
          <span className="you-said-text">
            “{(microphone.lastIgnored ?? microphone.lastSent)!.text}”
          </span>
        </output>
      )}
      <details className="band-more">
        <summary>More</summary>
        <div className="band-more-panel">
          {voices.catalog &&
            agentIds.map((agent) => (
              <label key={`voice-${agent}`} className="voice-pick">
                {names[agent]} voice
                <select
                  value={voices.catalog?.selection[agent]}
                  disabled={voices.busy || preview}
                  onChange={(event) => void voices.select(agent, event.target.value)}
                >
                  {voices.catalog?.voices.map((voice) => (
                    <option key={voice.alias} value={voice.alias}>
                      {voice.alias}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          <form
            className="voice-add"
            onSubmit={(event) => {
              event.preventDefault();
              if (!newAlias.trim() || !newId.trim()) return;
              void voices.add(newAlias.trim(), newId.trim()).then(() => {
                setNewAlias('');
                setNewId('');
              });
            }}
          >
            <input
              aria-label="New voice name"
              placeholder="Name"
              value={newAlias}
              maxLength={32}
              onChange={(event) => setNewAlias(event.target.value)}
            />
            <input
              aria-label="Cartesia voice ID"
              placeholder="Cartesia voice ID"
              value={newId}
              spellCheck={false}
              onChange={(event) => setNewId(event.target.value)}
            />
            <Button
              size="sm"
              variant="ghost"
              type="submit"
              disabled={voices.busy || !newAlias.trim() || !newId.trim()}
            >
              Add voice
            </Button>
          </form>
          {voices.catalog?.voices.some((voice) => voice.custom) && (
            <div className="voice-custom">
              {voices.catalog.voices
                .filter((voice) => voice.custom)
                .map((voice) => (
                  <Button
                    key={voice.alias}
                    size="sm"
                    variant="ghost"
                    disabled={voices.busy}
                    title={`Remove ${voice.alias} from the catalog`}
                    onClick={() => void voices.remove(voice.alias)}
                  >
                    Remove {voice.alias}
                  </Button>
                ))}
            </div>
          )}
          {voices.error && <p className="voice-error">{voices.error}</p>}
          {hangout &&
            agentIds.map((agent) => (
              <Button
                key={`mute-${agent}`}
                size="sm"
                variant="ghost"
                aria-pressed={speech.muted[agent]}
                disabled={speech.starting || speech.testing}
                onClick={() => speech.toggleMute(agent)}
              >
                {speech.muted[agent] ? <VolumeX /> : <Volume2 />}
                {speech.muted[agent] ? 'Unmute' : 'Mute'} {names[agent]}
              </Button>
            ))}
          {agentIds.map((agent) => (
            <Button
              key={`test-${agent}`}
              size="sm"
              variant="ghost"
              disabled={
                !speech.ready ||
                speech.muted[agent] ||
                !speech.voiceEnabled[agent] ||
                speech.starting ||
                speech.busy ||
                speech.testing ||
                preview
              }
              onClick={() => void speech.test(agent)}
            >
              Test {names[agent]} voice
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={ping} disabled={pinging}>
            {pinging ? 'Checking…' : health || 'Ping API'}
          </Button>
          {reconnect && (
            <Button size="sm" variant="ghost" onClick={reconnect}>
              Reconnect
            </Button>
          )}
        </div>
      </details>
    </div>
  );
}
