/**
 * A wrapper of mermaid CLI 
 * http://knsv.github.io/mermaid/#mermaid-cli
 * But it doesn't work well
 */

import * as fs from "fs"
import * as path from "path"
import {execFile} from "child_process"
import * as temp from "temp"

import * as utility from "./utility"

export async function mermaidToPNG(mermaidCode:string, pngFilePath:string, css="mermaid.css"):Promise<string> {
  const info = await utility.tempOpen({prefix: 'mpe-mermaid', suffix: '.mermaid'})
  await utility.write(info.fd, mermaidCode)
  try {
    await utility.execFile('mermaid', 
                            [ info.path, '-p', 
                              '-o', path.dirname(info.path),
                              '--css', path.resolve(utility.extensionDirectoryPath, './dependencies/mermaid/'+ css)
                            ])
    console.log(info.path)
    fs.createReadStream(info.path + '.png').pipe(fs.createWriteStream(pngFilePath))
    fs.unlink(info.path + '.png', ()=>{})
    return pngFilePath
  } catch(error) {
    throw "mermaid CLI is required to be installed.\nCheck http://knsv.github.io/mermaid/#mermaid-cli for more information.\n\n" + error.toString()
  }
}