import * as vscode from 'vscode'
import * as path from 'path'
import {Uri, CancellationToken, Event, ProviderResult, TextEditor} from 'vscode'

import {MarkdownEngine} from './markdown-engine'
import {MarkdownPreviewEnhancedConfig} from './config'
import {escapeString} from './utility'

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

  private getScripts(isForPreview:boolean) {
    let scripts = ""

    // mermaid
    scripts += `<script src="file://${path.resolve(this.context.extensionPath, `./dependencies/mermaid/mermaid.min.js`)}"></script>`
    
    // math 
    if (this.config.mathRenderingOption === 'MathJax') {
      const mathJaxConfig = {
        extensions: ['tex2jax.js'],
        jax: ['input/TeX','output/HTML-CSS'],
        showMathMenu: false,
        messageStyle: 'none',

        tex2jax: {
          inlineMath: this.config.mathInlineDelimiters,
          displayMath: this.config.mathBlockDelimiters,
          processEnvironments: false,
          processEscapes: true,
          preview: "none"
        },
        TeX: {
          extensions: ['AMSmath.js', 'AMSsymbols.js', 'noErrors.js', 'noUndefined.js']
        },
        'HTML-CSS': { availableFonts: ['TeX'] },
        skipStartupTypeset: true
      }

      scripts += `<script type="text/javascript" async src="file://${path.resolve(this.context.extensionPath, './dependencies/mathjax/MathJax.js')}"></script>`
      scripts += `<script type="text/x-mathjax-config"> MathJax.Hub.Config(${JSON.stringify(mathJaxConfig)}); </script>`
    }

    if  (isForPreview) {
      // jquery 
      scripts += `<script type="text/javascript" src="file://${path.resolve(this.context.extensionPath, './dependencies/jquery/jquery.js')}"></script>`
    
      // jquery contextmenu
      scripts += `<script type="text/javascript" src="file://${path.resolve(this.context.extensionPath, './dependencies/jquery-contextmenu/jquery.ui.position.min.js')}"></script>`
      scripts += `<script type="text/javascript" src="file://${path.resolve(this.context.extensionPath, './dependencies/jquery-contextmenu/jquery.contextMenu.min.js')}"></script>`

      // crpto-js
      scripts += `<script type="text/javascript" src="file://${path.resolve(this.context.extensionPath, './dependencies/crypto-js/crypto-js.js')}"></script>`
    }
    
    return scripts
  }

  /**
   * @param isForPreview: whether to getStyles for rendering preview.  
   * @return a string of <link ...> that links to css files
   */
  private getStyles(isForPreview:boolean) {
    let styles = `<link rel="stylesheet" media="screen" href="${path.resolve(this.context.extensionPath, './styles/style-template.css')}">`

    // check math 
    if (this.config.mathRenderingOption === "KaTeX") {
      styles += `<link rel="stylesheet" href="file://${path.resolve(this.context.extensionPath, './dependencies/katex/katex.min.css')}">`
    }

    // check mermaid 
    styles += `<link rel="stylesheet" href="file://${path.resolve(this.context.extensionPath, `./dependencies/mermaid/${this.config.mermaidTheme}`)}">`

    // check prism 
    styles += `<link rel="stylesheet" href="file://${path.resolve(this.context.extensionPath, `./dependencies/prism/themes/${this.config.codeBlockTheme}`)}">`

    // check preview theme 
    styles += `<link rel="stylesheet" href="file://${path.resolve(this.context.extensionPath, `./styles/${this.config.previewTheme}`)}">`

    if (isForPreview) {
      // preview.css 
      styles += `<link rel="stylesheet" href="file://${path.resolve(this.context.extensionPath, './styles/preview.css')}">`

      // loading.css 
      styles += `<link rel="stylesheet" href="file://${path.resolve(this.context.extensionPath, './styles/loading.css')}">`
    
      // jquery-contextmenu
      styles += `<link rel="stylesheet" href="file://${path.resolve(this.context.extensionPath, `./dependencies/jquery-contextmenu/jquery.contextMenu.min.css`)}">`
    }

    return styles  
  }

  public provideTextDocumentContent(uri: Uri)
  : Thenable<string> {
		const sourceUri = vscode.Uri.parse(uri.query)
    // console.log(sourceUri, uri, vscode.workspace.rootPath)

		let initialLine: number | undefined = undefined;
		const editor = vscode.window.activeTextEditor;
		if (editor && editor.document.uri.fsPath === sourceUri.fsPath) {
			initialLine = editor.selection.active.line;
		}

    return vscode.workspace.openTextDocument(sourceUri).then(document => {
      const text = document.getText()

      const settings = {
        fsPath: sourceUri.fsPath
      }

      /**
       * Initialize MarkdownEngine for this markdown file
       */
      let engine = this.engineMaps[sourceUri.fsPath]
      let html
      if (!engine) {
        engine = new MarkdownEngine(
          {
            filePath: sourceUri.fsPath,
            projectDirectoryPath: vscode.workspace.rootPath,
            config: this.config
          })
        this.engineMaps[sourceUri.fsPath] = engine

        html = '<div class="markdown-spinner"> Loading Markdown\u2026 </div>'
      } else { // engine already initialized
        html = engine.getCachedHTML()
      }

      const config = Object.assign({}, this.config, {
				previewUri: uri.toString(),
				sourceUri: sourceUri.toString(),
        initialLine: initialLine
      })

      return `<!DOCTYPE html>
      <html>
      <head>
        <meta http-equiv="Content-type" content="text/html;charset=UTF-8">
        <meta id="vscode-markdown-preview-enhanced-data" data-config="${escapeString(JSON.stringify(config))}">
        <meta charset="UTF-8">
        ${this.getStyles(true)}
        ${this.getScripts(true)}
        <base href="${document.uri.toString(true)}">
      </head>
      <body class="markdown-preview-enhanced-container">
        <div class="markdown-preview-enhanced" for="preview">
          ${html}
        </div>
        <div class="refreshing-icon"></div>
        <div class="mpe-toolbar">
          <div class="back-to-top-btn btn"><span>⬆︎</span></div>
          <div class="refresh-btn btn"><span>⟳︎</span></div>
          <div class="sidebar-toc-btn btn"><span>≡</span></div>
        </div>
        <span class="contextmenu">
        </span>
      </body>
      <script src="${path.resolve(this.context.extensionPath, './out/src/markdown-preview-enhanced-webview.js')}"></script>
      </html>`
    })
  }

  public updateMarkdown(uri:Uri) {
    const sourceUri = vscode.Uri.parse(uri.query)
    const engine = this.engineMaps[sourceUri.fsPath]
    if (!engine) return 

    vscode.workspace.openTextDocument(sourceUri).then(document => {
      const text = document.getText()
      engine.parseMD(text, {isForPreview: true, useRelativeImagePath: false, hideFrontMatter: false}).then(({markdown, html, tocHTML})=> {
        vscode.commands.executeCommand(
          '_workbench.htmlPreview.postMessage',
          uri,
          {
            type: 'update-html',
            html: html,
            tocHTML: tocHTML,
            totalLineCount: document.lineCount
          })
      })
    })
  }

  public openInBrowser(sourceUri: Uri) {
    const fsPath = sourceUri.fsPath
    const engine = this.engineMaps[fsPath]
    if (engine) {
      engine.openInBrowser()
    }
  }

  public cacheSVG(sourceUri: Uri, code:string, svg:string) {
    const fsPath = sourceUri.fsPath
    const engine = this.engineMaps[fsPath]
    if (engine) {
      engine.cacheSVG(code, svg)
    }
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
				// this._onDidChange.fire(uri);
        this.updateMarkdown(uri)
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
					// this.update(document.uri);
          this._onDidChange.fire(document.uri)
				}
			})
    }
  }

  /**
   * check if the markdown preview is on for the textEditor
   * @param textEditor 
   */
  public isPreviewOn(textEditor:TextEditor) {
    const fsPath = textEditor.document.fileName
    return (fsPath in this.engineMaps)
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