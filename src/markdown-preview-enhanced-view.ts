import * as vscode from 'vscode'
import {Uri, CancellationToken, Event, ProviderResult} from 'vscode'


// http://www.typescriptlang.org/play/
// https://github.com/Microsoft/vscode/blob/master/extensions/markdown/media/main.js
// https://github.com/Microsoft/vscode/tree/master/extensions/markdown/src
// https://github.com/tomoki1207/gfm-preview/blob/master/src/gfmProvider.ts
// https://github.com/cbreeden/vscode-markdownit
export class MarkdownPreviewEnhancedView implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<Uri>()
  private _waiting:boolean = false

  public constructor(private _context: vscode.ExtensionContext) {
  }

  public provideTextDocumentContent(uri: Uri, token: CancellationToken)
  : string {
    console.log('provideTextDocumentContent')
    const editor = vscode.window.activeTextEditor;
    if (editor.document.languageId !== 'markdown') {
        return "Active editor doesn't show a CSS document - no properties to preview.";
    }
    
    const text = editor.document.getText();
    return `<div class="markdown-preview-enhanced">${text}</div>`
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