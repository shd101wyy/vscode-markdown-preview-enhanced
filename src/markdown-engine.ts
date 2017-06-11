import * as katex from "katex"
import * as cheerio from "cheerio"
import * as path from "path"
import * as fs from "fs"
import * as remarkable from "remarkable"
import * as uslug from "uslug"
import * as matter from "gray-matter"

import {MarkdownPreviewEnhancedConfig} from './config'

interface MarkdownEngineConstructorArgs {
  fileDirectoryPath: string,
  projectDirectoryPath: string,
  config: MarkdownPreviewEnhancedConfig
}

interface MarkdownEngineRenderOption {
  useRelativeImagePath?: boolean,
  isForPreview?: boolean,
  isForEbook?: boolean,
  hideFrontMatter?: boolean
}

interface MarkdownEngineOutput {
  html:string,
  markdown:string
}

const defaults = {
  html:         true,        // Enable HTML tags in source
  xhtmlOut:     false,       // Use '/' to close single tags (<br />)
  breaks:       true,        // Convert '\n' in paragraphs into <br>
  langPrefix:   'language-', // CSS language prefix for fenced blocks
  linkify:      true,        // autoconvert URL-like texts to links
  linkTarget:   '',          // set target to open link in
  typographer:  true,        // Enable smartypants and other sweet transforms
}

export class MarkdownEngine {
  private readonly fileDirectoryPath: string
  private readonly projectDirectoryPath: string
  private config: MarkdownPreviewEnhancedConfig

  private breakOnSingleNewLine: boolean
  private enableTypographer: boolean

  private md;

  constructor(args:MarkdownEngineConstructorArgs) {
    this.fileDirectoryPath = args.fileDirectoryPath
    this.projectDirectoryPath = args.projectDirectoryPath
    this.config = args.config
    this.initConfig()

    this.md = new remarkable('full', 
      Object.assign({}, defaults, {typographer: this.enableTypographer, breaks: this.breakOnSingleNewLine}))
  }

  private initConfig() {
    this.breakOnSingleNewLine = this.config.breakOnSingleNewLine
    this.enableTypographer = this.config.enableTypographer
  }

  public updateConfiguration(config) {
    this.config = config 
    this.initConfig()

    this.md.set({breaks: this.breakOnSingleNewLine, typographer: this.enableTypographer})
  }

  public parseMD(inputString:string, options:MarkdownEngineRenderOption):Thenable<MarkdownEngineOutput> {
    return new Promise((resolve, reject)=> {
      let html = this.md.render(inputString)
      return resolve({html, markdown:inputString})
    })
  }
}