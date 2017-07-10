import * as path from "path"
import * as fs from "fs"
import * as os from "os"
import {exec} from "child_process"
import * as child_process from "child_process"
import * as less from "less"
import * as mkdirp_ from "mkdirp"

import * as temp from "temp"
temp.track()

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

export function execFile(file:string, args:string[], options?:object):Promise<string> {
  return new Promise((resolve, reject)=> {
    child_process.execFile(file, args, options, (error, stdout, stderr)=> {
      if (error) return reject(error.toString())
      else if (stderr) return reject(stderr)
      else return resolve(stdout)
    })
  })
}

export function mkdirp(dir:string):Promise<boolean> {
  return new Promise((resolve, reject)=> {
    mkdirp_(dir, (error, made)=> {
      if (error) return reject(error)
      return resolve(made)
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

/**
 * get the directory path of this extension.
 */
export const extensionDirectoryPath = path.resolve(__dirname, "../../")


/**
 * compile ~/.markdown-preview-enhanced/style.less and return 'css' content.
 */
export async function getGlobalStyles():Promise<string> {
  const homeDir = os.homedir()
  const globalLessFilePath = path.resolve(homeDir, './.markdown-preview-enhanced/style.less')

  let fileContent:string
  try {
    fileContent = await readFile(globalLessFilePath, {encoding: 'utf-8'})
  } catch(e) {
        // create style.less file 
    fileContent = `
.markdown-preview-enhanced.markdown-preview-enhanced {
  // modify your style here
  // eg: background-color: blue;
}    `
    await writeFile(globalLessFilePath, fileContent, {encoding: 'utf-8'})
  }

  return await new Promise<string>((resolve, reject)=> {
    less.render(fileContent, {paths: [path.dirname(globalLessFilePath)]}, (error, output)=> {
      if (error) return reject(error)
      return resolve(output.css || '')
    })
  })
}

/**
 * load ~/.markdown-preview-enhanced/mermaid_config.js file.  
 */
export async function getMermaidConfig():Promise<string> {
  const homeDir = os.homedir()
  const mermaidConfigPath = path.resolve(homeDir, './.markdown-preview-enhanced/mermaid_config.js')

  let mermaidConfig:string
  if (fs.existsSync(mermaidConfigPath)) {
    try {
      mermaidConfig = await readFile(mermaidConfigPath, {encoding: 'utf-8'})
    } catch(e) {
      mermaidConfig = `MERMAID_CONFIG = {startOnLoad: false}`
    }
  } else {
    const fileContent = `// config mermaid init call
// http://knsv.github.io/mermaid/#configuration
//
// You can edit the 'MERMAID_CONFIG' variable below.
MERMAID_CONFIG = {
  startOnLoad: false
}
`
    await writeFile(mermaidConfigPath, fileContent, {encoding: 'utf-8'})
    mermaidConfig = `MERMAID_CONFIG = {startOnLoad: false}`
  }

  return mermaidConfig
}

/**
 * load ~/.markdown-preview-enhanced/phantomjs_config.js file.  
 */
export async function getPhantomjsConfig():Promise<object> {
  const homeDir = os.homedir()
  const phantomjsConfigPath = path.resolve(homeDir, './.markdown-preview-enhanced/phantomjs_config.js')

  let phantomjsConfig:object
  if (fs.existsSync(phantomjsConfigPath)) {
    try {
      delete require.cache[phantomjsConfigPath] // return uncached
      phantomjsConfig = require(phantomjsConfigPath)
    } catch(e) {
      phantomjsConfig = {}
    }
  } else {
    const fileContent = `/*
configure header and footer (and other options)
more information can be found here:
    https://github.com/marcbachmann/node-html-pdf
Attention: this config will override your config in exporter panel.

eg:

  let config = {
    "header": {
      "height": "45mm",
      "contents": '<div style="text-align: center;">Author: Marc Bachmann</div>'
    },
    "footer": {
      "height": "28mm",
      "contents": '<span style="color: #444;">{{page}}</span>/<span>{{pages}}</span>'
    }
  }
*/
// you can edit the 'config' variable below
let config = {
}

module.exports = config || {}
`
    await writeFile(phantomjsConfigPath, fileContent, {encoding: 'utf-8'})
    phantomjsConfig = {}
  }

  return phantomjsConfig
}

const defaultMathjaxConfig = {
  extensions: ['tex2jax.js'],
  jax: ['input/TeX','output/HTML-CSS'],
  messageStyle: 'none',
  tex2jax: {
    processEnvironments: false,
    processEscapes: true
  },
  TeX: {
    extensions: ['AMSmath.js', 'AMSsymbols.js', 'noErrors.js', 'noUndefined.js']
  },
  'HTML-CSS': { availableFonts: ['TeX'] }
}

/**
 * load ~/.markdown-preview-enhanced/mermaid_config.js file.  
 */
export async function getMathJaxConfig():Promise<object> {
  const homeDir = os.homedir()
  const mathjaxConfigPath = path.resolve(homeDir, './.markdown-preview-enhanced/mathjax_config.js')

  let mathjaxConfig:object
  if (fs.existsSync(mathjaxConfigPath)) {
    try {
      delete require.cache[mathjaxConfigPath] // return uncached
      mathjaxConfig = require(mathjaxConfigPath)
    } catch(e) {
      mathjaxConfig = defaultMathjaxConfig
    }
  } else {
    const fileContent = `
module.exports = {
  extensions: ['tex2jax.js'],
  jax: ['input/TeX','output/HTML-CSS'],
  messageStyle: 'none',
  tex2jax: {
    processEnvironments: false,
    processEscapes: true
  },
  TeX: {
    extensions: ['AMSmath.js', 'AMSsymbols.js', 'noErrors.js', 'noUndefined.js']
  },
  'HTML-CSS': { availableFonts: ['TeX'] }
}
`
    await writeFile(mathjaxConfigPath, fileContent, {encoding: 'utf-8'})
    mathjaxConfig = defaultMathjaxConfig
  }

  return mathjaxConfig
}

export async function getExtensionConfig():Promise<object> {
  const homeDir = os.homedir()
  const extensionConfigFilePath = path.resolve(homeDir, './.markdown-preview-enhanced/config.json')

  let config:object 
  if (fs.existsSync(extensionConfigFilePath)) {
    try {
      delete require.cache[extensionConfigFilePath] // return uncached
      config = require(extensionConfigFilePath)
    } catch(error) {
      config = {error: error}
    }
  } else {
    config = {}
    await writeFile(extensionConfigFilePath, '{}', {encoding: 'utf-8'})
  }
  return config
}

export async function getParserConfig():Promise<object> {
  const homeDir = os.homedir()
  const parserConfigPath = path.resolve(homeDir, './.markdown-preview-enhanced/parser.js')

  let parserConfig:object
  if (fs.existsSync(parserConfigPath)) {
    try {
      delete require.cache[parserConfigPath] // return uncached
      parserConfig = require(parserConfigPath)
    } catch(error) {
      parserConfig = {}
    }
  } else {
    const template = `module.exports = {
  onWillParseMarkdown: async function(markdown) {
    return markdown
  },
  onDidParseMarkdown: async function(html) {
    return html
  }
}
`
    await writeFile(parserConfigPath, template, {encoding: 'utf-8'})

    parserConfig = {}
  }

  return parserConfig
}

/**
 * Check whether two arrays are equal
 * @param x 
 * @param y 
 */
export function isArrayEqual(x, y) {
  if (x.length !== y.length) return false 
  for (let i = 0; i < x.length; i++) {
    if (x[i] !== y[i]) return false
  }
  return true 
}

/**
 * Add file:// to file path
 * @param filePath 
 */
export function addFileProtocol(filePath:string):string {
  if (!filePath.startsWith('file://')) {
    filePath = 'file:///' + filePath
  }
  filePath = filePath.replace(/^file\:\/+/, 'file:///')
  return filePath
}

/**
 * style.less, 
 * mathjax_config.js, 
 * mermaid_config.js 
 * phantomjs_config.js
 * config.json
 * 
 * files
 */
export const extensionConfig:
{ globalStyle:string
  mathjaxConfig:object 
  mermaidConfig: string
  phantomjsConfig: object
  parserConfig: object
  config: object } = {

  globalStyle: "",
  mathjaxConfig: null,
  mermaidConfig: "MERMAID_CONFIG = {startOnLoad: false}",
  phantomjsConfig: {},
  parserConfig: {},
  config: {}
}