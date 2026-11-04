/**
 * Words Sid sends while a seat is already replying. A runtime that can read
 * input mid-turn consumes them as `priority: 'next'` user messages, so they
 * join the reply in progress at the next tool boundary instead of cancelling
 * it. Shape matches `TurnContext.inbox` in chat.types.ts.
 */
export class FollowUps implements AsyncIterable<string> {
  private readonly queue: string[] = [];
  private waiter?: () => void;
  private closed = false;
  get isClosed() {
    return this.closed;
  }
  push(text: string): boolean {
    if (this.closed) return false;
    this.queue.push(text);
    this.waiter?.();
    return true;
  }
  close() {
    this.closed = true;
    this.waiter?.();
  }
  async *[Symbol.asyncIterator](): AsyncIterator<string> {
    for (;;) {
      if (this.queue.length) {
        yield this.queue.shift()!;
        continue;
      }
      if (this.closed) return;
      await new Promise<void>((resolve) => {
        this.waiter = () => {
          this.waiter = undefined;
          resolve();
        };
      });
    }
  }
}
