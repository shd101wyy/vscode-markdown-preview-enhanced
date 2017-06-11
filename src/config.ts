import * as vscode from "vscode"

export class MarkdownPreviewEnhancedConfig {
  public static getCurrentConfig() {
    return new MarkdownPreviewEnhancedConfig()
  }

  public readonly breakOnSingleNewLine: boolean
  public readonly enableTypographer: boolean

  private constructor() {
    const config = vscode.workspace.getConfiguration('markdown-preview-enhanced')

    this.breakOnSingleNewLine = config.get<boolean>('breakOnSingleNewLine')
    this.enableTypographer = config.get<boolean>('enableTypographer')
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
