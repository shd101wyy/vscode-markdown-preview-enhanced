import * as path from "path"
import * as fs from "fs"
import * as cheerio from "cheerio"

import * as plantumlAPI from "./puml"
import * as utility from "./utility"
import {svgElementToPNGFile} from "./magick"
// import {mermaidToPNG} from "./mermaid"
import {compileLaTeX} from "./code-chunk"
const Viz = require(path.resolve(utility.extensionDirectoryPath, './dependencies/viz/viz.js'))
const jsonic = require(path.resolve(utility.extensionDirectoryPath, './dependencies/jsonic/jsonic.js'))
const md5 = require(path.resolve(utility.extensionDirectoryPath, './dependencies/javascript-md5/md5.js'))

export async function processGraphs(text:string, 
{fileDirectoryPath, projectDirectoryPath, imageDirectoryPath, imageFilePrefix, useRelativeFilePath, codeChunksData, graphsCache}:
{fileDirectoryPath:string, projectDirectoryPath:string, imageDirectoryPath:string, imageFilePrefix:string, useRelativeFilePath:boolean, codeChunksData: {[key:string]: CodeChunkData}, graphsCache:{[key:string]:string}})
:Promise<{outputString:string, imagePaths: string[]}> {
  let lines = text.split('\n')
  const codes:Array<{start:number, end:number, content:string, options:object, optionsStr:string}> = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmedLine = line.trim()

    if (trimmedLine.match(/^```(.+)\"?cmd\"?\:/) || // code chunk
        trimmedLine.match(/^```(puml|plantuml|dot|viz|mermaid)/)) { // graphs
      const numOfSpacesAhead = line.match(/^\s*/).length
      let j = i + 1
      let content = ''
      while (j < lines.length) {
        if (lines[j].trim() == '```' && lines[j].match(/^\s*/).length == numOfSpacesAhead) {
          let options = {},
              optionsStr = '',
              optionsMatch
          if (optionsMatch = trimmedLine.match(/\{(.+)\}$/)) {
            try {
              options = jsonic(optionsMatch[0])
              optionsStr = optionsMatch[1]
            } catch(error) {
              options = {}
            }
          }

          codes.push({
            start: i, 
            end: j, 
            content,
            options,
            optionsStr
          })
          i = j
          break
        }
        content += (lines[j]+'\n')
        j += 1
      }
    } else if (trimmedLine.match(/^```\S/)) { // remove {...} after ```lang
      const indexOfFirstSpace = line.indexOf(' ', line.indexOf('```'))
      if (indexOfFirstSpace > 0)
        lines[i] = line.slice(0, indexOfFirstSpace)
    } else if (!trimmedLine) {
      lines[i] = '  '
    } 

    i += 1
  }  

  if (!imageFilePrefix) 
    imageFilePrefix = (Math.random().toString(36).substr(2, 9) + '_')
  
  imageFilePrefix = imageFilePrefix.replace(/[\/&]/g, '_ss_')
  imageFilePrefix = encodeURIComponent(imageFilePrefix)

  let imgCount = 0

  const asyncFunctions = [],
        imagePaths = []

  let currentCodeChunk:CodeChunkData = null 
  for (let key in codeChunksData) { // get the first code chunk.
    if (!codeChunksData[key].prev) {
      currentCodeChunk = codeChunksData[key]
      break
    }
  }

  function clearCodeBlock(lines:string[], start:number, end:number) {
    let i = start
    while (i <= end) {
      lines[i] = ''
      i += 1
    }
  }

  async function convertSVGToPNGFile(svg:string, lines:string[], start:number, end:number, modifyCodeBlock:boolean) {
    const pngFilePath = path.resolve(imageDirectoryPath, imageFilePrefix+imgCount+'.png')
    await svgElementToPNGFile(svg, pngFilePath)
    let displayPNGFilePath
    if (useRelativeFilePath) {
      displayPNGFilePath = path.relative(fileDirectoryPath, pngFilePath) + '?' + Math.random()
    } else {
      displayPNGFilePath = '/' + path.relative(projectDirectoryPath, pngFilePath) + '?' + Math.random()
    }

    imgCount++
  
    if (modifyCodeBlock) {
      clearCodeBlock(lines, start, end)
      lines[end] += '\n' + `![](${displayPNGFilePath})  `
    }

    imagePaths.push(pngFilePath)
    return displayPNGFilePath
  }

  for (let i = 0; i < codes.length; i++) {
    const codeData = codes[i]
    const {start, end, content, options, optionsStr} = codeData
    const def = lines[start].trim().slice(3).trim()

    if (def.match(/^(puml|plantuml)/)) { 
      try {
        const checksum = md5(optionsStr + content)
        let svg 
        if (!(svg = graphsCache[checksum])) { // check whether in cache
          svg = await plantumlAPI.render(content, fileDirectoryPath)
        }
        await convertSVGToPNGFile(svg, lines, start, end, true)
      } catch(error) {
        clearCodeBlock(lines, start, end)
        lines[end] += `\n` + `\`\`\`\n${error}\n\`\`\`  \n`
      }
    } else if (def.match(/^(viz|dot)/)) {
      try {
        const checksum = md5(optionsStr + content)
        let svg 
        if (!(svg = graphsCache[checksum])) {
          const engine = options['engine'] || 'dot'
          svg = Viz(content, {engine})
        }
        await convertSVGToPNGFile(svg, lines, start, end, true)
      } catch(error) {
        clearCodeBlock(lines, start, end)
        lines[end] += `\n` + `\`\`\`\n${error}\n\`\`\`  \n`
      }
    } else if (def.match(/^mermaid/))  {
      // do nothing as it doesn't work well...
      /*
      try {
        const pngFilePath = path.resolve(imageDirectoryPath, imageFilePrefix+imgCount+'.png')
        imgCount++
        await mermaidToPNG(content, pngFilePath)

        let displayPNGFilePath
        if (useRelativeFilePath) {
          displayPNGFilePath = path.relative(fileDirectoryPath, pngFilePath) + '?' + Math.random()
        } else {
          displayPNGFilePath = '/' + path.relative(projectDirectoryPath, pngFilePath) + '?' + Math.random()
        }
        clearCodeBlock(lines, start, end)
        
        lines[end] += '\n' + `![](${displayPNGFilePath})  `

        imagePaths.push(pngFilePath)
      } catch(error) {
        clearCodeBlock(lines, start, end)
        lines[end] += `\n` + `\`\`\`\n${error}\n\`\`\`  \n`
      }
      */
    } else if (currentCodeChunk) { // code chunk
      if (currentCodeChunk.options['hide']) { // remove code block
        clearCodeBlock(lines, start, end)
      } else { // remove {...} after ```lang  
        const line = lines[start]
        const indexOfFirstSpace = line.indexOf(' ', line.indexOf('```'))
        lines[start] = line.slice(0, indexOfFirstSpace)
      }

      if (currentCodeChunk.result) { // append result
        let result = currentCodeChunk.result
        const options = currentCodeChunk.options
        if (options['output'] === 'html' || options['matplotlib']) { // check svg and convert it to png
          const $ = cheerio.load(currentCodeChunk.result, {xmlMode: true}) // xmlMode here is necessary...
          const svg = $('svg')
          if (svg.length === 1) {
            const pngFilePath = await convertSVGToPNGFile($.html('svg'), lines, start, end, false)
            result = `![](${pngFilePath})  \n`
          }
        } else if (options['cmd'].match(/^(la)?tex$/)) { // for latex, need to run it again to generate svg file in currect directory.
          result = await compileLaTeX(content, fileDirectoryPath, Object.assign({}, options, {latex_svg_dir: imageDirectoryPath}))
        } else if (currentCodeChunk.options['output'] === 'markdown') {
          result = currentCodeChunk.plainResult
        }

        lines[end] += ('\n' + result)
      }
      currentCodeChunk = codeChunksData[currentCodeChunk.next]
    }
  }

  await Promise.all(asyncFunctions)

  const outputString = lines.filter((line)=> line).join('\n')
  return {outputString, imagePaths}
}