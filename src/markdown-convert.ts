/**
 * Convert MPE markdown to Githb Flavored Markdown
 */

import * as path from "path"
import * as fs from "fs"
import * as mkdirp from "mkdirp"
// processGraphs = require './process-graphs'
// encrypt = require './encrypt'
// CACHE = require './cache'
import {transformMarkdown} from "./transformer"
import * as utility from "./utility"
import {processGraphs} from "./process-graphs"
const md5 = require(path.resolve(utility.extensionDirectoryPath, './dependencies/javascript-md5/md5.js'))


/**
 * Convert all math expressions inside markdown to images.  
 * @param text input markdown text
 * @param config 
 */
function processMath(text:string, {mathInlineDelimiters, mathBlockDelimiters}):string {
  let line = text.replace(/\\\$/g, '#slash_dollarsign#')

  const inline = mathInlineDelimiters
  const block = mathBlockDelimiters

  const inlineBegin = '(?:' + inline.map((x)=> x[0])
                      .join('|')
                      .replace(/\\/g, '\\\\')
                      .replace(/([\(\)\[\]\$])/g, '\\$1') + ')'
  const inlineEnd = '(?:' + inline.map((x)=> x[1])
                      .join('|')
                      .replace(/\\/g, '\\\\')
                      .replace(/([\(\)\[\]\$])/g, '\\$1') + ')'
  const blockBegin = '(?:' + block.map((x)=> x[0])
                      .join('|')
                      .replace(/\\/g, '\\\\')
                      .replace(/([\(\)\[\]\$])/g, '\\$1') + ')'
  const blockEnd = '(?:' + block.map((x)=> x[1])
                      .join('|')
                      .replace(/\\/g, '\\\\')
                      .replace(/([\(\)\[\]\$])/g, '\\$1') + ')'

  // display
  line = line.replace(new RegExp(`(\`\`\`(?:[\\s\\S]+?)\`\`\`\\s*(?:\\n|$))|(?:${blockBegin}([\\s\\S]+?)${blockEnd})`, 'g'), ($0, $1, $2)=> {
    if ($1) return $1
    let math = $2
    math = math.replace(/\n/g, '').replace(/\#slash\_dollarsign\#/g, '\\\$')
    math = utility.escapeString(math)
    return `<p align="center"><img src=\"https://latex.codecogs.com/gif.latex?${math.trim()}\"/></p>`
  })

  // inline
  line = line.replace(new RegExp(`(\`\`\`(?:[\\s\\S]+?)\`\`\`\\s*(?:\\n|$))|(?:${inlineBegin}([\\s\\S]+?)${inlineEnd})`, 'g'), ($0, $1, $2)=> {
    if ($1) return $1
    let math = $2
    math = math.replace(/\n/g, '').replace(/\#slash\_dollarsign\#/g, '\\\$')
    math = utility.escapeString(math)
    return `<img src=\"https://latex.codecogs.com/gif.latex?${math.trim()}\"/>`
  })

  line = line.replace(/\#slash\_dollarsign\#/g, '\\\$')
  return line
}

/**
 * Format paths
 * @param text 
 * @param fileDirectoryPath 
 * @param projectDirectoryPath 
 * @param useRelativeFilePath 
 * @param protocolsWhiteListRegExp 
 */
function processPaths(text, fileDirectoryPath, projectDirectoryPath, useRelativeFilePath, protocolsWhiteListRegExp:RegExp) {
  let match = null,
      offset = 0,
      output = ''

  function resolvePath(src) {
    if (src.match(protocolsWhiteListRegExp))
      return src

    if (useRelativeFilePath) {
      if (src.startsWith('/'))
        return path.relative(fileDirectoryPath, path.resolve(projectDirectoryPath, '.'+src))
      else // ./test.png or test.png
        return src
    }
    else {
      if (src.startsWith('/'))
        return src
      else // ./test.png or test.png
        return '/' + path.relative(projectDirectoryPath, path.resolve(fileDirectoryPath, src))
    }
  }

  let inBlock = false
  let lines = text.split('\n')
  lines = lines.map((line)=> {
    if (line.match(/^\s*```/)) {
      inBlock = !inBlock
      return line
    }
    else if (inBlock)
      return line
    else {
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

export async function markdownConvert(text, 
{projectDirectoryPath, fileDirectoryPath, protocolsWhiteListRegExp, filesCache, mathInlineDelimiters, mathBlockDelimiters, codeChunksData, graphsCache, usePandocParser}:
{projectDirectoryPath:string, fileDirectoryPath:string, protocolsWhiteListRegExp:RegExp, filesCache:{[key:string]:string}, mathInlineDelimiters:string[][], mathBlockDelimiters:string[][], codeChunksData:{[key:string]:CodeChunkData}, graphsCache:{[key:string]:string}, usePandocParser: boolean}, 
config:object):Promise<string> {
  if (!config['path'])
    throw '{path} has to be specified'

  if (!config['image_dir'])
    throw '{image_dir} has to be specified'

  // dest
  let outputFilePath
  if (config['path'][0] == '/')
    outputFilePath = path.resolve(projectDirectoryPath, '.' + config['path'])
  else
    outputFilePath = path.resolve(fileDirectoryPath, config['path'])

  for (let key in filesCache) {
    if (key.endsWith('.pdf')) 
      delete(filesCache[key])
  }

  let imageDirectoryPath:string
  if (config['image_dir'][0] === '/')
    imageDirectoryPath = path.resolve(projectDirectoryPath, '.' + config['image_dir'])
  else
    imageDirectoryPath = path.resolve(fileDirectoryPath, config['image_dir'])

  const useRelativeFilePath = !config['absolute_image_path']

  // import external files
  const data = await transformMarkdown(text, {fileDirectoryPath, projectDirectoryPath, useRelativeFilePath, filesCache, forPreview:false, protocolsWhiteListRegExp, imageDirectoryPath, usePandocParser})
  text = data.outputString
  
  // change link path to project '/' path
  // this is actually differnet from pandoc-convert.coffee
  text = processPaths(text, fileDirectoryPath, projectDirectoryPath, useRelativeFilePath, protocolsWhiteListRegExp)

  text = processMath(text, {mathInlineDelimiters, mathBlockDelimiters})

  return await new Promise<string>((resolve, reject)=> {
    mkdirp(imageDirectoryPath, (error, made)=> {
      if (error) return reject(error.toString())

      processGraphs(text, 
      {fileDirectoryPath, projectDirectoryPath, imageDirectoryPath, imageFilePrefix: md5(outputFilePath), useRelativeFilePath, codeChunksData, graphsCache})
      .then(({outputString})=> {
        fs.writeFile(outputFilePath, outputString, {encoding: 'utf-8'}, (error)=> {
          if (error) return reject(error.toString())
          return resolve(outputFilePath)
        })
      })
    })
  })
}



