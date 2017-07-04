/**
 * The core of markdown preview enhanced package.
 */
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import * as less from "less"

import * as utility from "./utility"

let INITIALIZED = false
let CONFIG_CHANGE_CALLBACK:()=>void = null

/**
 * style.less, mathjax_config.js, and mermaid_config.js files
 */
export const extensionConfig:{globalStyle:string, mathjaxConfig:object, mermaidConfig: object, phantomjsConfig: object} = {
  globalStyle: "",
  mathjaxConfig: null,
  mermaidConfig: null,
  phantomjsConfig: {}
}

/**
 * init markdown-preview-enhanced config folder at ~/.markdown-preview-enhanced
 */
export async function init():Promise<void> {
  if (INITIALIZED) return 

  const homeDir = os.homedir()
  const extensionConfigDirectoryPath = path.resolve(homeDir, './.markdown-preview-enhanced')
  if (!fs.existsSync(extensionConfigDirectoryPath)) {
    fs.mkdirSync(extensionConfigDirectoryPath)
  }

  extensionConfig.globalStyle = await utility.getGlobalStyles()
  extensionConfig.mermaidConfig = await utility.getMermaidConfig()
  extensionConfig.mathjaxConfig = await utility.getMathJaxConfig()
  extensionConfig.phantomjsConfig = await utility.getPhantomjsConfig()

  fs.watch(extensionConfigDirectoryPath, (eventType, fileName)=> {
    if (eventType === 'change' && CONFIG_CHANGE_CALLBACK) {
      if (fileName === 'style.less') { // || fileName==='mermaid_config.js' || fileName==='mathjax_config')
        utility.getGlobalStyles()
        .then((css)=> {
          extensionConfig.globalStyle = css
          CONFIG_CHANGE_CALLBACK()
        })
      } else if (fileName === 'mermaid_config.js') {
        utility.getMermaidConfig()
        .then((mermaidConfig)=> {
          extensionConfig.mermaidConfig = mermaidConfig
          CONFIG_CHANGE_CALLBACK()
        })
      } else if (fileName === 'mathjax_config.js') {
        utility.getMathJaxConfig()
        .then((mathjaxConfig)=> {
          extensionConfig.mathjaxConfig = mathjaxConfig
          CONFIG_CHANGE_CALLBACK()
        })
      }
    }
  })

  INITIALIZED = true 
  return 
}


/**
 * cb will be called when global style.less file is changed.
 * @param cb function(error, css){}
 */

export function onDidChangeConfigFile(cb:()=>void) {
  CONFIG_CHANGE_CALLBACK = cb
}
