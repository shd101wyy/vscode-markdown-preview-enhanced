interface MPEConfig {
  breakOnSingleNewLine: boolean
  enableTypographer: boolean
  enableWikiLinkSyntax: boolean
  wikiLinkFileExtension: string
  frontMatterRenderingOption:string
  scrollSync: boolean
  mermaidTheme: string
  /**
   * "KaTeX", "MathJax", or "None"
   */
  mathRenderingOption: string
  mathInlineDelimiters: Array<string[]>
  mathBlockDelimiters: Array<string[]>

  /**
   * Themes
   */
  codeBlockTheme: string
  previewTheme: string

  protocolsWhiteList: string

  /**
   * image helper
   */
  imageFolderPath: string
  imageUploader: string
}