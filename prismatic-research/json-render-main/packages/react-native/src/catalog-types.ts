import type { ReactNode } from "react";
import type {
  Catalog,
  InferCatalogComponents,
  InferCatalogActions,
  InferComponentProps,
  InferActionParams,
  StateModel,
} from "@json-render/core";

export type { StateModel };

// =============================================================================
// State Types
// =============================================================================

/**
 * State setter function for updating application state
 */
export type SetState = (
  updater: (prev: Record<string, unknown>) => Record<string, unknown>,
) => void;

// =============================================================================
// Component Types
// =============================================================================

/**
 * Context passed to component render functions
 * @example
 * const Button: ComponentFn<typeof catalog, 'Button'> = (ctx) => {
 *   return <Pressable onPress={() => ctx.emit("press")}><Text>{ctx.props.label}</Text></Pressable>
 * }
 */
export interface ComponentContext<
  C extends Catalog,
  K extends keyof InferCatalogComponents<C>,
> {
  props: InferComponentProps<C, K>;
  children?: ReactNode;
  /** Emit a named event. The renderer resolves the event to an action binding from the element's `on` field. */
  emit: (event: string) => void;
  /**
   * Two-way binding paths resolved from `$bindState` / `$bindItem` expressions.
   * Maps prop name → absolute state path for write-back.
   */
  bindings?: Record<string, string>;
  loading?: boolean;
}

/**
 * Component render function type for React Native
 * @example
 * const Button: ComponentFn<typeof catalog, 'Button'> = ({ props, emit }) => (
 *   <Pressable onPress={() => emit("press")}><Text>{props.label}</Text></Pressable>
 * );
 */
export type ComponentFn<
  C extends Catalog,
  K extends keyof InferCatalogComponents<C>,
> = (ctx: ComponentContext<C, K>) => ReactNode;

/**
 * Registry of all component render functions for a catalog
 * @example
 * const components: Components<typeof myCatalog> = {
 *   Button: ({ props }) => <Pressable><Text>{props.label}</Text></Pressable>,
 *   Input: ({ props }) => <TextInput placeholder={props.placeholder} />,
 * };
 */
export type Components<C extends Catalog> = {
  [K in keyof InferCatalogComponents<C>]: ComponentFn<C, K>;
};

// =============================================================================
// Action Types
// =============================================================================

/**
 * Action handler function type
 * @example
 * const viewCustomers: ActionFn<typeof catalog, 'viewCustomers'> = async (params, setState) => {
 *   const data = await fetch('/api/customers');
 *   setState(prev => ({ ...prev, customers: data }));
 * };
 */
export type ActionFn<
  C extends Catalog,
  K extends keyof InferCatalogActions<C>,
> = (
  params: InferActionParams<C, K> | undefined,
  setState: SetState,
  state: StateModel,
) => Promise<void>;

/**
 * Registry of all action handlers for a catalog
 * @example
 * const actions: Actions<typeof myCatalog> = {
 *   viewCustomers: async (params, setState) => { ... },
 *   createCustomer: async (params, setState) => { ... },
 * };
 */
export type Actions<C extends Catalog> = {
  [K in keyof InferCatalogActions<C>]: ActionFn<C, K>;
};
