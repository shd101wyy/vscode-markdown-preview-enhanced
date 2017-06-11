import * as katex from "katex"
import * as cheerio from "cheerio"
import * as path from "path"
import * as fs from "fs"
import * as remarkable from "remarkable"
import * as uslug from "uslug"
import * as matter from "gray-matter"
import * as jsonic from "jsonic"

import {MarkdownPreviewEnhancedConfig} from './config'
import * as plantumlAPI from './puml'
import {escapeString, unescapeString, getExtensionDirectoryPath} from "./utility"
let viz = null

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
    
    this.configureRemarkable()
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

  private configureRemarkable() {

    // task list 
    this.md.renderer.rules.list_item_open = (tokens, idx)=> {
      if (tokens[idx + 2]) {
        let children = tokens[idx + 2].children
        if (!children || !(children[0] && children[0].content))
          return '<li>'

        const line = children[0].content
        if (line.match(/^\[[xX\s]\]\s/)) {
          children[0].content = line.slice(3)
          let checked = !(line[1] == ' ')
          let checkBox = `<input type=\"checkbox\" class=\"task-list-item-checkbox\" ${checked ? 'checked' : ''}>`
          let level = children[0].level
          children = [{content: checkBox, type: 'htmltag', level}].concat(children)

          tokens[idx + 2].children = children
          return '<li class="task-list-item">'
        }
        return '<li>'
      } else {
        return '<li>'
      }
    }
  }



  /**
   * 
   * @param preElement the cheerio element
   * @param parameters is in the format of `lang {opt1:val1, opt2:val2}` or just `lang`       
   * @param text 
   */
  private async renderCodeBlock($preElement, text, parameters) {
    let match, lang 
    if (match = parameters.match(/\s*([^\s]+)\s+\{(.+?)\}/)) {
      lang = match[1]
      parameters = match[2]
    } else {
      lang = parameters
      parameters = ''
    }

    if (parameters) {
      try {
        parameters = jsonic('{'+parameters+'}')
      } catch (e) {
        return $preElement.replaceWith(`<pre>${'{'+parameters+'}'}<br>${e.toString()}</pre>`)
      }
    } else {
      parameters = {}
    }

    if (lang.match(/^(puml|plantuml)$/)) {
      const svg = await plantumlAPI.render(text, this.fileDirectoryPath)
      $preElement.replaceWith(svg)
    } else if (lang.match(/^mermaid$/)) {
      $preElement.replaceWith(`<div class="mermaid">${text}</div>`)
    } else if (lang.match(/^(dot|viz)$/)) {
      if (!viz) {
        viz = require(path.resolve(__dirname, '../../dependencies/viz/viz.js'))
      }
      try {
        let engine = parameters.engine || "dot"
        const svg = viz(text, {engine})
        $preElement.replaceWith(svg)
      } catch(e) {
        $preElement.replaceWith(`<pre>${e.toString()}</pre>`)
      }
    }
  }

  /**
   * This function resovle image paths and render code blocks
   * @param html the html string that we will analyze 
   * @return html 
   */
  private async resolveImagePathAndCodeBlock(html) {
    let $ = cheerio.load(html, {xmlMode:true})

    const asyncFunctions = []
    $('pre').each((i, preElement)=> {
      let codeBlock, lang, text 

      if (preElement.children[0] && preElement.children[0].name == 'code') {
        codeBlock = $(preElement).children().first()
        lang = 'text'
        if (codeBlock.attr('class'))
          lang = codeBlock.attr('class').replace(/^language-/, '') || 'text'
        text = codeBlock.text()
      } else {
        lang = 'text'
        if (preElement.children[0])
          text = preElement.children[0].data
        else
          text = ''
      }
      
      asyncFunctions.push(this.renderCodeBlock($(preElement), text, lang))
    })

    await Promise.all(asyncFunctions)
    return $.html()
  }

  public parseMD(inputString:string, options:MarkdownEngineRenderOption):Thenable<MarkdownEngineOutput> {
    // console.log('parseMD')
    return new Promise((resolve, reject)=> {
      let html = this.md.render(inputString)

      return this.resolveImagePathAndCodeBlock(html).then((html)=> {
        return resolve({html, markdown:inputString})
      })
    })
  }
}