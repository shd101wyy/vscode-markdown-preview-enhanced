/**
 * The core of markdown preview enhanced package.
 */
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import * as less from "less"

import * as utility from "./utility"

import * as globalStyle from "./global_style"

let INITIALIZED = false
let GLOBAL_LESS_CHANGE_CALLBACK = null
let GLOBAL_STYLES = ''

export async function init():Promise<void> {
  if (INITIALIZED) return 

  const homeDir = os.homedir()
  const extensionConfigDirectoryPath = path.resolve(homeDir, './.markdown-preview-enhanced')
  if (!fs.existsSync(extensionConfigDirectoryPath)) {
    fs.mkdirSync(extensionConfigDirectoryPath)
  }

  GLOBAL_STYLES = await globalStyle.getGlobalStyles()

  fs.watch(path.resolve(extensionConfigDirectoryPath, './style.less'), (eventType, fileName)=> {
    if (eventType === 'change') {
       globalStyle.getGlobalStyles()
      .then((css)=> {
        GLOBAL_STYLES = css
        if (GLOBAL_LESS_CHANGE_CALLBACK) GLOBAL_LESS_CHANGE_CALLBACK(null, css)
      })
      .catch((error)=> {
        if(GLOBAL_LESS_CHANGE_CALLBACK) GLOBAL_LESS_CHANGE_CALLBACK(error, null)
      })
    }
  })

  INITIALIZED = true 
  return 
}


export function getGlobalStyles() {
  return GLOBAL_STYLES
} 

/**
 * cb will be called when global style.less file is changed.
 * @param cb function(error, css){}
 */

export function onDidChangeGlobalStyles(cb) {
  GLOBAL_LESS_CHANGE_CALLBACK = cb
}
