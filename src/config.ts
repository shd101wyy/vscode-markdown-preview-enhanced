import * as vscode from "vscode"

export class MarkdownPreviewEnhancedConfig {
  public static getCurrentConfig() {
    return new MarkdownPreviewEnhancedConfig()
  }

  public readonly breakOnSingleNewLine: boolean
  public readonly enableTypographer: boolean
  public readonly mermaidTheme: string
  /**
   * "KaTeX", "MathJax", or "None"
   */
  public readonly mathRenderingOption: string
  public readonly mathInlineDelimiters: Array<string[]>
  public readonly mathBlockDelimiters: Array<string[]>

  private constructor() {
    const config = vscode.workspace.getConfiguration('markdown-preview-enhanced')

    this.breakOnSingleNewLine = config.get<boolean>('breakOnSingleNewLine')
    this.enableTypographer = config.get<boolean>('enableTypographer')
    this.mermaidTheme = config.get<string>('mermaidTheme')
    this.mathRenderingOption = config.get<string>('mathRenderingOption')
    this.mathInlineDelimiters = config.get<Array<string[]>>('mathInlineDelimiters')
    this.mathBlockDelimiters = config.get<Array<string[]>>('mathBlockDelimiters')
  }

  public isEqualTo(otherConfig: MarkdownPreviewEnhancedConfig) {
    for (let key in this) {
      if (this.hasOwnProperty(key)) {
        if (this[key] !== otherConfig[key]) {
          return false
        }
      }
    }
  }

  [key: string]: any
}
