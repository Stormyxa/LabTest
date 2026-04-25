const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, '..', 'src', 'pages', 'Dashboard.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Use a simpler string search to avoid regex escaping issues
const oldButton1 = '<button onClick={() => setRemovingStudent(s)} style={{ background: \'transparent\', color: \'red\', padding: \'4px\', boxShadow: \'none\' }} title="Удалить из класса"><UserMinus size={16} /></button>';
const oldButton2 = '<button onClick={() => setBlockingUser(s)} style={{ background: \'transparent\', color: \'#dc2626\', padding: \'4px\', boxShadow: \'none\' }} title="Исключить и заблокировать"><Ban size={16} /></button>';

const newButtons = `                                                               <button onClick={() => setRemovingStudent({ ...s, blacklist: false })} style={{ background: 'transparent', color: 'var(--primary-color)', padding: '4px', boxShadow: 'none' }} title="Убрать из состава"><UserMinus size={16} /></button>
                                                               <button onClick={() => setRemovingStudent({ ...s, blacklist: true })} style={{ background: 'transparent', color: 'red', padding: '4px', boxShadow: 'none' }} title="Исключить и заблокировать в классе"><Ban size={16} /></button>
                                                               {(profile?.role === 'admin' || profile?.role === 'creator') && (
                                                                 <button onClick={() => setBlockingUser(s)} style={{ background: 'transparent', color: '#dc2626', padding: '4px', boxShadow: 'none' }} title="Полная блокировка (удаление аккаунта)"><ShieldAlert size={16} /></button>
                                                               )}`;

if (content.includes(oldButton1) && content.includes(oldButton2)) {
    let newContent = content.replace(oldButton1, newButtons);
    newContent = newContent.replace(oldButton2, '');
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log('Successfully updated buttons');
} else {
    console.log('Failed to find buttons');
}
