// `pdf2svg` is required to be installed 
// http://www.cityinthesky.co.uk/opensource/pdf2svg/
//

import * as path from "path"
import * as fs from "fs"
import {spawn} from "child_process"
import * as temp from "temp"

import * as utility from "./utility"
const extensionDirectoryPath = utility.getExtensionDirectoryPath()
const md5 = require(path.resolve(extensionDirectoryPath, './dependencies/javascript-md5/md5.js'))

let SVG_DIRECTORY_PATH:string = null 


export function toSVGMarkdown(pdfFilePath:string, {svgDirectoryPath, markdownDirectoryPath, svgZoom, svgWidth, svgHeight}:{
  markdownDirectoryPath: string,
  svgDirectoryPath?: string,
  svgZoom?: string,
  svgWidth?: string,
  svgHeight?: string
}):Promise<string> {
return new Promise<string>((resolve, reject)=> {
  if (!svgDirectoryPath) {
    if (!SVG_DIRECTORY_PATH) SVG_DIRECTORY_PATH = temp.mkdirSync('mpe_pdf')
    svgDirectoryPath = SVG_DIRECTORY_PATH
  }

  const svgFilePrefix = md5(pdfFilePath) + '_'

  const task = spawn('pdf2svg', [pdfFilePath, path.resolve(svgDirectoryPath, svgFilePrefix + '%d.svg'), 'all'])
  const chunks = []
  task.stdout.on('data', (chunk)=> {
    chunks.push(chunk)
  })

  const errorChunks = []
  task.stderr.on('data', (chunk)=> {
    errorChunks.push(chunk)
  })

  task.on('error', (error)=> {
    errorChunks.push(Buffer.from(error.toString(), 'utf-8'))
  })

  task.on('close', ()=> {
    if (errorChunks.length) {
      return reject(Buffer.concat(errorChunks).toString())
    } else {
      fs.readdir(svgDirectoryPath, (error, items)=> {
        if (error)
          return reject(error.toString())

        let svgMarkdown = ''
        const r = Math.random()
        items.forEach((fileName)=> {
          let match 
          if (match = fileName.match(new RegExp(`^${svgFilePrefix}(\\d+)\.svg`))) {
            const filePath = path.relative(markdownDirectoryPath, path.resolve(svgDirectoryPath, fileName))

            if (svgZoom || svgWidth || svgHeight)
              svgMarkdown += `<img src=\"${filePath}\" ${svgWidth ? `width="${svgWidth}"` : ""} ${svgHeight ? `height="${svgHeight}"` : ''} ${svgZoom ? `style="zoom:${svgZoom};"` : ""}>`
            else
              svgMarkdown += `![](${filePath}?${r})\n`
          }
        })

        return resolve(svgMarkdown)
      })
    }
  })
})
}