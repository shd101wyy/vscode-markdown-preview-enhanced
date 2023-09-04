const { context, build } = require('esbuild');
const { polyfillNode } = require('esbuild-plugin-polyfill-node');

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
    manual: true
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
    window: JSON.stringify(defaultWindow),
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
        // bundle: false,
        // external: undefined,
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
