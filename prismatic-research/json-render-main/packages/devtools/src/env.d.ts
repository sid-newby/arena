// Minimal process.env typing for dev-only warnings / prod guard.
// Uses a namespaced interface so it merges cleanly with @types/node if present.
declare namespace NodeJS {
  interface ProcessEnv {
    readonly NODE_ENV?: string;
  }
}

declare const process: { readonly env: NodeJS.ProcessEnv };
