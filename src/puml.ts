import * as path from "path"
import {extensionDirectoryPath} from './utility'
import {spawn} from "child_process"

const PlantUMLJarPath = path.resolve(extensionDirectoryPath, './dependencies/plantuml/plantuml.jar')

/**
 * key is fileDirectoryPath, value is PlantUMLTask
 */
const TASKS:{[key:string]: PlantUMLTask} = {}

/**
 * key is fileDirectoryPath, value is String
 */
const CHUNKS:{[key:string]: string} = {}

/**
 * key is fileDirectoryPath, value is Array
 */
const CALLBACKS: {[key:string]: Array<(result:string)=>void> } = {} 

class PlantUMLTask {
  private fileDirectoryPath:string
  private chunks:string
  private callbacks:Array<(result:string)=>void>
  private task

  constructor(fileDirectoryPath:string) {
    this.fileDirectoryPath = fileDirectoryPath
    this.chunks = CHUNKS[this.fileDirectoryPath] || ''
    this.callbacks = CALLBACKS[this.fileDirectoryPath] || []
    this.task = null 

    this.startTask()
  }

  startTask() {
    this.task = spawn("java", [ '-Djava.awt.headless=true',
                                '-Dplantuml.include.path='+this.fileDirectoryPath,
                                '-jar', PlantUMLJarPath,
                                // '-graphvizdot', 'exe'
                                '-pipe',
                                '-tsvg',
                                '-charset', 'UTF-8'])

    this.task.stdout.on("data", (chunk)=> {
      let data = chunk.toString().trimRight() // `trimRight()` here is necessary.
      if (data.endsWith('</svg>')) {
        data = this.chunks + data
        this.chunks = '' // clear CHUNKS

        let diagrams = data.split('</svg>')
        diagrams.forEach((diagram, i)=> {
          if (diagram.length) {
            const callback = this.callbacks.shift()
            if (callback) {
              callback(diagram + '</svg>')
            }
          }
        })
      } else {
        this.chunks += data
      }
    })

    this.task.on("error", ()=> this.closeSelf())
    this.task.on("exit", ()=> this.closeSelf())
  }

  public generateSVG(content:string):Promise<string> {
    return new Promise((resolve, reject)=> {
      this.callbacks.push(resolve)
      this.task.stdin.write(content + '\n')
    })
  }

  /**
   * stop this.task and store this.chunks and this.callbacks
   */
  private closeSelf() {
    TASKS[this.fileDirectoryPath] = null
    CHUNKS[this.fileDirectoryPath] = this.chunks
    CALLBACKS[this.fileDirectoryPath] = this.callbacks
  }
}


// async call 
export async function render(content:string, fileDirectoryPath:string=""):Promise<string> {
  content = content.trim()
  // ' @mpe_file_directory_path:/fileDirectoryPath
  // fileDirectoryPath 
  let match = null
  if (match = content.match(/^'\s@mpe_file_directory_path:(.+)$/m)) {
    fileDirectoryPath = match[1]
  }

  let startMatch;
  if (startMatch = content.match(/^\@start(.+?)\s+/m)) {
    if (content.match(new RegExp(`^\\@end${startMatch[1]}`, 'm')))
      null // do nothing
    else
      content = "@startuml\n@enduml" // error
  } else {
    content = `@startuml
${content}
@enduml`
  }
  
  if (!TASKS[fileDirectoryPath]) // init `plantuml.jar` task
    TASKS[fileDirectoryPath] = new PlantUMLTask(fileDirectoryPath)
  
  return await TASKS[fileDirectoryPath].generateSVG(content)
}