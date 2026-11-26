/* global suite, test */

/**
 * Some settings are an enum of what crossnote accepts. A value crossnote
 * accepts and the enum does not list cannot be picked in Settings, and a value
 * the enum lists and crossnote does not accept is passed to it all the same.
 * Each of these enums is kept to the members of the type of the crossnote the
 * extension pins, so that a value crossnote gains fails here until it is
 * listed.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const prefix = 'markdown-preview-enhanced.';

const properties = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
).contributes.configuration.properties;

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

/** The members of a union of strings that the pinned crossnote declares. */
function crossnoteStrings(typeName) {
  const union = new RegExp(
    '^export type ' + typeName + '\\s*=\\s*([^;]*);',
    'm',
  ).exec(types);
  assert.ok(union, 'the pinned crossnote does not declare ' + typeName);
  return union[1].match(/'[^']+'/g).map((member) => member.slice(1, -1));
}

/**
 * Each setting whose enum is a type of crossnote, by that type.
 *
 * `frontMatterRenderingOption` is not among them: crossnote has `code` and
 * `code block` where the setting has `code block` only, an old name that is
 * kept for the configs that have it.
 */
const settings = [
  ['codeBlockTheme', 'CodeBlockTheme'],
  ['exportColorScheme', 'ExportColorScheme'],
  ['imageUploader', 'ImageUploader'],
  ['markdownParser', 'MarkdownParser'],
  ['mathRenderingOption', 'MathRenderingOption'],
  ['mermaidTheme', 'MermaidTheme'],
  ['previewTheme', 'PreviewTheme'],
  ['revealjsTheme', 'RevealJsTheme'],
  ['wikiLinkResolution', 'WikiLinkResolution'],
  ['wikiLinkTargetFileNameChangeCase', 'WikiLinkTargetFileNameChangeCase'],
];

suite('settings that are an enum of what crossnote accepts', () => {
  for (const [setting, typeName] of settings) {
    test(`${setting} lists the members of ${typeName}, and only those`, () => {
      assert.deepStrictEqual(
        [...properties[prefix + setting].enum].sort(),
        crossnoteStrings(typeName).sort(),
      );
    });
  }

  test('each has its default among its values', () => {
    for (const [setting] of settings) {
      const { enum: values, default: value } = properties[prefix + setting];
      assert.ok(values.includes(value), setting);
    }
  });
});
