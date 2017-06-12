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

  context.subscriptions.push(vscode.commands.registerCommand('markdown-preview-enhanced.toggle', togglePreview))

  context.subscriptions.push(vscode.commands.registerCommand('_markdown-preview-enhanced.revealLine', revealLine))

  context.subscriptions.push(contentProviderRegistration)
}
exports.activate = activate;

function togglePreview(uri?: vscode.Uri) {
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

  return vscode.commands.executeCommand(
    'vscode.previewHtml', 
    getMarkdownUri(resource), 
    vscode.ViewColumn.Two, 
    `Preview '${path.basename(resource.fsPath)}'`)
  .then((success)=> {
    console.log('done opening: ' + getMarkdownUri(resource).toString())

    // vscode.commands.executeCommand('_workbench.htmlPreview.postMessage', resource, )

  }, (reason)=> {
    vscode.window.showErrorMessage(reason)
  })
}


function revealLine(fsPath) {
  // console.log('revealLine: ' + fsPath)
}

// this method is called when your extension is deactivated
function deactivate() {
}
exports.deactivate = deactivate;