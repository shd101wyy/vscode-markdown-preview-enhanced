import * as crossnote from 'crossnote';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { globalConfigPath } from './utils';

/**
 * `buildWiki` is exported by newer crossnote releases (the `build-wiki`
 * feature). Older pinned versions don't have it; feature-detect at runtime
 * so this module stays loadable either way and the commands can explain
 * what to upgrade.
 *
 * eslint-disable-next-line @typescript-eslint/no-explicit-any -- forward-compatible access to a dependency that gains this export in a later release
 */
const buildWiki = (crossnote as any).buildWiki as
  | ((options: {
      directories: string[];
      vscode?: boolean;
      globalConfigDirectory?: string;
      crossnoteBuildDirectory?: string;
      onProgress?: (info: {
        rendered: number;
        total: number;
        root: string;
      }) => void;
    }) => Promise<{
      html: string;
      files: Array<{ path: string; title: string }>;
      failures: Array<{ path: string; error: string }>;
    }>)
  | undefined;

/** The extension ships crossnote's build output in `crossnote/` (gulpfile). */
function crossnoteBuildDirectory(context: vscode.ExtensionContext): string {
  return path.join(context.extensionPath, 'crossnote');
}

export function isBuildWikiSupported(): boolean {
  return typeof buildWiki === 'function';
}

/**
 * Directories the wiki covers: every folder of the current workspace, or —
 * for a loose file without a workspace — the folder containing it. Empty
 * when there is nothing to build from (the caller explains); never falls
 * back to the extension host's cwd, which is a filesystem root.
 */
function wikiDirectories(sourceUri?: vscode.Uri): string[] {
  if (vscode.workspace.workspaceFolders?.length) {
    return vscode.workspace.workspaceFolders.map((folder) => folder.uri.fsPath);
  }
  if (sourceUri) {
    return [path.dirname(sourceUri.fsPath)];
  }
  return [];
}

/**
 * Build the standalone wiki HTML for the current workspace (like
 * `crossnote build-wiki`). Resolves with the document; the caller decides
 * where to write it.
 */
export async function buildWikiHTML(
  context: vscode.ExtensionContext,
  sourceUri?: vscode.Uri,
): Promise<{ html: string; noteCount: number }> {
  if (!isBuildWikiSupported() || !buildWiki) {
    throw new Error(
      'The installed crossnote dependency does not export buildWiki. Please update the crossnote dependency.',
    );
  }

  const result = await buildWiki({
    directories: wikiDirectories(sourceUri),
    vscode: true,
    globalConfigDirectory: globalConfigPath || undefined,
    crossnoteBuildDirectory: crossnoteBuildDirectory(context),
    onProgress: ({ rendered, total, root }) => {
      // Progress is surfaced through withProgress below; per-note logs help
      // only in debug scenarios.
      if (process.env.VSCODE_MPE_DEBUG) {
        console.debug(`crossnote build-wiki: ${root} ${rendered}/${total}`);
      }
    },
  });

  if (result.failures.length > 0) {
    console.error(
      'crossnote build-wiki: notes that failed to render:',
      result.failures,
    );
  }

  return { html: result.html, noteCount: result.files.length };
}

/**
 * Build the wiki and ask the user where to save it. Shared by the command
 * palette entry and the preview's context-menu item.
 */
export async function buildAndSaveWiki(
  context: vscode.ExtensionContext,
  sourceUri?: vscode.Uri,
): Promise<void> {
  if (!isBuildWikiSupported()) {
    vscode.window.showErrorMessage(
      vscode.l10n.t(
        'Build Standalone Wiki requires a newer crossnote dependency. Please update the extension.',
      ),
    );
    return;
  }

  const directories = wikiDirectories(sourceUri);
  if (directories.length === 0) {
    vscode.window.showWarningMessage(
      vscode.l10n.t(
        'Open a folder first: the standalone wiki covers the folders of the current workspace.',
      ),
    );
    return;
  }
  const defaultUri = vscode.Uri.file(path.join(directories[0], 'index.html'));
  const target = await vscode.window.showSaveDialog({
    defaultUri,
    filters: { HTML: ['html'] },
    title: vscode.l10n.t('Save the standalone wiki'),
  });
  if (!target) {
    return;
  }

  try {
    // The progress task ends when the file is written — the "saved" message
    // is shown after it, so the progress notification closes first instead
    // of waiting for the user to dismiss the message.
    const noteCount = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: vscode.l10n.t('Building the standalone wiki…'),
        cancellable: false,
      },
      async () => {
        const { html, noteCount } = await buildWikiHTML(context, sourceUri);
        await fs.promises.writeFile(target.fsPath, html, 'utf-8');
        return noteCount;
      },
    );
    const openItem = vscode.l10n.t('Open');
    const selection = await vscode.window.showInformationMessage(
      vscode.l10n.t('Standalone wiki saved ({noteCount} notes).', {
        noteCount,
      }),
      openItem,
    );
    if (selection === openItem) {
      void vscode.env.openExternal(target);
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      vscode.l10n.t('Building the standalone wiki failed: {message}', {
        message: String(error),
      }),
    );
  }
}
