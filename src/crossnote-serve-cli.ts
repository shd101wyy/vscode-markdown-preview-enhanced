/**
 * Entry point of the standalone `crossnote serve` child process
 * (out/native/crossnote-serve.js).
 *
 * The extension spawns this bundle with Node-style argv
 * (`crossnote-serve.js serve <folders> --json ...`); `main()` from
 * `crossnote/cli` parses it exactly like the `crossnote` bin does. Bundling
 * the CLI keeps the VSIX self-contained (node_modules are not shipped), and
 * running it in a child process isolates crossnote's serve server from the
 * extension host: it mutates process-global state (build directory, the
 * addFileProtocol mapper) that the extension's own previews rely on.
 */
import { main } from 'crossnote/cli';

void main();
