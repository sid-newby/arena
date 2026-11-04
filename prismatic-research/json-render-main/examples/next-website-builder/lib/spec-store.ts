import type { NextAppSpec } from "@json-render/next";
import { defaultSpec } from "./default-spec";

let currentSpec: NextAppSpec = defaultSpec;

export function getSpec(): NextAppSpec {
  return currentSpec;
}

export function setSpec(spec: NextAppSpec): void {
  currentSpec = spec;
}
