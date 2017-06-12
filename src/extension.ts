// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode'
import * as path from 'path'
import {MarkdownPreviewEnhancedView, getMarkdownUri, isMarkdownFile} from './markdown-preview-enhanced-view'


// this method is called when your extension iopenTextDocuments activated
// your extension is activated the very first time the command is executed
function activate(context: vscode.ExtensionContext) {

  // assume only one preview supported.  
  const extensionPath = context.extensionPath

  const contentProvider = new MarkdownPreviewEnhancedView(context);
  const contentProviderRegistration = vscode.workspace.registerTextDocumentContentProvider('markdown-preview-enhanced', contentProvider);

	function openPreview(uri?: vscode.Uri) {
		let resource = uri;
		if (!(resource instanceof vscode.Uri)) {
			if (vscode.window.activeTextEditor) {
				// we are relaxed and don't check for markdown files
				resource = vscode.window.activeTextEditor.document.uri;
			}
		}

		/*
		if (!(resource instanceof vscode.Uri)) {
			if (!vscode.window.activeTextEditor) {
				// this is most likely toggling the preview
				return vscode.commands.executeCommand('markdown.showSource');
			}
			// nothing found that could be shown or toggled
			return;
		}
		*/


		vscode.window.activeTextEditor.hide

		const markdownURI = getMarkdownUri(resource)
		if (contentProvider.isPreviewOn(vscode.window.activeTextEditor)) {
			// return vscode.commands.executeCommand('workbench.action.closeActiveEditor', markdownURI)
		} else {
			return vscode.commands.executeCommand(
				'vscode.previewHtml', 
				markdownURI, 
				vscode.ViewColumn.Two, 
				`Preview '${path.basename(resource.fsPath)}'`)
			.then((success)=> {
				contentProvider.update(markdownURI)
			}, (reason)=> {
				vscode.window.showErrorMessage(reason)
			})
		}
	}


	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
		if (isMarkdownFile(document)) {
			const uri = getMarkdownUri(document.uri);
			contentProvider.update(uri);
		}
	}))

	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
		if (isMarkdownFile(event.document)) {
			const uri = getMarkdownUri(event.document.uri);
			contentProvider.update(uri);
		}
	}))

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
		contentProvider.updateConfiguration();
	}))

  context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(event => {
		if (isMarkdownFile(event.textEditor.document)) {
			const markdownFile = getMarkdownUri(event.textEditor.document.uri);
			// logger.log('updatePreviewForSelection', { markdownFile: markdownFile.toString() });
      // console.log('onDidChangeTextEditorSelection', markdownFile)
      vscode.commands.executeCommand('_workbench.htmlPreview.postMessage',
        markdownFile,
        {
          type: 'change-text-editor-selection',
          line: event.selections[0].active.line
        })
      }
	}))

	context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(textEditors=> {
		// console.log('onDidChangeonDidChangeVisibleTextEditors ', textEditors)
	}))

  context.subscriptions.push(vscode.commands.registerCommand('markdown-preview-enhanced.open-preview', openPreview))

  context.subscriptions.push(vscode.commands.registerCommand('_markdown-preview-enhanced.revealLine', revealLine))

  context.subscriptions.push(contentProviderRegistration)
}
exports.activate = activate;


function revealLine(uri, line) {
	// console.log('revealLine: ' + uri + ' ' + line)
	const sourceUri = vscode.Uri.parse(decodeURIComponent(uri));

	vscode.window.visibleTextEditors
		.filter(editor => isMarkdownFile(editor.document) && editor.document.uri.fsPath === sourceUri.fsPath)
		.forEach(editor => {
			const sourceLine = Math.floor(line);
			const fraction = line - sourceLine;
			const text = editor.document.lineAt(sourceLine).text;
			const start = Math.floor(fraction * text.length);
			editor.revealRange(
				new vscode.Range(sourceLine, start, sourceLine + 1, 0),
				vscode.TextEditorRevealType.InCenter);
		})

}

// this method is called when your extension is deactivated
function deactivate() {
}
exports.deactivate = deactivate;