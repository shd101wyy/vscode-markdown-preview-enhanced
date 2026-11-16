/* global suite, test, suiteSetup, suiteTeardown, setup, teardown */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const esbuild = require('esbuild');
const {
  stubPlugin,
  setConfiguration,
  setWorkspaceFolderResolver,
} = require('./vscode-stub');

let bundle;
let tmpFile;
let tempDirs;

suite('image helper', function () {
  this.timeout(30000);

  suiteSetup(async function () {
    const result = await esbuild.build({
      stdin: {
        contents: [
          "import * as vscode from 'vscode';",
          "export { pasteImageFile, stripImageExtension } from './src/image-helper';",
          'export { vscode };',
        ].join('\n'),
        resolveDir: path.join(__dirname, '..'),
        loader: 'ts',
      },
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node18',
      write: false,
      logLevel: 'silent',
      plugins: [stubPlugin()],
    });
    tmpFile = path.join(__dirname, '.image-helper.bundle.cjs');
    fs.writeFileSync(tmpFile, result.outputFiles[0].text);
    bundle = require(tmpFile);
  });

  suiteTeardown(function () {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  });

  setup(function () {
    tempDirs = [];
    setConfiguration({});
    setWorkspaceFolderResolver(() => undefined);
    bundle.vscode.window.visibleTextEditors.length = 0;
  });

  teardown(function () {
    bundle.vscode.window.visibleTextEditors.length = 0;
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('stripImageExtension preserves extensionless names and dotfiles', function () {
    assert.strictEqual(bundle.stripImageExtension('photo.png'), 'photo');
    assert.strictEqual(bundle.stripImageExtension('my.photo.webp'), 'my.photo');
    assert.strictEqual(bundle.stripImageExtension('diagram'), 'diagram');
    assert.strictEqual(bundle.stripImageExtension('.hidden'), '.hidden');
  });

  test('pasteImageFile creates nested image directories and preserves extensionless alt text', async function () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mpe-img-'));
    tempDirs.push(root);
    const mdPath = path.join(root, 'note.md');
    const srcImg = path.join(root, 'diagram');
    fs.writeFileSync(mdPath, '# Note\n');
    fs.writeFileSync(srcImg, 'png-bytes');

    setConfiguration({ imageFolderPath: 'assets/nested' });
    setWorkspaceFolderResolver(() => ({
      uri: bundle.vscode.Uri.file(root),
    }));

    const inserted = [];
    const mdUri = bundle.vscode.Uri.file(mdPath);
    bundle.vscode.window.visibleTextEditors.push({
      document: {
        uri: mdUri,
        fileName: mdPath,
        languageId: 'markdown',
      },
      selection: { active: { line: 0, character: 0 } },
      edit(cb) {
        cb({
          insert(_pos, text) {
            inserted.push(text);
          },
        });
        return Promise.resolve(true);
      },
    });

    bundle.pasteImageFile(mdUri.toString(), srcImg);

    await new Promise((resolve, reject) => {
      const deadline = Date.now() + 3000;
      const poll = () => {
        if (inserted.length > 0) return resolve();
        if (Date.now() > deadline) {
          return reject(new Error('timed out waiting for pasteImageFile'));
        }
        setTimeout(poll, 20);
      };
      poll();
    });

    const copiedPath = path.join(root, 'assets', 'nested', 'diagram');
    assert.ok(fs.existsSync(copiedPath));
    assert.deepStrictEqual(inserted, ['![diagram](assets/nested/diagram)']);
  });
});
