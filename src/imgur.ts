// imgur api
// referenced from node-imgur:
// https://github.com/kaimallea/node-imgur/blob/master/lib/imgur.js
import * as request from "request"
import * as fs from "fs"
import * as path from "path"

// The following client ID is tied to the
// registered 'node-imgur' app and is available
// here for public, anonymous usage via this node
// module only.
const IMGUR_API_URL = process.env.IMGUR_API_URL || 'https://api.imgur.com/3/';
const IMGUR_CLIENT_ID    = process.env.IMGUR_CLIENT_ID || 'f0ea04148a54268';

export function uploadFile(filePath):Promise<string> {
  return new Promise((resolve, reject)=> {
    const headers = {
      Authorization: `Client-ID ${IMGUR_CLIENT_ID}`
    }

    request.post({
      url: `${IMGUR_API_URL}image`,
      encoding: 'utf8',
      formData: {image: fs.createReadStream(filePath)},
      json: true,
      headers
    },
    (err, httpResponse, body)=> {
      if (err) {
        return reject(err)
      } 
      if (body.success) {
        return resolve(body.data.link)
      } else {
        return resolve(body.data.error.message)
      }
    })
  })
}

/*
uploadFile('/Users/wangyiyi/Desktop/markdown-example/test.jpg')
.then((url)=> {
  ...
}).then((error)=> {
  ...
})
*/