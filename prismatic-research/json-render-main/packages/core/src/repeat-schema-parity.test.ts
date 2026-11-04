import { describe, expect, it } from "vitest";
import type { Schema, SchemaType } from "./schema";
import { schema as imageSchema } from "../../image/src/schema";
import { schema as inkSchema } from "../../ink/src/schema";
import { schema as reactEmailSchema } from "../../react-email/src/schema";
import { schema as reactNativeSchema } from "../../react-native/src/schema";
import { schema as reactPdfSchema } from "../../react-pdf/src/schema";
import { schema as reactSchema } from "../../react/src/schema";
import { schema as solidSchema } from "../../solid/src/schema";
import { schema as svelteSchema } from "../../svelte/src/schema";
import { schema as vueSchema } from "../../vue/src/schema";

const schemas: Record<string, Schema> = {
  image: imageSchema,
  ink: inkSchema,
  react: reactSchema,
  "react-email": reactEmailSchema,
  "react-native": reactNativeSchema,
  "react-pdf": reactPdfSchema,
  solid: solidSchema,
  svelte: svelteSchema,
  vue: vueSchema,
};

describe("renderer schema repeat parity", () => {
  it.each(Object.entries(schemas))(
    "%s declares repeat as an optional element field",
    (_name, schema) => {
      const spec = schema.definition.spec as SchemaType<
        "object",
        Record<string, SchemaType>
      >;
      const elements = spec.inner?.elements as SchemaType<
        "record",
        SchemaType<"object", Record<string, SchemaType>>
      >;
      const repeat = elements.inner?.inner?.repeat;

      expect(repeat?.kind).toBe("any");
      expect(repeat?.optional).toBe(true);
    },
  );
});
