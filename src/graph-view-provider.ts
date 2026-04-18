import { constructGraphView, GraphViewData } from 'crossnote';
import * as path from 'path';
import * as vscode from 'vscode';
import NotebooksManager from './notebooks-manager';

export class GraphViewProvider {
  static notebooksManager: NotebooksManager;

  private static graphViewPanel: vscode.WebviewPanel | undefined;
  private static currentHash: string | undefined;

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

    let notebookRootPath: string | undefined;

    if (uri) {
      try {
        const notebook =
          await GraphViewProvider.notebooksManager.getNotebook(uri);
        notebookRootPath = notebook.notebookPath.fsPath;
        const engine = notebook.getNoteMarkdownEngine(uri.fsPath);
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
          // node IDs are relative paths — resolve against notebook root
          const relFilePath = message.args[0] as string;
          const absFilePath = notebookRootPath
            ? path.resolve(notebookRootPath, relFilePath)
            : relFilePath;
          try {
            const fileUri = vscode.Uri.file(absFilePath);
            const doc = await vscode.workspace.openTextDocument(fileUri);
            await vscode.window.showTextDocument(doc, {
              preview: false,
              viewColumn: vscode.ViewColumn.One,
            });
          } catch {
            vscode.window.showErrorMessage(
              `Could not open file: ${absFilePath}`,
            );
          }
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
        await notebook.refreshNotes({
          dir: '.',
          includeSubdirectories: true,
          refreshRelations: true,
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

      // Node IDs in graphData are relative paths; send activeFilePath as relative too
      const relativeActiveFilePath = uri
        ? path.relative(notebook.notebookPath.fsPath, uri.fsPath)
        : undefined;

      await panel.webview.postMessage({
        command: 'graphData',
        data: graphData,
        activeFilePath: relativeActiveFilePath,
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
      const notebook =
        await GraphViewProvider.notebooksManager.getNotebook(uri);
      const relativeFilePath = path.relative(
        notebook.notebookPath.fsPath,
        uri.fsPath,
      );
      await panel.webview.postMessage({
        command: 'setActiveFile',
        filePath: relativeFilePath,
      });
    } catch {
      // Ignore errors when notebook is not available
    }
  }
}
