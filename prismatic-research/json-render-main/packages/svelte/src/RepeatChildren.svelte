<script lang="ts">
  import type { Spec, UIElement } from "@json-render/core";
  import {
    getByPath,
    resolveRepeatItemStatePath,
    resolveRepeatStatePath,
  } from "@json-render/core";
  import type { ComponentRegistry, ComponentRenderer } from "./renderer.js";
  import { getStateContext } from "./contexts/StateProvider.svelte";
  import RepeatScopeProvider, {
    getRepeatScope,
  } from "./contexts/RepeatScopeProvider.svelte";
  import ElementRenderer from "./ElementRenderer.svelte";

  interface Props {
    element: UIElement;
    spec: Spec;
    registry: ComponentRegistry;
    loading?: boolean;
    fallback?: ComponentRenderer;
  }

  let { element, spec, registry, loading = false, fallback }: Props = $props();

  const stateCtx = getStateContext();
  const parentScope = getRepeatScope();

  let statePath = $derived.by(() => {
    const resolved = resolveRepeatStatePath(
      element.repeat!.statePath,
      parentScope?.basePath,
    );
    if (resolved === undefined) {
      console.warn(
        "[json-render/svelte] $item in repeat.statePath used outside of a repeat scope",
      );
    }
    return resolved;
  });

  let items = $derived(
    statePath === undefined
      ? []
      : ((getByPath(stateCtx.state, statePath) as unknown[] | undefined) ?? []),
  );
</script>

{#each items as itemValue, index (element.repeat?.key && typeof itemValue === "object" && itemValue !== null ? String((itemValue as any)[element.repeat.key] ?? index) : String(index))}
  {@const basePath = resolveRepeatItemStatePath(statePath!, index)}

  {#if element.children}
    <RepeatScopeProvider item={itemValue} {index} {basePath}>
      {#each element.children as childKey (childKey)}
        {#if spec.elements[childKey]}
          <ElementRenderer
            element={spec.elements[childKey]}
            elementKey={childKey}
            {spec}
            {registry}
            {loading}
            {fallback} />
        {:else if !loading}
          {console.warn(
            `[json-render] Missing element "${childKey}" referenced as child of "${element.type}". This element will not render.`,
          )}
        {/if}
      {/each}
    </RepeatScopeProvider>
  {/if}
{/each}
