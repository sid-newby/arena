import { demoScene } from '@/stage/demo';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const line = (patch: object) => `${JSON.stringify(patch)}\n`;

/**
 * A fake agent: streams the demo scene as RFC 6902 patches, one node at a
 * time, the way a real seat will once the API relays its ops.
 */
export async function* mockAgent(pace = 450): AsyncGenerator<string> {
  const elements: Record<string, { type: string; props: unknown; children: string[] }> =
    demoScene.elements;
  const root = demoScene.root;
  yield line({ op: 'add', path: '/root', value: root });
  yield line({ op: 'add', path: `/elements/${root}`, value: { ...elements[root], children: [] } });
  for (const id of elements[root].children) {
    await sleep(pace);
    yield line({ op: 'add', path: `/elements/${id}`, value: elements[id] });
    yield line({ op: 'add', path: `/elements/${root}/children/-`, value: id });
  }
}
