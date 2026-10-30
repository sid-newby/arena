> ## Documentation Index
> Fetch the complete documentation index at: https://docs.cartesia.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# WebSocket Concurrent Contexts

> Two contexts on one connection, each using ctx.receive() to get their own audio.

**Python**

Since sync code can't receive from both contexts concurrently, we collect
them sequentially — but the lazy-routing in receive() ensures that events
consumed while reading context 1 are queued for context 2 (and vice-versa).

```python theme={null}
def tts_websocket_concurrent_receives(client: Cartesia) -> None:
    """Two contexts on one connection, each using ctx.receive() to get their own audio.

    Since sync code can't receive from both contexts concurrently, we collect
    them sequentially — but the lazy-routing in receive() ensures that events
    consumed while reading context 1 are queued for context 2 (and vice-versa).
    """
    from cartesia.types import RawOutputFormatParam

    output_format: RawOutputFormatParam = {"container": "raw", "encoding": "pcm_s16le", "sample_rate": 44100}

    with client.tts.websocket_connect() as connection:
        ctx1 = connection.context(
            model_id="sonic-3.6",
            voice="6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
            output_format=output_format,
        )
        ctx2 = connection.context(
            model_id="sonic-3.6",
            voice="6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
            output_format=output_format,
        )

        # Send to both contexts before receiving
        ctx1.push(
            "Context one is speaking now. This is a longer transcript to ensure that audio chunks from both contexts are interleaved on the wire. The quick brown fox jumps over the lazy dog."
        )
        ctx1.no_more_inputs()

        ctx2.push(
            "Context two has a different message. We want to verify that the routing logic correctly separates the audio streams. Pack my box with five dozen liquor jugs."
        )
        ctx2.no_more_inputs()

        import datetime

        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")

        # Receive from ctx1 — any ctx2 events read from the wire get queued
        filename1 = f"tts_concurrent_ctx1_{timestamp}.pcm"
        with open(filename1, "wb") as f:
            for response in ctx1.receive():
                if response.type == "chunk" and response.audio:
                    f.write(response.audio)
                elif response.type == "error":
                    print(f"error: {response.message or response.title}")

        # Receive from ctx2 — picks up queued events first
        filename2 = f"tts_concurrent_ctx2_{timestamp}.pcm"
        with open(filename2, "wb") as f:
            for response in ctx2.receive():
                if response.type == "chunk" and response.audio:
                    f.write(response.audio)
                elif response.type == "error":
                    print(f"error: {response.message or response.title}")

        print(f"Saved context 1 audio to {filename1}")
        print(f"Saved context 2 audio to {filename2}")
        print(f"Play with:")
        print(f"  ffplay -f s16le -ar 44100 {filename1}")
        print(f"  ffplay -f s16le -ar 44100 {filename2}")
```

