import * as path from "path"
import {execFile} from "child_process"

export function princeConvert(src, dest):Promise<string> {
  return new Promise((resolve, reject)=> {
    execFile('prince', [src, '--javascript', '-o', dest], function(error:Error) {
      if (error) {
        let errorMessage = error.toString()
        if (error.message.indexOf('spawn prince ENOENT') >= 0) {
          errorMessage = '"princexml" is required to be installed.'
        }
        return reject(errorMessage)
      }
      return resolve()
    })    
  })
}
