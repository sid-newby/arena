import type { NextAppSpec, MatchedRoute } from "./types";

interface CompiledRoute {
  pattern: string;
  regex: RegExp;
  paramNames: string[];
  /** Whether the last segment is catch-all or optional catch-all */
  catchAll: boolean;
  optionalCatchAll: boolean;
  /** Number of static segments (higher = more specific) */
  specificity: number;
}

/**
 * Compile a Next.js route pattern into a regex matcher.
 *
 * Supports:
 * - Static segments: `/about`, `/blog`
 * - Dynamic segments: `/blog/[slug]`
 * - Catch-all segments: `/docs/[...path]`
 * - Optional catch-all segments: `/settings/[[...path]]`
 */
function compileRoute(pattern: string): CompiledRoute {
  const paramNames: string[] = [];
  let catchAll = false;
  let optionalCatchAll = false;
  let specificity = 0;

  const segments = pattern === "/" ? [""] : pattern.split("/").slice(1);
  const regexParts: string[] = [];

  for (const segment of segments) {
    if (segment.startsWith("[[...") && segment.endsWith("]]")) {
      const paramName = segment.slice(5, -2);
      paramNames.push(paramName);
      optionalCatchAll = true;
      regexParts.push("(?:/(.+))?");
    } else if (segment.startsWith("[...") && segment.endsWith("]")) {
      const paramName = segment.slice(4, -1);
      paramNames.push(paramName);
      catchAll = true;
      regexParts.push("/(.+)");
    } else if (segment.startsWith("[") && segment.endsWith("]")) {
      const paramName = segment.slice(1, -1);
      paramNames.push(paramName);
      regexParts.push("/([^/]+)");
    } else {
      specificity++;
      regexParts.push(`/${escapeRegExp(segment)}`);
    }
  }

  const regexStr = pattern === "/" ? "^/$" : `^${regexParts.join("")}$`;

  return {
    pattern,
    regex: new RegExp(regexStr),
    paramNames,
    catchAll,
    optionalCatchAll,
    specificity,
  };
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match a pathname against a spec's routes.
 *
 * Routes are matched in order of specificity:
 * 1. Exact/static matches first (most specific)
 * 2. Dynamic segment matches
 * 3. Catch-all matches (least specific)
 * 4. Optional catch-all matches (fallback)
 *
 * @returns The matched route with extracted params, or null if no match.
 */
export function matchRoute(
  spec: NextAppSpec,
  pathname: string,
): MatchedRoute | null {
  const normalizedPath = pathname === "" ? "/" : pathname;

  const compiled = Object.keys(spec.routes).map(compileRoute);

  compiled.sort((a, b) => {
    if (a.optionalCatchAll !== b.optionalCatchAll) {
      return a.optionalCatchAll ? 1 : -1;
    }
    if (a.catchAll !== b.catchAll) {
      return a.catchAll ? 1 : -1;
    }
    if (a.specificity !== b.specificity) {
      return b.specificity - a.specificity;
    }
    return a.paramNames.length - b.paramNames.length;
  });

  for (const route of compiled) {
    const match = route.regex.exec(normalizedPath);
    if (!match) continue;

    const params: Record<string, string | string[]> = {};
    for (let i = 0; i < route.paramNames.length; i++) {
      const value = match[i + 1];
      const name = route.paramNames[i]!;

      if (route.catchAll || route.optionalCatchAll) {
        params[name] = value ? value.split("/") : [];
      } else {
        params[name] = value ?? "";
      }
    }

    return {
      route: spec.routes[route.pattern]!,
      pattern: route.pattern,
      params,
    };
  }

  return null;
}

/**
 * Convert a Next.js catch-all slug array to a pathname.
 *
 * @example
 * slugToPath(undefined)     // "/"
 * slugToPath([])            // "/"
 * slugToPath(["blog"])      // "/blog"
 * slugToPath(["blog","hi"]) // "/blog/hi"
 */
export function slugToPath(slug: string[] | undefined): string {
  if (!slug || slug.length === 0) return "/";
  return "/" + slug.join("/");
}

/**
 * Collect all static params from the spec for generateStaticParams.
 * Returns params suitable for Next.js [[...slug]] catch-all routes.
 */
export function collectStaticParams(spec: NextAppSpec): { slug: string[] }[] {
  const results: { slug: string[] }[] = [];

  for (const [pattern, route] of Object.entries(spec.routes)) {
    if (route.staticParams) {
      for (const paramSet of route.staticParams) {
        const slug = buildSlugFromPattern(pattern, paramSet);
        if (slug) results.push({ slug });
      }
    } else if (!pattern.includes("[")) {
      const slug = pattern === "/" ? [] : pattern.slice(1).split("/");
      results.push({ slug });
    }
  }

  return results;
}

/**
 * Build a slug array from a route pattern and a set of params.
 */
function buildSlugFromPattern(
  pattern: string,
  params: Record<string, string>,
): string[] | null {
  if (pattern === "/") return [];

  const segments = pattern.split("/").slice(1);
  const result: string[] = [];

  for (const segment of segments) {
    if (segment.startsWith("[[...") && segment.endsWith("]]")) {
      const paramName = segment.slice(5, -2);
      const value = params[paramName];
      if (value) result.push(...value.split("/"));
    } else if (segment.startsWith("[...") && segment.endsWith("]")) {
      const paramName = segment.slice(4, -1);
      const value = params[paramName];
      if (!value) return null;
      result.push(...value.split("/"));
    } else if (segment.startsWith("[") && segment.endsWith("]")) {
      const paramName = segment.slice(1, -1);
      const value = params[paramName];
      if (!value) return null;
      result.push(value);
    } else {
      result.push(segment);
    }
  }

  return result;
}
