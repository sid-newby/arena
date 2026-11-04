import { notFound } from "next/navigation";
import type {
  NextAppSpec,
  CreateNextAppOptions,
  NextAppExports,
  PageData,
} from "./types";
import { matchRoute, slugToPath, collectStaticParams } from "./router";
import { resolveMetadata, type ResolvedMetadata } from "./metadata";

/**
 * Resolve the spec from the options — supports both static specs
 * and factory functions that return specs (sync or async).
 */
async function resolveSpec(
  specOrFn: NextAppSpec | (() => NextAppSpec | Promise<NextAppSpec>),
): Promise<NextAppSpec> {
  if (typeof specOrFn === "function") {
    return await specOrFn();
  }
  return specOrFn;
}

/**
 * Merge state from multiple sources: global state, page state, and loader data.
 * Later sources override earlier ones.
 */
function mergeState(
  ...sources: (Record<string, unknown> | undefined | null)[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const source of sources) {
    if (source) {
      Object.assign(result, source);
    }
  }
  return result;
}

/**
 * Create a fully wired Next.js application from a json-render spec.
 *
 * Returns `getPageData`, `generateMetadata`, and `generateStaticParams`
 * ready to be used in Next.js `[[...slug]]` catch-all routes.
 *
 * @example
 * ```typescript
 * // lib/app.ts
 * import { createNextApp } from "@json-render/next/server";
 *
 * export const { getPageData, generateMetadata, generateStaticParams } =
 *   createNextApp({ spec });
 *
 * // app/[[...slug]]/page.tsx (Server Component)
 * import { notFound } from "next/navigation";
 * import { getPageData, generateMetadata, generateStaticParams } from "@/lib/app";
 * import { SiteRenderer } from "./renderer";
 *
 * export { generateMetadata, generateStaticParams };
 *
 * export default async function Page({ params }) {
 *   const data = await getPageData({ params });
 *   if (!data) notFound();
 *   return <SiteRenderer {...data} />;
 * }
 *
 * // app/[[...slug]]/renderer.tsx ("use client")
 * import { PageRenderer } from "@json-render/next";
 * export function SiteRenderer(props) {
 *   return <PageRenderer {...props} />;
 * }
 * ```
 */
export function createNextApp(options: CreateNextAppOptions): NextAppExports {
  const { spec: specOrFn, loaders } = options;

  /**
   * Resolve page data for a given set of route params.
   * Returns null when no route matches.
   */
  async function getPageData({
    params,
  }: {
    params: Promise<{ slug?: string[] }>;
  }): Promise<PageData | null> {
    const { slug } = await params;
    const pathname = slugToPath(slug);
    const spec = await resolveSpec(specOrFn);

    const matched = matchRoute(spec, pathname);

    if (!matched) {
      return null;
    }

    const { route } = matched;

    let loaderData: Record<string, unknown> | undefined;
    if (route.loader && loaders?.[route.loader]) {
      loaderData = await loaders[route.loader]!(matched.params);
    }

    const initialState = mergeState(
      spec.state,
      route.page.state as Record<string, unknown> | undefined,
      loaderData,
    );

    const layoutSpec =
      route.layout && spec.layouts
        ? (spec.layouts[route.layout] ?? null)
        : null;

    return {
      spec: route.page,
      initialState:
        Object.keys(initialState).length > 0 ? initialState : undefined,
      layoutSpec,
    };
  }

  /**
   * Generate metadata for the matched route.
   * Merges global spec metadata with route-specific metadata.
   */
  async function generateMetadata({
    params,
  }: {
    params: Promise<{ slug?: string[] }>;
  }): Promise<ResolvedMetadata> {
    const { slug } = await params;
    const pathname = slugToPath(slug);
    const spec = await resolveSpec(specOrFn);
    const matched = matchRoute(spec, pathname);
    return resolveMetadata(spec, matched?.route ?? null);
  }

  /**
   * Generate static params for all statically-known routes.
   * Used by Next.js to pre-render pages at build time.
   */
  async function generateStaticParams(): Promise<{ slug: string[] }[]> {
    const spec = await resolveSpec(specOrFn);
    return collectStaticParams(spec);
  }

  return { getPageData, generateMetadata, generateStaticParams };
}
