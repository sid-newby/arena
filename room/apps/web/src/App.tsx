import { useEffect, useRef, useState } from 'react';
import './arena.css';
import { Tabs } from 'radix-ui';
import { AgentPanel } from '@/components/agent-panel';
import { Button } from '@/components/ui/button';
import { HangoutMemory } from '@/components/hangout-memory';
import { ThemeControls } from '@/components/theme-controls';
import { MaestroDialog } from '@/components/maestro-dialog';
import { VoiceBand } from '@/components/voice-band';
import { useAgents } from '@/hooks/use-agents';
import { useSpeech } from '@/hooks/use-speech';
import { useMicrophone } from '@/hooks/use-microphone';
import type { VoiceTarget } from '@/lib/microphone';
import { agentIds, api, modelPanelName, panelistName, type AgentId } from '@/lib/agents';
import { assertSendScope, type DeliveryBatch } from '@/lib/run-scope';
import { ExpressionLab } from '@/components/expression-lab';
import type { ExpressionSnapshot } from '@/lib/panel-expression';
import type { ActivityFrame } from '@/lib/panel-motion';
import { messagePending, type MessageIntent } from '@/lib/messaging';

function readPreference(key: string) {
  try {
    return localStorage.getItem(key) !== 'off';
  } catch {
    return true;
  }
}
function writePreference(key: string, enabled: boolean) {
  try {
    localStorage.setItem(key, enabled ? 'on' : 'off');
  } catch {
    /* The preference still applies for this visit. */
  }
}
function userHasActivated() {
  return navigator.userActivation?.hasBeenActive ?? false;
}

