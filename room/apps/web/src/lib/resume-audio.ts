// Browsers can leave an initial resume() pending until a trusted interaction.
export async function resumeAudio(context: AudioContext, signal: AbortSignal) {
  signal.throwIfAborted();
  if (context.state === 'running') return;
  await new Promise<void>((resolve, reject) => {
    function cleanup() {
      window.removeEventListener('click', resume);
      window.removeEventListener('keydown', resume);
      signal.removeEventListener('abort', cancel);
    }
    function cancel() {
      cleanup();
      reject(signal.reason);
    }
    function resume() {
      context.resume().then(
        () => {
          cleanup();
          resolve();
        },
        (error: unknown) => {
          if (error instanceof DOMException && error.name === 'NotAllowedError') return;
          cleanup();
          reject(error);
        },
      );
    }
    window.addEventListener('click', resume);
    window.addEventListener('keydown', resume);
    signal.addEventListener('abort', cancel, { once: true });
    resume();
  });
}
