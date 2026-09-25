/* global suite, test */

/**
 * `workbench.editorAssociations` sync for `previewMode`. Outside "Previews
 * Only" the extension used to delete every `"*.md": "markdown-preview-enhanced"`
 * entry on activation, including ones the user added by hand, so a manual
 * association vanished on every VS Code restart (vscode-mpe#2429). Only the
 * patterns the extension wrote itself may be removed.
 */

const assert = require('assert');
const esbuild = require('esbuild');
const fs = require('fs');
const os = require('os');
const path = require('path');

suite('editor associations', function () {
  let compute;

  async function load() {
    if (compute) {
      return compute;
    }
    const result = await esbuild.build({
      stdin: {
        contents:
          "export { computeEditorAssociations } from './src/editor-associations';",
        resolveDir: path.join(__dirname, '..'),
        loader: 'ts',
      },
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node18',
      write: false,
      logLevel: 'silent',
    });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-associations-'));
    const file = path.join(tmp, 'bundle.cjs');
    fs.writeFileSync(file, result.outputFiles[0].text);
    compute = require(file).computeEditorAssociations;
    return compute;
  }

  const MPE = 'markdown-preview-enhanced';

  test('keeps a user-added association outside Previews Only', async function () {
    const computeEditorAssociations = await load();
    const current = { '*.md': MPE, '*.png': 'imagePreview.previewEditor' };
    const result = computeEditorAssociations({
      current,
      previewsOnly: false,
      markdownFileExtensions: ['.md'],
      owned: [],
    });
    assert.deepStrictEqual(result.associations, current);
    assert.deepStrictEqual(result.owned, []);
    assert.strictEqual(result.changed, false);
  });

  test('adds and owns associations in Previews Only', async function () {
    const computeEditorAssociations = await load();
    const result = computeEditorAssociations({
      current: { '*.png': 'imagePreview.previewEditor' },
      previewsOnly: true,
      markdownFileExtensions: ['.md', '.markdown'],
      owned: [],
    });
    assert.deepStrictEqual(result.associations, {
      '*.png': 'imagePreview.previewEditor',
      '*.md': MPE,
      '*.markdown': MPE,
    });
    assert.deepStrictEqual(result.owned, ['*.md', '*.markdown']);
    assert.strictEqual(result.changed, true);
  });

  test('removes owned associations when leaving Previews Only', async function () {
    const computeEditorAssociations = await load();
    const result = computeEditorAssociations({
      current: { '*.md': MPE, '*.png': 'imagePreview.previewEditor' },
      previewsOnly: false,
      markdownFileExtensions: ['.md'],
      owned: ['*.md'],
    });
    assert.deepStrictEqual(result.associations, {
      '*.png': 'imagePreview.previewEditor',
    });
    assert.deepStrictEqual(result.owned, []);
    assert.strictEqual(result.changed, true);
  });

  test('does not remove an owned pattern the user remapped', async function () {
    const computeEditorAssociations = await load();
    const current = { '*.md': 'default' };
    const result = computeEditorAssociations({
      current,
      previewsOnly: false,
      markdownFileExtensions: ['.md'],
      owned: ['*.md'],
    });
    assert.deepStrictEqual(result.associations, current);
    assert.strictEqual(result.changed, false);
  });

  test('drops owned patterns for extensions no longer listed', async function () {
    const computeEditorAssociations = await load();
    const result = computeEditorAssociations({
      current: { '*.md': MPE, '*.markdown': MPE },
      previewsOnly: true,
      markdownFileExtensions: ['.md'],
      owned: ['*.md', '*.markdown'],
    });
    assert.deepStrictEqual(result.associations, { '*.md': MPE });
    assert.deepStrictEqual(result.owned, ['*.md']);
  });
});
