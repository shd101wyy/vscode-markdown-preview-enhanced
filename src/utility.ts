import * as path from "path"
import * as fs from "fs"
import * as vscode from "vscode"
import {exec} from "child_process"

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

export function readFile(filePath):Promise<string> {
  return new Promise<string>((resolve, reject)=> {
    fs.readFile(filePath, {encoding: 'utf-8'}, (error, data)=> {
      if (error) return reject(error.toString())
      else return resolve(data)
    })
  })
}

export function writeFile(filePath, data):Promise<string> {
  return new Promise((resolve, reject)=> {
    fs.writeFile(filePath, data, {encoding: 'utf-8'}, (error)=> {
      if (error) return reject(error.toString())
      else return resolve()
    })
  }) 
}

/**
 * Display error messages
 * @param msg 
 */
export function showErrorMessage(msg) {
  vscode.window.showErrorMessage(msg)
}

export function showSuccessMessage(msg) {
  vscode.window.showInformationMessage(msg)
}

export function showWarningMessage(msg) {
  vscode.window.showWarningMessage(msg)
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