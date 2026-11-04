import { createSpecStreamCompiler } from '@json-render/core';
import { stageStore, type StageSpec } from './store';

const LOG_LINES = 40;

/**
 * Feed JSONL patch chunks into the scene. Any source works: the mock agent,
 * a fetch body, an EventSource. Stops quietly when the signal aborts.
 */
export async function playStream(chunks: AsyncIterable<string>, signal?: AbortSignal) {
  const compiler = createSpecStreamCompiler<StageSpec>();
  stageStore.setState({ spec: null, patches: 0, log: [] });
  for await (const chunk of chunks) {
    if (signal?.aborted) return;
    const { result, newPatches } = compiler.push(chunk);
    if (newPatches.length === 0) continue;
    stageStore.setState((store) => ({
      spec: result,
      patches: store.patches + newPatches.length,
      log: [...store.log, ...newPatches.map((patch) => `${patch.op} ${patch.path}`)].slice(
        -LOG_LINES,
      ),
    }));
  }
}
