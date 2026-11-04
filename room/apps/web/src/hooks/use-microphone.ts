import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listenSocketUrl,
  parseListenEvent,
  PcmChunker,
  PCM_CAPTURE_WORKLET,
  LISTEN_RATE,
  looksLikeEcho,
  resample,
  toPcm16,
  transcriptReady,
  wordCount,
} from '@/lib/microphone';

type Capture = {
  stream: MediaStream;
  context: AudioContext;
  socket?: WebSocket;
  chunker: PcmChunker;
  closed: boolean;
  attempts: number;
  turnDuringPlayback: boolean;
};

export type MicrophoneCallbacks = {
  onTranscript: (text: string) => void;
  onSpeech?: () => void;
  playing?: () => boolean;
  spoken?: () => string[];
};

export function useMicrophone(preview: boolean, callbacks: MicrophoneCallbacks) {
  const latest = useRef(callbacks);
  useEffect(() => {
    latest.current = callbacks;
  }, [callbacks]);
  const capture = useRef<Capture>(undefined);
  const supported =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof AudioWorkletNode !== 'undefined' &&
    typeof WebSocket !== 'undefined';
  const [ready, setReady] = useState(false);
  const [detail, setDetail] = useState('Checking Cartesia listening setup…');
  const [enabled, setEnabled] = useState(false);
  const [starting, setStarting] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [status, setStatus] = useState('Microphone off');
  const [error, setError] = useState<string>();

  const teardown = useCallback(() => {
    const current = capture.current;
    capture.current = undefined;
    if (!current) return;
    current.closed = true;
    current.socket?.close(1000, 'Microphone off');
    for (const track of current.stream.getTracks()) track.stop();
    void current.context.close().catch(() => {});
  }, []);

  const disable = useCallback(() => {
    teardown();
    setEnabled(false);
    setListening(false);
    setInterim('');
    setStatus('Microphone off');
  }, [teardown]);

  /* oxlint-disable react/set-state-in-effect -- Document lifecycle resets external capture. */
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/speech/listen/status', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Listening server unavailable.');
        const data: unknown = await response.json();
        if (
          !data ||
          typeof data !== 'object' ||
          !('ready' in data) ||
          typeof data.ready !== 'boolean' ||
          !('detail' in data) ||
          typeof data.detail !== 'string'
        )
          throw new Error('Unreadable listening setup.');
        setReady(data.ready);
        setDetail(data.detail);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setDetail('Listening server unavailable. Reload after configuring Cartesia.');
      });
    return () => {
      controller.abort();
      teardown();
    };
  }, [teardown]);
  useEffect(() => {
    if (preview && enabled) disable();
  }, [preview, enabled, disable]);
  /* oxlint-enable react/set-state-in-effect */

  function connect(current: Capture) {
    if (current.closed) return;
    const socket = new WebSocket(listenSocketUrl(window.location));
    socket.binaryType = 'arraybuffer';
    current.socket = socket;
    setStatus(current.attempts ? 'Reconnecting microphone…' : 'Connecting microphone…');
    socket.addEventListener('open', () => {
      current.attempts = 0;
    });
    socket.addEventListener('message', (message) => {
      const event = parseListenEvent(message.data);
      if (!event || current.closed) return;
      switch (event.type) {
        case 'ready':
          setError(undefined);
          setStatus('Listening · speak any time');
          return;
        case 'turn.start':
          current.turnDuringPlayback = latest.current.playing?.() ?? false;
          setListening(true);
          setInterim('');
          setStatus('Hearing you…');
          return;
        case 'turn.update': {
          setListening(true);
          setInterim(event.transcript);
          const echo =
            current.turnDuringPlayback &&
            looksLikeEcho(event.transcript, latest.current.spoken?.() ?? []);
          if (!echo && wordCount(event.transcript) >= 2) latest.current.onSpeech?.();
          return;
        }
        case 'turn.end': {
          setListening(false);
          setInterim('');
          const text = transcriptReady(event.transcript);
          if (
            text &&
            current.turnDuringPlayback &&
            looksLikeEcho(text, latest.current.spoken?.() ?? [])
          ) {
            setStatus('Ignored playback echo · listening');
            return;
          }
          if (text) {
            setStatus('Sent · listening');
            latest.current.onTranscript(text);
          } else setStatus('Listening · speak any time');
          return;
        }
        case 'error':
          setError(event.message);
          return;
        case 'closed':
          return;
        default:
          return;
      }
    });
    socket.addEventListener('close', () => {
      if (current.closed || capture.current !== current) return;
      setListening(false);
      setInterim('');
      if (current.attempts >= 5) {
        setError('Listening connection lost. Enable the microphone again.');
        disable();
        return;
      }
      current.attempts += 1;
      setTimeout(() => connect(current), Math.min(8000, 500 * 2 ** current.attempts));
    });
  }

  async function enable() {
    if (!supported || !ready || preview || starting || capture.current) return;
    setStarting(true);
    setError(undefined);
    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      try {
        context = new AudioContext({ sampleRate: LISTEN_RATE });
      } catch {
        context = new AudioContext();
      }
      await context.resume();
      const moduleUrl = URL.createObjectURL(
        new Blob([PCM_CAPTURE_WORKLET], { type: 'application/javascript' }),
      );
      try {
        await context.audioWorklet.addModule(moduleUrl);
      } finally {
        URL.revokeObjectURL(moduleUrl);
      }
      const current: Capture = {
        stream,
        context,
        chunker: new PcmChunker(LISTEN_RATE),
        closed: false,
        attempts: 0,
        turnDuringPlayback: false,
      };
      const node = new AudioWorkletNode(context, 'pcm-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
      });
      const inputRate = context.sampleRate;
      node.port.addEventListener('message', (message: MessageEvent<Float32Array>) => {
        const socket = current.socket;
        if (current.closed || !socket || socket.readyState !== socket.OPEN) return;
        const pcm = toPcm16(resample(message.data, inputRate, LISTEN_RATE));
        for (const chunk of current.chunker.push(pcm)) socket.send(chunk);
      });
      node.port.start();
      const silence = context.createGain();
      silence.gain.value = 0;
      context.createMediaStreamSource(stream).connect(node);
      node.connect(silence).connect(context.destination);
      capture.current = current;
      connect(current);
      setEnabled(true);
    } catch (cause) {
      for (const track of stream?.getTracks() ?? []) track.stop();
      void context?.close().catch(() => {});
      setError(
        cause instanceof DOMException && cause.name === 'NotAllowedError'
          ? 'Microphone permission was denied. Allow the microphone and try again.'
          : 'The microphone could not start. Check the input device and try again.',
      );
    } finally {
      setStarting(false);
    }
  }

  const notify = useCallback((message: string | undefined) => setError(message), []);

  return {
    supported,
    ready,
    detail,
    enabled,
    starting,
    listening,
    interim,
    status,
    error,
    enable,
    disable,
    notify,
  };
}
