const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'src', 'pages');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsx'));

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  let i = 0;
  while (i < content.length) {
    const idx = content.indexOf('className="modal-overlay"', i);
    if (idx === -1) break;
    
    let startDiv = idx;
    while (startDiv >= i && content[startDiv] !== '<') {
      startDiv--;
    }
    
    let endDiv = idx;
    while (endDiv < content.length && content[endDiv] !== '>') {
      endDiv++;
    }
    
    const divStr = content.substring(startDiv, endDiv + 1);
    console.log('[' + file + '] Found divStr: ' + divStr);
    
    const onClickIdx = divStr.indexOf('onClick={');
    console.log('  onClickIdx: ' + onClickIdx);
    if (onClickIdx !== -1) {
      let braceCount = 0;
      let startBrace = onClickIdx + 8; // 'onClick={'.length - 1
      let endBrace = startBrace;
      for (let j = startBrace; j < divStr.length; j++) {
        if (divStr[j] === '{') braceCount++;
        if (divStr[j] === '}') {
          braceCount--;
          if (braceCount === 0) {
            endBrace = j;
            break;
          }
        }
      }
      console.log('  braceCount: ' + braceCount + ', endBrace: ' + endBrace);
    }
    
    i = endDiv + 1;
  }
}
