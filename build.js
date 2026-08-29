const { execSync } = require('child_process');
const { cpSync, existsSync, mkdirSync, readdirSync } = require('fs');
const { join } = require('path');
const { context, build } = require('esbuild');
const { polyfillNode } = require('esbuild-plugin-polyfill-node');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',

  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');

      // Run `gulp copy:files` before build
      execSync('gulp copy-files');
      console.log('[watch] gulp copy-files');
    });
    build.onEnd((result) => {
      if (result.errors.length) {
        result.errors.forEach((error) =>
          console.error(
            `> ${error.location?.file}:${error.location?.line}:${error.location?.column}: error: ${error.text}`,
          ),
        );
      } else {
        copyTikzjaxTexFiles();
        copyXhrSyncWorker();
        copyMarkdownYoWasm();
        console.log('[watch] build finished');
      }
    });
  },
};

/**
 * esbuild plugin to mark jsdom's xhr-sync-worker.js as external.
 * jsdom uses require.resolve('./xhr-sync-worker.js') to locate the sync XHR
 * worker. We copy the file to out/native/ so it resolves correctly at runtime
 * via __dirname. Without this plugin, esbuild warns about the require.resolve
 * call and may inline the wrong absolute path from node_modules.
 */
const xhrSyncWorkerExternalPlugin = {
  name: 'xhr-sync-worker-external',
  /** @param {import('esbuild').PluginBuild} build */
  setup(build) {
    build.onResolve({ filter: /xhr-sync-worker/ }, (args) => ({
      path: args.path,
      external: true,
    }));
  },
};

/**
 * @type {import('esbuild').BuildOptions}
 */
const nativeConfig = {
  entryPoints: ['./src/extension.ts'],
  bundle: true,
  minify: true,
  platform: 'node', // For CJS
  outfile: './out/native/extension.js',
  target: 'node16',
  format: 'cjs',
  external: ['vscode'],
  plugins: [xhrSyncWorkerExternalPlugin],
};

// FIX:
const defaultDocument = {
  readyState: 'ready',
};
const defaultWindow = {
  document: {
    currentScript: {
      dataset: {},
    },
  },
  location: {
    protocol: 'https:',
  },
  less: {
    onReady: false,
    async: false,
  },
};

/**
 * @type {import('esbuild').BuildOptions}
 */
const webConfig = {
  entryPoints: ['./src/extension-web.ts'],
  bundle: true,
  minify: true,
  platform: 'browser', // For ESM
  outfile: './out/web/extension.js',
  target: 'es2020',
  format: 'cjs',
  // node-tikzjax and Node.js built-ins used in server-side code paths are not
  // available/needed in the web extension build.
  external: ['vscode', 'node-tikzjax', 'stream/promises', 'stream'],
  plugins: [
    polyfillNode({
      polyfills: {
        fs: true,
      },
      globals: {
        // global: true,
      },
    }),
  ],
  define: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    // window: 'globalThis',
    // global: 'globalThis',
    // window: "globalThis",
    'window': JSON.stringify(defaultWindow),
    // document: JSON.stringify(defaultDocument),
    'process.env.IS_VSCODE_WEB_EXTENSION': '"true"',
  },
};

/**
 * Locate a file/directory inside a dependency package across the different
 * node_modules layouts produced by the supported package managers:
 * - hoisted at top-level node_modules (npm / yarn classic)
 * - nested under crossnote/node_modules (resolves through pnpm's symlink for
 *   crossnote's dependencies, or yarn's nested install for `pnpm add ../crossnote`)
 * - pnpm's virtual store: node_modules/.pnpm/<name>@<version>/node_modules/<name>
 *
 * @param {string} packageName
 * @param {(pkgDir: string) => string} resolveWithinPackage
 * @returns {{ found: string | undefined, tried: string[] }}
 */
function findInPackage(packageName, resolveWithinPackage) {
  const tried = [];
  const bases = [
    join(__dirname, 'node_modules'),
    join(__dirname, 'node_modules', 'crossnote', 'node_modules'),
  ];
  for (const base of bases) {
    const candidate = resolveWithinPackage(join(base, packageName));
    tried.push(candidate);
    if (existsSync(candidate)) {
      return { found: candidate, tried };
    }
  }

  const pnpmStores = [
    join(__dirname, 'node_modules', '.pnpm'),
    join(__dirname, 'node_modules', 'crossnote', 'node_modules', '.pnpm'),
  ];
  for (const pnpmStore of pnpmStores) {
    if (!existsSync(pnpmStore)) {
      continue;
    }
    const packageDirs = readdirSync(pnpmStore).filter((d) =>
      d.startsWith(`${packageName}@`),
    );
    for (const d of packageDirs) {
      const candidate = resolveWithinPackage(
        join(pnpmStore, d, 'node_modules', packageName),
      );
      tried.push(candidate);
      if (existsSync(candidate)) {
        return { found: candidate, tried };
      }
    }
  }
  return { found: undefined, tried };
}

