/* global suite, test */

/**
 * L10n bundle integrity: every l10n/bundle.l10n.*.json must ship the exact
 * same key set as the source bundle (l10n/bundle.l10n.json), no empty
 * translations, and the same {placeholder} set per key — a mismatched or
 * missing placeholder would break interpolation at runtime, and VS Code
 * silently falls back per-string, so drift is otherwise invisible.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const l10nDir = path.join(__dirname, '..', 'l10n');

function loadBundles() {
  const files = fs
    .readdirSync(l10nDir)
    .filter((name) => /^bundle\.l10n(\.[^.]+)?\.json$/.test(name))
    .sort();
  assert.ok(
    files.length > 0,
    'no l10n bundles found — bundle.l10n.json is the source and must exist',
  );
  const bundles = new Map(
    files.map((name) => [
      name,
      JSON.parse(fs.readFileSync(path.join(l10nDir, name), 'utf8')),
    ]),
  );
  assert.ok(
    bundles.has('bundle.l10n.json'),
    'l10n/bundle.l10n.json (the source bundle) is missing',
  );
  return bundles;
}

function placeholders(value) {
  return (value.match(/\{(\w+)\}/g) ?? []).sort().join(',');
}

suite('l10n bundles', () => {
  const bundles = loadBundles();
  const sourceName = 'bundle.l10n.json';
  const source = bundles.get(sourceName);
  const sourceKeys = Object.keys(source).sort();

  test('locale bundles carry the exact key set of the source bundle', () => {
    for (const [name, bundle] of bundles) {
      if (name === sourceName) {
        continue;
      }
      assert.deepStrictEqual(
        Object.keys(bundle).sort(),
        sourceKeys,
        `${name} must ship the same keys as ${sourceName}`,
      );
    }
  });

  test('no empty translations', () => {
    for (const [name, bundle] of bundles) {
      for (const [key, value] of Object.entries(bundle)) {
        assert.ok(
          typeof value === 'string' && value.trim().length > 0,
          `${name} has an empty translation for ${key}`,
        );
      }
    }
  });

  test('placeholders match the source bundle on every key', () => {
    for (const [name, bundle] of bundles) {
      if (name === sourceName) {
        continue;
      }
      for (const key of sourceKeys) {
        assert.strictEqual(
          placeholders(bundle[key]),
          placeholders(source[key]),
          `${name} placeholder mismatch for ${key}`,
        );
      }
    }
  });

  test('every supported package.nls locale ships an l10n bundle', () => {
    const nlsLocales = fs
      .readdirSync(path.join(__dirname, '..'))
      .filter((name) => /^package\.nls\.(.+)\.json$/.test(name))
      .map((name) => name.match(/^package\.nls\.(.+)\.json$/)[1])
      .sort();
    for (const locale of nlsLocales) {
      assert.ok(
        bundles.has(`bundle.l10n.${locale}.json`),
        `package.nls.${locale}.json exists but l10n/bundle.l10n.${locale}.json is missing`,
      );
    }
  });
});
