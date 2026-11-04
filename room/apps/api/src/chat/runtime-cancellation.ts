export class UnconfirmedCancellationError extends Error {
  constructor() {
    super(
      'The provider did not acknowledge cancellation. Delivery is unconfirmed; review before continuing.',
    );
    this.name = 'UnconfirmedCancellationError';
  }
}
