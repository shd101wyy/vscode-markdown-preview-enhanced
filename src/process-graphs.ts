import * as path from "path"
import * as fs from "fs"

import * as plantumlAPI from "./puml"
import * as utility from "./utility"
import {svgElementToPNGFile} from "./magick"
let Viz = require(path.resolve(utility.extensionDirectoryPath, './dependencies/viz/viz.js'))

export async function processGraphs(text:string, 
{fileDirectoryPath, projectDirectoryPath, imageDirectoryPath, imageFilePrefix, useRelativeFilePath, codeChunksData}:
{fileDirectoryPath:string, projectDirectoryPath:string, imageDirectoryPath:string, imageFilePrefix:string, useRelativeFilePath:boolean, codeChunksData: {[key:string]: CodeChunkData}})
:Promise<{outputString:string, imagePaths: string[]}> {
  let lines = text.split('\n')
  const codes:Array<{start:number, end:number, content:string}> = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmedLine = line.trim()

    if (trimmedLine.match(/^```(.+)\"?cmd\"?\:/) || // code chunk
        trimmedLine.match(/^```(puml|plantuml|dot|viz)/)) { // graphs
      const numOfSpacesAhead = line.match(/^\s*/).length

      let j = i + 1
      let content = ''
      while (j < lines.length) {
        if (lines[j].trim() == '```' && lines[j].match(/^\s*/).length == numOfSpacesAhead) {
          codes.push({start: i, end: j, content: content.trim()})
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

  async function convertSVGToPNGFile(svg:string, lines:string[], start:number, end:number) {
    const pngFilePath = path.resolve(imageDirectoryPath, imageFilePrefix+imgCount+'.png')
    await svgElementToPNGFile(svg, pngFilePath)
    let displayPNGFilePath
    if (useRelativeFilePath) {
      displayPNGFilePath = path.relative(fileDirectoryPath, pngFilePath) + '?' + Math.random()
    } else {
      displayPNGFilePath = '/' + path.relative(projectDirectoryPath, pngFilePath) + '?' + Math.random()
    }

    imgCount++
    clearCodeBlock(lines, start, end)
    lines[end] += '\n' + `![](${displayPNGFilePath})  `

    imagePaths.push(pngFilePath)
  }

  for (let i = 0; i < codes.length; i++) {
    const codeData = codes[i]
    const {start, end, content} = codeData
    const def = lines[start].trim().slice(3).trim()

    if (def.match(/^(puml|plantuml)/)) { 
      try {
        const svg = await plantumlAPI.render(content, fileDirectoryPath)
        await convertSVGToPNGFile(svg, lines, start, end)
      } catch(error) {
        clearCodeBlock(lines, start, end)
        lines[end] += `\n` + `\`\`\`\n${error}\n\`\`\`  \n`
      }
    } else if (def.match(/^(viz|dot)/)) {
      try {
        const svg = Viz(content, {engine: "dot"})
        await convertSVGToPNGFile(svg, lines, start, end)
      } catch(error) {
        clearCodeBlock(lines, start, end)
        lines[end] += `\`\`\`\n${error}\n\`\`\`  `
      }
    } else if (currentCodeChunk) { // code chunk
      if (currentCodeChunk.options['hide']) { // remove code block
        clearCodeBlock(lines, start, end)
      } else { // remove {...} after ```lang 
        const line = lines[start]
        const indexOfFirstSpace = line.indexOf(' ', line.indexOf('```'))
        lines[start] = line.slice(0, indexOfFirstSpace)
      }

      if (currentCodeChunk.result) { // append result
        // TODO: check svg and convert it to png
        lines[end] += ('\n' + currentCodeChunk.result)
      }
      currentCodeChunk = codeChunksData[currentCodeChunk.next]
    }
  }

  await Promise.all(asyncFunctions)

  const outputString = lines.filter((line)=> line).join('\n')
  return {outputString, imagePaths}
}