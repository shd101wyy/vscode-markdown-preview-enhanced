/* global suite, test, suiteSetup, suiteTeardown */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

let customEditorProviderOptions;
let tmpFile;

suite('customEditorProviderOptions', function () {
  this.timeout(15000);

  suiteSetup(async function () {
    const result = await esbuild.build({
      entryPoints: [
        path.join(__dirname, '..', 'src', 'custom-editor-options.ts'),
      ],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node18',
      write: false,
      logLevel: 'silent',
    });
    tmpFile = path.join(__dirname, '.custom-editor-options.bundle.cjs');
    fs.writeFileSync(tmpFile, result.outputFiles[0].text);
    customEditorProviderOptions = require(tmpFile).customEditorProviderOptions;
  });

  suiteTeardown(function () {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  });

  test('retains custom-editor context while its tab is hidden', function () {
    assert.deepStrictEqual(customEditorProviderOptions, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    });
  });
});
