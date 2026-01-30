const { cpSync, existsSync, rmSync } = require('fs');
const path = require('path');
const { context, build } = require('esbuild');
const { polyfillNode } = require('esbuild-plugin-polyfill-node');

/**
 * Copy crossnote assets
 */
function copyCrossnoteAssets() {
  const crossnoteDir = path.resolve(__dirname, 'crossnote');
  const sourceDir = path.resolve(__dirname, 'node_modules/crossnote/out');

  if (existsSync(crossnoteDir)) {
    rmSync(crossnoteDir, { recursive: true });
  }

  for (const subdir of ['dependencies', 'styles', 'webview']) {
    cpSync(path.resolve(sourceDir, subdir), path.resolve(crossnoteDir, subdir), {
      recursive: true,
    });
  }
  console.log('[build] Copied crossnote assets');
}

/**
 * Clean output directory
 */
function cleanOutput() {
  const outDir = path.resolve(__dirname, 'out');
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true });
  }
  console.log('[build] Cleaned output directory');
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',

  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      if (result.errors.length) {
        result.errors.forEach((error) =>
          console.error(
            `> ${error.location?.file}:${error.location?.line}:${error.location?.column}: error: ${error.text}`,
          ),
        );
      } else {
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
  platform: 'node',
  outfile: './out/native/extension.js',
  target: 'node16',
  format: 'cjs',
  external: ['vscode'],
  sourcemap: true,
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
  platform: 'browser',
  outfile: './out/web/extension.js',
  target: 'es2020',
  format: 'cjs',
  external: ['vscode'],
  sourcemap: true,
  plugins: [
    polyfillNode({
      polyfills: {
        fs: true,
      },
    }),
  ],
  define: {
    'window': JSON.stringify(defaultWindow),
    'process.env.IS_VSCODE_WEB_EXTENSION': '"true"',
  },
};

async function main() {
  // Copy assets and clean output
  cleanOutput();
  copyCrossnoteAssets();

  try {
    // Watch mode
    if (process.argv.includes('--watch')) {
      // Native
      const nativeContext = await context({
        ...nativeConfig,
        minify: false,
        plugins: [esbuildProblemMatcherPlugin],
      });

      // Web
      const webContext = await context({
        ...webConfig,
        minify: false,
        define: {
          ...webConfig.define,
          'process.env.IS_VSCODE_WEB_EXTENSION_DEV_MODE': '"true"',
        },
        plugins: [esbuildProblemMatcherPlugin, ...webConfig.plugins],
      });

      await Promise.all([nativeContext.watch(), webContext.watch()]);
    } else {
      // Build mode
      await Promise.all([build(nativeConfig), build(webConfig)]);
      console.log('[build] Build completed');
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main();
