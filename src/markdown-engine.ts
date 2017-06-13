import * as path from "path"
import * as fs from "fs"
import * as cheerio from "cheerio"
import * as uslug from "uslug"

import {MarkdownPreviewEnhancedConfig} from "./config"
import * as plantumlAPI from "./puml"
import {escapeString, unescapeString, getExtensionDirectoryPath} from "./utility"
let viz = null
import {scopeForLanguageName} from "./extension-helper"
import {fileImport} from "./file-import"
import {toc} from "./toc"

const extensionDirectoryPath = getExtensionDirectoryPath()
const katex = require(path.resolve(extensionDirectoryPath, './dependencies/katex/katex.min.js'))
const remarkable = require(path.resolve(extensionDirectoryPath, './dependencies/remarkable/remarkable.js'))
const jsonic = require(path.resolve(extensionDirectoryPath, './dependencies/jsonic/jsonic.js'))
const md5 = require(path.resolve(extensionDirectoryPath, './dependencies/javascript-md5/md5.js'))

// import * as uslug from "uslug"
// import * as matter from "gray-matter"
// import * as Prism from "prismjs"
let Prism = null

enum CustomSubjects {
  pagebreak,
  newpage,
  toc,
  tocstop,
  slide,
  ebook,
  'toc-bracket'
}

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

interface Heading {
  content:string,
  level:number,
  id:string
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
  private protocolsWhiteListRegExp:RegExp

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

    // protocal whitelist
    const protocolsWhiteList = this.config.protocolsWhiteList.split(',').map((x)=>x.trim()) || ['http', 'https', 'atom', 'file']
    this.protocolsWhiteListRegExp = new RegExp('^(' + protocolsWhiteList.join('|')+')\:\/\/')  // eg /^(http|https|atom|file)\:\/\//
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

    /**
     * wikilink rule
     * inline [[]] 
     * [[...]]
     */
    this.md.inline.ruler.before('autolink', 'wikilink',
    (state, silent)=> {
      if (!this.config.enableWikiLinkSyntax || !state.src.startsWith('[[', state.pos))
        return false

      let content = null,
          tag = ']]',
          end = -1

      let i = state.pos + tag.length
      while (i < state.src.length) {
        if (state.src[i] == '\\') {
          i += 1
        } else if (state.src.startsWith(tag, i)) {
          end = i
          break
        }
        i += 1
      }

      if (end >= 0) // found ]]
        content = state.src.slice(state.pos + tag.length, end)
      else
        return false

      if (content && !silent) {
        state.push({
          type: 'wikilink',
          content: content
        })
        state.pos += content.length + 2 * tag.length
        return true
      } else {
        return false
      }
    })

    this.md.renderer.rules.wikilink = (tokens, idx)=> {
      let {content} = tokens[idx]
      if (!content) return

      let splits = content.split('|')
      let linkText = splits[0].trim()
      let wikiLink = splits.length === 2 ? `${splits[1].trim()}${this.config.wikiLinkFileExtension}` : `${linkText.replace(/\s/g, '')}${this.config.wikiLinkFileExtension}`

      return `<a href="${wikiLink}">${linkText}</a>`
    }

