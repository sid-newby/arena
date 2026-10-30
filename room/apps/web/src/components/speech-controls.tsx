import { agentIds } from '@/lib/agents';
import { Square, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { useSpeech } from '@/hooks/use-speech';
import './speech-controls.css';

export function SpeechControls({
  speech,
  preview,
}: {
  speech: ReturnType<typeof useSpeech>;
  preview: boolean;
}) {
  return (
    <div className="speech-controls" aria-label="Cartesia speech playback">
      <div className="speech-actions">
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={speech.enabled}
          disabled={
            speech.starting ||
            speech.testing ||
            (!speech.enabled && (!speech.ready || preview || !speech.connectionsReady))
          }
          title={preview ? 'Leave preview before enabling speech.' : speech.detail}
          onClick={() => (speech.enabled ? speech.disable() : void speech.enable())}
        >
          {speech.enabled ? <Volume2 /> : <VolumeX />}
          {speech.starting ? 'Starting audio…' : speech.enabled ? 'Speech on' : 'Enable speech'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!speech.enabled && !speech.busy && !speech.starting}
          onClick={speech.stop}
        >
          <Square /> Stop audio
        </Button>
        {agentIds.map((agent) => (
          <Button
            key={agent}
            size="sm"
            variant="ghost"
            disabled={!speech.ready || speech.starting || speech.busy || speech.testing || preview}
            onClick={() => void speech.test(agent)}
          >
            Test {agent === 'a' ? 'A' : 'B'} voice
          </Button>
        ))}
      </div>
      <output className="speech-feedback" aria-live="polite">
        {speech.error ||
          (speech.enabled || speech.busy || speech.testing || speech.feedback
            ? speech.status
            : !speech.ready
              ? speech.detail
              : preview
                ? 'Speech off in preview'
                : 'Cartesia · new replies only')}
      </output>
    </div>
  );
}
