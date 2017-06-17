import * as vscode from 'vscode'
import * as path from 'path'
import {Uri, CancellationToken, Event, ProviderResult, TextEditor} from 'vscode'

import {MarkdownEngine} from './markdown-engine'
import {MarkdownPreviewEnhancedConfig} from './config'
import * as utility from './utility'

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
   * return markdown engine of sourceUri
   * @param sourceUri 
   */
  public getEngine(sourceUri:Uri):MarkdownEngine {
    return this.engineMaps[sourceUri.fsPath]
  }

  /**
   * check if the markdown preview is on for the textEditor
   * @param textEditor 
   */
  public isPreviewOn(sourceUri:Uri) {
    if (useSinglePreview()) {
      return Object.keys(this.engineMaps).length >= 1
    }
    return this.getEngine(sourceUri)
  }

  /**
   * remove engine from this.engineMaps
   * @param previewUri 
   */
  public destroyEngine(previewUri: Uri) {
    if (useSinglePreview()) {
      return this.engineMaps = {}
    }
    const sourceUri = vscode.Uri.parse(previewUri.query)
    const engine = this.getEngine(sourceUri)
    if (engine) {
      // console.log('engine destroyed')
      this.engineMaps[sourceUri.fsPath] = null // destroy engine 
    }
  } 

  /**
   * Initialize MarkdownEngine for this markdown file
   */
  public initMarkdownEngine(sourceUri: Uri) {
    let engine = this.getEngine(sourceUri)
    if (!engine) {
      engine = new MarkdownEngine(
        {
          filePath: sourceUri.fsPath,
          projectDirectoryPath: vscode.workspace.rootPath,
          config: this.config
        })
      this.engineMaps[sourceUri.fsPath] = engine
    }
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

      // jquery modal 
      scripts += `<script type="text/javascript" src="file://${path.resolve(this.context.extensionPath, './dependencies/jquery-modal/jquery.modal.min.js')}"></script>`

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
    
      // jquery-modal 
      styles += `<link rel="stylesheet" href="file://${path.resolve(this.context.extensionPath, `./dependencies/jquery-modal/jquery.modal.min.css`)}">`

    }

    return styles  
  }

  public provideTextDocumentContent(previewUri: Uri)
  : Thenable<string> {
    // console.log(sourceUri, uri, vscode.workspace.rootPath)

    let sourceUri
    if (useSinglePreview()) {
      sourceUri = vscode.window.activeTextEditor.document.uri
    } else {
      sourceUri = vscode.Uri.parse(previewUri.query)
    }
    // console.log('open preview for source: ' + sourceUri.toString())

		let initialLine: number | undefined = undefined;
		const editor = vscode.window.activeTextEditor;
		if (editor && editor.document.uri.fsPath === sourceUri.fsPath) {
			initialLine = editor.selection.active.line;
		}

    return vscode.workspace.openTextDocument(sourceUri).then(document => {
      const text = document.getText()

      const config = Object.assign({}, this.config, {
				previewUri: previewUri.toString(),
				sourceUri: sourceUri.toString(),
        initialLine: initialLine
      })

      let html = '<div class="markdown-spinner"> Loading Markdown\u2026 </div>'
      const engine = this.getEngine(sourceUri)
      if (engine) {
        html = engine.getCachedHTML()
      }

      return `<!DOCTYPE html>
      <html>
      <head>
        <meta http-equiv="Content-type" content="text/html;charset=UTF-8">
        <meta id="vscode-markdown-preview-enhanced-data" data-config="${utility.escapeString(JSON.stringify(config))}">
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

        <div id="image-helper-view">
          <h4>Image Helper</h4>
          <div class="upload-div">
            <label>Link</label>
            <input type="text" class="url-editor" placeholder="enter image URL here, then press \'Enter\' to insert.">

            <div class="splitter"></div>

            <label class="copy-label">Copy image to root /assets folder</label>
            <div class="drop-area paster">
              <p class="paster"> Drop image file here or click me </p>
              <input class="file-uploader paster" type="file" style="display:none;" multiple="multiple" >
            </div>

            <div class="splitter"></div>

            <label>Upload</label>
            <div class="drop-area uploader">
              <p class="uploader">Drop image file here or click me</p>
              <input class="file-uploader uploader" type="file" style="display:none;" multiple="multiple" >
            </div>
            <div class="uploader-choice">
              <span>use</span>
              <select class="uploader-select">
                <option>imgur</option>
                <option>sm.ms</option>
              </select>
              <span> to upload images</span>
            </div>
          </div>
        </div>
      </body>
      <script src="${path.resolve(this.context.extensionPath, './out/src/markdown-preview-enhanced-webview.js')}"></script>
      </html>`
    })
  }

  public updateMarkdown(sourceUri:Uri) {
    const engine = this.getEngine(sourceUri)
    // console.log('updateMarkdown: ' + Object.keys(this.engineMaps).length)
    if (!engine) return 

    vscode.workspace.openTextDocument(sourceUri).then(document => {
      const text = document.getText()

      vscode.commands.executeCommand(
        '_workbench.htmlPreview.postMessage',
        getPreviewUri(sourceUri),
        {
          type: 'start-parsing-markdown',
        })

      engine.parseMD(text, {isForPreview: true, useRelativeImagePath: false, hideFrontMatter: false}).then(({markdown, html, tocHTML})=> {
        vscode.commands.executeCommand(
          '_workbench.htmlPreview.postMessage',
          getPreviewUri(sourceUri),
          {
            type: 'update-html',
            html: html,
            tocHTML: tocHTML,
            totalLineCount: document.lineCount,
            sourceUri: sourceUri.toString()
          })
      })
    })
  }

  public refreshPreview(sourceUri: Uri) {
    const engine = this.getEngine(sourceUri)
    if (engine) {
      engine.clearCaches()
      this.updateMarkdown(sourceUri)
    }
  }

  public openInBrowser(sourceUri: Uri) {
    const engine = this.getEngine(sourceUri)
    if (engine) {
      engine.openInBrowser()
      .catch((error)=> {
        vscode.window.showErrorMessage(error)
      })
    }
  }

  public saveAsHTML(sourceUri: Uri) {
    const engine = this.getEngine(sourceUri)
    if (engine) {
      engine.saveAsHTML()
      .then((dest)=> {
        vscode.window.showInformationMessage(`File ${path.basename(dest)} was created at path: ${dest}`)
      })
      .catch((error)=> {
        vscode.window.showErrorMessage(error)
      })
    }
  }

  public princeExport(sourceUri: Uri) {
    const engine = this.getEngine(sourceUri)
    if (engine) {
      engine.princeExport()
      .then((dest)=> {
        if (dest.endsWith('?print-pdf'))  // presentation pdf
          vscode.window.showInformationMessage(`Please copy and open the link: { ${dest.replace(/\_/g, '\\_')} } in Chrome then Print as Pdf.`)
        else 
          vscode.window.showInformationMessage(`File ${path.basename(dest)} was created at path: ${dest}`)
      })
      .catch((error)=> {
        vscode.window.showErrorMessage(error)
      })
    }
  }

  public eBookExport(sourceUri: Uri, fileType:string) {
    const engine = this.getEngine(sourceUri)
    if (engine) {
      engine.eBookExport(fileType)
      .then((dest)=> {
        vscode.window.showInformationMessage(`eBook ${path.basename(dest)} was created as path: ${dest}`)
      })
      .catch((error)=> {
        vscode.window.showErrorMessage(error)
      })
    }
  }

  public cacheSVG(sourceUri: Uri, code:string, svg:string) {
    const engine = this.getEngine(sourceUri)
    if (engine) {
      engine.cacheSVG(code, svg)
    }
  }

  public runCodeChunk(sourceUri: Uri, codeChunkId: string) {
    const engine = this.getEngine(sourceUri)
    if (engine) {
      engine.runCodeChunk(codeChunkId)
      .then(()=> {
        this.updateMarkdown(sourceUri)
      })
    }
  }

  public runAllCodeChunks(sourceUri) {
    const engine = this.getEngine(sourceUri)
    if (engine) {
      engine.runAllCodeChunks()
      .then(()=> {
        this.updateMarkdown(sourceUri)
      })
    }
  }

  get onDidChange(): Event<Uri> {
    return this._onDidChange.event
  }

  public update(sourceUri: Uri) {
    // console.log('update')
		if (!this._waiting) {
			this._waiting = true;
			setTimeout(() => {
				this._waiting = false;
				// this._onDidChange.fire(uri);
        this.updateMarkdown(sourceUri)
			}, 300)
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

  public openImageHelper(sourceUri:Uri) {
    if (sourceUri.scheme === 'markdown-preview-enhanced') {
      return vscode.window.showWarningMessage('Please focus a markdown file.')
    } else if (!this.isPreviewOn(sourceUri)) {
      return vscode.window.showWarningMessage('Please open preview first.')
    } else {
      vscode.commands.executeCommand(
        '_workbench.htmlPreview.postMessage',
        getPreviewUri(sourceUri),
        {
          type: 'open-image-helper'
        })
    }
  }

}

/**
 * check whehter to use only one preview or not
 */
export function useSinglePreview() {
  const config = vscode.workspace.getConfiguration('markdown-preview-enhanced')
  return config.get<boolean>('singlePreview')
}


export function getPreviewUri(uri: vscode.Uri) {
	if (uri.scheme === 'markdown-preview-enhanced') {
		return uri
	}

  if (useSinglePreview()) {
    return uri.with({
      scheme: 'markdown-preview-enhanced',
      path: 'single-preview.rendered' 
    })
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