/* global suite, test */

/**
 * The custom-editor preview (previewMode "Previews Only") must opt into the
 * webview find widget. The regular preview panel enables it via its panel
 * options; without the flag here, cmd/ctrl+F in Previews-Only mode silently
 * did nothing (vscode-mpe#2412).
 */

const assert = require('assert');
const esbuild = require('esbuild');

suite('custom editor options', function () {
  const optionsCache = new Map();

  async function loadOptions() {
    if (optionsCache.has('options')) {
      return optionsCache.get('options');
    }
    const result = await esbuild.build({
      stdin: {
        contents:
          "export { customEditorProviderOptions } from './src/custom-editor-options';",
        resolveDir: require('path').join(__dirname, '..'),
        loader: 'ts',
      },
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node18',
      write: false,
      logLevel: 'silent',
    });
    const tmp = require('fs').mkdtempSync(
      require('path').join(require('os').tmpdir(), 'custom-editor-options-'),
    );
    const file = require('path').join(tmp, 'bundle.cjs');
    require('fs').writeFileSync(file, result.outputFiles[0].text);
    const options = require(file).customEditorProviderOptions;
    optionsCache.set('options', options);
    return options;
  }

  test('enables the webview find widget', async function () {
    const options = await loadOptions();
    assert.strictEqual(options.webviewOptions.enableFindWidget, true);
  });

  test('retains context when hidden', async function () {
    const options = await loadOptions();
    assert.strictEqual(options.webviewOptions.retainContextWhenHidden, true);
  });
});
