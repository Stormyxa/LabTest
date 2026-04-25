const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'src', 'pages');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsx'));
let changedFiles = 0;

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;
  
  let i = 0;
  while (i < content.length) {
    const idx = content.indexOf('className="modal-overlay"', i);
    if (idx === -1) break;
    
    // Search for onClick={ within 200 characters after className="modal-overlay"
    const searchArea = content.substring(idx, idx + 200);
    const onClickRelIdx = searchArea.indexOf('onClick={');
    
    if (onClickRelIdx !== -1) {
      const onClickIdx = idx + onClickRelIdx;
      
      let braceCount = 0;
      let startBrace = onClickIdx + 8; // index of {
      let endBrace = startBrace;
      
      for (let j = startBrace; j < content.length; j++) {
        if (content[j] === '{') braceCount++;
        if (content[j] === '}') {
          braceCount--;
          if (braceCount === 0) {
            endBrace = j;
            break;
          }
        }
      }
      
      if (braceCount === 0) {
        const onClickContent = content.substring(startBrace + 1, endBrace);
        
        const newStr = 'onMouseDown={(e) => { if (e.target === e.currentTarget) e.target.dataset.md = "true" }} ' +
                       'onMouseUp={(e) => { if (e.target === e.currentTarget && e.target.dataset.md === "true") { e.target.dataset.md = "false"; (' + onClickContent + ')(e); }}}';
        
        content = content.substring(0, onClickIdx) + newStr + content.substring(endBrace + 1);
        
        // Advance i past the newly inserted string
        i = onClickIdx + newStr.length;
        continue;
      }
    }
    
    i = idx + 25; // advance past 'className="modal-overlay"'
  }

  if (originalContent !== content) {
    fs.writeFileSync(filePath, content, 'utf8');
    changedFiles++;
    console.log('Fixed ' + file);
  }
}
console.log('Total files changed: ' + changedFiles);
