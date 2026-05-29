/// <reference types="vite/client" />

declare module '*.mjs' {
  export function main(): void
  export function registerBuildEditor(): void
  export function registerBuildTerminal(): void
  export function dispatchPreviewElementSelected(element: unknown): void
  export function dispatchBuildFromPlan(planSummary: string): void
}
