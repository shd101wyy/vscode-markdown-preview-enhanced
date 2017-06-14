import * as path from "path"
import * as fs from "fs"
import * as cheerio from "cheerio"
import * as uslug from "uslug"
import * as temp from "temp"
temp.track()

const matter = require('gray-matter')

import {MarkdownPreviewEnhancedConfig} from "./config"
import * as plantumlAPI from "./puml"
import {escapeString, unescapeString, getExtensionDirectoryPath, readFile} from "./utility"
import * as utility from "./utility"
let viz = null
import {scopeForLanguageName} from "./extension-helper"
import {fileImport} from "./file-import"
import {toc} from "./toc"
import {CustomSubjects} from "./custom-subjects"

const extensionDirectoryPath = getExtensionDirectoryPath()
const katex = require(path.resolve(extensionDirectoryPath, './dependencies/katex/katex.min.js'))
const remarkable = require(path.resolve(extensionDirectoryPath, './dependencies/remarkable/remarkable.js'))
const jsonic = require(path.resolve(extensionDirectoryPath, './dependencies/jsonic/jsonic.js'))
const md5 = require(path.resolve(extensionDirectoryPath, './dependencies/javascript-md5/md5.js'))

// import * as uslug from "uslug"
// import * as Prism from "prismjs"
let Prism = null


interface MarkdownEngineConstructorArgs {
  filePath: string,
  projectDirectoryPath: string,
  config: MarkdownPreviewEnhancedConfig
}

interface MarkdownEngineRenderOption {
  useRelativeImagePath: boolean,
  isForPreview: boolean,
  hideFrontMatter: boolean
}

interface MarkdownEngineOutput {
  html:string,
  markdown:string,
  tocHTML:string,
  yamlConfig: any,
 // slideConfigs: Array<object>
}

interface HTMLTemplateOption {
  useRelativeImagePath: boolean
  isForPrint: boolean
  isForPrince: boolean
  offline: boolean
  embedLocalImages: boolean
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
  /**
   * markdown file path 
   */
  private readonly filePath: string 
  private readonly fileDirectoryPath: string
  private readonly projectDirectoryPath: string
  private config: MarkdownPreviewEnhancedConfig

  private breakOnSingleNewLine: boolean
  private enableTypographer: boolean
  private protocolsWhiteListRegExp:RegExp

  private headings: Array<Heading>
  private tocHTML: string

  private md;

  // caches 
  private graphsCache:{[key:string]:string} = {}

  /**
   * cachedHTML is the cache of html generated from the markdown file.  
   */
  private cachedHTML:string = '';
  private cachedInputString:string = ''

