# crossnote 0.9.42: wait for Mermaid before Chrome export

`crossnote@0.9.42.patch` is applied by pnpm on installation and bundled into the
extension. Keep it until a crossnote release includes the equivalent fix; remove
the patch and its `pnpm.patchedDependencies` entry when upgrading to that release.

The upstream implementation lives in `src/markdown-engine/index.ts`, in
`generateHTMLTemplateForExport()` and `chromeExport()`. The published package only
ships compiled JavaScript, so this patch updates its CJS, ESM, and CLI bundles.
The CLI portion of the patch contains the unminified export implementation.

The generated Mermaid module reports pending, complete, or error status on
`window.__crossnoteMermaidExport`. Completion is set only after `await mermaid.run()`
resolves, including presentation exports. ZenUML registration uses a dynamic
import so its failures reach the same error handler. Neither a `data-processed`
attribute nor an inserted SVG proves that Mermaid has finished laying out a graph.

After navigation, Chrome export waits for completion or error, with a 30-second
limit. Documents without Mermaid proceed immediately. Rendering errors abort
export instead of producing a broken PDF/image. The browser closes in `finally`,
including navigation, rendering, and capture failures. Existing front-matter and
`puppeteerWaitForTimeout` delays still apply after readiness.

`test/chrome-export-mermaid.test.js` runs the real CJS and ESM export methods and
their generated scripts with a controllable asynchronous renderer. It covers PDF,
PNG, errors, timeouts, and documents without Mermaid, without requiring Chrome in
the unit-test environment.
