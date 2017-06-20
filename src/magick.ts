/**
 * ImageMagick magick command wrapper
 */

import * as fs from "fs"
import * as path from "path"
import {execFile} from "child_process"
import * as temp from "temp"

import * as utility from "./utility"

export async function svgElementToPNGFile(svgElement:string, pngFilePath:string):Promise<string> {
  const info = await utility.tempOpen({prefix: "mpe-svg", suffix:'.svg'})
  await utility.write(info.fd, svgElement) // write svgElement to temp .svg file
  try {
    await utility.execFile('magick', [info.path, pngFilePath])
  } catch(error) {
    throw "ImageMagick is required to be installed to convert svg to png.\n" + error.toString()
  }
  return pngFilePath
}