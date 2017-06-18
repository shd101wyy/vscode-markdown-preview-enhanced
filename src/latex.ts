import {spawn} from "child_process"
import * as path from "path"
import * as fs from "fs"

import * as PDF from "./pdf"


function cleanUpFiles(texFilePath:string) {
  const directoryPath = path.dirname(texFilePath)
  const extensionName = path.extname(texFilePath)
  const filePrefix = path.basename(texFilePath).replace(new RegExp(extensionName + '$'), '')

  fs.readdir(directoryPath, (error, items)=> {
    if (error) return 

    items.forEach((fileName)=> {
      if (fileName.startsWith(filePrefix) && !fileName.match(/\.(la)?tex/))
        fs.unlink(path.resolve(directoryPath, fileName), ()=>{})
    })
  })
}


export function toSVGMarkdown(texFilePath:string, {latexEngine="pdflatex", svgDirectoryPath, markdownDirectoryPath, svgZoom, svgWidth, svgHeight}:
{
  latexEngine: string,
  svgDirectoryPath?: string,
  markdownDirectoryPath: string, 
  svgZoom?: string,
  svgWidth?: string, 
  svgHeight?: string 
}):Promise<string> {
return new Promise<string>((resolve, reject)=> {
  const task = spawn(latexEngine, [texFilePath], {cwd: path.dirname(texFilePath)})

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
      cleanUpFiles(texFilePath)
      return reject(Buffer.concat(errorChunks).toString())
    } else {
      const output = Buffer.concat(chunks).toString()
      if (output.indexOf('LaTeX Error') >= 0) { // meet error 
        cleanUpFiles(texFilePath)
        return reject(output)
      }

      const pdfFilePath = texFilePath.replace(/\.(la)?tex$/, '.pdf')

      PDF.toSVGMarkdown(pdfFilePath, {svgDirectoryPath, markdownDirectoryPath, svgZoom, svgWidth, svgHeight})
      .then((svgMarkdown)=> {
        cleanUpFiles(texFilePath)
        return resolve(svgMarkdown)
      })
      .catch((error)=> {
        cleanUpFiles(texFilePath)
        return reject(error)
      })
    }
  })

  task.stdin.end()
})
}