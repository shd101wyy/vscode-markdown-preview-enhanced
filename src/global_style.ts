import * as path from "path"
import * as os from "os"
import * as less from "less"

import * as utility from "./utility"

/**
 * compile ~/.markdown-preview-enhanced/style.less and return 'css' content.
 */
export async function getGlobalStyles():Promise<string> {
  const homeDir = os.homedir()
  const globalLessFilePath = path.resolve(homeDir, './.markdown-preview-enhanced/style.less')

  let fileContent:string
  try {
    fileContent = await utility.readFile(globalLessFilePath, {encoding: 'utf-8'})
  } catch(e) {
        // create style.less file 
    fileContent = `
.markdown-preview-enhanced.markdown-preview-enhanced {
  // modify your style here
  // eg: background-color: blue;
}    `
    await utility.writeFile(globalLessFilePath, fileContent, {encoding: 'utf-8'})
  }

  return await new Promise<string>((resolve, reject)=> {
    less.render(fileContent, {paths: [path.dirname(globalLessFilePath)]}, (error, output)=> {
      if (error) return reject(error)
      return resolve(output.css || '')
    })
  })
}