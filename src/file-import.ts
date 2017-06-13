// import * as Baby from "babyparse"
import * as path from "path"
import * as fs from "fs"
// import * as request from 'request'
// import * as less from "less"
import * as md5 from "md5"
// import * as temp from "temp"
// temp.track()


function createAnchor(lineNo) {
  return `\n\n<p data-line="${lineNo}" class="sync-line" style="margin:0;"></p>\n\n`
}

/**
 * 
 * @param inputString 
 * @param fileDirectoryPath 
 * @param projectDirectoryPath 
 * @param param3 
 */
export function fileImport(inputString:string, 
                            fileDirectoryPath:string, 
                            projectDirectoryPath:string, 
                            { filesCache = null, 
                              useAbsoluteImagePath = null,
                              imageDirectoryPath = null,
                              forPreview = false }) {
  return new Promise((resolve, reject)=> {
    let inBlock = false // inside code block

    function helper(i, lineNo=0, outputString="") {
      if (i >= inputString.length)
        return resolve({outputString})
      if (inputString[i] == '\n')
        return helper(i+1, lineNo+1, outputString+'\n')

      let end = inputString.indexOf('\n', i)
      if (end < 0) end = inputString.length
      let line = inputString.substring(i, end)

      if (line.match(/^\s*```/)) {
        inBlock = !inBlock
        return helper(end+1, lineNo+1, outputString+line+'\n')
      }

      if (inBlock)
        return helper(end+1, lineNo+1, outputString+line+'\n')

      let subjectMatch

      if (forPreview) { // insert anchors for scroll sync
        if (line.match(/^(\#|\!\[|```[^`]|@import)/)) {
          outputString += createAnchor(lineNo)
        } else if (subjectMatch = line.match(/^\<!--\s+([^\s]+)/)) {
          /*
          let subject = subjectMatch[1]
          if subjects[subject]
            line = line.replace(subject, "#{subject} lineNo:#{lineNo} ")
            outputString += createAnchor(lineNo)
          */
        }
      }

      return helper(end+1, lineNo+1, outputString+line+'\n')
    }

    return helper(0, 0, '')
  })
}