From [cartesia-python/examples/examples.py:395](https://github.com/cartesia-ai/cartesia-python/blob/v4.0.1/examples/examples.py#L395)

**Python (Async)**

The async version runs both senders and receivers in parallel via `asyncio.gather`.
The connection's background listener routes events into per-context queues, and each
`ctx.receive()` iterator drains its own queue.

```python theme={null}
async def tts_websocket_concurrent_receives_async(client: AsyncCartesia) -> None:
    """Two contexts on one connection, each using ctx.receive() concurrently via tasks.

    The lazy-routing in receive() ensures that whichever task happens to read an
    event from the wire routes it to the correct context's queue.
    """
    import asyncio
    import datetime

    from cartesia.types import RawOutputFormatParam
    from cartesia.resources.tts import AsyncWebSocketContext

    output_format: RawOutputFormatParam = {"container": "raw", "encoding": "pcm_s16le", "sample_rate": 44100}

    async with client.tts.websocket_connect() as connection:
        ctx1 = connection.context(
            model_id="sonic-3.6",
            voice="6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
            output_format=output_format,
        )
        ctx2 = connection.context(
            model_id="sonic-3.6",
            voice="6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
            output_format=output_format,
        )

        # Send to both contexts
        await ctx1.push(
            "Context one is speaking now. This is a longer transcript to ensure that audio chunks from both contexts are interleaved on the wire. The quick brown fox jumps over the lazy dog."
        )
        await ctx1.no_more_inputs()

        await ctx2.push(
            "Context two has a different message. We want to verify that the routing logic correctly separates the audio streams. Pack my box with five dozen liquor jugs."
        )
        await ctx2.no_more_inputs()

        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")

        # Receive concurrently via tasks, writing to files
        async def collect(ctx: AsyncWebSocketContext, filename: str) -> None:
            with open(filename, "wb") as f:
                async for response in ctx.receive():
                    if response.type == "chunk" and response.audio:
                        f.write(response.audio)
                    elif response.type == "error":
                        print(f"error: {response.message or response.title}")

        filename1 = f"tts_concurrent_async_ctx1_{timestamp}.pcm"
        filename2 = f"tts_concurrent_async_ctx2_{timestamp}.pcm"

        await asyncio.gather(
            collect(ctx1, filename1),
            collect(ctx2, filename2),
        )

        print(f"Saved context 1 audio to {filename1}")
        print(f"Saved context 2 audio to {filename2}")
        print(f"Play with:")
        print(f"  ffplay -f s16le -ar 44100 {filename1}")
        print(f"  ffplay -f s16le -ar 44100 {filename2}")
```

From [cartesia-python/examples/async\_examples.py:309](https://github.com/cartesia-ai/cartesia-python/blob/v4.0.1/examples/async_examples.py#L309)

**TypeScript**

```typescript theme={null}
async function ttsWebsocketConcurrentContexts(client: Cartesia): Promise<void> {
  const ws = await client.tts.websocket();
  ws.on('error', (err) => console.error('WS error:', err.message));

  try {
    const ctx1 = ws.context({
      model_id: 'sonic-3.6',
      voice: '6ccbfb76-1fc6-48f7-b71d-91ac6298247b',
      output_format: { container: 'raw', encoding: 'pcm_f32le', sample_rate: 44100 },
      language: 'en',
    });

    const ctx2 = ws.context({
      model_id: 'sonic-3.6',
      voice: '6ccbfb76-1fc6-48f7-b71d-91ac6298247b',
      output_format: { container: 'raw', encoding: 'pcm_f32le', sample_rate: 44100 },
      language: 'en',
    });

    // Send to both contexts before receiving.
    await ctx1.push({
      transcript:
        'Context one is speaking now. This is a longer transcript to ensure that ' +
        'audio chunks from both contexts are interleaved on the wire. ' +
        'The quick brown fox jumps over the lazy dog.',
    });
    await ctx1.no_more_inputs();

    await ctx2.push({
      transcript:
        'Context two has a different message. We want to verify that the routing ' +
        'logic correctly separates the audio streams. ' +
        'Pack my box with five dozen liquor jugs.',
    });
    await ctx2.no_more_inputs();

    const ts = timestamp();

    async function collect(ctx: { receive: typeof ctx1.receive }, filename: string): Promise<void> {
      const file = fs.createWriteStream(filename);
      for await (const event of ctx.receive()) {
        if (event.type === 'chunk' && event.audio) {
          file.write(event.audio);
        } else if (event.type === 'error') {
          throw new Error(`${event.title}: ${event.message}`);
        }
      }
      file.end();
    }

    const filename1 = `tts_concurrent_ctx1_${ts}.pcm`;
    const filename2 = `tts_concurrent_ctx2_${ts}.pcm`;

    await Promise.all([collect(ctx1, filename1), collect(ctx2, filename2)]);

    console.log(`Saved context 1 audio to ${filename1}`);
    console.log(`Saved context 2 audio to ${filename2}`);
    console.log('Play with:');
    console.log(`  ffplay -f f32le -ar 44100 ${filename1}`);
    console.log(`  ffplay -f f32le -ar 44100 ${filename2}`);
  } finally {
    ws.close();
  }
}
```

From [cartesia-js/examples/node\_examples.ts:351](https://github.com/cartesia-ai/cartesia-js/blob/v4.0.1/examples/node_examples.ts#L351)

## Run this example

**Python**

```sh theme={null}
git clone --branch v4.0.1 https://github.com/cartesia-ai/cartesia-python
cd cartesia-python
uv sync
CARTESIA_API_KEY=YOUR_KEY uv run examples/examples.py tts_websocket_concurrent_receives
```

**Python (Async)**

```sh theme={null}
git clone --branch v4.0.1 https://github.com/cartesia-ai/cartesia-python
cd cartesia-python
uv sync
CARTESIA_API_KEY=YOUR_KEY uv run examples/async_examples.py tts_websocket_concurrent_receives_async
```

**TypeScript**

```sh theme={null}
git clone --branch v4.0.1 https://github.com/cartesia-ai/cartesia-js
cd cartesia-js
pnpm i
CARTESIA_API_KEY=YOUR_KEY pnpm tsn examples/node_examples.ts ttsWebsocketConcurrentContexts
```


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.