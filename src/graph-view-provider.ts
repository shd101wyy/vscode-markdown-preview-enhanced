import { constructGraphView, GraphViewData } from 'crossnote';
import * as path from 'path';
import * as vscode from 'vscode';
import NotebooksManager from './notebooks-manager';
import { getWorkspaceFolderUri } from './utils';

export class GraphViewProvider {
  static notebooksManager: NotebooksManager;
  private static extensionContext: vscode.ExtensionContext;

  private static graphViewPanel: vscode.WebviewPanel | undefined;
  private static currentHash: string | undefined;

  public static init(context: vscode.ExtensionContext) {
    GraphViewProvider.extensionContext = context;
  }

  private static getViewMode(): 'global' | 'local' {
    return (
      (GraphViewProvider.extensionContext?.globalState.get<string>(
        'graphViewMode',
      ) as 'global' | 'local') ?? 'global'
    );
  }

  private static getColorByFolder(): boolean {
    return (
      GraphViewProvider.extensionContext?.globalState.get<boolean>(
        'graphViewColorByFolder',
      ) ?? false
    );
  }

  /**
   * Open (or reveal) the graph view panel.
   * If a source URI is provided it will be used to determine the workspace
   * notebook and to pre-highlight the active file.
   */
  public static async openGraphView(
    context: vscode.ExtensionContext,
    sourceUri?: vscode.Uri,
  ) {
    if (GraphViewProvider.graphViewPanel) {
      GraphViewProvider.graphViewPanel.reveal(vscode.ViewColumn.Beside, true);
      if (sourceUri) {
        await GraphViewProvider.sendActiveFile(sourceUri);
      }
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'crossnote.graphView',
      'Graph View',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    GraphViewProvider.graphViewPanel = panel;
    panel.iconPath = {
      light: vscode.Uri.parse(
        'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><line x1="12" y1="7" x2="5" y2="17"/><line x1="12" y1="7" x2="19" y2="17"/></svg>',
      ),
      dark: vscode.Uri.parse(
        'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><line x1="12" y1="7" x2="5" y2="17"/><line x1="12" y1="7" x2="19" y2="17"/></svg>',
      ),
    };

    const uri = sourceUri ?? vscode.window.activeTextEditor?.document.uri;

    // Store the workspace folder URI (not just fsPath) so we can construct
    // correct virtual-filesystem URIs (e.g. vscode-test-web://mount/) when
    // opening files from the graph.
    let workspaceFolderUri: vscode.Uri | undefined;

    if (uri) {
      try {
        workspaceFolderUri = getWorkspaceFolderUri(uri);
        const notebook =
          await GraphViewProvider.notebooksManager.getNotebook(uri);
        // Use the URI path component (not fsPath) as the relative note path
        // so it works correctly on virtual filesystems too.
        const relFilePath = path.relative(workspaceFolderUri.path, uri.path);
        const engine = notebook.getNoteMarkdownEngine(relFilePath);
        panel.webview.html = engine.generateHTMLTemplateForGraphView({
          vscodePreviewPanel: panel,
        });
      } catch (error) {
        console.error(
          'GraphViewProvider: failed to generate graph view HTML',
          error,
        );
        panel.webview.html = '<body>Failed to load graph view.</body>';
      }
    }

    // Handle messages from webview
    panel.webview.onDidReceiveMessage(
      async (message: { command: string; args: unknown[] }) => {
        if (message.command === 'openFile') {
          // node IDs are relative paths — reconstruct the URI using the
          // workspace folder's scheme and authority so virtual filesystems work.
          const relFilePath = message.args[0] as string;
          try {
            const fileUri = workspaceFolderUri
              ? vscode.Uri.joinPath(workspaceFolderUri, relFilePath)
              : vscode.Uri.file(relFilePath);
            const doc = await vscode.workspace.openTextDocument(fileUri);
            await vscode.window.showTextDocument(doc, {
              preview: false,
              viewColumn: vscode.ViewColumn.One,
            });
          } catch {
            vscode.window.showErrorMessage(
              `Could not open file: ${relFilePath}`,
            );
          }
        } else if (message.command === 'saveSetting') {
          const { key, value } = message.args[0] as {
            key: string;
            value: unknown;
          };
          await GraphViewProvider.extensionContext.globalState.update(
            `graphView${key.charAt(0).toUpperCase()}${key.slice(1)}`,
            value,
          );
        } else if (message.command === 'graphViewReady') {
          // Webview finished loading — send graph data
          await GraphViewProvider.refreshGraphData(uri);
        }
      },
      null,
      context.subscriptions,
    );

    panel.onDidDispose(
      () => {
        GraphViewProvider.graphViewPanel = undefined;
        GraphViewProvider.currentHash = undefined;
      },
      null,
      context.subscriptions,
    );
  }

  /**
   * Refresh the graph data in the open panel.
   * Skips the refresh if the graph content has not changed (hash comparison).
   * @param forceRefresh - When true, rebuilds all note relations (e.g. after a save).
   *                       When false (default), only loads notes if not yet loaded.
   */
  public static async refreshGraphData(
    sourceUri?: vscode.Uri,
    forceRefresh = false,
  ) {
    const panel = GraphViewProvider.graphViewPanel;
    if (!panel) return;

    const uri = sourceUri ?? vscode.window.activeTextEditor?.document.uri;
    if (!uri) return;

    try {
      const notebook =
        await GraphViewProvider.notebooksManager.getNotebook(uri);

      // Ensure the reference map is populated before building the graph
      if (forceRefresh) {
        // Incremental refresh: walk + stat, only re-process files
        // whose on-disk mtime is newer than the stamped value.  On a
        // warm cache (watcher kept us in sync) this is mostly the
        // walk cost; on a cold cache it does the same work as the
        // full `refreshNotes`.
        await notebook.refreshNotesIncremental({
          dir: '.',
          includeSubdirectories: true,
        });
      } else {
        await notebook.refreshNotesIfNotLoaded({
          dir: '.',
          includeSubdirectories: true,
        });
      }

      const graphData: GraphViewData = constructGraphView(notebook);

      if (graphData.hash === GraphViewProvider.currentHash) return;
      GraphViewProvider.currentHash = graphData.hash;

      // Node IDs in graphData are relative paths; compute activeFilePath
      // using URI path components (not fsPath) so virtual filesystems work.
      const workspaceFolderUri = getWorkspaceFolderUri(uri);
      const relativeActiveFilePath = path.relative(
        workspaceFolderUri.path,
        uri.path,
      );

      await panel.webview.postMessage({
        command: 'graphData',
        data: graphData,
        activeFilePath: relativeActiveFilePath,
        viewMode: GraphViewProvider.getViewMode(),
        colorByFolder: GraphViewProvider.getColorByFolder(),
      });
    } catch (error) {
      console.error('GraphViewProvider: failed to build graph data', error);
    }
  }

  /**
   * Notify the graph view which file is currently active
   * so it can highlight the corresponding node.
   */
  public static async sendActiveFile(uri: vscode.Uri) {
    const panel = GraphViewProvider.graphViewPanel;
    if (!panel) return;
    try {
      const workspaceFolderUri = getWorkspaceFolderUri(uri);
      const relativeFilePath = path.relative(workspaceFolderUri.path, uri.path);
      await panel.webview.postMessage({
        command: 'setActiveFile',
        filePath: relativeFilePath,
      });
    } catch {
      // Ignore errors when notebook is not available
    }
  }
}