    // custom comment
    this.md.block.ruler.before('code', 'custom-comment',
    (state, start, end, silent)=> {
      let pos = state.bMarks[start] + state.tShift[start],
          max = state.eMarks[start],
          src = state.src

      if (pos >= max)
        return false
      if (src.startsWith('<!--', pos)) {
        end = src.indexOf('-->', pos + 4)
        if (end >= 0) {
          let content = src.slice(pos + 4, end).trim()

          let match = content.match(/(\s|\n)/) // find ' ' or '\n'
          let firstIndexOfSpace:number
          if (!match) {
            firstIndexOfSpace = content.length
          } else {
            firstIndexOfSpace = match.index
          }

          let subject = content.slice(0, firstIndexOfSpace)

          if (!(subject in CustomSubjects)) { // check if it is a valid subject
            // it's not a valid subject, therefore escape it
            state.line = start + 1 + (src.slice(pos + 4, end).match(/\n/g)||[]).length
            return true
          }

          let rest = content.slice(firstIndexOfSpace+1).trim()

          match = rest.match(/(?:[^\s\n:"']+|"[^"]*"|'[^']*')+/g) // split by space and \newline and : (not in single and double quotezz)

          let option:object
          if (match && match.length % 2 === 0) {
            option = {}
            let i = 0
            while (i < match.length) {
              const key = match[i],
                    value = match[i+1]
              try {
                option[key] = JSON.parse(value)
              } catch (e) {
                null // do nothing
              }
              i += 2
            }
          } else {
            option = {}
          }

          state.tokens.push({
            type: 'custom',
            subject: subject,
            option: option
          })

          state.line = start + 1 + (src.slice(pos + 4, end).match(/\n/g)||[]).length
          return true
        } else {
          return false
        }
      } else if (src[pos] === '[' && src.slice(pos, max).match(/^\[toc\]\s*$/i)) { // [TOC]
        state.tokens.push({
          type: 'custom',
          subject: 'toc-bracket',
          option: {}
        })
        state.line = start + 1
        return true
      } else {
        return false
      }
    })

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

    // code fences 
    // modified to support math block
    // check https://github.com/jonschlinkert/remarkable/blob/875554aedb84c9dd190de8d0b86c65d2572eadd5/lib/rules.js
    this.md.renderer.rules.fence = (tokens, idx, options, env, instance)=> {
      let token = tokens[idx],
          langClass = '',
          langPrefix = options.langPrefix,
          langName = escapeString(token.params)

      if (token.params)
        langClass = ' class="' + langPrefix + langName + '" ';

      // get code content
      let content = escapeString(token.content)

      // copied from getBreak function.
      let break_ = '\n'
      if (idx < tokens.length && tokens[idx].type === 'list_item_close')
        break_ = ''

      if (langName === 'math') {
        const openTag = this.config.mathBlockDelimiters[0][0] || '$$'
        const closeTag = this.config.mathBlockDelimiters[0][1] || '$$'
        const mathExp = unescapeString(content).trim()
        if (!mathExp) return ''
        const mathHtml = this.parseMath({openTag, closeTag, content: mathExp, displayMode: true})
        return `<p>${mathHtml}</p>`
      }

      return '<pre><code' + langClass + '>' + content + '</code></pre>' + break_
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
        return $preElement.replaceWith(`<pre class="language-text">ParameterError: ${'{'+parameters+'}'}<br>${e.toString()}</pre>`)
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
  private async resolveImagePathAndCodeBlock(html, options:MarkdownEngineRenderOption) {
    let $ = cheerio.load(html, {xmlMode:true})

    // resolve image paths
    $('img, a').each((i, imgElement)=> {
      let srcTag = 'src'
      if (imgElement.name === 'a')
        srcTag = 'href'

      const img = $(imgElement)
      const src = img.attr(srcTag)

      if (src &&
        (!(src.match(this.protocolsWhiteListRegExp) ||
          src.startsWith('data:image/') ||
          src[0] == '#' ||
          src[0] == '/'))) {
        if (!options.useRelativeImagePath) 
          img.attr(srcTag, 'file://'+path.resolve(this.fileDirectoryPath,  src))
      } else if (src && src[0] === '/') { // absolute path
        if (options.useRelativeImagePath)
          img.attr(srcTag, path.relative(this.fileDirectoryPath, path.resolve(this.projectDirectoryPath, '.' + src)))
        else
          img.attr(srcTag, 'file://'+path.resolve(this.projectDirectoryPath, '.' + src))
      }
    })

    
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

        const tocTable:{[key:string]:number} = {},
              headings:Array<Heading> = [],
              slideConfigs = []
        let tocBracketEnabled:boolean = false

        // overwrite remarkable heading parse function
        this.md.renderer.rules.heading_open = (tokens, idx)=> {
          let line = null
          let id = null
          let classes = null

          if (tokens[idx + 1] && tokens[idx + 1].content) {
            let ignore = false
            let heading = tokens[idx + 1].content

            // check {class:string, id:string, ignore:boolean}
            let optMatch = null
            if (optMatch = heading.match(/[^\\]\{(.+?)\}(\s*)$/)) {
              heading = heading.replace(optMatch[0], '')
              tokens[idx + 1].content = heading
              tokens[idx + 1].children[0].content = heading

              try {
                let opt = jsonic(optMatch[1])
                
                classes = opt.class,
                id = opt.id,
                ignore = opt.ignore 
              } catch(e) {
                heading = "ParameterError: " + optMatch[1]
              }
            }

            if (!id) {
              id = uslug(heading)
            }

            if (tocTable[id] >= 0) {
              tocTable[id] += 1
              id = id + '-' + tocTable[id]
            } else {
              tocTable[id] = 0
            }

            if (!ignore) {
              headings.push({content: heading, level: tokens[idx].hLevel, id:id})
            }
          }

          id = id ? `id=${id}` : ''
          classes = classes ? `class=${classes}` : ''
          return `<h${tokens[idx].hLevel} ${id} ${classes}>`
        }

        // <!-- subject options... -->
        this.md.renderer.rules.custom = (tokens, idx)=> {
          const subject = tokens[idx].subject

          if (subject === 'pagebreak' || subject === 'newpage') {
            return '<div class="pagebreak"> </div>'
          } else if (subject == 'toc-bracket') { // [toc]
            tocBracketEnabled = true
            return '\n[MPETOC]\n'
          } else if (subject == 'slide') {
            let opt = tokens[idx].option
            slideConfigs.push(opt)
            return '<span class="new-slide"></span>'
          }
          return ''
        }
  
        let html = this.md.render(outputString)

        if (tocBracketEnabled) { // [TOC]
          const tocObject = toc(headings, {ordered: false, depthFrom: 1, depthTo: 6, tab: '\t'})
          const tocHtml = this.md.render(tocObject.content)
          html = html.replace(/^\s*\[MPETOC\]\s*/gm, tocHtml)
        }
      
        return this.resolveImagePathAndCodeBlock(html, options).then((html)=> {
          this.cachedHTML = html
          return resolve({html, markdown:inputString})
        })
      })
    })
  }
}