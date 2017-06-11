import * as vscode from 'vscode'
import * as path from 'path'
import {Uri, CancellationToken, Event, ProviderResult} from 'vscode'

// http://www.typescriptlang.org/play/
// https://github.com/Microsoft/vscode/blob/master/extensions/markdown/media/main.js
// https://github.com/Microsoft/vscode/tree/master/extensions/markdown/src
// https://github.com/tomoki1207/gfm-preview/blob/master/src/gfmProvider.ts
// https://github.com/cbreeden/vscode-markdownit
export class MarkdownPreviewEnhancedView implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<Uri>()
  private _waiting:boolean = false

  public constructor(private context: vscode.ExtensionContext) {
  }

  /**
   * 
   * @param mediaFile 
   * @return path.resolve(this.context.extensionPath, `media/${mediaFile}`)
   */
  private getMediaPath(mediaFile: string): string {
    return vscode.Uri.file(this.context.asAbsolutePath(path.join('media', mediaFile))).toString();
  }

  public provideTextDocumentContent(uri: Uri, token: CancellationToken)
  : Thenable<string> {
		const sourceUri = vscode.Uri.parse(uri.query);

    return vscode.workspace.openTextDocument(sourceUri).then(document => {
      const text = document.getText()
      return `<!DOCTYPE html>
				<html>
				<head>
					<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
					<meta id="vscode-markdown-preview-data" >
					<script src="${this.getMediaPath('main.js')}"></script>
					<base href="${document.uri.toString(true)}">
				</head>
				<body class="markdown-preview-enhanced">
          ${text}
				</body>
				</html>`;
    })
  }

  get onDidChange(): Event<Uri> {
    return this._onDidChange.event
  }

  public update(uri: Uri) {
		if (!this._waiting) {
			this._waiting = true;
			setTimeout(() => {
				this._waiting = false;
				this._onDidChange.fire(uri);
			}, 300);
		}
  }

  public dispose() {
    console.log('dispose markdown-preview-enhanced-view')
  }
}

export function getMarkdownUri(uri: vscode.Uri) {
	if (uri.scheme === 'markdown-preview-enhanced') {
		return uri;
	}

	return uri.with({
		scheme: 'markdown-preview-enhanced',
		path: uri.path + '.rendered',
		query: uri.toString()
	});
}


export function isMarkdownFile(document: vscode.TextDocument) {
	return document.languageId === 'markdown'
		&& document.uri.scheme !== 'markdown-preview-enhanced'; // prevent processing of own documents
}