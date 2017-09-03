import * as vscode from "vscode"
import {MarkdownEngineConfig} from "@shd101wyy/mume"

export class MarkdownPreviewEnhancedConfig implements MarkdownEngineConfig {
  public static getCurrentConfig() {
    return new MarkdownPreviewEnhancedConfig()
  }

  public readonly usePandocParser: boolean
  public readonly breakOnSingleNewLine: boolean
  public readonly enableTypographer: boolean
  public readonly enableWikiLinkSyntax: boolean
  public readonly wikiLinkFileExtension: string
  public readonly enableExtendedTableSyntax: boolean
  public readonly enableCriticMarkupSyntax: boolean
  public readonly frontMatterRenderingOption:string
  public readonly mathRenderingOption: string
  public readonly mathInlineDelimiters: Array<string[]>
  public readonly mathBlockDelimiters: Array<string[]>
  public readonly codeBlockTheme: string
  public readonly mermaidTheme: string
  public readonly previewTheme: string
  public readonly revealjsTheme: string
  public readonly protocolsWhiteList: string
  public readonly imageFolderPath: string
  public readonly imageUploader: string
  public readonly printBackground: boolean
  public readonly phantomPath: string 
  public readonly pandocPath: string
  public readonly pandocMarkdownFlavor: string 
  public readonly pandocArguments: string[]
  public readonly latexEngine: string
  public readonly enableScriptExecution: boolean

  // preview config
  public readonly scrollSync: boolean

  private constructor() {
    const config = vscode.workspace.getConfiguration('markdown-preview-enhanced')

    this.usePandocParser = config.get<boolean>('usePandocParser')
    this.breakOnSingleNewLine = config.get<boolean>('breakOnSingleNewLine')
    this.enableTypographer = config.get<boolean>('enableTypographer')
    this.enableWikiLinkSyntax = config.get<boolean>('enableWikiLinkSyntax')
    this.wikiLinkFileExtension = config.get<string>('wikiLinkFileExtension')
    this.enableExtendedTableSyntax = config.get<boolean>('enableExtendedTableSyntax')
    this.enableCriticMarkupSyntax = config.get<boolean>('enableCriticMarkupSyntax')    
    this.frontMatterRenderingOption = config.get<string>('frontMatterRenderingOption')
    this.mermaidTheme = config.get<string>('mermaidTheme')
    this.mathRenderingOption = config.get<string>('mathRenderingOption')
    this.mathInlineDelimiters = config.get<Array<string[]>>('mathInlineDelimiters')
    this.mathBlockDelimiters = config.get<Array<string[]>>('mathBlockDelimiters')
    this.codeBlockTheme = config.get<string>('codeBlockTheme')
    this.previewTheme = config.get<string>('previewTheme')
    this.revealjsTheme = config.get<string>('revealjsTheme')
    this.protocolsWhiteList = config.get<string>('protocolsWhiteList')
    this.imageFolderPath = config.get<string>('imageFolderPath')
    this.imageUploader = config.get<string>('imageUploader')
    this.printBackground = config.get<boolean>('printBackground')
    this.phantomPath = config.get<string>('phantomPath')
    this.pandocPath = config.get<string>('pandocPath')
    this.pandocMarkdownFlavor = config.get<string>('pandocMarkdownFlavor')
    this.pandocArguments = config.get<string>('pandocArguments').split(',').map((x)=> x.trim())
    this.latexEngine = config.get<string>('latexEngine')
    this.enableScriptExecution = config.get<boolean>('enableScriptExecution')

    this.scrollSync = config.get<boolean>('scrollSync')
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
