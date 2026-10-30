import { useRef, useState, type MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import type { AgentId } from '@/lib/agents';
import {
  expressionMoods,
  type ExpressionSnapshot,
  type PanelExpression,
} from '@/lib/panel-expression';
import type { ActivityFrame } from '@/lib/panel-motion';
import './expression-lab.css';

export function ExpressionLab({
  show,
  showActivity,
}: {
  show: (agent: AgentId, snapshot: ExpressionSnapshot | undefined) => void;
  showActivity: (agent: AgentId, frame: ActivityFrame | undefined) => void;
}) {
  const [agent, setAgent] = useState<AgentId>('a');
  const [intensity, setIntensity] = useState(0.6);
  const [status, setStatus] = useState('Local previews. No model turns.');
  const last = useRef<Partial<Record<AgentId, ExpressionSnapshot>>>({});
  const cooldown = useRef<Partial<Record<AgentId, number>>>({});
  const turns = useRef<Partial<Record<AgentId, string>>>({});
  function activity(phase: ActivityFrame['phase'], stopped = false) {
    if (phase === 'thinking' || !turns.current[agent]) turns.current[agent] = crypto.randomUUID();
    showActivity(agent, {
      connected: true,
      phase,
      reply: {
        id: turns.current[agent],
        status: phase === 'idle' ? (stopped ? 'stopped' : 'completed') : 'streaming',
      },
    });
    setStatus(
      `${agent === 'a' ? 'A' : 'B'} · ${stopped ? 'interrupted' : phase} · local activity preview`,
    );
  }
  function trigger(mood: PanelExpression['mood'], expired = false) {
    const now = Date.now();
    if (!expired && now < (cooldown.current[agent] ?? 0)) {
      setStatus('Wait 750ms between expressions.');
      return;
    }
    const startedAt = expired ? now - 2000 : now;
    const snapshot = {
      expression: {
        id: crypto.randomUUID(),
        mood,
        intensity,
        duration: 1500,
        startedAt,
        expiresAt: startedAt + 1500,
      },
      serverNow: now,
      receivedAt: performance.now(),
    };
    last.current[agent] = snapshot;
    cooldown.current[agent] = now + 750;
    show(agent, snapshot);
    setStatus(
      expired
        ? 'Expired snapshot. It should stay clear.'
        : `${agent === 'a' ? 'A' : 'B'} · ${mood} · local preview`,
    );
  }
  function handleExpression(event: MouseEvent<HTMLButtonElement>) {
    const mood = expressionMoods.find((candidate) => candidate === event.currentTarget.value);
    if (mood) trigger(mood);
  }
  return (
    <details className="expression-lab">
      <summary>Expression lab</summary>
      <div className="expression-lab-body">
        <label>
          Panel{' '}
          <select
            value={agent}
            onChange={(event) => setAgent(event.target.value === 'b' ? 'b' : 'a')}
          >
            <option value="a">A</option>
            <option value="b">B</option>
          </select>
        </label>
        <label>
          Intensity{' '}
          <input
            aria-label="Expression intensity"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={intensity}
            onChange={(event) => setIntensity(Number(event.target.value))}
          />
        </label>
        <div className="expression-lab-actions">
          {expressionMoods.map((mood) => (
            <Button
              key={mood}
              value={mood}
              size="sm"
              variant="secondary"
              onClick={handleExpression}
            >
              {mood[0].toUpperCase() + mood.slice(1)}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              show(agent, {
                expression: null,
                serverNow: Date.now(),
                receivedAt: performance.now(),
              });
              setStatus('Expression cleared. Pose stays current.');
            }}
          >
            Clear
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const snapshot = last.current[agent];
              if (snapshot) show(agent, { ...snapshot });
              setStatus('Repeated snapshot. It must not restart.');
            }}
          >
            Repeat snapshot
          </Button>
          <Button size="sm" variant="ghost" onClick={() => trigger('annoyed', true)}>
            Expired snapshot
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              show(agent, undefined);
              showActivity(agent, undefined);
              setStatus('Following live agent expressions.');
            }}
          >
            Live
          </Button>
        </div>
        <fieldset className="expression-lab-activity">
          <legend>Turn activity · local preview</legend>
          <div className="expression-lab-actions">
            <Button size="sm" variant="secondary" onClick={() => activity('thinking')}>
              Thinking
            </Button>
            <Button size="sm" variant="secondary" onClick={() => activity('writing')}>
              Writing
            </Button>
            <Button size="sm" variant="secondary" onClick={() => activity('idle')}>
              Finish
            </Button>
            <Button size="sm" variant="ghost" onClick={() => activity('idle', true)}>
              Interrupt
            </Button>
          </div>
        </fieldset>
        <output>{status}</output>
      </div>
    </details>
  );
}
