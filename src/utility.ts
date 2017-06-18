import * as path from "path"
import * as fs from "fs"
import * as os from "os"
import {exec} from "child_process"
import * as temp from "temp"
temp.track()

export function getExtensionDirectoryPath() {
  return path.resolve(__dirname, "../../") // 
}

const TAGS_TO_REPLACE = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#x27;',
    '\/': '&#x2F;',
    '\\': '&#x5C;',
}

const TAGS_TO_REPLACE_REVERSE = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': '\'',
    '&#x27;': '\'',
    '&#x2F;': '\/',
    '&#x5C;': '\\',
}

export function escapeString(str:string):string {
  return str.replace(/[&<>"'\/\\]/g, (tag)=>(TAGS_TO_REPLACE[tag] || tag))
}

export function unescapeString(str:string):string {
  return str.replace(/\&(amp|lt|gt|quot|apos|\#x27|\#x2F|\#x5C)\;/g, (whole)=> (TAGS_TO_REPLACE_REVERSE[whole] || whole))
}

export function readFile(file:string, options?):Promise<string> {
  return new Promise((resolve, reject)=> {
    fs.readFile(file, options, (error, text)=> {
      if (error) return reject(error.toString())
      else return resolve(text)
    })
  })
}

export function writeFile(file:string, text, options?) {
  return new Promise((resolve, reject)=> {
    fs.writeFile(file, text, options, (error)=> {
      if (error) return reject(error.toString())
      else return resolve()
    })
  })
}

export function write(fd:number, text:string) {
  return new Promise((resolve, reject)=> {
    fs.write(fd, text, (error)=> {
      if (error) return reject(error.toString())
      return resolve()
    })
  }) 
}

export function tempOpen(options):Promise<any> {
  return new Promise((resolve, reject)=> {
    temp.open(options, function(error, info) {
      if (error) return reject(error.toString())
      return resolve(info)
    })
  })
}

/**
 * open html file in browser or open pdf file in reader ... etc
 * @param filePath 
 */
export function openFile(filePath) {
  let cmd 
  if (process.platform === 'win32')
    cmd = 'explorer'
  else if (process.platform === 'darwin')
    cmd = 'open'
  else
    cmd = 'xdg-open'
  
  exec(`${cmd} ${filePath}`)
}

/**
 * get "~/.markdown-preview-enhanced" path
 */
export const extensionConfigDirectoryPath = path.resolve(os.homedir(), './.markdown-preview-enhanced')