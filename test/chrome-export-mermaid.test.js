/* global suite, test, setup, teardown, suiteTeardown */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');
const { fileURLToPath, pathToFileURL } = require('url');
const crossnote = require('crossnote');
const crossnoteRequire = createRequire(require.resolve('crossnote'));
const puppeteer = crossnoteRequire(
  'puppeteer-core/lib/cjs/puppeteer/puppeteer-core.js',
);

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

// Exercise the real HTML generator and chromeExport method. Only the browser
// transport is replaced: execute the emitted scripts, with a controllable
// asynchronous renderer, and observe the document captured by PDF/screenshot.
// This keeps the regression deterministic without downloading Chrome in CI.
function browserHarness({ hasMermaid = true, timeout = false } = {}) {
  const loaded = deferred();
  const rendering = deferred();
  const nodes = hasMermaid ? [{}, {}, {}] : [];
  const captured = [];
  let closed = false;
  let htmlPath;
  const context = vm.createContext({
    console: { error() {} },
    document: {
      querySelector: () => nodes[0] || null,
      querySelectorAll: () => nodes,
    },
    mermaid: {
      initialize() {},
      async run() {
        // Mermaid marks nodes as processed BEFORE it finishes their SVGs.
        nodes.forEach((node) => (node.processed = true));
        await rendering.promise;
        nodes.forEach((node) => (node.svg = 'complete'));
      },
    },
  });
  context.window = context;
  function evaluate(fn) {
    return vm.runInContext(`(${fn.toString()})()`, context);
  }
  function capture(options) {
    captured.push(nodes.map((node) => node.svg));
    fs.writeFileSync(options.path, JSON.stringify(captured[0]));
  }
  const page = {
    async goto(url) {
      htmlPath = fileURLToPath(url);
      const html = fs.readFileSync(htmlPath, 'utf8');
      for (const match of html.matchAll(
        /<script([^>]*)>([\s\S]*?)<\/script>/g,
      )) {
        if (match[1].includes('src=')) continue;
        // Like page.goto(), wait for load, not an async module's completion.
        Promise.resolve(
          vm.runInContext(`(async () => {${match[2]}\n})()`, context),
        ).catch(() => {});
      }
      loaded.resolve();
    },
    async waitForFunction(fn) {
      while (!(await evaluate(fn))) {
        if (timeout) throw new Error('Waiting failed: timeout exceeded');
        await new Promise((resolve) => setImmediate(resolve));
      }
    },
    evaluate,
    pdf: capture,
    screenshot: capture,
  };
  return {
    loaded,
    rendering,
    nodes,
    captured,
    get closed() {
      return closed;
    },
    browser: {
      async newPage() {
        return page;
      },
      async close() {
        closed = true;
        if (htmlPath) fs.rmSync(htmlPath, { force: true });
      },
    },
  };
}

suite('Chrome export Mermaid readiness', function () {
  this.timeout(10000);
  let directory;
  let harness;
  const originalLaunch = puppeteer.launch;
  // Node caches the named exports of a dynamic CJS import. Install one stable
  // function before chromeExport first imports Puppeteer.
  puppeteer.launch = async () => harness.browser;

  setup(function () {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mpe-mermaid-test-'));
  });
  teardown(function () {
    fs.rmSync(directory, { recursive: true, force: true });
  });
  suiteTeardown(function () {
    puppeteer.launch = originalLaunch;
  });

  async function engineFor(format, hasMermaid = true) {
    const api =
      format === 'cjs'
        ? crossnote
        : await import(
            pathToFileURL(
              path.resolve(
                path.dirname(require.resolve('crossnote')),
                '../esm/index.mjs',
              ),
            ).href
          );
    const filePath = path.join(directory, 'diagram.md');
    fs.writeFileSync(filePath, 'fixture');
    const engine = new api.MarkdownEngine({
      filePath,
      notebook: {
        config: {
          ...api.getDefaultNotebookConfig(),
          chromePath: '/test/chrome',
          mathRenderingOption: 'None',
          puppeteerWaitForTimeout: 0,
        },
        fs: { readFile: (name) => fs.promises.readFile(name, 'utf8') },
      },
    });
    engine.parseMD = async () => ({
      html: hasMermaid
        ? '<div class="mermaid">graph TD; A-->B</div>'
        : '<p>Plain Markdown</p>',
      yamlConfig: {},
    });
    return engine;
  }

  for (const format of ['cjs', 'esm']) {
    for (const fileType of ['pdf', 'png']) {
      test(`${format}: ${fileType} captures all diagrams only after rendering completes`, async function () {
        harness = browserHarness();
        const engine = await engineFor(format);
        const exporting = engine.chromeExport({ fileType });
        await harness.loaded.promise;
        await new Promise((resolve) => setImmediate(resolve));
        try {
          assert.deepStrictEqual(harness.captured, [], 'export raced Mermaid');
        } finally {
          harness.rendering.resolve();
          await exporting;
        }
        assert.deepStrictEqual(harness.captured, [
          ['complete', 'complete', 'complete'],
        ]);
        assert.strictEqual(harness.closed, true);
      });
    }

    test(`${format}: reports rendering errors without writing a broken PDF`, async function () {
      harness = browserHarness();
      const engine = await engineFor(format);
      const exporting = engine.chromeExport();
      await harness.loaded.promise;
      harness.rendering.reject(new Error('Invalid diagram syntax'));
      await assert.rejects(exporting, /Invalid diagram syntax/);
      assert.deepStrictEqual(harness.captured, []);
      assert.strictEqual(harness.closed, true);
    });

    test(`${format}: closes Chrome when rendering never finishes`, async function () {
      harness = browserHarness({ timeout: true });
      const engine = await engineFor(format);
      await assert.rejects(engine.chromeExport(), /timeout/);
      assert.deepStrictEqual(harness.captured, []);
      assert.strictEqual(harness.closed, true);
      harness.rendering.resolve();
    });

    test(`${format}: documents without Mermaid export immediately`, async function () {
      harness = browserHarness({ hasMermaid: false });
      const engine = await engineFor(format, false);
      await engine.chromeExport();
      assert.deepStrictEqual(harness.captured, [[]]);
      assert.strictEqual(harness.closed, true);
    });
  }
});
