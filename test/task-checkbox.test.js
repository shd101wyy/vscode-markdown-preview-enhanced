/* global suite, test, suiteSetup, suiteTeardown */

/**
 * Unit tests for src/task-checkbox.ts.
 *
 * Checkboxes match Obsidian's Table Checkbox Renderer: `[ ]` and `[x]`
 * anywhere on a line, including several in one table row, each mapped
 * back to its own source token.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

let renderTaskCheckboxes;
let toggleTaskCheckboxLine;
let tmpFile;

function inputAt(html, offset) {
  const marker = `data-checkbox-offset="${offset}"`;
  assert.ok(html.includes(marker), `missing checkbox at offset ${offset}`);
  const at = html.indexOf(marker);
  const start = html.lastIndexOf('<input', at);
  const end = html.indexOf('>', at);
  return html.slice(start, end + 1);
}

suite('task checkboxes', function () {
  this.timeout(15000);

  suiteSetup(async function () {
    const result = await esbuild.build({
      entryPoints: [path.join(__dirname, '..', 'src', 'task-checkbox.ts')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node18',
      write: false,
      logLevel: 'silent',
    });
    tmpFile = path.join(__dirname, '.task-checkbox.bundle.cjs');
    fs.writeFileSync(tmpFile, result.outputFiles[0].text);
    const loaded = require(tmpFile);
    renderTaskCheckboxes = loaded.renderTaskCheckboxes;
    toggleTaskCheckboxLine = loaded.toggleTaskCheckboxLine;
  });

  suiteTeardown(function () {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  });

  test('renders an unchecked checkbox in the middle of a line', function () {
    const html = renderTaskCheckboxes('foo [ ] bar');
    const box = inputAt(html, 4);
    assert.ok(!box.includes(' checked'));
    assert.ok(box.includes('data-task-state="blank"'));
    assert.ok(box.includes('data-source-line="1"'));
    assert.ok(html.startsWith('foo '));
    assert.ok(html.endsWith(' bar'));
  });

  test('renders a checked checkbox for [x] and [X]', function () {
    for (const marker of ['x', 'X']) {
      const html = renderTaskCheckboxes(`foo [${marker}] bar`);
      const box = inputAt(html, 4);
      assert.ok(box.includes(' checked'));
      assert.ok(box.includes(`data-task-state="${marker}"`));
    }
  });

  test('maps every checkbox on a table row to its own source offset', function () {
    const line = '| [ ] foo | bar [x] |';
    const html = renderTaskCheckboxes(line);
    const first = inputAt(html, 2);
    const second = inputAt(html, 16);
    assert.ok(!first.includes(' checked'));
    assert.ok(second.includes(' checked'));
    assert.ok(!first.includes('mpe-task-checkbox-leading'));
    assert.ok(!second.includes('mpe-task-checkbox-leading'));
    assert.strictEqual(
      toggleTaskCheckboxLine(line, 2),
      '| [x] foo | bar [x] |',
    );
    assert.strictEqual(
      toggleTaskCheckboxLine(line, 16),
      '| [ ] foo | bar [ ] |',
    );
  });

  test('renders several checkboxes in one cell', function () {
    const line = '| [ ] foo [x] bar [ ] |';
    const html = renderTaskCheckboxes(line);
    assert.ok(html.includes('data-checkbox-offset="2"'));
    assert.ok(html.includes('data-checkbox-offset="10"'));
    assert.ok(html.includes('data-checkbox-offset="18"'));
    assert.strictEqual(
      toggleTaskCheckboxLine(line, 10),
      '| [ ] foo [ ] bar [ ] |',
    );
  });

  test('keeps a link in the same cell and still checks the checkbox', function () {
    const line = '| [docs](a.md) | [ ] |';
    const html = renderTaskCheckboxes(line);
    assert.ok(html.includes('[docs](a.md)'));
    assert.ok(html.includes(`data-checkbox-offset="${line.indexOf('[ ]')}"`));
    assert.ok(!html.includes('data-checkbox-offset="2"'));
  });

  test('gives a list-item checkbox the leading class', function () {
    const html = renderTaskCheckboxes('- [ ] milk');
    const box = inputAt(html, 2);
    assert.ok(box.includes('mpe-task-checkbox-leading'));
    const quoted = renderTaskCheckboxes('> - [ ] milk');
    assert.ok(inputAt(quoted, 4).includes('mpe-task-checkbox-leading'));
  });

  test('leaves code, links, images, wikilinks, and escapes as text', function () {
    const samples = [
      'see `[ ]` please',
      'see [x](http://example.com)',
      'see ![x](pic.png)',
      'see [[x]]',
      '[x]: http://example.com',
      'see \\[ ]',
      'callout [!NOTE]',
      'progress [/] and cancelled [-]',
    ];
    for (const sample of samples) {
      assert.strictEqual(renderTaskCheckboxes(sample), sample);
    }
  });

  test('leaves markers inside fenced code and converts the one after', function () {
    const markdown = ['```', '[ ]', '```', 'done [ ]'].join('\n');
    const html = renderTaskCheckboxes(markdown);
    assert.ok(html.startsWith('```\n[ ]\n```\n'));
    assert.ok(html.includes('data-source-line="4"'));
    assert.ok(html.includes('data-checkbox-offset="5"'));
  });

  test('leaves front matter and math and comments alone', function () {
    const markdown = [
      '---',
      'tags: [ ]',
      '---',
      '$$',
      '[ ]',
      '$$',
      '<!--',
      '[x]',
      '-->',
      'real [ ]',
    ].join('\n');
    const html = renderTaskCheckboxes(markdown);
    assert.ok(html.includes('tags: [ ]'));
    assert.ok(html.includes('$$\n[ ]\n$$'));
    assert.ok(html.includes('<!--\n[x]\n-->'));
    assert.ok(html.includes('data-source-line="10"'));
    assert.strictEqual(
      toggleTaskCheckboxLine('real [ ]', 'real [ ]'.indexOf('[ ]')),
      'real [x]',
    );
  });

  test('checks [ ] and clears [x] and [X]', function () {
    assert.strictEqual(toggleTaskCheckboxLine('a [ ] b', 2), 'a [x] b');
    assert.strictEqual(toggleTaskCheckboxLine('a [x] b', 2), 'a [ ] b');
    assert.strictEqual(toggleTaskCheckboxLine('a [X] b', 2), 'a [ ] b');
  });

  test('does not edit a stale offset', function () {
    assert.strictEqual(toggleTaskCheckboxLine('a [ ] b', 0), undefined);
    assert.strictEqual(toggleTaskCheckboxLine('a [ ] b', 99), undefined);
  });

  test('without an offset, toggles the first marker on the line', function () {
    assert.strictEqual(
      toggleTaskCheckboxLine('keep [ ] and [x]'),
      'keep [x] and [x]',
    );
    assert.strictEqual(
      toggleTaskCheckboxLine('only [X] here'),
      'only [ ] here',
    );
  });
});