  constructor(args:MarkdownEngineConstructorArgs) {
    this.filePath = args.filePath
    this.fileDirectoryPath = path.dirname(this.filePath)
    this.projectDirectoryPath = args.projectDirectoryPath || '/'
    this.config = args.config
    this.initConfig()
    this.headings = []
    this.tocHTML = ''

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
   * Generate HTML content
   * @param html: this is the final content you want to put. 
   * @param yamlConfig: this is the front matter.
   * @param option: HTMLTemplateOption
   */
  public async generateHTMLFromTemplate(html, yamlConfig={}, options:HTMLTemplateOption):Promise<string> {
      // get `id` and `class`
      const elementId = yamlConfig['id'] || ''
      let elementClass = yamlConfig['class'] || []
      if (typeof(elementClass) == 'string')
        elementClass = [elementClass]
      elementClass = elementClass.join(' ')

      // TODO: mermaid

      // math style and script
      let mathStyle = ''
      if (this.config.mathRenderingOption === 'MathJax') {
        const inline = this.config.mathInlineDelimiters
        const block = this.config.mathBlockDelimiters

        // TODO
        const mathJaxConfig = {
          extensions: ['tex2jax.js'],
          jax: ['input/TeX','output/HTML-CSS'],
          showMathMenu: false,
          messageStyle: 'none',

          tex2jax: {
            inlineMath: this.config.mathInlineDelimiters,
            displayMath: this.config.mathBlockDelimiters,
            processEnvironments: false,
            processEscapes: true,
          },
          TeX: {
            extensions: ['AMSmath.js', 'AMSsymbols.js', 'noErrors.js', 'noUndefined.js']
          },
          'HTML-CSS': { availableFonts: ['TeX'] },
        }

        if (options.offline) {
          mathStyle = `
          <script type="text/x-mathjax-config">
            MathJax.Hub.Config(${JSON.stringify(mathJaxConfig)});
          </script>
          <script type="text/javascript" async src="file://${path.resolve(extensionDirectoryPath, './dependencies/mathjax/MathJax.js')}"></script>
          `
        } else {
          mathStyle = `
          <script type="text/x-mathjax-config">
            MathJax.Hub.Config(${JSON.stringify(mathJaxConfig)});
          </script>
          <script type="text/javascript" async src="https://cdn.rawgit.com/mathjax/MathJax/2.7.1/MathJax.js"></script>
          `
        }
      } else if (this.config.mathRenderingOption == 'KaTeX') {
        if (options.offline) {
          mathStyle = `<link rel="stylesheet" href="file://${path.resolve(extensionDirectoryPath, './dependencies/katex/katex.min.css')}">`
        } else {
          mathStyle = `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.7.1/katex.min.css">`
        }
      } else {
        mathStyle = ''
      }

      // presentation
      let presentationScript = '',
          presentationStyle = '',
          presentationInitScript = ''
      if (yamlConfig["isPresentationMode"]) {
        if (options.offline) {
          presentationScript = `
          <script src='file:///${path.resolve(extensionDirectoryPath, './dependencies/reveal/lib/js/head.min.js')}'></script>
          <script src='file:///${path.resolve(extensionDirectoryPath, './dependencies/reveal/js/reveal.js')}'></script>`
        } else {
          presentationScript = `
          <script src='https://cdnjs.cloudflare.com/ajax/libs/reveal.js/3.4.1/lib/js/head.min.js'></script>
          <script src='https://cdnjs.cloudflare.com/ajax/libs/reveal.js/3.4.1/js/reveal.min.js'></script>`
        }

        let presentationConfig = yamlConfig['presentation'] || {}
        let dependencies = presentationConfig.dependencies || []
        if (presentationConfig['enableSpeakerNotes']) {
          if (options.offline)
            dependencies.push({src: path.resolve(__dirname, '../dependencies/reveal/plugin/notes/notes.js'), async: true})
          else
            dependencies.push({src: 'revealjs_deps/notes.js', async: true}) // TODO: copy notes.js file to corresponding folder
        }
        presentationConfig.dependencies = dependencies

        presentationStyle = `
        <style>
        ${fs.readFileSync(path.resolve(extensionDirectoryPath, './dependencies/reveal/reveal.css'))}
        ${options.isForPrint ? fs.readFileSync(path.resolve(extensionDirectoryPath, './dependencies/reveal/pdf.css')) : ''}
        </style>
        `
        presentationInitScript = `
        <script>
          Reveal.initialize(${JSON.stringify(Object.assign({margin: 0.1}, presentationConfig))})
        </script>
        `
      }

      // prince 
      let princeClass = ""
      if (options.isForPrince) {
        princeClass = "prince"
      }

      let title = path.basename(this.filePath)
      title = title.slice(0, title.length - path.extname(title).length) // remove '.md'

      // prism and preview theme 
      let styleCSS = ""
      try{
        const styles = await Promise.all([
          // style template
          readFile(path.resolve(extensionDirectoryPath, './styles/style-template.css')),
          // prism *.css
          readFile(path.resolve(extensionDirectoryPath, `./dependencies/prism/themes/${this.config.codeBlockTheme}`)),
          // preview theme
          readFile(path.resolve(extensionDirectoryPath, `./styles/${this.config.previewTheme}`))
        ])
        styleCSS = styles.join('')
      } catch(e) {
        styleCSS = ''
      }
      html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${presentationStyle}
        ${mathStyle}
        ${presentationScript}
        <style> ${styleCSS} </style>
      </head>
      <body class="markdown-preview-enhanced ${princeClass} ${elementClass}" ${yamlConfig["isPresentationMode"] ? 'data-presentation-mode' : ''} ${elementId ? `id="${elementId}"` : ''}>
      ${html}
      </body>
      ${presentationInitScript}
    </html>
      `

      return html
  }

  /**
   * generate HTML file and open it in browser
   */
  public openInBrowser() {
    this.parseMD(this.cachedInputString, {useRelativeImagePath: false, hideFrontMatter: true, isForPreview: false})
    .then(({html, yamlConfig})=> {
      this.generateHTMLFromTemplate(html, yamlConfig, 
                                    {useRelativeImagePath: false, isForPrint: false, isForPrince: false, offline: true, embedLocalImages: false} )
      .then((html)=> {      
        // create temp file

      temp.open({
        prefix: 'markdown-preview-enhanced',
        suffix: '.html'
      }, (err, info)=> {
        if (err) return utility.showErrorMessage(err.toString())
        fs.write(info.fd, html, (err)=> {
          if (err) return utility.showErrorMessage(err.toString())
          /*
          if isForPresentationPrint
            url = 'file:///' + info.path + '?print-pdf'
            atom.notifications.addInfo('Please copy and open the link below in Chrome.\nThen Right Click -> Print -> Save as Pdf.', dismissable: true, detail: url)
          else
          */
          // open in browser
          utility.openFile(info.path)
        })
      })
      })
    })
  }

  private resolveFilePath(filePath='', relative=false) {
    if (  filePath.match(this.protocolsWhiteListRegExp) ||
          filePath.startsWith('data:image/') ||
          filePath[0] == '#') {
      return filePath
    } else if (filePath[0] == '/') {
      if (relative)
        return path.relative(this.fileDirectoryPath, path.resolve(this.projectDirectoryPath, '.'+filePath))
      else
        return 'file://'+path.resolve(this.projectDirectoryPath, '.'+filePath)
    } else {
      if (relative)
        return filePath
      else
        return 'file://'+path.resolve(this.fileDirectoryPath, filePath)
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

      img.attr(srcTag, this.resolveFilePath(src, options.useRelativeImagePath))
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

  /**
   * process input string, skip front-matter
   * if display table. return {
   *      content: rest of input string after skipping front matter (but with '\n' included)
   *      table: string of <table>...</table> generated from data
   * }
   * else return {
   *      content: replace ---\n with ```yaml
   *      table: '',
   * }
   * 
   */
  private processFrontMatter(inputString:string, hideFrontMatter=false) {
    function toTable (arg) {
      if (arg instanceof Array) {
        let tbody = "<tbody><tr>"
        arg.forEach((item)=> tbody += `<td>${toTable(item)}</td>` )
        tbody += "</tr></tbody>"
        return `<table>${tbody}</table>`
      } else if (typeof(arg) === 'object') {
        let thead = "<thead><tr>"
        let tbody = "<tbody><tr>"
        for (let key in arg) {
          thead += `<th>${key}</th>`
          tbody += `<td>${toTable(arg[key])}</td>`
        }
        thead += "</tr></thead>"
        tbody += "</tr></tbody>"

        return `<table>${thead}${tbody}</table>`
      } else {
        return arg
      }
    }

    // https://regexper.com/
    let r = /^-{3}[\n\r]([\w|\W]+?)[\n\r]-{3}[\n\r]/

    let match = r.exec(inputString)

    if (match) {
      let yamlStr = match[0] 
      let data:any = matter(yamlStr).data

      if (hideFrontMatter || this.config.frontMatterRenderingOption[0] == 'n') { // hide
        const content = '\n'.repeat((yamlStr.match(/\n/g) || []).length) + inputString.slice(yamlStr.length)
        return {content, table: '', data}
      } else if (this.config.frontMatterRenderingOption[0] === 't') { // table
        const content = '\n'.repeat((yamlStr.match(/\n/g) || []).length) + inputString.slice(yamlStr.length)

        // to table
        let table 
        if (typeof(data) === 'object')
          table = toTable(data)
        else
          table = "<pre>Failed to parse YAML.</pre>"

        return {content, table, data}
      } else { // # if frontMatterRenderingOption[0] == 'c' # code block
        const content = '```yaml\n' + match[1] + '\n```\n' + inputString.slice(yamlStr.length)

        return {content, table: '', data}
      }
    } else {
      return {content: inputString, table: '', data:{}}
    }
  }

  /**
   * Parse `html` to generate slides
   * @param html 
   * @param slideConfigs 
   * @param yamlConfig 
   */
  private parseSlides(html:string, slideConfigs:Array<object>, yamlConfig) {
    let slides = html.split('<span class="new-slide"></span>')
    
    let output = ''
    let width = 960,
        height = 700

    let presentationConfig = {}
    if (yamlConfig && yamlConfig['presentation']) {
      presentationConfig = yamlConfig['presentation']
      width = presentationConfig['width'] || 960
      height = presentationConfig['height'] || 700
    }


    slides.forEach((slide, offset)=> {
      if (!offset) {  // first part of html before the first <!-- slide -->
        return output += `<div style='display: none;'>${slide}</div>`
      }
      offset = offset - 1
      const slideConfig = slideConfigs[offset] || {}
      let styleString = '',
          videoString = '',
          iframeString = '',
          classString = slideConfig['class'] || '',
          idString = slideConfig['id'] ? `id="${slideConfig['id']}"` : ''
      if (slideConfig['data-background-image']) {
        styleString += `background-image: url('${this.resolveFilePath(slideConfig['data-background-image'])}');`

        if (slideConfig['data-background-size'])
          styleString += `background-size: ${slideConfig['data-background-size']};`
        else
          styleString += "background-size: cover;"

        if (slideConfig['data-background-position'])
          styleString += `background-position: ${slideConfig['data-background-position']};`
        else
          styleString += "background-position: center;"

        if (slideConfig['data-background-repeat'])
          styleString += `background-repeat: ${slideConfig['data-background-repeat']};`
        else
          styleString += "background-repeat: no-repeat;"
      } else if (slideConfig['data-background-color']) {
        styleString += `background-color: ${slideConfig['data-background-color']} !important;`
      } else if (slideConfig['data-background-video']) {
        const videoMuted = slideConfig['data-background-video-muted']
        const videoLoop = slideConfig['data-background-video-loop']

        const muted_ = videoMuted ? 'muted' : ''
        const loop_ = videoLoop ? 'loop' : ''

        videoString = `
        <video ${muted_} ${loop_} playsinline autoplay class="background-video" src="${this.resolveFilePath(slideConfig['data-background-video'])}">
        </video>
        `
      } else if (slideConfig['data-background-iframe']) {
        iframeString = `
        <iframe class="background-iframe" src="${this.resolveFilePath(slideConfig['data-background-iframe'])}" frameborder="0" > </iframe>
        <div class="background-iframe-overlay"></div>
        `
      }

      output += `
        <div class='slide ${classString}' ${idString} data-line="${slideConfig['lineNo']}" data-offset='${offset}' style="width: ${width}px; height: ${height}px; ${styleString}">
          ${videoString}
          ${iframeString}
          <section>${slide}</section>
        </div>
      `
    })

    // remove <aside class="notes"> ... </aside>
    output = output.replace(/(<aside\b[^>]*>)[^<>]*(<\/aside>)/ig, '')

    return `
    <div id="preview-slides" data-width="${width}" data-height="${height}">
      ${output}
    </div>
    `
  }

  private parseSlidesForExport(html:string, slideConfigs:Array<object>, useRelativeImagePath:boolean) {
    let slides = html.split('<span class="new-slide"></span>')
    let before = slides[0]
    slides = slides.slice(1)

    let output = ''

    const parseAttrString = (slideConfig)=> {
      let attrString = ''

      if (slideConfig['data-background-image'])
        attrString += ` data-background-image='${this.resolveFilePath(slideConfig['data-background-image'], useRelativeImagePath)}'`

      if (slideConfig['data-background-size'])
        attrString += ` data-background-size='${slideConfig['data-background-size']}'`

      if (slideConfig['data-background-position'])
        attrString += ` data-background-position='${slideConfig['data-background-position']}'`

      if (slideConfig['data-background-repeat'])
        attrString += ` data-background-repeat='${slideConfig['data-background-repeat']}'`

      if (slideConfig['data-background-color'])
        attrString += ` data-background-color='${slideConfig['data-background-color']}'`

      if (slideConfig['data-notes'])
        attrString += ` data-notes='${slideConfig['data-notes']}'`

      if (slideConfig['data-background-video'])
        attrString += ` data-background-video='${this.resolveFilePath(slideConfig['data-background-video'], useRelativeImagePath)}'`

      if (slideConfig['data-background-video-loop'])
        attrString += ` data-background-video-loop`

      if (slideConfig['data-background-video-muted'])
        attrString += ` data-background-video-muted`

      if (slideConfig['data-transition'])
        attrString += ` data-transition='${slideConfig['data-transition']}'`

      if (slideConfig['data-background-iframe'])
        attrString += ` data-background-iframe='${this.resolveFilePath(slideConfig['data-background-iframe'], useRelativeImagePath)}'`
      
      return attrString
    }

    let i = 0
    while (i < slides.length) { 
      const slide = slides[i] 
      const slideConfig = slideConfigs[i]
      const attrString = parseAttrString(slideConfig)
      const classString = slideConfig['class'] || ''
      const idString = slideConfig['id'] ? `id="${slideConfig['id']}"` : ''

      if (!slideConfig['vertical']) {
        if (i > 0 && slideConfigs[i-1]['vertical']) // end of vertical slides
          output += '</section>'
        if (i < slides.length - 1 && slideConfigs[i+1]['vertical']) // start of vertical slides
          output += "<section>"
      }

      output += `<section ${attrString} ${idString} class=\"${classString}\">${slide}</section>`
      i += 1
    }
    if (i > 0 && slideConfigs[i-1]['vertical']) // end of vertical slides
      output += "</section>"

    return `
    <div style="display:none;">${before}</div>
    <div class="reveal">
      <div class="slides">
        ${output}
      </div>
    </div>
    `
  }

  public parseMD(inputString:string, options:MarkdownEngineRenderOption):Thenable<MarkdownEngineOutput> {
    return new Promise((resolve, reject)=> {
      this.cachedInputString = inputString // save to cache

      // process front-matter
      const fm = this.processFrontMatter(inputString, options.hideFrontMatter)
      const frontMatterTable = fm.table,
            yamlConfig = fm.data 
      inputString = fm.content

      // import external files and insert anchors if necessary 
      fileImport(inputString, this.fileDirectoryPath, this.projectDirectoryPath, {forPreview: options.isForPreview})
      .then(({outputString})=> {

        const tocTable:{[key:string]:number} = {},
              headings:Array<Heading> = [],
              slideConfigs:Array<object> = []
        let tocBracketEnabled:boolean = false
        /**
         * flag for checking whether there is change in headings.
         */
        let headingsChanged = false,
            headingOffset = 0

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
                let opt = jsonic(optMatch[0].trim())
                
                classes = opt.class,
                id = opt.id,
                ignore = opt.ignore 
              } catch(e) {
                heading = "ParameterError: " + optMatch[1]

                tokens[idx + 1].content = heading
                tokens[idx + 1].children[0].content = heading
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
              const heading1:Heading = {content: heading, level: tokens[idx].hLevel, id:id}
              headings.push(heading1)

              /**
               * check whether the heading is changed compared to the old one
               */
              if (headingOffset >= this.headings.length) headingsChanged = true
              if (!headingsChanged && headingOffset < this.headings.length) {
                const heading2 = this.headings[headingOffset]
                if (heading1.content !== heading2.content || heading1.level !== heading2.level) {
                  headingsChanged = true
                }
              }
              headingOffset += 1
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

        /**
         * render tocHTML
         */
        if (headingsChanged || headings.length !== this.headings.length) {
          const tocObject = toc(headings, {ordered: false, depthFrom: 1, depthTo: 6, tab: '\t'})
          this.tocHTML = this.md.render(tocObject.content)
        }
        this.headings = headings // reset headings information

        if (tocBracketEnabled) { // [TOC]
          html = html.replace(/^\s*\[MPETOC\]\s*/gm, this.tocHTML)
        }
      
        return this.resolveImagePathAndCodeBlock(html, options).then((html)=> {
          html = frontMatterTable + html

          /**
           * check slides
           */
          if (slideConfigs.length) {
            if (options.isForPreview) {
              html = this.parseSlides(html, slideConfigs, yamlConfig)
            } else {
              html = this.parseSlidesForExport(html, slideConfigs, options.useRelativeImagePath)
            }
            if (yamlConfig) yamlConfig.isPresentationMode = true // mark as presentation mode
          }

          this.cachedHTML = html // save to cache
          return resolve({html, markdown:inputString, tocHTML: this.tocHTML, yamlConfig})
        })
      })
    })
  }
}