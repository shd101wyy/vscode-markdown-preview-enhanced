import * as vscode from 'vscode'
import * as path from 'path'
import {Uri, CancellationToken, Event, ProviderResult} from 'vscode'

import {MarkdownEngine} from './markdown-engine'
import {MarkdownPreviewEnhancedConfig} from './config'

// http://www.typescriptlang.org/play/
// https://github.com/Microsoft/vscode/blob/master/extensions/markdown/media/main.js
// https://github.com/Microsoft/vscode/tree/master/extensions/markdown/src
// https://github.com/tomoki1207/gfm-preview/blob/master/src/gfmProvider.ts
// https://github.com/cbreeden/vscode-markdownit
export class MarkdownPreviewEnhancedView implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<Uri>()
  private _waiting:boolean = false

  /**
   * The key is markdown file fsPath
   * value is MarkdownEngine
   */
  private engineMaps:{[key:string]: MarkdownEngine} = {} 

  /**
   * key is markdown file path
   * value is html generated from markdown file 
   */
  // private htmlMaps:{[key:string]: string} = {}


  private config:MarkdownPreviewEnhancedConfig

  public constructor(private context: vscode.ExtensionContext) {
    this.config = MarkdownPreviewEnhancedConfig.getCurrentConfig()
  }

  /**
   * 
   * @param mediaFile 
   * @return path.resolve(this.context.extensionPath, `media/${mediaFile}`)
   */
  private getMediaPath(mediaFile: string): string {
    return vscode.Uri.file(this.context.asAbsolutePath(path.join('media', mediaFile))).toString();
  }

  private getScripts() {
    let scripts = ""
  }

  /**
   * @return a string of <link ...> that links to css files
   */
  private getStyles() {
    let styles = ""

    // check math 
    if (this.config.mathRenderingOption === "KaTeX") {
      styles += `<link rel="stylesheet" href="file:///${path.resolve(this.context.extensionPath, './node_modules/katex/dist/katex.min.css')}">`
    }

    // check mermaid 
    styles += `<link rel="stylesheet" href="file:///${path.resolve(this.context.extensionPath, `./dependencies/mermaid/${this.config.mermaidTheme}`)}">`
    return styles  
  }

  public getHTMLTemplate(html) {
    /* data-settings="${JSON.stringify(settings).replace(/"/g, '&quot;')}" */

    return `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-type" content="text/html;charset=UTF-8">
  <meta id="vscode-markdown-preview-enhanced-data">
  <meta charset="UTF-8">
  <link rel="stylesheet" media="screen" href="${path.resolve(this.context.extensionPath, './styles/style-template.css')}">
  ${this.getStyles()}

  <script src="${path.resolve(this.context.extensionPath, `./dependencies/mermaid/mermaid.min.js`)}"></script>

</head>
<body class="markdown-preview-enhanced-container">
  <div class="markdown-preview-enhanced" for="preview">
  ${html}
  </div>
</body>
<script src="${path.resolve(this.context.extensionPath, './out/src/markdown-preview-enhanced-webview.js')}"></script>
</html>`
  }

  public provideTextDocumentContent(uri: Uri)
  : Thenable<string> {
		const sourceUri = vscode.Uri.parse(uri.query)
    // console.log(sourceUri, uri, vscode.workspace.rootPath)

    return vscode.workspace.openTextDocument(sourceUri).then(document => {
      const text = document.getText()

      const settings = {
        fsPath: sourceUri.fsPath
      }

      let engine = this.engineMaps[sourceUri.fsPath]
      if (!engine) {
        engine = new MarkdownEngine(
          {
            fileDirectoryPath: sourceUri.fsPath,
            projectDirectoryPath: vscode.workspace.rootPath,
            config: this.config
          })
        this.engineMaps[sourceUri.fsPath] = engine
      }

      return engine.parseMD(text, {}).then(({markdown, html})=> {
        html = this.getHTMLTemplate(html)
        // this.htmlMaps[sourceUri.fsPath] = html
        return html
      })
    })
  }

  get onDidChange(): Event<Uri> {
    return this._onDidChange.event
  }

  public update(uri: Uri) {
    // console.log('update')
		if (!this._waiting) {
			this._waiting = true;
			setTimeout(() => {
				this._waiting = false;
				this._onDidChange.fire(uri);
			}, 300);
		}
  }

  public updateConfiguration() {
    const newConfig = MarkdownPreviewEnhancedConfig.getCurrentConfig()
    if (!this.config.isEqualTo(newConfig)) {
      this.config = newConfig

      for (let fsPath in this.engineMaps) {
        const engine = this.engineMaps[fsPath]
        engine.updateConfiguration(newConfig)
      }

      // update all generated md documents
			vscode.workspace.textDocuments.forEach(document => {
				if (document.uri.scheme === 'markdown-preview-enhanced') {
					this.update(document.uri);
				}
			})
    }
  }
}

export function getMarkdownUri(uri: vscode.Uri) {
	if (uri.scheme === 'markdown-preview-enhanced') {
		return uri
	}

	return uri.with({
		scheme: 'markdown-preview-enhanced',
		path: uri.path + '.rendered',
		query: uri.toString()
	});
}


export function isMarkdownFile(document: vscode.TextDocument) {
	return document.languageId === 'markdown'
		&& document.uri.scheme !== 'markdown-preview-enhanced' // prevent processing of own documents
}