# Stripe App (Drawer)

A [Stripe App](https://stripe.com/docs/stripe-apps) example demonstrating how to use json-render to build dynamic, AI-generated UI in the Stripe Dashboard drawer.

## Views

- **Home** - Revenue dashboard with AI-powered UI generation
- **Customers** - Customer list and management
- **Customer Details** - Individual customer view
- **Payments** - Payment list and details
- **Subscriptions** - Subscription management
- **Invoices** - Invoice list
- **Products** - Product catalog

## Setup

```bash
pnpm install

cp .env.example .env
# Optionally set STRIPE_APP_ID to your own app ID

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

## How It Works

1. **Component Catalog** - Maps json-render component types to Stripe UIXT components
2. **Action Handlers** - Stripe operations (refunds, subscriptions, etc.)
3. **StripeRenderer** - Custom renderer connecting json-render specs to Stripe components
4. **Views** - Each view fetches data from the Stripe API and renders it using json-render specs
