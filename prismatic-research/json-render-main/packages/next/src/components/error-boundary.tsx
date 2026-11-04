"use client";

import React from "react";
import type { Spec } from "@json-render/core";
import { Renderer, type ComponentRegistry } from "@json-render/react";
import { useNextApp } from "./provider";

/**
 * Props for NextErrorBoundary.
 */
export interface NextErrorBoundaryProps {
  /** The error that occurred */
  error: Error & { digest?: string };
  /** Function to attempt re-rendering the page */
  reset: () => void;
  /** Optional error UI spec from the matched route */
  errorSpec?: Spec | null;
}

/**
 * Error boundary component for json-render Next.js apps.
 *
 * If the matched route defines an `error` spec, it renders that.
 * Otherwise renders a minimal default error UI.
 *
 * Must be used in a file with `"use client"` directive (Next.js requirement).
 */
export function NextErrorBoundary({
  error,
  reset,
  errorSpec,
}: NextErrorBoundaryProps) {
  let registry: ComponentRegistry | undefined;
  try {
    const ctx = useNextApp();
    registry = ctx.registry;
  } catch {
    // Provider may not be available in error boundaries
  }

  if (errorSpec && registry) {
    const augmentedRegistry: ComponentRegistry = {
      ...registry,
      Slot: () => null,
    };
    return <Renderer spec={errorSpec} registry={augmentedRegistry} />;
  }

  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <h2 style={{ marginBottom: "1rem" }}>Something went wrong</h2>
      <p style={{ color: "#666", marginBottom: "1.5rem" }}>
        {error.message || "An unexpected error occurred."}
      </p>
      <button
        onClick={reset}
        style={{
          padding: "0.5rem 1rem",
          borderRadius: "0.375rem",
          border: "1px solid #ccc",
          background: "#fff",
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </div>
  );
}
