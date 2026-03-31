// Patch .jbrowse/index.html after `jbrowse create`:
//  - Set the page title to "Apollo"
//  - Inject a script that forwards ?assemblies= to config.json via
//    window.__jbrowseConfigPath so the server returns only the requested
//    assemblies.

import { readFileSync, writeFileSync } from 'node:fs'

const indexPath = '.jbrowse/index.html'
let html = readFileSync(indexPath, 'utf8')

html = html.replace('<title>JBrowse</title>', '<title>Apollo</title>')

const script = `<script>(function(){
var a=new URLSearchParams(window.location.search).get("assemblies");
if(a){window.__jbrowseConfigPath="config.json?assemblies="+encodeURIComponent(a)}
})()</script>`

html = html.replace('<head>', '<head>' + script)

writeFileSync(indexPath, html)
