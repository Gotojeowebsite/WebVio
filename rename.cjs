const fs = require('fs');
const path = require('path');

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let newContent = content.replace(/TorNode/g, 'Webvio').replace(/tornode/g, 'webvio');
  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`Updated ${filePath}`);
  }
}

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (!fullPath.includes('node_modules') && !fullPath.includes('.git') && !fullPath.includes('dist')) {
        walk(fullPath);
      }
    } else {
      if (['.ts', '.tsx', '.json', '.html', '.md', '.css'].includes(path.extname(fullPath))) {
        replaceInFile(fullPath);
      }
    }
  }
}

walk('.');
