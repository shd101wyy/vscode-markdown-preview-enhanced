/* global suite, test, suiteSetup, suiteTeardown */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const esbuild = require('esbuild');
const { stubPlugin, setConfiguration } = require('./vscode-stub');

let bundle;
let tmpFile;
let configDir;

suite('ai translation block cache', function () {
  this.timeout(30000);

  suiteSetup(async function () {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpe-ai-cache-'));
    // `globalConfigPath` is read when the module is first evaluated, and the
    // cache lives under it. Point `configPath` at a throwaway directory so the
    // test never touches the real `~/.config/crossnote`.
    setConfiguration({ configPath: configDir });
    const result = await esbuild.build({
      stdin: {
        contents: [
          "export { getBlockTranslation, setBlockTranslation } from './src/ai-translation-cache';",
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
    tmpFile = path.join(__dirname, '.ai-translation-cache.bundle.cjs');
    fs.writeFileSync(tmpFile, result.outputFiles[0].text);
    bundle = require(tmpFile);
  });

  suiteTeardown(function () {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
    if (configDir) {
      fs.rmSync(configDir, { recursive: true, force: true });
    }
    setConfiguration({});
  });

  test('reuses a block translated by the same provider and model', function () {
    bundle.setBlockTranslation(
      'same',
      'translated',
      'deepseek',
      'deepseek-chat',
    );

    assert.strictEqual(
      bundle.getBlockTranslation('same', 'deepseek', 'deepseek-chat'),
      'translated',
    );
  });

  test('misses a block translated by another provider', function () {
    bundle.setBlockTranslation('provider', 'translated', 'deepseek', 'chat');

    assert.strictEqual(
      bundle.getBlockTranslation('provider', 'openai', 'chat'),
      undefined,
    );
  });

  test('misses a block translated by another model', function () {
    bundle.setBlockTranslation('model', 'translated', 'deepseek', 'chat');

    assert.strictEqual(
      bundle.getBlockTranslation('model', 'deepseek', 'reasoner'),
      undefined,
    );
  });

  test('a miss leaves the other model entry readable', function () {
    bundle.setBlockTranslation('kept', 'translated', 'deepseek', 'chat');

    assert.strictEqual(
      bundle.getBlockTranslation('kept', 'openai', 'gpt-4o'),
      undefined,
    );
    assert.strictEqual(
      bundle.getBlockTranslation('kept', 'deepseek', 'chat'),
      'translated',
    );
  });

  test('treats an entry without metadata as a legacy hit', function () {
    bundle.setBlockTranslation('legacy', 'translated', 'deepseek', 'chat');
    const blocksDir = path.join(configDir, 'ai-translation-cache', 'blocks');
    fs.unlinkSync(path.join(blocksDir, 'legacy.meta.json'));

    assert.strictEqual(
      bundle.getBlockTranslation('legacy', 'openai', 'gpt-4o'),
      'translated',
    );
  });
});
