import type { Spec, UIElement } from "@json-render/core";

/**
 * Visitor function for spec traversal
 */
export interface TreeVisitor {
  (
    element: UIElement,
    key: string,
    depth: number,
    parent: UIElement | null,
  ): void;
}

/**
 * Traverse a UI spec depth-first
 */
export function traverseSpec(
  spec: Spec,
  visitor: TreeVisitor,
  startKey?: string,
): void {
  if (!spec || !spec.root) return;

  const rootKey = startKey ?? spec.root;
  const rootElement = spec.elements[rootKey];
  if (!rootElement) return;

  function visit(key: string, depth: number, parent: UIElement | null): void {
    const element = spec.elements[key];
    if (!element) return;

    visitor(element, key, depth, parent);

    if (element.children) {
      for (const childKey of element.children) {
        visit(childKey, depth + 1, element);
      }
    }

    if (element.slots) {
      for (const childKeys of Object.values(element.slots)) {
        for (const childKey of childKeys) {
          visit(childKey, depth + 1, element);
        }
      }
    }
  }

  visit(rootKey, 0, null);
}

/**
 * Collect all unique component types used in a spec
 */
export function collectUsedComponents(spec: Spec): Set<string> {
  const components = new Set<string>();

  traverseSpec(spec, (element, _key) => {
    components.add(element.type);
  });

  return components;
}

/**
 * Collect all state paths referenced in a spec
 */
export function collectStatePaths(spec: Spec): Set<string> {
  const paths = new Set<string>();

  traverseSpec(spec, (element, _key) => {
    // Check props for data paths
    for (const [propName, propValue] of Object.entries(element.props)) {
      // Check for path props (e.g., statePath, dataPath, bindPath)
      if (typeof propValue === "string") {
        if (
          propName.endsWith("Path") ||
          propName === "bindPath" ||
          propName === "statePath"
        ) {
          paths.add(propValue);
        }
      }

      // Check for dynamic value objects with $state
      if (
        propValue &&
        typeof propValue === "object" &&
        "$state" in propValue &&
        typeof (propValue as { $state: unknown }).$state === "string"
      ) {
        paths.add((propValue as { $state: string }).$state);
      }
    }

    // Check visibility conditions for $state paths
    if (element.visible != null && typeof element.visible !== "boolean") {
      collectPathsFromCondition(element.visible, paths);
    }
  });

  return paths;
}

function collectPathFromItem(
  item: Record<string, unknown>,
  paths: Set<string>,
): void {
  if (typeof item.$state === "string") {
    paths.add(item.$state);
  }
  // Also collect $state references in comparison values (eq, neq, etc.)
  for (const op of ["eq", "neq", "gt", "gte", "lt", "lte"]) {
    const val = item[op];
    if (
      val &&
      typeof val === "object" &&
      "$state" in (val as Record<string, unknown>) &&
      typeof (val as Record<string, unknown>).$state === "string"
    ) {
      paths.add((val as { $state: string }).$state);
    }
  }
}

function collectPathsFromCondition(
  condition: unknown,
  paths: Set<string>,
): void {
  if (!condition || typeof condition !== "object") return;

  // Array = implicit AND
  if (Array.isArray(condition)) {
    for (const item of condition) {
      if (item && typeof item === "object") {
        collectPathFromItem(item as Record<string, unknown>, paths);
      }
    }
    return;
  }

  const cond = condition as Record<string, unknown>;

  // $or: recurse into each child condition
  if ("$or" in cond && Array.isArray(cond.$or)) {
    for (const child of cond.$or) {
      collectPathsFromCondition(child, paths);
    }
    return;
  }

  // Single StateCondition
  collectPathFromItem(cond, paths);
}

/**
 * Collect all action names used in a spec
 */
export function collectActions(spec: Spec): Set<string> {
  const actions = new Set<string>();

  traverseSpec(spec, (element, _key) => {
    for (const propValue of Object.values(element.props)) {
      // Check for action prop (string action name)
      if (typeof propValue === "string" && propValue.startsWith("action:")) {
        actions.add(propValue.slice(7));
      }

      // Check for action objects
      if (
        propValue &&
        typeof propValue === "object" &&
        "name" in propValue &&
        typeof (propValue as { name: unknown }).name === "string"
      ) {
        actions.add((propValue as { name: string }).name);
      }
    }

    // Also check direct action prop
    const actionProp = element.props.action;
    if (typeof actionProp === "string") {
      actions.add(actionProp);
    }

    // Collect actions from on event bindings
    const onBindings = element.on;
    if (onBindings) {
      for (const binding of Object.values(onBindings)) {
        const bindings = Array.isArray(binding) ? binding : [binding];
        for (const b of bindings) {
          if (
            b &&
            typeof b === "object" &&
            "action" in b &&
            typeof (b as { action: unknown }).action === "string"
          ) {
            actions.add((b as { action: string }).action);
          }
        }
      }
    }
  });

  return actions;
}
