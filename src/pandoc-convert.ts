import * as path from "path"
import * as fs from "fs"
import {execFile} from "child_process"
import * as mkdirp from "mkdirp"

const matter = require('gray-matter')

import {transformMarkdown} from "./transformer"
import {processGraphs} from "./process-graphs"
import * as utility from "./utility"
const md5 = require(path.resolve(utility.extensionDirectoryPath, './dependencies/javascript-md5/md5.js'))

function getFileExtension(documentType:string) {
  if (documentType === 'pdf_document' || documentType === 'beamer_presentation')
    return 'pdf'
  else if (documentType === 'word_document')
    return 'docx'
  else if (documentType === 'rtf_document')
    return 'rtf'
  else if (documentType === 'custom_document')
    return '*'
  else
    return null
}

/**
 * eg: process config inside pdf_document block
 */ 
function processOutputConfig(config:object, args:string[]) {
  if (config['toc'])
    args.push('--toc')

  if (config['toc_depth'])
    args.push('--toc-depth='+config['toc_depth'])

  if (config['highlight']) {
    if (config['highlight'] == 'default')
      config['highlight'] = 'pygments'
    args.push('--highlight-style='+config['highlight'])
  }

  if (config['reference_docx']) { // issue #448
    args.push('--reference_docx=' + config['reference_docx'])
  }

  if (config['highlight'] === null)
    args.push('--no-highlight')

  if (config['pandoc_args']) 
    config['pandoc_args'].forEach((arg)=> args.push(arg))

  if (config['citation_package']) {
    if (config['citation_package'] === 'natbib')
      args.push('--natbib')
    else if (config['citation_package'] == 'biblatex')
      args.push('--biblatex')
  }

  if (config['number_sections'])
    args.push('--number-sections')

  if (config['incremental'])
    args.push('--incremental')

  if (config['slide_level'])
    args.push('--slide-level='+config['slide_level'])

  if (config['theme'])
    args.push('-V', 'theme:'+config['theme'])

  if (config['colortheme'])
    args.push('-V', 'colortheme:'+config['colortheme'])

  if (config['fonttheme'])
    args.push('-V', 'fonttheme:'+config['fonttheme'])

  if (config['latex_engine'])
    args.push('--latex-engine='+config['latex_engine'])

  if (config['includes'] && typeof(config['includes']) === 'object') {
    let includesConfig = config['includes']
    const helper = (prefix, data)=> {
      if (typeof(data) == 'string')
        args.push(prefix+data)
      else if (data.constructor === Array) {
        data.forEach((d)=> args.push(prefix+d))
      }
      else
        args.push(prefix+data)
    }

    // TODO: includesConfig['in_header'] is array
    if (includesConfig['in_header'])
      helper('--include-in-header=', includesConfig['in_header'])
    if (includesConfig['before_body'])
      helper('--include-before-body=', includesConfig['before_body'])
    if (includesConfig['after_body'])
      helper('--include-after-body=', includesConfig['after_body'])
  }

  if (config['template'])
    args.push('--template=' + config['template'])
}

function loadOutputYAML(fileDirectoryPath, config) {
  const yamlPath = path.resolve(fileDirectoryPath, '_output.yaml')
  let yaml:string = ""
  try {
    yaml = fs.readFileSync(yamlPath, {encoding: 'utf-8'})
  } catch (error) {
    return Object.assign({}, config)
  }

  let data:any = matter('---\n'+yaml+'---\n').data
  data = data || {}

  if (config['output']) {
    if (typeof(config['output']) === 'string' && data[config['output']]) {
      const format = config['output']
      config['output'] = {}
      config['output'][format] = data[format]
    } else {
      const format = Object.keys(config['output'])[0]
      if (data[format])
        config['output'][format] = Object.assign({}, data[format], config['output'][format])
    }
  }
  return Object.assign({}, data, config)
}

/*
function processConfigPaths(config, fileDirectoryPath, projectDirectoryPath)->
  # same as the one in processPaths function
  # TODO: refactor in the future
  resolvePath = (src)->
    if src.startsWith('/')
      return path.relative(fileDirectoryPath, path.resolve(projectDirectoryPath, '.'+src))
    else # ./test.png or test.png
      return src

  helper = (data)->
    if typeof(data) == 'string'
      return resolvePath(data)
    else if data.constructor == Array
      return data.map (d)->resolvePath(d)
    else
      data

  if config['bibliography']
    config['bibliography'] = helper(config['bibliography'])

  if config['csl']
    config['csl'] = helper(config['csl'])

  if config['output'] and typeof(config['output']) == 'object'
    documentFormat = Object.keys(config['output'])[0]
    outputConfig = config['output'][documentFormat]
    if outputConfig['includes']
      if outputConfig['includes']['in_header']
        outputConfig['includes']['in_header'] = helper(outputConfig['includes']['in_header'])
      if outputConfig['includes']['before_body']
        outputConfig['includes']['before_body'] = helper(outputConfig['includes']['before_body'])
      if outputConfig['includes']['after_body']
        outputConfig['includes']['after_body'] = helper(outputConfig['includes']['after_body'])

    if outputConfig['reference_docx']
      outputConfig['reference_docx'] = helper(outputConfig['reference_docx'])

    if outputConfig['template']
      outputConfig['template'] = helper(outputConfig['template'])
*/

