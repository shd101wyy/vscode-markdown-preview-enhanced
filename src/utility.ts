import * as path from "path"

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