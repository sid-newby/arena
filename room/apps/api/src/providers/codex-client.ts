import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { codexEnvironment, protocolObject } from './provider-environment.js';

type ProtocolObject = Record<string, unknown>;
interface PendingRequest {
  resolve(value: ProtocolObject): void;
  reject(error: Error): void;
}

export class CodexClient {
  private readonly server;
  private readonly lines;
  private readonly pending = new Map<number, PendingRequest>();
  private nextId = 0;
  private closed = false;
  private rejectFailure!: (error: Error) => void;
  readonly failure = new Promise<never>((_resolve, reject) => {
    this.rejectFailure = reject;
  });
  onNotification: (method: string, params: ProtocolObject) => void = () => {};
  onTool: (name: string, input: ProtocolObject) => Promise<string> = async () => {
    throw new Error('Tool unavailable.');
  };

  constructor() {
    void this.failure.catch(() => {});
    this.server = spawn(process.env.CODEX_BIN ?? 'codex', ['app-server', '--listen', 'stdio://'], {
      env: codexEnvironment(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.server.stderr.resume();
    this.server.on('error', (error) => this.fail(error));
    this.server.stdin.on('error', (error) => this.fail(error));
    this.server.on('exit', (code) => {
      if (!this.closed) this.fail(new Error(`Codex connection closed (${code ?? 'signal'}).`));
    });
    this.lines = createInterface({ input: this.server.stdout });
    this.lines.on('line', (line) => {
      void this.receive(line).catch((error: unknown) =>
        this.fail(error instanceof Error ? error : new Error('Codex protocol failed.')),
      );
    });
  }

  private fail(error: Error) {
    this.pending.forEach((request) => request.reject(error));
    this.pending.clear();
    this.rejectFailure(error);
  }

  send(value: ProtocolObject) {
    if (!this.closed) this.server.stdin.write(`${JSON.stringify(value)}\n`);
  }

  request(method: string, params: ProtocolObject = {}): Promise<ProtocolObject> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex timed out responding to ${method}.`));
      }, 30000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      this.send({ id, method, params });
    });
  }

  async initialize() {
    await this.request('initialize', {
      clientInfo: { name: 'arena_room', title: 'Arena room', version: '0.2.0' },
      capabilities: { experimentalApi: true },
    });
    this.send({ method: 'initialized', params: {} });
    const account = await this.request('account/read', { refreshToken: false });
    if (protocolObject(account.account).type !== 'chatgpt')
      throw new Error(
        'Sign in to a ChatGPT subscription with codex login. API-key and cloud routes are not supported.',
      );
  }

  private async receive(line: string) {
    const message = protocolObject(JSON.parse(line));
    if (typeof message.id === 'number' && typeof message.method !== 'string') {
      const request = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) request?.reject(new Error(String(protocolObject(message.error).message)));
      else request?.resolve(protocolObject(message.result));
      return;
    }
    if (typeof message.method !== 'string') throw new Error('Invalid Codex notification.');
    const params = protocolObject(message.params ?? {});
    if ('id' in message) {
      if (message.method !== 'item/tool/call') {
        this.send({
          id: message.id,
          error: { code: -32601, message: 'Only the supplied room tools are authorized.' },
        });
        return;
      }
      try {
        const output = await this.onTool(String(params.tool), protocolObject(params.arguments));
        this.send({
          id: message.id,
          result: { contentItems: [{ type: 'inputText', text: output }], success: true },
        });
      } catch (error) {
        this.send({
          id: message.id,
          result: {
            contentItems: [
              { type: 'inputText', text: error instanceof Error ? error.message : 'Tool denied.' },
            ],
            success: false,
          },
        });
      }
      return;
    }
    this.onNotification(message.method, params);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.fail(new Error('Codex connection closed.'));
    this.lines.close();
    this.server.stdin.destroy();
    this.server.kill();
    const timer = setTimeout(() => this.server.kill('SIGKILL'), 1500);
    timer.unref();
    this.server.once('exit', () => clearTimeout(timer));
  }
}
