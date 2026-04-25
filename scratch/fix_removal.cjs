const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, '..', 'src', 'pages', 'Dashboard.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const search = /const cid = removingStudent\.class_id;[\s\S]*?if \(isBlacklist && cid && email\) \{[\s\S]*?insert\(\{ class_id: cid, email: email \}\);[\s\S]*?\}/;
const replacement = `const cid = removingStudent.class_id;
    let email = removingStudent.email;
    const isBlacklist = removingStudent.blacklist;

    if (isBlacklist && !email) {
      const { data: fresh } = await supabase.from('profiles').select('email').eq('id', removingStudent.id).single();
      if (fresh?.email) email = fresh.email;
    }

    const { error } = await supabase.from('profiles').update({ class_id: null }).eq('id', removingStudent.id);
    
    if (isBlacklist && cid && email) {
      await supabase.from('class_black_list').insert({ class_id: cid, email: email });
    }`;

const newContent = content.replace(search, replacement);
if (content !== newContent) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log('Successfully updated Dashboard.jsx');
} else {
    console.log('Failed to match the code block');
}
