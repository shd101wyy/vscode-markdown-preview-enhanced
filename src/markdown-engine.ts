import * as cheerio from "cheerio"
import * as path from "path"
import * as fs from "fs"


import {MarkdownPreviewEnhancedConfig} from './config'
import * as plantumlAPI from './puml'
import {escapeString, unescapeString, getExtensionDirectoryPath} from "./utility"
let viz = null
import {scopeForLanguageName} from "./extension-helper"
import {fileImport} from "./file-import"

const extensionDirectoryPath = getExtensionDirectoryPath()
const katex = require(path.resolve(extensionDirectoryPath, './dependencies/katex/katex.min.js'))
const remarkable = require(path.resolve(extensionDirectoryPath, './dependencies/remarkable/remarkable.js'))
const jsonic = require(path.resolve(extensionDirectoryPath, './dependencies/jsonic/jsonic.js'))
const md5 = require(path.resolve(extensionDirectoryPath, './dependencies/javascript-md5/md5.js'))

// import * as uslug from "uslug"
// import * as matter from "gray-matter"
// import * as Prism from "prismjs"
let Prism = null

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

  // caches 
  private graphsCache:{[key:string]:string} = {}

  /**
   * cachedHTML is the cache of html generated from the markdown file.  
   */
  private cachedHTML:string = '';

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

  /**
   * 
   * @param content the math expression 
   * @param openTag the open tag, eg: '\('
   * @param closeTag the close tag, eg: '\)'
   * @param displayMode whether to be rendered in display mode
   */
  private parseMath({content, openTag, closeTag, displayMode}) {
    if (!content) return ''
    if (this.config.mathRenderingOption[0] == 'K') { // KaTeX
      try {
        return katex.renderToString(content, {displayMode})
      } catch(error) {
        return `<span style=\"color: #ee7f49; font-weight: 500;\">${error.toString()}</span>`
      }
    } else if (this.config.mathRenderingOption[0] == 'M') { // MathJax
      const text = (openTag + content + closeTag).replace(/\n/g, '')
      const tag = displayMode ? 'div' : 'span'
      return `<${tag} class="mathjax-exps">${escapeString(text)}</${tag}>`
    } else {
      return ''
    }
  }

  private configureRemarkable() {

    /**
     * math rule
     */
    this.md.inline.ruler.before('escape', 'math', (state, silent)=> {
      if (this.config.mathRenderingOption[0] == 'N')
        return false

      let openTag = null,
          closeTag = null,
          displayMode = true,
          inline = this.config.mathInlineDelimiters,
          block = this.config.mathBlockDelimiters

      for (let a = 0; a < block.length; a++) {
        const b = block[a]
        if (state.src.startsWith(b[0], state.pos)) {
          openTag = b[0]
          closeTag = b[1]
          displayMode = true
          break
        }
      }

      if (!openTag) {
        for (let a = 0; a < inline.length; a++) {
          const i = inline[a]
          if (state.src.startsWith(i[0], state.pos)) {
            openTag = i[0]
            closeTag = i[1]
            displayMode = false
            break
          }
        }
      }

      if (!openTag) return false // not math

      let content = null,
          end = -1

      let i = state.pos + openTag.length
      while (i < state.src.length) {
        if (state.src.startsWith(closeTag, i)) {
          end = i
          break
        } else if (state.src[i] == '\\') {
          i += 1
        }
        i += 1
      }

      if (end >= 0)
        content = state.src.slice(state.pos + openTag.length, end)
      else
        return false

      if (content && !silent) {
        state.push({
          type: 'math',
          content: content.trim(),
          openTag: openTag,
          closeTag: closeTag,
          displayMode: displayMode
        })

        state.pos += (content.length + openTag.length + closeTag.length)
        return true
      } else {
        return false
      }
    })

    /**
     * math renderer 
     */
    this.md.renderer.rules.math = (tokens, idx)=> {
      return this.parseMath(tokens[idx] || {})
    }


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
  private async renderCodeBlock($preElement, code, parameters, {graphsCache}) {
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

    if (lang.match(/^(puml|plantuml)$/)) { // PlantUML 
      const checksum = md5(code)
      let svg:string = this.graphsCache[checksum] 
      if (!svg) {
        svg = await plantumlAPI.render(code, this.fileDirectoryPath)
      }
      $preElement.replaceWith(`<p>${svg}</p>`)
      graphsCache[checksum] = svg // store to new cache 

    } else if (lang.match(/^mermaid$/)) { // mermaid 
      $preElement.replaceWith(`<div class="mermaid">${code}</div>`)
    } else if (lang.match(/^(dot|viz)$/)) { // GraphViz
      const checksum = md5(code)
      let svg = this.graphsCache[checksum]
      if (!svg) {
        if (!viz) viz = require(path.resolve(__dirname, '../../dependencies/viz/viz.js'))
        
        try {
          let engine = parameters.engine || "dot"
          svg = viz(code, {engine})
        } catch(e) {
          $preElement.replaceWith(`<pre>${e.toString()}</pre>`)
        }
      } 

      $preElement.replaceWith(`<p>${svg}</p>`)
      graphsCache[checksum] = svg // store to new cache
    } else { // normal code block  // TODO: code chunk
      try {
        if (!Prism) {
          Prism = require(path.resolve(getExtensionDirectoryPath(), './dependencies/prism/prism.js'))
        }
        const html = Prism.highlight(code, Prism.languages[scopeForLanguageName(lang)])
        $preElement.html(html)  
      } catch(e) {
        // do nothing
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
    
    // new caches
    // which will be set when this.renderCodeBlocks is called
    const newGraphsCache:{[key:string]:string} = {}

    const asyncFunctions = []
    $('pre').each((i, preElement)=> {
      let codeBlock, lang, code 
      const $preElement = $(preElement)
      if (preElement.children[0] && preElement.children[0].name == 'code') {
        codeBlock = $preElement.children().first()
        lang = 'text'
        let classes = codeBlock.attr('class')
        if (classes)
          lang = classes.replace(/^language-/, '') || 'text'
        code = codeBlock.text()
        $preElement.attr('class', classes)
      } else {
        lang = 'text'
        if (preElement.children[0])
          code = preElement.children[0].data
        else
          code = ''
        $preElement.attr('class', 'language-text')
      }
      
      asyncFunctions.push(this.renderCodeBlock($preElement, code, lang, {graphsCache: newGraphsCache }))
    })

    await Promise.all(asyncFunctions)

    // reset caches 
    this.graphsCache = newGraphsCache

    return $.html()
  }

  /**
   * return this.cachedHTML
   */
  public getCachedHTML() {
    return this.cachedHTML
  }

  public parseMD(inputString:string, options:MarkdownEngineRenderOption):Thenable<MarkdownEngineOutput> {
    return new Promise((resolve, reject)=> {

      fileImport(inputString, this.fileDirectoryPath, this.projectDirectoryPath, {forPreview: options.isForPreview})
      .then(({outputString})=> {
        let html = this.md.render(outputString)

        return this.resolveImagePathAndCodeBlock(html).then((html)=> {
          this.cachedHTML = html
          return resolve({html, markdown:inputString})
        })
      })
    })
  }
}