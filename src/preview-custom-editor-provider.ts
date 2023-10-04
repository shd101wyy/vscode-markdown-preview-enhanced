import * as vscode from 'vscode';
import { PreviewProvider } from './preview-provider';

export class PreviewCustomEditorProvider
  implements vscode.CustomTextEditorProvider {
  constructor(private context: vscode.ExtensionContext) {}

  resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    token: vscode.CancellationToken,
  ): void | Thenable<void> {
    PreviewProvider.getPreviewContentProvider(document.uri, this.context)
      .then((provider) => {
        provider.initPreview({
          sourceUri: document.uri,
          document,
          // HACK: The `viewOptions` below will not actually be used.
          viewOptions: {
            viewColumn: webviewPanel.viewColumn ?? vscode.ViewColumn.One,
            preserveFocus: true,
          },
          webviewPanel,
        });
      })
      .catch((error) => {
        console.error(error);
        vscode.window.showErrorMessage(error.message);
      });
  }
}
