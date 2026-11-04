import Stripe from "stripe";
import {
  createHttpClient,
  STRIPE_API_KEY,
} from "@stripe/ui-extension-sdk/http_client";

/**
 * Create a Stripe client for use in Stripe Apps.
 *
 * The Stripe UI Extension SDK handles authentication automatically
 * through the httpClient - no real API key is needed.
 */
export const stripe = new Stripe(STRIPE_API_KEY, {
  httpClient: createHttpClient(),
  apiVersion: "2024-12-18.acacia",
});

/**
 * Format amount for display (converts cents to dollars)
 */
export function formatAmount(amount: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

/**
 * Format date for display
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
