import type { NextMetadata, NextAppSpec, NextRouteSpec } from "./types";

/**
 * Metadata result compatible with Next.js's Metadata type.
 * Uses plain objects to avoid importing Next.js types at runtime.
 */
export type ResolvedMetadata = Record<string, unknown>;

/**
 * Resolve metadata for a route by merging global spec metadata
 * with route-specific metadata.
 *
 * Follows Next.js metadata merging semantics:
 * - Route metadata overrides global metadata for scalar fields
 * - Title templates from global metadata apply to route titles
 * - OpenGraph and Twitter fields are shallow-merged
 */
export function resolveMetadata(
  spec: NextAppSpec,
  route?: NextRouteSpec | null,
): ResolvedMetadata {
  const globalMeta = spec.metadata;
  const routeMeta = route?.metadata;

  if (!globalMeta && !routeMeta) return {};

  const result: ResolvedMetadata = {};

  const mergedTitle = resolveTitle(globalMeta?.title, routeMeta?.title);
  if (mergedTitle !== undefined) result.title = mergedTitle;

  const description = routeMeta?.description ?? globalMeta?.description;
  if (description) result.description = description;

  const keywords = routeMeta?.keywords ?? globalMeta?.keywords;
  if (keywords) result.keywords = keywords;

  const openGraph = mergeObject(globalMeta?.openGraph, routeMeta?.openGraph);
  if (openGraph) result.openGraph = openGraph;

  const twitter = mergeObject(globalMeta?.twitter, routeMeta?.twitter);
  if (twitter) result.twitter = twitter;

  const robots = routeMeta?.robots ?? globalMeta?.robots;
  if (robots) result.robots = robots;

  const alternates = routeMeta?.alternates ?? globalMeta?.alternates;
  if (alternates) result.alternates = alternates;

  const icons = routeMeta?.icons ?? globalMeta?.icons;
  if (icons) result.icons = icons;

  return result;
}

/**
 * Resolve a title value considering templates.
 *
 * If global metadata defines a title template (e.g. "%s | My App"),
 * route titles are interpolated into it.
 */
function resolveTitle(
  globalTitle: NextMetadata["title"],
  routeTitle: NextMetadata["title"],
): unknown {
  if (!routeTitle && !globalTitle) return undefined;

  if (!routeTitle) {
    if (typeof globalTitle === "string") return globalTitle;
    if (typeof globalTitle === "object" && globalTitle !== null) {
      return globalTitle.default ?? undefined;
    }
    return undefined;
  }

  if (typeof routeTitle === "object" && routeTitle !== null) {
    if (routeTitle.absolute) return routeTitle.absolute;
    if (routeTitle.template || routeTitle.default) return routeTitle;
    return routeTitle;
  }

  if (
    typeof globalTitle === "object" &&
    globalTitle !== null &&
    globalTitle.template
  ) {
    return globalTitle.template.replace("%s", routeTitle as string);
  }

  return routeTitle;
}

function mergeObject(
  base: Record<string, unknown> | undefined,
  override: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!base && !override) return undefined;
  if (!base) return override;
  if (!override) return base;
  return { ...base, ...override };
}
