// sm.ms api
import * as request from "request"
import * as fs from "fs"
import * as path from "path"

export function uploadFile(filePath):Promise<string> {
  return new Promise((resolve, reject)=> {
    const headers = {
      authority: 'sm.ms',
      'user-agent': 'markdown-preview-enhanced'

    }
    request.post({
      url:'https://sm.ms/api/upload', 
      formData: {smfile: fs.createReadStream(filePath)}, 
      headers:headers
    }, 
    (err, httpResponse, body)=> {
      try {
        body = JSON.parse(body)
        if (err)
          return reject('Failed to upload image')
        else if (body.code === 'error')
          return reject(body.msg)
        else
          return resolve(body.data.url)
      } catch (error) {
        return reject('Failed to connect to sm.ms host')
      }
    })
  })
}

/*
// example of how to use this API
smAPI.uploadFile('/Users/wangyiyi/Desktop/test.jpg')
      .then((url)=> {...})
      .catch((error)=> {...})
*/
