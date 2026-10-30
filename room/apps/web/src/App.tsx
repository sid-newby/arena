import { useState } from 'react';
import './arena.css';
import { Tabs } from 'radix-ui';
import { ArrowLeft, ArrowRight, MoveUpRight, LocateFixed, RotateCcw, Square } from 'lucide-react';
import { AgentPanel } from '@/components/agent-panel';
import { Button } from '@/components/ui/button';
import { ThemeControls } from '@/components/theme-controls';
import { MaestroDialog } from '@/components/maestro-dialog';
import { SpeechControls } from '@/components/speech-controls';
import { useAgents } from '@/hooks/use-agents';
import { useSpeech } from '@/hooks/use-speech';
import { agentIds, modelPanelName, panelistName, type AgentId, type Pose } from '@/lib/agents';
import { assertSendScope, type SendScope } from '@/lib/run-scope';
import { ExpressionLab } from '@/components/expression-lab';
import type { ExpressionSnapshot } from '@/lib/panel-expression';
import type { ActivityFrame } from '@/lib/panel-motion';

function readEffectsEnabled() {
  try {
    return localStorage.getItem('lilbits-effects') !== 'off';
  } catch {
    return true;
  }
}

export default function App() {
  const room = useAgents();
  const [preview, setPreview] = useState(false);
  const speech = useSpeech(room.agents, preview, room.runId);
  const [conversationAction, setConversationAction] = useState<
    { status: 'idle' | 'stopping' | 'stopped' } | { status: 'error'; message: string }
  >({ status: 'idle' });
  const [effectsEnabled, setEffectsEnabled] = useState(readEffectsEnabled);
  const [developmentExpressions, setDevelopmentExpressions] = useState<
    Partial<Record<AgentId, ExpressionSnapshot>>
  >({});
  const [developmentActivity, setDevelopmentActivity] = useState<
    Partial<Record<AgentId, ActivityFrame>>
  >({});
  const [poses, setPoses] = useState<
    Partial<Record<AgentId, { pose: Pose | 'lean'; revision: number }>>
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
        room.agents[id].pending ||
        room.agents[id].snapshot.pendingPanelistMessages > 0,
    );
  async function send(id: AgentId, text: string, requestId: string, scope: SendScope) {
    assertSendScope(room.runId ?? '', scope);
    setConversationAction({ status: 'idle' });
    if (
      scope.revision === room.agents[id].snapshot.revision &&
      room.agents[id].snapshot.activeSource === 'panelist'
    )
      speech.stop();
    await room.send(id, text, requestId, scope);
  }
  async function stopConversation() {
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
        <span className="room-description">A little room for big thoughts.</span>
        <div className="room-tools">
          <MaestroDialog runId={room.runId} disabled={preview} />
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
          <ThemeControls />
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={effectsEnabled}
            title="Screen expressions. Reduced motion also suppresses these effects."
            onClick={() => {
              const enabled = !effectsEnabled;
              setEffectsEnabled(enabled);
              try {
                localStorage.setItem('lilbits-effects', enabled ? 'on' : 'off');
              } catch {
                /* The preference still applies for this visit. */
              }
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
                effectsEnabled={effectsEnabled}
                selected={selected === id}
                developmentExpression={developmentExpressions[id]}
                developmentActivity={developmentActivity[id]}
                pose={
                  poses[id]?.revision === room.agents[id].snapshot.poseRevision
                    ? poses[id]?.pose
                    : undefined
                }
              />
            </Tabs.Content>
          ))}
        </main>
      </Tabs.Root>
      <footer className="room-footer" data-selected={selected}>
        <div className="scene-controls">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setPoses({
                a: { pose: 'front', revision: room.agents.a.snapshot.poseRevision },
                b: { pose: 'front', revision: room.agents.b.snapshot.poseRevision },
              })
            }
          >
            <LocateFixed />
            Recenter panels
          </Button>
          {agentIds.map((id) => (
            <fieldset key={id} className={`pose-control pose-${id}`}>
              <legend>{id === 'a' ? 'A' : 'B'}</legend>
              <div>
                {(['front', id === 'a' ? 'right' : 'left', 'lean'] as const).map((pose) => (
                  <Button
                    key={pose}
                    variant="ghost"
                    size="sm"
                    aria-label={`${id === 'a' ? 'A' : 'B'}: ${pose === 'front' ? 'face audience' : pose === 'lean' ? 'lean in' : 'face peer'}`}
                    aria-pressed={
                      poses[id]?.pose === pose &&
                      poses[id]?.revision === room.agents[id].snapshot.poseRevision
                    }
                    onClick={() =>
                      setPoses((current) => ({
                        ...current,
                        [id]: { pose, revision: room.agents[id].snapshot.poseRevision },
                      }))
                    }
                  >
                    {pose === 'lean' ? (
                      <MoveUpRight />
                    ) : pose === 'left' ? (
                      <ArrowLeft />
                    ) : pose === 'right' ? (
                      <ArrowRight />
                    ) : (
                      <MoveUpRight className="front-pose-icon" />
                    )}
                    <span>
                      {pose === 'front' ? 'Audience' : pose === 'lean' ? 'Lean in' : 'Peer'}
                    </span>
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Reset ${id} pose`}
                  onClick={() => setPoses((current) => ({ ...current, [id]: undefined }))}
                >
                  <RotateCcw />
                </Button>
              </div>
            </fieldset>
          ))}
        </div>
        <div className="room-utility">
          <SpeechControls speech={speech} preview={preview} />
          <div className="conversation-controls">
            <Button
              size="sm"
              variant="ghost"
              disabled={preview || !conversationActive || conversationAction.status === 'stopping'}
              aria-busy={conversationAction.status === 'stopping'}
              onClick={() => void stopConversation()}
            >
              <Square />
              {conversationAction.status === 'stopping'
                ? 'Stopping conversation…'
                : 'Stop conversation'}
            </Button>
            <output
              className="conversation-feedback"
              aria-live="polite"
              data-error={conversationAction.status === 'error' || undefined}
            >
              {conversationAction.status === 'error'
                ? conversationAction.message
                : conversationAction.status === 'stopped' && !conversationActive
                  ? 'Conversation stopped'
                  : ''}
            </output>
          </div>
          <Button size="sm" variant="ghost" onClick={() => void ping()} disabled={pinging}>
            {pinging ? 'Checking…' : health || 'Ping API'}
          </Button>
          {(room.apiError || reconnecting) && (
            <Button size="sm" variant="ghost" onClick={room.reconnect}>
              Reconnect
            </Button>
          )}
        </div>
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
