const { execSync } = require('child_process');
const { cpSync, mkdirSync, readdirSync } = require('fs');
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
        console.log('[watch] build finished');
      }
    });
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
 * Copy node-tikzjax WASM/tex data files to out/tex/ so the bundled native
 * extension (at out/native/extension.js) can find them via
 * path.join(__dirname, '../tex') at runtime.
 */
function copyTikzjaxTexFiles() {
  const tikzjaxTexDir = join(
    __dirname,
    'node_modules',
    'crossnote',
    'node_modules',
    'node-tikzjax',
    'tex',
  );
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
  const jsdomPnpmDir = join(
    __dirname,
    'node_modules',
    'crossnote',
    'node_modules',
    '.pnpm',
  );
  const jsdomDirs = readdirSync(jsdomPnpmDir).filter((d) =>
    d.startsWith('jsdom@'),
  );
  if (jsdomDirs.length === 0) {
    console.warn(
      'Could not find jsdom in pnpm store, skipping xhr-sync-worker copy',
    );
    return;
  }
  const workerSrc = join(
    jsdomPnpmDir,
    jsdomDirs[0],
    'node_modules',
    'jsdom',
    'lib',
    'jsdom',
    'living',
    'xhr',
    'xhr-sync-worker.js',
  );
  const outNativeDir = join(__dirname, 'out', 'native');
  mkdirSync(outNativeDir, { recursive: true });
  cpSync(workerSrc, join(outNativeDir, 'xhr-sync-worker.js'));
  console.log('Copied jsdom xhr-sync-worker.js to out/native/');
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
    } else {
      // Build mode
      await Promise.all([build(nativeConfig), build(webConfig)]);
      copyTikzjaxTexFiles();
      copyXhrSyncWorker();
    }
  } catch (error) {
    console.error(error);
  }
}

main();
