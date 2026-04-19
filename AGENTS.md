# Agent Instructions for vscode-markdown-preview-enhanced

This file provides context for AI coding agents (GitHub Copilot, Claude, etc.) working in this repository.

## Project Overview

This is the **VS Code extension** for Markdown Preview Enhanced. It wraps the [crossnote](https://github.com/shd101wyy/crossnote) markdown rendering library and exposes it as a VS Code webview preview, custom editor, and notebook support.

## Architecture

- **`src/extension.ts`** — Extension entry point (Node.js / desktop VS Code)
- **`src/extension-web.ts`** — Web extension entry point (VS Code for the Web / vscode.dev)
- **`src/extension-common.ts`** — Shared activation logic used by both entry points
- **`src/preview-provider.ts`** — Webview panel provider for the live markdown preview
- **`src/notebooks-manager.ts`** — Manages per-workspace notebook instances
- **`src/config.ts`** — Reads and writes VS Code settings, bridges to crossnote's `NotebookConfig`
- **`src/backlinks-provider.ts`** — Provides backlink references in the editor
- **`build.js`** — esbuild config: bundles `extension.ts` → `out/native/extension.js` and `extension-web.ts` → `out/web/extension.js`
- **`gulpfile.js`** — Copies crossnote's `out/styles`, `out/webview`, and `out/dependencies` into `crossnote/` for packaging

## Key Conventions

### Code Style

- **Single quotes** everywhere (Prettier-enforced)
- **TypeScript**: `strict: true` — no implicit `any`
- Package manager: **yarn** (not npm or pnpm)

### Build & Lint

- Build: `yarn build`
- Lint: `yarn check:all` (ESLint + Prettier + tsc)
- Fix: `yarn fix:all`
- Watch mode (for extension dev): `yarn watch`

### Working with Local crossnote

The extension depends on `crossnote` as a local path dependency. When making changes to crossnote:

1. In `~/Workspace/crossnote`: run `pnpm build`
2. In this repo: run `yarn add ../crossnote` to update `node_modules/crossnote` with the new build
3. Then run `yarn build` to rebundle the extension

> **Note**: `yarn install` copies the local package rather than symlinking, so you must re-run `yarn add ../crossnote` after any crossnote build to pick up changes.

## Extension Bundling Notes

The native extension (`out/native/extension.js`) is bundled by esbuild with `platform: 'node'`. Some packages require special handling:

- **`node-tikzjax`**: WASM data files (`tex.wasm.gz`, `core.dump.gz`, `tex_files.tar.gz`) are copied to `out/tex/` by `build.js` at build time, because `node-tikzjax` uses `__dirname`-relative paths to locate them.
- **`markdown_yo`**: `markdown_yo_wasm_api.wasm` is copied to `out/native/` by `build.js` because the Emscripten module resolves it relative to `__dirname` at runtime.
- **`jsdom`** (used by node-tikzjax): `xhr-sync-worker.js` is copied to `out/native/` because `jsdom` calls `require.resolve('./xhr-sync-worker.js')` at load time.
- **`vscode`**: always marked as external (provided by the VS Code runtime).

## Testing

- Run tests: `yarn test`
- For manual testing, press **F5** in VS Code to launch the Extension Development Host.
- After making changes to `build.js` or `src/`, run `yarn build` then reload the Extension Development Host (`Developer: Reload Window`).

## Adding New Settings

1. Add the setting to `package.json` under `contributes.configuration`
2. Add it to the `NotebookConfig` interface in crossnote if it's a rendering option
3. Wire it up in `src/config.ts` where VS Code settings are mapped to crossnote config
4. Document it in the CHANGELOG under `[Unreleased]`
