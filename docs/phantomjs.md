# PhantomJS Export  

**PhantomJS** supports `pdf`, `jpeg`, and `png` file export.  
You need to download and install [phantomjs](http://phantomjs.org/download.html) first.  

## Usage
Right click at the preview, then click `PhantomJS`. Choose the file type you want to export.       

## Configuration    
You can edit phantomjs configuration by running `Markdown Preview Enhanced: Open PhantomJS Config` command.  

The `phantomjs_header_footer_config.js` file should look like this:   


```javascript
'use strict'
/*
configure header and footer (and other options)
more information can be found here:
    https://github.com/marcbachmann/node-html-pdf
Attention: this config will override your config in exporter panel.

eg:

  let config = {
    "header": {
      "height": "45mm",
      "contents": '<div style="text-align: center;">Author: Marc Bachmann</div>'
    },
    "footer": {
      "height": "28mm",
      "contents": '<span style="color: #444;">{{page}}</span>/<span>{{pages}}</span>'
    }
  }
*/
// you can edit the 'config' variable below
let config = {
}

module.exports = config || {}
```

---

You can also write configuration for individual markdown file by front-matter.  
For example:   

```markdown
---
phantomjs:
    orientation: "landscape"
---

```
