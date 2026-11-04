# Full Page Stripe App (Alpha)

A full-page [Stripe App](https://stripe.com/docs/stripe-apps) example using json-render. This uses the `FullPageView` component and the `stripe.dashboard.fullpage` viewport, which are part of Stripe's **private developer preview**.

## Prerequisites

- [Stripe CLI](https://stripe.com/docs/stripe-cli) with the apps plugin
- A Stripe account with **full-page apps alpha access** enabled by Stripe
- Both your `app_id` and `account_id` must be flagged in by Stripe

## Setup

```bash
pnpm install

cp .env.example .env
# Set STRIPE_APP_ID to your app ID

pnpm setup
```

## Running

Start the API server first (from `../api`):

```bash
cd ../api && pnpm dev
```

Then start the Stripe app:

```bash
stripe apps start
```

Navigate directly to your full-page app URL (it will not appear in the left navigation):

```
https://dashboard.stripe.com/test/app/<your-app-id>
```

## Troubleshooting

If you are redirected to the Dashboard home page, the feature flag is not enabled for your account. Contact your Stripe partner to have both your `app_id` and `account_id` flagged in.

## Resources

- [FullPageView Component](https://docs.stripe.com/stripe-apps/components/fullpageview?app-sdk-version=9)
- [FullPageTabs Component](https://docs.stripe.com/stripe-apps/components/fullpagetabs?app-sdk-version=9)
