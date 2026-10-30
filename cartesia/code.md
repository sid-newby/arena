```ts
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