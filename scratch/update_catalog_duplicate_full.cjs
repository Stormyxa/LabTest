const fs = require('fs');
const path = require('path');

const catalogPath = path.join(__dirname, '../src/pages/QuizCatalog.jsx');
let content = fs.readFileSync(catalogPath, 'utf8');

// 1. Add stable setter
content = content.replace(
  'const setRandomQuizModal = useCallback((v) => setRandomQuizModalState(v), []);',
  'const setRandomQuizModal = useCallback((v) => setRandomQuizModalState(v), []);\n  const setDuplicateModal = useCallback((v) => setDuplicateModalState(v), []);'
);

// 2. Add states to QuizCatalog
const statesRegex = /const \[hasUnsavedChanges, setHasUnsavedChanges\] = useState\(false\);/;
const newStates = `const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [duplicateModal, setDuplicateModalState] = useState(null);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [personalClasses, setPersonalClasses] = useState([]);
  const [personalSections, setPersonalSections] = useState([]);
  const [destClassId, setDestClassId] = useState('');
  const [destSectionId, setDestSectionId] = useState('');
  const [duplicateTitle, setDuplicateTitle] = useState('');

  useEffect(() => {
    if (duplicateModal) {
      setDestClassId('');
      setDestSectionId('');
      setDuplicateTitle(duplicateModal.title || 'Копия');
      (async () => {
         const [{data: c}, {data: s}] = await Promise.all([
            supabase.from('quiz_classes').select('*').eq('is_personal', true).eq('author_id', profile?.id).order('sort_order', {ascending: true}),
            supabase.from('quiz_sections').select('*').eq('is_personal', true).eq('author_id', profile?.id).order('sort_order', {ascending: true})
         ]);
         if (c) setPersonalClasses(c);
         if (s) setPersonalSections(s);
      })();
    }
  }, [duplicateModal, profile?.id]);

  const handleDuplicate = async () => {
    if (!destSectionId) return alert('Выберите папку и предмет');
    setDuplicateLoading(true);
    try {
       const contentStr = JSON.stringify(duplicateModal.content || {});
       const urlRegex = /https:\\/\\/raw\\.githubusercontent\\.com\\/[^\\s"']+/g;
       const urls = contentStr.match(urlRegex) || [];
       const uniqueUrls = [...new Set(urls)];

       let newContentStr = contentStr;
       const newQuizId = crypto.randomUUID();

       if (uniqueUrls.length > 0) {
         const res = await fetch('/api/github-duplicate', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ urls: uniqueUrls, path: \`user_assets/\${profile.id}/\${newQuizId}\` })
         });
         const data = await res.json();
         if (data.success && data.duplicated) {
            for (const [oldUrl, newUrl] of Object.entries(data.duplicated)) {
               newContentStr = newContentStr.split(oldUrl).join(newUrl);
            }
         } else {
            console.error('Duplication error', data);
            alert('Не удалось скопировать некоторые изображения. Текст будет скопирован.');
         }
       }

       const { error } = await supabase.from('quizzes').insert({
         id: newQuizId,
         title: duplicateTitle,
         section_id: destSectionId,
         author_id: profile.id,
         is_personal: true,
         is_public: false,
         content: JSON.parse(newContentStr),
         is_verified: true,
         sort_order: 9999
       });

       if (error) throw error;
       alert('Тест успешно продублирован в вашу личную библиотеку!');
       setDuplicateModalState(null);
    } catch (e) {
       console.error(e);
       alert('Ошибка: ' + e.message);
    }
    setDuplicateLoading(false);
  };
`;
content = content.replace(statesRegex, newStates);

// 3. Pass setDuplicateModal down the tree
// SectionContent
content = content.replace(
  'setHideModal={setHideModal}',
  'setHideModal={setHideModal}\n                setDuplicateModal={setDuplicateModal}'
);
content = content.replace(
  'setHideModal, setRenamingItem, setSelectedQuiz, setRandomQuizModal',
  'setHideModal, setDuplicateModal, setRenamingItem, setSelectedQuiz, setRandomQuizModal'
);
// QuizCard signature
content = content.replace(
  'setSelectedQuiz, setHideModal, isDimmed, quizzesLength',
  'setSelectedQuiz, setHideModal, setDuplicateModal, isDimmed, quizzesLength'
);
// QuizCard button
content = content.replace(
  "onClick={(e) => { e.stopPropagation(); alert('Функция дублирования находится в разработке, ожидайте в следующем обновлении!'); }}",
  "onClick={(e) => { e.stopPropagation(); setDuplicateModal(quiz); }}"
);

