// sm.ms api
import * as request from "request"
import * as fs from "fs"
import * as path from "path"

export function uploadFile(filePath, callback) {
  const headers = {
    authority: 'sm.ms',
    'user-agent': 'markdown-preview-enhanced'

  }
  request.post({
    url:'https://sm.ms/api/upload', 
    formData: {smfile: fs.createReadStream(filePath)}, 
    headers:headers}, 
  (err, httpResponse, body)=> {
    try {
      body = JSON.parse(body)
      if (err)
        callback('Failed to upload image')
      else if (body.code === 'error')
        callback(body.msg, null)
      else
        callback(null, body.data.url)
    } catch (error) {
      callback('Failed to connect to sm.ms host', null)
    }
  })
}

/*
// example of how to use this API
smAPI.uploadFile '/Users/wangyiyi/Desktop/test.html', (err, url)->
  if err
    console.log err
  else
    console.log url
*/
