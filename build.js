const { execSync } = require('child_process');
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
  external: ['vscode'],
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
    }
  } catch (error) {
    console.error(error);
  }
}

main();
