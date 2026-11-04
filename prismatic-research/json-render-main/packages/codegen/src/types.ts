import type { Spec } from "@json-render/core";

/**
 * Represents a generated file
 */
export interface GeneratedFile {
  /** File path relative to project root */
  path: string;
  /** File contents */
  content: string;
}

/**
 * Interface for code generators
 */
export interface CodeGenerator {
  /** Generate files from a UI spec */
  generate(spec: Spec): GeneratedFile[];
}
