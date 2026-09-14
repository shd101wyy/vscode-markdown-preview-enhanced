import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  CrossnoteServeListeningEvent,
  parseListeningLine,
} from './crossnote-serve-output';

/** Context key driving the Start/Stop commands' enablement. */
export const CROSSNOTE_SERVER_RUNNING_KEY =
  'markdown-preview-enhanced.crossnoteServerRunning';

const STARTUP_TIMEOUT_MS = 30000;

let serverProcess: ChildProcess | null = null;
let serverUrl: string | null = null;

export function isCrossnoteServerRunning(): boolean {
  return (
    serverProcess !== null &&
    serverProcess.exitCode === null &&
    !serverProcess.killed
  );
}

export function getCrossnoteServerUrl(): string | null {
  return serverUrl;
}

async function showRunningMessage(): Promise<void> {
  if (!serverUrl) {
    vscode.window.showInformationMessage(
      'The crossnote server is still starting…',
    );
    return;
  }
  const selection = await vscode.window.showInformationMessage(
    `crossnote server is running at ${serverUrl}`,
    'Open in browser',
  );
  if (selection === 'Open in browser') {
    void vscode.env.openExternal(vscode.Uri.parse(serverUrl));
  }
}

/**
 * Start the `crossnote serve` child process for the folders of the current
 * workspace (multi-root workspaces serve every folder, like the CLI does).
 *
 * The server runs in its own process on purpose: crossnote's serve server
 * mutates process-global state (build directory, the addFileProtocol
 * mapper) that the extension host's own previews rely on.
 */
export async function startCrossnoteServer(
  context: vscode.ExtensionContext,
): Promise<void> {
  if (isCrossnoteServerRunning()) {
    await showRunningMessage();
    return;
  }

  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showWarningMessage(
      'Open a folder first: the crossnote server serves the folders of the current workspace.',
    );
    return;
  }

  // out/native/crossnote-serve.js is built from crossnote's CLI; builds
  // against a crossnote older than the serve CLI skip it (see build.js).
  const cliBundlePath = path.join(
    context.extensionPath,
    'out',
    'native',
    'crossnote-serve.js',
  );
  if (!fs.existsSync(cliBundlePath)) {
    vscode.window.showErrorMessage(
      'This version of Markdown Preview Enhanced was built without the crossnote serve CLI; please update the extension.',
    );
    return;
  }

  const port = vscode.workspace
    .getConfiguration('markdown-preview-enhanced')
    .get<number>('crossnoteServePort', 3000);
  const buildDirectory = path.join(context.extensionPath, 'crossnote');

  const child = spawn(
    process.execPath,
    [
      cliBundlePath,
      'serve',
      ...folders.map((folder) => folder.uri.fsPath),
      '--vscode',
      '--json',
      '--build-dir',
      buildDirectory,
      '--port',
      String(port),
    ],
    {
      // The extension host's execPath is Electron; as Node it runs the CLI
      // bundle like plain `node` would.
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  serverProcess = child;
  serverUrl = null;
  void vscode.commands.executeCommand(
    'setContext',
    CROSSNOTE_SERVER_RUNNING_KEY,
    true,
  );

  let stdout = '';
  let stderrTail = '';
  const startupTimer = setTimeout(() => {
    // Not listening after a generous timeout — give up instead of leaving
    // an unknown-state child around.
    child.kill();
  }, STARTUP_TIMEOUT_MS);

  child.stdout?.on('data', (chunk: Buffer) => {
    stdout += chunk.toString('utf-8');
    const listening: CrossnoteServeListeningEvent | null =
      parseListeningLine(stdout);
    if (listening) {
      clearTimeout(startupTimer);
      serverUrl = listening.url;
      void showRunningMessage();
    }
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString('utf-8')).slice(-1000);
  });

  child.on('error', (error) => {
    clearTimeout(startupTimer);
    cleanup();
    vscode.window.showErrorMessage(
      `Failed to start the crossnote server: ${error.message}`,
    );
  });
  child.on('exit', (code) => {
    clearTimeout(startupTimer);
    const url = serverUrl;
    cleanup();
    if (url === null && code !== 0) {
      vscode.window.showErrorMessage(
        `The crossnote server exited early (code ${code}).${
          stderrTail ? `\n${stderrTail}` : ''
        }`,
      );
    } else if (url !== null) {
      vscode.window.setStatusBarMessage('crossnote server stopped', 4000);
    }
  });
}

export function stopCrossnoteServer(): void {
  if (!isCrossnoteServerRunning()) {
    vscode.window.showInformationMessage(
      'The crossnote server is not running.',
    );
    return;
  }
  // SIGTERM lets the CLI close the server gracefully; the exit handler
  // above resets the state and shows the stopped status.
  serverProcess?.kill();
}

function cleanup(): void {
  serverProcess = null;
  serverUrl = null;
  void vscode.commands.executeCommand(
    'setContext',
    CROSSNOTE_SERVER_RUNNING_KEY,
    false,
  );
}

/** Kill a running server when the extension deactivates. */
export function disposeCrossnoteServer(): void {
  serverProcess?.kill();
  cleanup();
}
