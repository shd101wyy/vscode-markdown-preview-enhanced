/* global suite, test */

/**
 * The revealjsTheme setting is an enum: a theme the preview's theme menu
 * offers but the enum does not list cannot be picked in Settings. The themes
 * are crossnote's, so the enum is kept to the ones the crossnote the
 * extension pins accepts: a theme the enum lists and crossnote does not ship
 * leaves a presentation without its theme.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
);
const setting =
  pkg.contributes.configuration.properties[
    'markdown-preview-enhanced.revealjsTheme'
  ];

/** The themes the pinned crossnote accepts: the members of its `RevealJsTheme`. */
function crossnoteThemes() {
  const types = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'node_modules',
      'crossnote',
      'out',
      'types',
      'src',
      'notebook',
      'types.d.ts',
    ),
    'utf8',
  );
  const union = /^export type RevealJsTheme\s*=\s*([^;]*);/m.exec(types);
  assert.ok(union, 'the pinned crossnote does not declare RevealJsTheme');
  return union[1].match(/'[^']+'/g).map((theme) => theme.slice(1, -1));
}

suite('revealjsTheme setting', () => {
  test('lists the themes of the crossnote the extension pins, and only those', () => {
    assert.deepStrictEqual([...setting.enum].sort(), crossnoteThemes().sort());
  });

  test('has its default among its themes', () => {
    assert.ok(setting.enum.includes(setting.default));
  });
});
