/**
 * Shared utility for extracting catalog data for display in the UI.
 * Used by both the demo and playground components.
 */

export interface CatalogField {
  name: string;
  type: string;
}

export interface CatalogComponentInfo {
  name: string;
  description: string;
  props: CatalogField[];
  slots: string[];
  events: string[];
}

export interface CatalogActionInfo {
  name: string;
  description: string;
  params: CatalogField[];
}

export interface CatalogDisplayData {
  components: CatalogComponentInfo[];
  actions: CatalogActionInfo[];
}

/**
 * Extract field names and types from a Zod schema object.
 * Supports both Zod v3 and v4 shape formats.
 */
export function extractFields(zodObj: unknown): CatalogField[] {
  if (!zodObj) return [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = zodObj as any;
    // Zod v4: shape is a plain object; Zod v3: shape is via _def.shape()
    const shape =
      typeof obj.shape === "object"
        ? obj.shape
        : typeof obj._def?.shape === "function"
          ? obj._def.shape()
          : typeof obj._def?.shape === "object"
            ? obj._def.shape
            : null;
    if (!shape) return [];

    return Object.entries(shape).map(([name, schema]) => {
      let type = "unknown";
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = schema as any;
        const typeName: string = s?._zod?.def?.type ?? s?._def?.typeName ?? "";
        if (typeName.includes("string")) type = "string";
        else if (typeName.includes("number")) type = "number";
        else if (typeName.includes("boolean")) type = "boolean";
        else if (typeName.includes("array")) type = "array";
        else if (typeName.includes("enum")) {
          const values = s?._zod?.def?.values ?? s?._def?.values;
          type = Array.isArray(values) ? values.join(" | ") : "enum";
        } else if (typeName.includes("union")) type = "union";
        else if (typeName.includes("nullable")) {
          const inner = s?._zod?.def?.innerType ?? s?._def?.innerType;
          const innerName: string =
            inner?._zod?.def?.type ?? inner?._def?.typeName ?? "";
          if (innerName.includes("string")) type = "string?";
          else if (innerName.includes("number")) type = "number?";
          else if (innerName.includes("boolean")) type = "boolean?";
          else if (innerName.includes("array")) type = "array?";
          else if (innerName.includes("enum")) {
            const values = inner?._zod?.def?.values ?? inner?._def?.values;
            type = Array.isArray(values) ? `(${values.join(" | ")})?` : "enum?";
          } else type = "optional";
        }
      } catch {
        // ignore
      }
      return { name, type };
    });
  } catch {
    return [];
  }
}

/**
 * Extract display data from a catalog's raw data.
 * Parses component definitions and action definitions into a
 * structured format suitable for rendering in the UI.
 */
export function buildCatalogDisplayData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawCatalogData: any,
): CatalogDisplayData {
  const components = Object.entries(rawCatalogData.components ?? {})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map(([name, def]: [string, any]) => ({
      name,
      description: (def.description as string) ?? "",
      props: extractFields(def.props),
      slots: (def.slots as string[]) ?? [],
      events: (def.events as string[]) ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const actions = Object.entries(rawCatalogData.actions ?? {})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map(([name, def]: [string, any]) => ({
      name,
      description: (def.description as string) ?? "",
      params: extractFields(def.params),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { components, actions };
}