/**
 * Copy node-tikzjax WASM/tex data files to out/tex/ so the bundled native
 * extension (at out/native/extension.js) can find them via
 * path.join(__dirname, '../tex') at runtime.
 */
function copyTikzjaxTexFiles() {
  const { found: tikzjaxTexDir, tried } = findInPackage(
    'node-tikzjax',
    (pkgDir) => join(pkgDir, 'tex'),
  );
  if (!tikzjaxTexDir) {
    throw new Error(
      `node-tikzjax tex directory not found. Tried:\n${tried.join('\n')}`,
    );
  }
  const outTexDir = join(__dirname, 'out', 'tex');
  mkdirSync(outTexDir, { recursive: true });
  cpSync(tikzjaxTexDir, outTexDir, { recursive: true });
  console.log('Copied node-tikzjax tex files to out/tex/');
}

/**
 * Copy jsdom's xhr-sync-worker.js to out/native/ so that the bundled
 * extension's require.resolve('./xhr-sync-worker.js') call succeeds.
 *
 * jsdom resolves this path at module load time to set up sync XHR support.
 * node-tikzjax only uses jsdom for DOM manipulation and never triggers sync
 * XHR, so the worker is never actually spawned — we just need the file to
 * exist at the resolved path.
 */
function copyXhrSyncWorker() {
  const { found: workerSrc, tried } = findInPackage('jsdom', (pkgDir) =>
    join(pkgDir, 'lib', 'jsdom', 'living', 'xhr', 'xhr-sync-worker.js'),
  );

  if (!workerSrc) {
    console.warn(
      `Could not find jsdom xhr-sync-worker.js, skipping copy. Tried:\n${tried.join('\n')}`,
    );
    return;
  }
  const outNativeDir = join(__dirname, 'out', 'native');
  mkdirSync(outNativeDir, { recursive: true });
  cpSync(workerSrc, join(outNativeDir, 'xhr-sync-worker.js'));
  console.log('Copied jsdom xhr-sync-worker.js to out/native/');
}

function copyMarkdownYoWasm() {
  const { found: wasmSrc, tried } = findInPackage('markdown_yo', (pkgDir) =>
    join(pkgDir, 'markdown_yo_wasm_api.wasm'),
  );

  if (!wasmSrc) {
    console.warn(
      `Could not find markdown_yo WASM, skipping copy. Tried:\n${tried.join('\n')}`,
    );
    return;
  }
  const outNativeDir = join(__dirname, 'out', 'native');
  mkdirSync(outNativeDir, { recursive: true });
  cpSync(wasmSrc, join(outNativeDir, 'markdown_yo_wasm_api.wasm'));
  console.log('Copied markdown_yo WASM to out/native/');
}

async function main() {
  try {
    // Watch mode
    if (process.argv.includes('--watch')) {
      // Native
      const nativeContext = await context({
        ...nativeConfig,
        sourcemap: true,
        minify: false,
        plugins: [esbuildProblemMatcherPlugin, ...(nativeConfig.plugins ?? [])],
      });

      // Web
      const webContext = await context({
        ...webConfig,
        sourcemap: true,
        minify: false,
        define: {
          ...(webConfig.define ?? {}),
          ...{
            'process.env.IS_VSCODE_WEB_EXTENSION_DEV_MODE': '"true"',
          },
        },
        plugins: [esbuildProblemMatcherPlugin, ...(webConfig.plugins ?? [])],
      });

      await Promise.all([nativeContext.watch(), webContext.watch()]);
    } else if (process.argv.includes('--web-dev')) {
      // Single web-only dev build (IS_VSCODE_WEB_EXTENSION_DEV_MODE=true, no watch)
      await build({
        ...webConfig,
        sourcemap: true,
        minify: false,
        define: {
          ...(webConfig.define ?? {}),
          'process.env.IS_VSCODE_WEB_EXTENSION_DEV_MODE': '"true"',
        },
      });
      console.log('[web-dev] Web extension built in dev mode');
    } else {
      // Build mode
      await Promise.all([build(nativeConfig), build(webConfig)]);
      copyTikzjaxTexFiles();
      copyXhrSyncWorker();
      copyMarkdownYoWasm();
    }
  } catch (error) {
    console.error(error);
  }
}

main();
