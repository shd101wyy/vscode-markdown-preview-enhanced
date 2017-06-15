import * as path from "path"
import {execFile} from "child_process"

export function princeConvert(src, dest, callback:(error:string)=>void) {
  execFile('prince', [src, '--javascript', '-o', dest], callback)
}
