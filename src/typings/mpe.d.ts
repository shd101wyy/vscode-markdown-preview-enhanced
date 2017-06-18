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

interface CodeChunkData {
  /**
   * id of the code chunk
   */
  id: string,
  /**
   * code content of the code chunk
   */
  code: string,
  /**
   * code chunk options
   */
  options: object,
  /**
   * result after running code chunk
   */
  result: string,
  /**
   * whether is running the code chunk or not
   */
  running: boolean,
  /**
   * last code chunk
   */
  prev: string
}
