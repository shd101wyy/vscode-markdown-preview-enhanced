import * as path from "path"
import {execFile} from "child_process"

export function princeConvert(src, dest):Promise<string> {
  return new Promise((resolve, reject)=> {
    execFile('prince', [src, '--javascript', '-o', dest], function(error) {
      if (error) return reject(error.toString())
      return resolve()
    })    
  })
}
