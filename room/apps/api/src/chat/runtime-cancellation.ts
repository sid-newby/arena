export class UnconfirmedCancellationError extends Error {
  constructor() {
    super('The provider did not acknowledge cancellation.');
    this.name = 'UnconfirmedCancellationError';
  }
}
