const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'src/pages');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsx'));
let changedFiles = 0;

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  const regex = /className=\"modal-overlay\"([^>]*?)onClick=\{([^\}]+)\}/g;
  
  const newContent = content.replace(regex, (match, beforeOnClick, onClickContent) => {
    // If the onClickContent is something like `() => setX(null)`, we can just wrap it in an IIFE.
    // E.g., `( () => setX(null) )()`
    return 'className="modal-overlay"' + beforeOnClick + 'onMouseDown={(e) => { if (e.target === e.currentTarget) e.target.dataset.md = "true" }} onMouseUp={(e) => { if (e.target === e.currentTarget && e.target.dataset.md === "true") { e.target.dataset.md = "false"; (' + onClickContent + ')(e); }}}';
  });

  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    changedFiles++;
    console.log('Fixed ' + file);
  }
}
console.log('Total files changed: ' + changedFiles);
