import * as vscode from "vscode"

export class MarkdownPreviewEnhancedConfig {
  public static getCurrentConfig() {
    return new MarkdownPreviewEnhancedConfig()
  }

  public readonly breakOnSingleNewLine: boolean
  public readonly enableTypographer: boolean
  public readonly enableWikiLinkSyntax: boolean
  public readonly wikiLinkFileExtension: string
  public readonly frontMatterRenderingOption:string
  public readonly scrollSync: boolean
  public readonly mermaidTheme: string
  /**
   * "KaTeX", "MathJax", or "None"
   */
  public readonly mathRenderingOption: string
  public readonly mathInlineDelimiters: Array<string[]>
  public readonly mathBlockDelimiters: Array<string[]>

  /**
   * Themes
   */
  public readonly codeBlockTheme: string
  public readonly previewTheme: string

  public readonly protocolsWhiteList: string

  /**
   * image helper
   */
  public readonly imageFolderPath: string
  public readonly imageUploader: string

  private constructor() {
    const config = vscode.workspace.getConfiguration('markdown-preview-enhanced')

    this.breakOnSingleNewLine = config.get<boolean>('breakOnSingleNewLine')
    this.enableTypographer = config.get<boolean>('enableTypographer')
    this.enableWikiLinkSyntax = config.get<boolean>('enableWikiLinkSyntax')
    this.wikiLinkFileExtension = config.get<string>('wikiLinkFileExtension')
    this.frontMatterRenderingOption = config.get<string>('frontMatterRenderingOption')
    this.scrollSync = config.get<boolean>('scrollSync')
    this.mermaidTheme = config.get<string>('mermaidTheme')
    this.mathRenderingOption = config.get<string>('mathRenderingOption')
    this.mathInlineDelimiters = config.get<Array<string[]>>('mathInlineDelimiters')
    this.mathBlockDelimiters = config.get<Array<string[]>>('mathBlockDelimiters')
    this.codeBlockTheme = config.get<string>('codeBlockTheme')
    this.previewTheme = config.get<string>('previewTheme')
    this.protocolsWhiteList = config.get<string>('protocolsWhiteList')
    this.imageFolderPath = config.get<string>('imageFolderPath')
    this.imageUploader = config.get<string>('imageUploader')
  }

  public isEqualTo(otherConfig: MarkdownPreviewEnhancedConfig) {
    const json1 = JSON.stringify(this)
    const json2 = JSON.stringify(otherConfig)
    return json1 === json2

    // this is not good because sometimes this[key] is of array type 
    /*
    for (let key in this) {
      if (this.hasOwnProperty(key)) {
        if (this[key] !== otherConfig[key]) {
          return false
        }
      }
    }
    */
  }

  [key: string]: any
}
