// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode'
import * as path from 'path'
import {MarkdownPreviewEnhancedView, getPreviewUri, isMarkdownFile, useSinglePreview} from './markdown-preview-enhanced-view'

// this method is called when your extension iopenTextDocuments activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

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


		/*
		if (contentProvider.isPreviewOn(vscode.window.activeTextEditor)) {
			// return vscode.commands.executeCommand('workbench.action.closeActiveEditor', markdownURI)
		} else {

		}
		*/
		const previewUri = getPreviewUri(resource)
		return vscode.commands.executeCommand(
			'vscode.previewHtml', 
			previewUri, 
			vscode.ViewColumn.Two, 
			useSinglePreview() ? 'MPE Preview' : `Preview '${path.basename(resource.fsPath)}'`)
		.then((success)=> {
			// contentProvider.update(previewUri)
			// the line above is changed to webviewFinishLoading function.
		}, (reason)=> {
			vscode.window.showErrorMessage(reason)
		})
	}

	function webviewFinishLoading(sourceUri) {
		sourceUri = vscode.Uri.parse(sourceUri)
		contentProvider.initMarkdownEngine(sourceUri)
		contentProvider.update(sourceUri)
	}

	function openInBrowser(uri) {
		const sourceUri = vscode.Uri.parse(decodeURIComponent(uri));
		contentProvider.openInBrowser(sourceUri)
	}

	function saveAsHTML(uri) {
		const sourceUri = vscode.Uri.parse(decodeURIComponent(uri));
		contentProvider.saveAsHTML(sourceUri)
	}

	function princeExport(uri) {
		const sourceUri = vscode.Uri.parse(decodeURIComponent(uri));
		contentProvider.princeExport(sourceUri)
	}

	function cacheSVG(uri, code, svg) {
		const sourceUri = vscode.Uri.parse(decodeURIComponent(uri));
		contentProvider.cacheSVG(sourceUri, code, svg)
	}

	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
		if (isMarkdownFile(document)) {
			contentProvider.update(document.uri);
		}
	}))

	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
		if (isMarkdownFile(event.document)) {
			contentProvider.update(event.document.uri);
		}
	}))

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
		contentProvider.updateConfiguration();
	}))

  context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(event => {
		if (isMarkdownFile(event.textEditor.document)) {
			const previewUri = getPreviewUri(event.textEditor.document.uri);
			// logger.log('updatePreviewForSelection', { markdownFile: markdownFile.toString() });
      // console.log('onDidChangeTextEditorSelection', markdownFile)
      vscode.commands.executeCommand('_workbench.htmlPreview.postMessage',
        previewUri,
        {
          type: 'change-text-editor-selection',
          line: event.selections[0].active.line
        })
      }
	}))

	/**
	 * Open preview automatically if the `automaticallyShowPreviewOfMarkdownBeingEdited` is on.  
	 * @param textEditor 
	 */
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((textEditor)=> {
		if (textEditor && textEditor.document && textEditor.document.uri) {
			// console.log('onDidChangeActiveTextEditor', textEditor.document.uri)
			if (isMarkdownFile(textEditor.document)) {
				const sourceUri = textEditor.document.uri
				/**
				 * Is using single preview and the preview is on.
				 * When we switched text editor, update preview to that text editor.
				 */
				if (useSinglePreview() && contentProvider.isPreviewOn(sourceUri)) { 
					contentProvider.initMarkdownEngine(sourceUri)
					contentProvider.updateMarkdown(sourceUri)
				}
			}
		} else {
			// console.log('onDidChangeActiveTextEditor', ' preview', textEditor)
		}
	}))

	context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(textDocument=> {
		// console.log('onDidCloseTextDocument', textDocument.uri)
		if (textDocument && textDocument.uri.scheme === 'markdown-preview-enhanced') {
			contentProvider.destroyEngine(textDocument.uri)
		}
	}))

	/*
	context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((textDocument)=> {
		// console.log('onDidOpenTextDocument', textDocument.uri)
	}))
	*/


	/*
	function openPreviewAutomatically(textEditor:vscode.TextEditor) {
		if (!textEditor) return 

		if (isMarkdownFile(textEditor.document)) {
			const automaticallyShowPreviewOfMarkdownBeingEdited = vscode.workspace.getConfiguration('markdown-preview-enhanced')
																														.get<boolean>("automaticallyShowPreviewOfMarkdownBeingEdited")

			if (!automaticallyShowPreviewOfMarkdownBeingEdited) return

			const previewUri = getMarkdownUri(textEditor.document.uri);
			return vscode.commands.executeCommand(
				'vscode.previewHtml', 
				previewUri, 
				vscode.ViewColumn.Two, 
				`Preview '${path.basename(textEditor.document.uri.fsPath)}'`)
			.then((success)=> {
			}, (reason)=> {
				vscode.window.showErrorMessage(reason)
			})
    }
	}
	
	openPreviewAutomatically(vscode.window.activeTextEditor) // first time 
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((textEditor)=> {
		openPreviewAutomatically(textEditor)
	}))

	
	context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(textEditors=> {
		// console.log('onDidChangeonDidChangeVisibleTextEditors ', textEditors)
	}))
	*/

  context.subscriptions.push(vscode.commands.registerCommand('markdown-preview-enhanced.openPreview', openPreview))

  context.subscriptions.push(vscode.commands.registerCommand('_markdown-preview-enhanced.revealLine', revealLine))

	context.subscriptions.push(vscode.commands.registerCommand('_markdown-preview-enhanced.openInBrowser', openInBrowser))

	context.subscriptions.push(vscode.commands.registerCommand('_markdown-preview-enhanced.saveAsHTML', saveAsHTML))

	context.subscriptions.push(vscode.commands.registerCommand('_markdown-preview-enhanced.princeExport', princeExport))


	context.subscriptions.push(vscode.commands.registerCommand('_markdown-preview-enhanced.webviewFinishLoading', webviewFinishLoading))

  context.subscriptions.push(vscode.commands.registerCommand('_markdown-preview-enhanced.cacheSVG', cacheSVG))

  context.subscriptions.push(contentProviderRegistration)
}


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
export function deactivate() {
}
