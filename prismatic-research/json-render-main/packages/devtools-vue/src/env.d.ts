declare namespace NodeJS {
  interface ProcessEnv {
    readonly NODE_ENV?: string;
  }
}

declare const process: { readonly env: NodeJS.ProcessEnv };
