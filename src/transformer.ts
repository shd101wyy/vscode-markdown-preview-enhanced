// import * as Baby from "babyparse"
import * as path from "path"
import * as fs from "fs"
// import * as request from 'request'
// import * as less from "less"
// import * as md5 from "md5"
// import * as temp from "temp"
// temp.track()

import {CustomSubjects} from "./custom-subjects"


function createAnchor(lineNo) {
  return `\n\n<p data-line="${lineNo}" class="sync-line" style="margin:0;"></p>\n\n`
}

interface TransformMarkdownOutput {
  outputString: string,
  /**
   * An array of slide configs.  
   */
  slideConfigs: Array<object>,
  /**
   * whehter we found [TOC] in markdown file or not.  
   */
  tocBracketEnabled: boolean
}

/**
 * 
 * @param inputString 
 * @param fileDirectoryPath 
 * @param projectDirectoryPath 
 * @param param3 
 */
export async function transformMarkdown(inputString:string, 
                            fileDirectoryPath:string, 
                            projectDirectoryPath:string, 
                            { filesCache = null, 
                              useAbsoluteImagePath = null,
                              imageDirectoryPath = null,
                              forPreview = false }):Promise<TransformMarkdownOutput> {
    let inBlock = false // inside code block
    const tocConfigs = [],
          slideConfigs = []
    let tocBracketEnabled = false 

    function helper(i, lineNo=0, outputString=""):TransformMarkdownOutput {
      if (i >= inputString.length) { // done 
        return {outputString, slideConfigs, tocBracketEnabled}
      }

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

      if (line.match(/^(\#|\!\[|```[^`]|@import)/)) {
        if (forPreview) outputString += createAnchor(lineNo) // insert anchor for scroll sync
      } else if (subjectMatch = line.match(/^\<!--\s+([^\s]+)/)) {
        if (forPreview) outputString += createAnchor(lineNo)
        
        let subject = subjectMatch[1]
        if (subject in CustomSubjects) {
          let commentEnd = inputString.indexOf('-->', i + 4)

          if (commentEnd < 0) { // didn't find -->
            return helper(end+1, lineNo+1, outputString+'\n')
          } else {
            commentEnd = commentEnd + 3
          }

          const content = inputString.slice(i+4, commentEnd-3).trim()
          const newlinesMatch = content.match(/\n/g)
          const newlines = (newlinesMatch ? newlinesMatch.length : 0)
          const optionsMatch = content.match(/^([^\s]+?)\s([\s\S]+)$/)
          const options = {lineNo}

          if (optionsMatch && optionsMatch[2]) {
            const rest = optionsMatch[2]
            const match = rest.match(/(?:[^\s\n:"']+|"[^"]*"|'[^']*')+/g) // split by space and \newline and : (not in single and double quotezz)

            if (match && match.length % 2 === 0) {
              let i = 0
              while (i < match.length) {
                const key = match[i],
                      value = match[i+1]
                try {
                  options[key] = JSON.parse(value)
                } catch (e) {
                  null // do nothing
                }
                i += 2
              }
            } 
          }

          if (subject === 'pagebreak' || subject === 'newpage') { // pagebreak
            return helper(commentEnd, lineNo + newlines, outputString + '<div class="pagebreak"> </div>\n')
          } else if (subject === 'slide') { // slide 
            slideConfigs.push(options)
            return helper(commentEnd, lineNo + newlines, outputString + '<span class="new-slide"></span>\n')
          }
        }
      } else if (line.match(/^\s*\[toc\]\s*$/i)) { // [TOC]
        if (forPreview) outputString += createAnchor(lineNo) // insert anchor for scroll sync
        tocBracketEnabled = true 
        return helper(end+1, lineNo+1, outputString + `\n[MPETOC]\n\n`)
      }

      return helper(end+1, lineNo+1, outputString+line+'\n')
    }

    return helper(0, 0, '')
}