const fs = require('fs');
const path = require('path');

const catalogPath = path.join(__dirname, '../src/pages/QuizCatalog.jsx');
let content = fs.readFileSync(catalogPath, 'utf8');

// 1. Add togglePublic and shareAccess to QuizCard
const quizCardRegex = /<button onClick=\{\(\) => setHideModal\(quiz\)\} style=\{\{ padding: '8px', background: 'rgba\(250,204,21,0\.08\)', color: '#ca8a04', boxShadow: 'none', borderRadius: '10px' \}\} title="Скрыть"><Eye size=\{15\} \/><\/button>\}/;
const quizCardReplacement = `<button onClick={() => setHideModal(quiz)} style={{ padding: '8px', background: 'rgba(250,204,21,0.08)', color: '#ca8a04', boxShadow: 'none', borderRadius: '10px' }} title="Скрыть"><Eye size={15} /></button>}
          {quiz.is_personal && quiz.author_id === userId && (
            <button 
               onClick={async (e) => { e.stopPropagation(); await supabase.from('quizzes').update({is_public: !quiz.is_public}).eq('id', quiz.id); window.location.reload(); }} 
               style={{ padding: '8px', background: quiz.is_public ? 'rgba(74, 222, 128, 0.1)' : 'rgba(0,0,0,0.05)', color: quiz.is_public ? '#4ade80' : 'var(--text-color)', boxShadow: 'none', borderRadius: '10px' }} 
               title={quiz.is_public ? "Сделать приватным" : "Сделать публичным"}
            >
              {quiz.is_public ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
          )}`;
content = content.replace(quizCardRegex, quizCardReplacement);

// 2. Add Duplicate logic. Let's add it to QuizCard if it's NOT personal OR if we are in public/shared.
const duplicateReplacement = `
          {(!quiz.is_personal || (quiz.is_personal && quiz.author_id !== userId)) && (
            <button
               onClick={(e) => { e.stopPropagation(); alert('Функция дублирования находится в разработке, ожидайте в следующем обновлении!'); }}
               style={{ padding: '8px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', boxShadow: 'none', borderRadius: '10px' }}
               title="Дублировать в мою библиотеку"
            >
               <Copy size={15} />
            </button>
          )}
`;
content = content.replace('title="Поделиться"', 'title="Поделиться"'); // to find a good anchor
// Actually, I'll insert it right after the Share button
content = content.replace(
  /<Share2 size=\{15\} \/>\s*<\/button>/,
  `<Share2 size={15} />\n            </button>` + duplicateReplacement
);

// 3. Let's also add the public toggle to CatalogClassRow
const classRowAnchor = /<button\s*onClick=\{\(e\) => \{ e\.stopPropagation\(\); handleCreateSectionDivider\(cls\.id\); \}\}/;
const classPublicReplacement = `{cls.is_personal && cls.author_id === profile?.id && (
              <button
                 onClick={async (e) => { e.stopPropagation(); await supabase.from('quiz_classes').update({is_public: !cls.is_public}).eq('id', cls.id); window.location.reload(); }}
                 style={{ padding: '8px', background: cls.is_public ? 'rgba(74, 222, 128, 0.1)' : 'rgba(0,0,0,0.05)', color: cls.is_public ? '#4ade80' : 'var(--text-color)', boxShadow: 'none', borderRadius: '10px' }}
                 title={cls.is_public ? "Сделать класс приватным" : "Сделать класс публичным"}
              >
                {cls.is_public ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); handleCreateSectionDivider(cls.id); }}`;
content = content.replace(classRowAnchor, classPublicReplacement);

fs.writeFileSync(catalogPath, content, 'utf8');
console.log('QuizCatalog buttons updated');
