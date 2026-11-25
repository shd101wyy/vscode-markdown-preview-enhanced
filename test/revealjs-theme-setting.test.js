/* global suite, test */

/**
 * The revealjsTheme setting is an enum: a theme the preview's menu offers but
 * the enum does not list cannot be picked in Settings. reveal.js 6 brought
 * three themes (crossnote#579); keep them, and any later one, listed.
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

suite('revealjsTheme setting', () => {
  test('lists the themes reveal.js 6 brought', () => {
    for (const theme of [
      'dracula.css',
      'black-contrast.css',
      'white-contrast.css',
    ]) {
      assert.ok(setting.enum.includes(theme), `${theme} is not listed`);
    }
  });

  test('has its default among its themes, each once', () => {
    assert.ok(setting.enum.includes(setting.default));
    assert.strictEqual(new Set(setting.enum).size, setting.enum.length);
  });
});
