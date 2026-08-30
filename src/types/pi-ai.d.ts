/**
 * `@earendil-works/pi-ai` is ESM-only with an exports map that the repo's
 * TypeScript `moduleResolution` cannot follow (TS2307), even though esbuild
 * resolves the dynamic import fine at build time. Declare the single symbol
 * we import so typechecking passes without weakening moduleResolution
 * globally (see the review discussion on #2353).
 */
declare module '@earendil-works/pi-ai/providers/all' {
  export function builtinModels(): unknown;
}