export default function App() {
  const debate = window.location.pathname.replace(/\/$/, '') === '/debate';
  useEffect(() => {
    document.title = debate ? 'Arena' : 'The Hangout · Arena';
  }, [debate]);
  const room = useAgents(debate ? 'debate' : 'hangout');
  const [preview, setPreview] = useState(false);
  const speech = useSpeech(room.agents, preview, room.runId);
  const [voiceTarget, setVoiceTarget] = useState<VoiceTarget>('room');
  const voiceQueue = useRef(Promise.resolve());
  const microphone = useMicrophone(preview, {
    onSpeech: () => {
      if (speech.busy) speech.stop();
    },
    onTranscript: (text) => {
      voiceQueue.current = voiceQueue.current
        .then(() => deliverTranscript(text))
        .catch((cause) =>
          microphone.notify(
            cause instanceof Error ? cause.message : 'Your words could not be delivered.',
          ),
        );
    },
  });
  const [wanted, setWanted] = useState(() => ({
    speech: readPreference('lilbits-speech'),
    microphone: readPreference('lilbits-microphone'),
  }));
  const [activated, setActivated] = useState(userHasActivated);
  useEffect(() => {
    if (activated) return;
    const arm = () => setActivated(true);
    window.addEventListener('pointerdown', arm, { once: true, capture: true });
    window.addEventListener('keydown', arm, { once: true, capture: true });
    return () => {
      window.removeEventListener('pointerdown', arm, { capture: true });
      window.removeEventListener('keydown', arm, { capture: true });
    };
  }, [activated]);
  const autoStarted = useRef({ speech: false, microphone: false });
  useEffect(() => {
    if (!activated || preview) return;
    if (
      wanted.speech &&
      !autoStarted.current.speech &&
      speech.ready &&
      speech.connectionsReady &&
      !speech.enabled &&
      !speech.starting
    ) {
      autoStarted.current.speech = true;
      void speech.enable();
    }
    if (
      wanted.microphone &&
      !autoStarted.current.microphone &&
      microphone.supported &&
      microphone.ready &&
      !microphone.enabled &&
      !microphone.starting
    ) {
      autoStarted.current.microphone = true;
      void microphone.enable();
    }
  }, [activated, preview, wanted, speech, microphone]);
  function toggleSpeech() {
    const enable = !speech.enabled;
    setWanted((current) => ({ ...current, speech: enable }));
    writePreference('lilbits-speech', enable);
    if (enable) void speech.enable();
    else speech.disable();
  }
  function toggleMicrophone() {
    const enable = !microphone.enabled;
    setWanted((current) => ({ ...current, microphone: enable }));
    writePreference('lilbits-microphone', enable);
    if (enable) void microphone.enable();
    else microphone.disable();
  }
  const [conversationAction, setConversationAction] = useState<
    { status: 'idle' | 'stopping' | 'stopped' } | { status: 'error'; message: string }
  >({ status: 'idle' });
  const [effectsEnabled, setEffectsEnabled] = useState(() => readPreference('lilbits-effects'));
  const [developmentExpressions, setDevelopmentExpressions] = useState<
    Partial<Record<AgentId, ExpressionSnapshot>>
  >({});
  const [developmentActivity, setDevelopmentActivity] = useState<
    Partial<Record<AgentId, ActivityFrame>>
  >({});
  const [selected, setSelected] = useState('a');
  const [health, setHealth] = useState<string>();
  const [pinging, setPinging] = useState(false);
  const connected = agentIds.every((id) => room.agents[id].connection === 'connected');
  const reconnecting = agentIds.some((id) => room.agents[id].connection === 'reconnecting');
  const conversationActive =
    speech.busy ||
    speech.starting ||
    agentIds.some(
      (id) =>
        room.agents[id].snapshot.status === 'working' ||
        room.agents[id].snapshot.humanMessages.some(messagePending) ||
        room.agents[id].side?.status === 'working' ||
        room.agents[id].side?.messages.some((message) => message.status === 'queued') ||
        room.agents[id].pending ||
        room.agents[id].snapshot.pendingPanelistMessages > 0,
    );
  async function send(
    id: AgentId,
    text: string,
    requestId: string,
    scope: DeliveryBatch,
    intent: MessageIntent,
  ) {
    assertSendScope(room.runId ?? '', scope);
    setConversationAction({ status: 'idle' });
    if (scope.revision === room.agents[id].snapshot.revision && intent === 'interrupt')
      speech.stop();
    await room.send(id, text, requestId, scope, intent);
  }
  async function deliverTranscript(text: string) {
    const runId = room.runId;
    if (!runId) throw new Error('Wait for the room to connect before speaking.');
    if (voiceTarget !== 'room') {
      const side = room.agents[voiceTarget].side;
      if (!side || side.runId !== runId)
        throw new Error('The whisper is not ready yet. Open the whisper and try again.');
      await api(
        `/api/runs/${encodeURIComponent(runId)}/agents/${voiceTarget}/side-conversation`,
        () => undefined,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId: crypto.randomUUID(),
            text,
            expectedRevision: side.revision,
          }),
          signal: AbortSignal.timeout(30000),
        },
      );
      return;
    }
    const targets = debate
      ? [...agentIds]
      : agentIds.filter((id) => room.agents[id].snapshot.hangoutPresence?.present === true);
    if (!targets.length) throw new Error('No one is present to hear you.');
    const revision = room.agents[targets[0]].snapshot.revision;
    if (room.agents[targets[0]].snapshot.runId !== runId || revision === undefined)
      throw new Error('Wait for the room to connect before speaking.');
    const batch = {
      runId,
      revision,
      text,
      targets,
      requestId: crypto.randomUUID(),
      intent: 'interrupt' as const,
      delivered: new Set<AgentId>(),
    };
    const results = await Promise.allSettled(
      targets.map((target) =>
        send(target, text, `${batch.requestId}-${target}`, batch, 'interrupt'),
      ),
    );
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failure)
      throw failure.reason instanceof Error
        ? failure.reason
        : new Error('Message could not be sent.');
  }
  async function stopConversation() {
    microphone.notify(undefined);
    speech.stop();
    setConversationAction({ status: 'stopping' });
    try {
      await room.stopConversation();
      setConversationAction({ status: 'stopped' });
    } catch (cause) {
      setConversationAction({
        status: 'error',
        message: cause instanceof Error ? cause.message : 'Could not stop the conversation.',
      });
    }
  }
  async function ping() {
    setPinging(true);
    try {
      const response = await fetch('/api/health');
      if (!response.ok) throw new Error();
      const body: unknown = await response.json();
      if (
        typeof body !== 'object' ||
        body === null ||
        !('status' in body) ||
        typeof body.status !== 'string'
      )
        throw new Error();
      setHealth(`API ${body.status}`);
    } catch {
      setHealth('API unreachable');
    } finally {
      setPinging(false);
    }
  }
  return (
    <div className="room">
      <header className="room-header">
        <h1 className="wordmark">
          arena<span aria-hidden="true">.</span>
        </h1>
        <span className="room-description">
          {debate ? 'A little room for big thoughts.' : 'The hangout'}
        </span>
        <div className="room-tools">
          {debate && <MaestroDialog runId={room.runId} disabled={preview} />}
          <output className="room-connection">
            <i data-connected={connected || undefined} />
            {room.apiError
              ? 'API offline'
              : reconnecting
                ? 'Reconnecting'
                : connected
                  ? 'Connected'
                  : 'Connecting'}
          </output>
          <Button
            size="sm"
            variant="ghost"
            className="preview-toggle"
            aria-pressed={preview}
            onClick={() => setPreview((value) => !value)}
          >
            Preview
            <span className="toggle-light" />
          </Button>
          {!debate && <HangoutMemory />}
          <ThemeControls />
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={effectsEnabled}
            title="Screen expressions. Reduced motion also suppresses these effects."
            onClick={() => {
              const enabled = !effectsEnabled;
              setEffectsEnabled(enabled);
              writePreference('lilbits-effects', enabled);
            }}
          >
            Effects {effectsEnabled ? 'on' : 'off'}
          </Button>
        </div>
      </header>
      <Tabs.Root className="room-tabs" value={selected} onValueChange={setSelected}>
        <Tabs.List className="mobile-agent-tabs" aria-label="Agent conversations">
          {agentIds.map((id) => {
            const name = modelPanelName(room.agents[id].info?.model, id);
            const seat = panelistName(id);
            return (
              <Tabs.Trigger key={id} value={id} aria-label={`${name}, seat ${seat}`}>
                <span className="mobile-agent-name" title={name}>
                  {name}
                </span>
                {name !== seat && <span className="mobile-agent-seat">· {seat}</span>}
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>
        <main className="stage" aria-label="Your agents">
          {agentIds.map((id) => (
            <Tabs.Content forceMount value={id} key={id} className="agent-slot">
              <AgentPanel
                key={`${room.runId ?? 'connecting'}:${id}`}
                id={id}
                {...room}
                send={send}
                preview={preview}
                hangout={!debate}
                effectsEnabled={effectsEnabled}
                selected={selected === id}
                developmentExpression={developmentExpressions[id]}
                developmentActivity={developmentActivity[id]}
                pose={undefined}
              />
            </Tabs.Content>
          ))}
        </main>
      </Tabs.Root>
      <footer className="room-footer">
        <VoiceBand
          speech={speech}
          microphone={microphone}
          preview={preview}
          hangout={!debate}
          names={{
            a: modelPanelName(room.agents.a.info?.model, 'a'),
            b: modelPanelName(room.agents.b.info?.model, 'b'),
          }}
          target={voiceTarget}
          setTarget={setVoiceTarget}
          awaitingActivation={!activated && (wanted.speech || wanted.microphone)}
          toggleSpeech={toggleSpeech}
          toggleMicrophone={toggleMicrophone}
          conversation={conversationAction}
          conversationActive={conversationActive}
          stopConversation={() => void stopConversation()}
          health={health}
          pinging={pinging}
          ping={() => void ping()}
          reconnect={room.apiError || reconnecting ? room.reconnect : undefined}
        />
      </footer>
      {import.meta.env.DEV && new URLSearchParams(location.search).has('effects') && (
        <ExpressionLab
          show={(id, snapshot) =>
            setDevelopmentExpressions((current) => ({ ...current, [id]: snapshot }))
          }
          showActivity={(id, frame) =>
            setDevelopmentActivity((current) => ({ ...current, [id]: frame }))
          }
        />
      )}
    </div>
  );
}
