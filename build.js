const { context, build } = require('esbuild');

/**
 * @type {import('esbuild').BuildOptions}
 */
const sharedConfig = {
  entryPoints: ['./src/extension.ts'],
  bundle: true,
  minify: true,
};

/**
 * @type {import('esbuild').BuildOptions}
 */
const cjsConfig = {
  ...sharedConfig,
  platform: 'node', // For CJS
  outfile: './out/native/extension.js',
  target: 'node16',
  format: 'cjs',
  external: ['vscode'],
};

async function main() {
  try {
    // Watch mode
    if (process.argv.includes('--watch')) {
      // CommonJS
      const cjsContext = await context({
        ...cjsConfig,
        sourcemap: true,
        minify: false,
        // bundle: false,
        // external: undefined,
      });
      await cjsContext.watch();
    } else {
      // Build mode
      // CommonJS
      await build(cjsConfig);
    }
  } catch (error) {
    console.error(error);
  }
}

main();
