import React from "react";
import type { Spec } from "@json-render/core";

/**
 * Props for NextLoading.
 */
export interface NextLoadingProps {
  /** Optional loading UI spec */
  loadingSpec?: Spec | null;
}

/**
 * Loading component for json-render Next.js apps.
 *
 * If a loading spec is provided, it will be rendered by the PageRenderer.
 * Otherwise renders a minimal default loading indicator.
 *
 * Note: Since Next.js loading.tsx is static (no params), this renders
 * a generic loading state. Route-specific loading can be achieved with
 * Suspense boundaries in page content.
 */
export function NextLoading({ loadingSpec: _loadingSpec }: NextLoadingProps) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "200px",
      }}
    >
      <div
        style={{
          width: "2rem",
          height: "2rem",
          border: "2px solid #e5e7eb",
          borderTopColor: "#3b82f6",
          borderRadius: "50%",
          animation: "jr-spin 0.6s linear infinite",
        }}
      />
      <style>{`@keyframes jr-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
