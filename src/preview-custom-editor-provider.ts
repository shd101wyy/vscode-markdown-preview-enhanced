import * as vscode from 'vscode';
import { PreviewProvider } from './preview-provider';

export class PreviewCustomEditorProvider
  implements vscode.CustomTextEditorProvider
{
  constructor(private context: vscode.ExtensionContext) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    try {
      const provider = await PreviewProvider.getPreviewContentProvider(
        document.uri,
        this.context,
      );
      return await provider.initPreview({
        sourceUri: document.uri,
        document,
        // HACK: The `viewOptions` below will not actually be used.
        viewOptions: {
          viewColumn: webviewPanel.viewColumn ?? vscode.ViewColumn.One,
          preserveFocus: true,
        },
        webviewPanel,
        // The panel is managed by VS Code and pinned to this document — it
        // must not be reused as (or redirected to) the shared single-preview
        // panel, so each custom editor tab renders its own document
        // (vscode-mpe#2433).
        isCustomEditor: true,
      });
    } catch (error) {
      console.error(error);
      vscode.window.showErrorMessage(String(error));
    }
  }
}
