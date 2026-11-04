/**
 * Follow-up messages for a reply that is already in progress.
 *
 * Sid chose on 2026-11-04 that his words should reach a seat while it is
 * replying without cancelling the reply. A runtime that can read input
 * mid-turn iterates this inbox; the service pushes each follow-up and closes
 * the inbox when the turn ends. A push after close returns false so the
 * caller can fall back to the ordinary queue.
 */
export class TurnInbox implements AsyncIterable<string> {
  private readonly items: string[] = [];
  private waiter?: () => void;
  private closed = false;
  get isClosed() {
    return this.closed;
  }
  push(text: string): boolean {
    if (this.closed) return false;
    this.items.push(text);
    this.waiter?.();
    return true;
  }
  close() {
    this.closed = true;
    this.waiter?.();
  }
  async *[Symbol.asyncIterator](): AsyncGenerator<string> {
    for (;;) {
      if (this.items.length) {
        yield this.items.shift()!;
        continue;
      }
      if (this.closed) return;
      await new Promise<void>((resolve) => {
        this.waiter = resolve;
      });
      this.waiter = undefined;
    }
  }
}
