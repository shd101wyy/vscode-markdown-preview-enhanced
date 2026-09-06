/* global suite, test, suiteSetup, suiteTeardown */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

let resolveActivePreviewSource;
let formatPreviewSourcePath;
let tmpFile;

suite('current-preview-source', function () {
  this.timeout(15000);

  suiteSetup(async function () {
    const result = await esbuild.build({
      entryPoints: [
        path.join(__dirname, '..', 'src', 'current-preview-source.ts'),
      ],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node18',
      write: false,
      logLevel: 'silent',
    });
    tmpFile = path.join(__dirname, '.current-preview-source.bundle.cjs');
    fs.writeFileSync(tmpFile, result.outputFiles[0].text);
    const mod = require(tmpFile);
    resolveActivePreviewSource = mod.resolveActivePreviewSource;
    formatPreviewSourcePath = mod.formatPreviewSourcePath;
  });

  suiteTeardown(function () {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  });

  test('returns the exact source of the active preview', function () {
    const docsIndex = { path: '/workspace/docs/index.md' };
    const apiIndex = { path: '/workspace/api/index.md' };

    assert.strictEqual(
      resolveActivePreviewSource([
        { active: false, sourceUri: docsIndex },
        { active: true, sourceUri: apiIndex },
      ]),
      apiIndex,
    );
  });

  test('returns undefined when no preview is active', function () {
    assert.strictEqual(
      resolveActivePreviewSource([
        { active: false, sourceUri: { path: '/workspace/a.md' } },
      ]),
      undefined,
    );
  });

  test('returns undefined while the active preview source is unresolved', function () {
    assert.strictEqual(
      resolveActivePreviewSource([{ active: true, sourceUri: undefined }]),
      undefined,
    );
  });

  test('returns undefined instead of guessing between active previews', function () {
    assert.strictEqual(
      resolveActivePreviewSource([
        { active: true, sourceUri: { path: '/workspace/a.md' } },
        { active: true, sourceUri: { path: '/workspace/b.md' } },
      ]),
      undefined,
    );
  });

  test('formats file URIs as filesystem paths', function () {
    assert.strictEqual(
      formatPreviewSourcePath({
        scheme: 'file',
        fsPath: '/workspace/docs/design.md',
        toString: () => 'file:///workspace/docs/design.md',
      }),
      '/workspace/docs/design.md',
    );
  });

  test('keeps the filesystem representation supplied for UNC file URIs', function () {
    const uncPath = '\\\\server\\share\\docs\\design.md';

    assert.strictEqual(
      formatPreviewSourcePath({
        scheme: 'file',
        fsPath: uncPath,
        toString: () => 'file://server/share/docs/design.md',
      }),
      uncPath,
    );
  });

  test('preserves scheme and authority for non-file URIs', function () {
    assert.strictEqual(
      formatPreviewSourcePath(remoteUri()),
      'vscode-remote://ssh-remote+example/workspace/docs/design.md',
    );
  });

  test('drops the fragment and query of non-file URIs', function () {
    assert.strictEqual(
      formatPreviewSourcePath(remoteUri({ query: 'v=2', fragment: 'section' })),
      'vscode-remote://ssh-remote+example/workspace/docs/design.md',
    );
  });

  test('resolves file and non-file URIs to the same resource when a fragment is present', function () {
    const withoutFragment = formatPreviewSourcePath(remoteUri());
    const withFragment = formatPreviewSourcePath(
      remoteUri({ fragment: 'section' }),
    );
    const fileUri = (fragment) => ({
      scheme: 'file',
      fsPath: '/workspace/docs/design.md',
      with: () => fileUri(''),
      toString: () =>
        `file:///workspace/docs/design.md${fragment ? `#${fragment}` : ''}`,
    });

    assert.strictEqual(withFragment, withoutFragment);
    assert.strictEqual(
      formatPreviewSourcePath(fileUri('section')),
      formatPreviewSourcePath(fileUri('')),
    );
  });
});

function remoteUri({ query = '', fragment = '' } = {}) {
  return {
    scheme: 'vscode-remote',
    fsPath: '/workspace/docs/design.md',
    with(change) {
      return remoteUri({
        query: change.query === undefined ? query : change.query,
        fragment: change.fragment === undefined ? fragment : change.fragment,
      });
    },
    toString() {
      return (
        'vscode-remote://ssh-remote+example/workspace/docs/design.md' +
        (query ? `?${query}` : '') +
        (fragment ? `#${fragment}` : '')
      );
    },
  };
}