function processPaths(text, fileDirectoryPath, projectDirectoryPath) {
  let match = null,
      offset = 0,
      output = ''

  function resolvePath(src) {
    if (src.startsWith('/'))
      return path.relative(fileDirectoryPath, path.resolve(projectDirectoryPath, '.'+src))
    else // ./test.png or test.png
      return src
  }

  let inBlock = false
  let lines = text.split('\n')
  lines = lines.map((line)=> {
    if (line.match(/^\s*```/)) {
      inBlock = !inBlock
      return line
    } else if (inBlock) {
      return line
    } else {
      // replace path in ![](...) and []()
      let r = /(\!?\[.*?]\()([^\)|^'|^"]*)(.*?\))/gi
      line = line.replace(r, (whole, a, b, c)=> {
        if (b[0] === '<') {
          b = b.slice(1, b.length-1)
          return a + '<' + resolvePath(b.trim()) + '> ' + c
        } else {
          return a + resolvePath(b.trim()) + ' ' + c
        }
      })

      // replace path in tag
      r = /(<[img|a|iframe].*?[src|href]=['"])(.+?)(['"].*?>)/gi
      line = line.replace(r, (whole, a, b, c)=> {
        return a + resolvePath(b) + c
      })
      return line
    }
  })

  return lines.join('\n')
}

/*
@param {String} text: markdown string
@param {Object} all properties are required!
  @param {String} fileDirectoryPath
  @param {String} projectDirectoryPath
  @param {String} sourceFilePath
callback(err, outputFilePath)
*/
/**
 * @return outputFilePath
 */
export async function pandocConvert(text, 
  {fileDirectoryPath, projectDirectoryPath, sourceFilePath, filesCache, protocolsWhiteListRegExp, /*deleteImages=true,*/ codeChunksData, imageDirectoryPath}, 
  config={}):Promise<string> {
    
  config = loadOutputYAML(fileDirectoryPath, config)
  // TODO =>
  //     args = ['-f', atom.config.get('markdown-preview-enhanced.pandocMarkdownFlavor').replace(/\-raw\_tex/, '')]
  const args = []

  let extension = null
  let outputConfig = null
  let documentFormat = null
  if (config['output']) {
    if (typeof(config['output']) == 'string') {
      documentFormat = config['output']
      extension = getFileExtension(documentFormat)
    }
    else {
      documentFormat = Object.keys(config['output'])[0]
      extension = getFileExtension(documentFormat)
      outputConfig = config['output'][documentFormat]
    }
  } else {
    throw "Output format needs to be specified."
  }

  if (extension === null) throw "Invalid document type."

  // custom_document requires path to be defined
  if (documentFormat == 'custom_document' && (!outputConfig || !outputConfig['path']))
    throw 'custom_document requires path to be defined.'

  if (documentFormat === 'beamer_presentation')
    args.push('-t', 'beamer')

  // dest
  let outputFilePath
  if (outputConfig && outputConfig['path']) {
    outputFilePath = outputConfig['path']
    if (outputFilePath.startsWith('/'))
      outputFilePath = path.resolve(projectDirectoryPath, '.'+outputFilePath)
    else
      outputFilePath = path.resolve(fileDirectoryPath, outputFilePath)

    if (documentFormat !== 'custom_document' && path.extname(outputFilePath) !== '.' + extension)
      throw ('Invalid extension for ' + documentFormat + '. Extension .' + extension + ' is required, but ' + path.extname(outputFilePath) + ' was provided.')

    args.push('-o', outputFilePath)
  } else {
    outputFilePath = sourceFilePath
    outputFilePath = outputFilePath.slice(0, outputFilePath.length - path.extname(outputFilePath).length) + '.' + extension
    args.push('-o', outputFilePath)
  }

  // NOTE: 0.12.4 No need to resolve paths.
  // #409: https://github.com/shd101wyy/markdown-preview-enhanced/issues/409
  // resolve paths in front-matter(yaml)
  // processConfigPaths config, fileDirectoryPath, projectDirectoryPath

  if (outputConfig)
    processOutputConfig(outputConfig, args)

  // add front-matter(yaml) to text
  text = matter.stringify(text, config)

  // import external files
  let data = await transformMarkdown(text, {fileDirectoryPath, projectDirectoryPath, useRelativeFilePath:true, filesCache, protocolsWhiteListRegExp, forPreview: false})
  text = data.outputString

  // change link path to relative path
  text = processPaths(text, fileDirectoryPath, projectDirectoryPath)

  // change working directory
  const cwd = process.cwd()
  process.chdir(fileDirectoryPath)

  // citation
  if (config['bibliography'] || config['references'])
    args.push('--filter', 'pandoc-citeproc')

  if (imageDirectoryPath[0] === '/') 
    imageDirectoryPath = path.resolve(projectDirectoryPath, '.' + imageDirectoryPath)
  else 
    imageDirectoryPath = path.resolve(fileDirectoryPath, imageDirectoryPath)
  await utility.mkdirp(imageDirectoryPath) // create imageDirectoryPath

  const {outputString, imagePaths} = await processGraphs(text, 
      {fileDirectoryPath, projectDirectoryPath, imageDirectoryPath, imageFilePrefix: md5(outputFilePath), useRelativeFilePath:true, codeChunksData})    
  
  // pandoc will cause error if directory doesn't exist,
  // therefore I will create directory first.
  await utility.mkdirp(path.dirname(outputFilePath))

  return await new Promise<string>((resolve, reject)=> {
    // const pandocPath = atom.config.get('markdown-preview-enhanced.pandocPath')
    const pandocPath = 'pandoc'
    const program = execFile(pandocPath, args, (error)=> {
      /*if (deleteImages) {
        imagePaths.forEach((p)=> fs.unlink(p, (error)=>{}))
      }*/

      process.chdir(cwd) // change cwd back

      if (error) return reject(error.toString())
      return resolve(outputFilePath)
    })

    program.stdin.end(outputString)
  })
}