// CatalogSectionRow signature
content = content.replace(
  'onToggle, onQuizzesChange, setHideModal, setRenamingItem, setSelectedQuiz, setRandomQuizModal,',
  'onToggle, onQuizzesChange, setHideModal, setDuplicateModal, setRenamingItem, setSelectedQuiz, setRandomQuizModal,'
);
// CatalogSectionRow prop to SectionContent
content = content.replace(
  'setHideModal={setHideModal}',
  'setHideModal={setHideModal}\n          setDuplicateModal={setDuplicateModal}'
);

// CatalogClassRow signature
content = content.replace(
  'onQuizzesChange, setHideModal, setSelectedQuiz, setRandomQuizModal',
  'onQuizzesChange, setHideModal, setDuplicateModal, setSelectedQuiz, setRandomQuizModal'
);
// CatalogClassRow prop to CatalogSectionRow
content = content.replace(
  'setHideModal={setHideModal}',
  'setHideModal={setHideModal}\n                setDuplicateModal={setDuplicateModal}'
);

// 4. Add the modal JSX at the bottom of QuizCatalog, just before the last `{hideModal && (`
const modalJSX = `
      {duplicateModal && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !duplicateLoading) e.target.dataset.md = "true" }} onMouseUp={(e) => { if (e.target === e.currentTarget && e.target.dataset.md === "true" && !duplicateLoading) { e.target.dataset.md = "false"; (() => setDuplicateModalState(null))(e); }}}>
          <div className="modal-content animate" style={{ width: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="flex-center" style={{ justifyContent: 'center', width: '55px', height: '55px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', borderRadius: '15px', margin: '0 auto 20px' }}><Copy size={26} /></div>
            <h3 style={{ marginBottom: '10px', textAlign: 'center' }}>Дублировать тест</h3>
            <p style={{ opacity: 0.6, fontSize: '0.9rem', marginBottom: '20px', textAlign: 'center', lineHeight: '1.6' }}>
              Создание копии в вашей Личной библиотеке. Все привязанные изображения будут скачаны и сохранены в ваш профиль.
            </p>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', opacity: 0.7, marginBottom: '8px' }}>Название копии</label>
              <input type="text" value={duplicateTitle} onChange={e => setDuplicateTitle(e.target.value)} disabled={duplicateLoading} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.1)' }} />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '30px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', opacity: 0.7, marginBottom: '8px' }}>Папка</label>
                <select value={destClassId} onChange={e => { setDestClassId(e.target.value); setDestSectionId(''); }} disabled={duplicateLoading} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.1)' }}>
                  <option value="">Выберите папку...</option>
                  {personalClasses.filter(c => !c.is_divider).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', opacity: 0.7, marginBottom: '8px' }}>Предмет</label>
                <select value={destSectionId} onChange={e => setDestSectionId(e.target.value)} disabled={!destClassId || duplicateLoading} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.1)' }}>
                  <option value="">Выберите предмет...</option>
                  {personalSections.filter(s => s.class_id === destClassId && !s.is_divider).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid-2" style={{ gap: '10px' }}>
              <button onClick={() => setDuplicateModalState(null)} disabled={duplicateLoading} style={{ background: 'rgba(0,0,0,0.05)', color: 'inherit' }}>Отмена</button>
              <button onClick={handleDuplicate} disabled={duplicateLoading} style={{ background: 'var(--primary-color)', color: 'white' }}>
                {duplicateLoading ? <Loader2 size={18} className="spinner" /> : 'Сохранить к себе'}
              </button>
            </div>
          </div>
        </div>
      )}
`;
content = content.replace('{hideModal && (', modalJSX + '\n      {hideModal && (');

fs.writeFileSync(catalogPath, content, 'utf8');
console.log('QuizCatalog duplicate logic added');
