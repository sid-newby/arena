# Chat with Luna

Run with Node.js 22.18 or later and Codex CLI on your PATH. No npm packages are required.

```sh
cd openai
node luna.ts
```

The script reuses your Codex ChatGPT login. If you have no login, it runs `codex login`, which opens the browser and handles the localhost callback. If you previously signed in with an API key, run `codex login` to switch to ChatGPT first.

Type a message and press Enter. Replies stream into the terminal. The conversation keeps its context until you leave. Use `/exit`, `/quit`, Ctrl-C, or Ctrl-D to leave. If Codex disconnects, the script exits too.

Edit `settings` at the top of `luna.ts` to tune the prompt, model, reasoning, verbosity, tools, and working directory. The shell can write within the configured working directory, which defaults to this `openai` folder. Commands run without confirmation inside Codex's `workspace-write` sandbox. Commands that require permission outside that sandbox cannot escalate through this minimal client.

To inspect raw app-server notifications, including reasoning summaries and tool results, run:

```sh
node luna.ts --json
```

Set `CODEX_BIN` to use another Codex executable.

This uses a local `codex app-server` child process over stdio. It does not send the sample request directly through the `openai` package. Codex owns authentication, conversation state, tool execution, and context compaction. The thread is ephemeral and is not saved for resumption. This is not a promise of zero server retention.

The defaults match the sample's model, service tier, reasoning effort, reasoning summary, and verbosity. Web search and image generation are enabled through Codex. The sample's exact image model, partial-image count, image encoding options, search location, `reasoning.mode`, `include`, and `store` fields are not forwarded. Codex manages those details. Image generation depends on account and model support; saved image paths are printed when Codex returns them.

The client was built against Codex CLI 0.159.3. The app-server protocol is experimental.

- [Codex app-server protocol](https://developers.openai.com/codex/app-server)
- [Codex authentication](https://developers.openai.com/codex/auth)
