"use client";

import React, { type ReactNode } from "react";
import NextLink from "next/link";
import type { ComponentRenderProps } from "@json-render/react";

/**
 * Props expected by the Link component in json-render specs.
 */
export interface LinkProps {
  /** The target URL or route path */
  href: string;
  /** Whether to replace the current history entry */
  replace?: boolean;
  /** Whether to prefetch the linked route */
  prefetch?: boolean;
  /** CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

/**
 * Built-in Link component for json-render Next.js specs.
 *
 * Wraps `next/link` for client-side navigation between routes.
 *
 * Usage in a spec:
 * ```json
 * {
 *   "type": "Link",
 *   "props": { "href": "/about" },
 *   "children": ["link-text"]
 * }
 * ```
 */
export function Link({ element, children }: ComponentRenderProps<LinkProps>) {
  const { href, replace, prefetch, className, style } =
    element.props as LinkProps;

  return (
    <NextLink
      href={href}
      replace={replace}
      prefetch={prefetch}
      className={className}
      style={style}
    >
      {children}
    </NextLink>
  );
}
