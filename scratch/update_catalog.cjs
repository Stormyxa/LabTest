const fs = require('fs');
const path = require('path');

const catalogPath = path.join(__dirname, '../src/pages/QuizCatalog.jsx');
let content = fs.readFileSync(catalogPath, 'utf8');

// 1. Add states to QuizCatalog
const stateReplacement = `
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem('catalog_tab') || 'official');
  const [libraryUsers, setLibraryUsers] = useState([]);
  const [selectedLibraryUser, setSelectedLibraryUser] = useState(null);
  const [usersLoading, setUsersLoading] = useState(false);

  useEffect(() => {
    sessionStorage.setItem('catalog_tab', activeTab);
    if (activeTab === 'official' || activeTab === 'personal') {
      setSelectedLibraryUser(null);
    } else if (!selectedLibraryUser) {
      const fetchLibraryUsers = async () => {
        setUsersLoading(true);
        try {
          if (activeTab === 'public') {
            const { data } = await supabase.from('quiz_classes').select('author_id, profiles(id, first_name, last_name, avatar_url)').eq('is_public', true);
            if (data) {
               const uniqueUsers = Array.from(new Map(data.filter(d => d.profiles).map(item => [item.author_id, item.profiles])).values());
               setLibraryUsers(uniqueUsers);
            }
          } else if (activeTab === 'shared') {
            const { data } = await supabase.from('library_access').select('owner_id, profiles!library_access_owner_id_fkey(id, first_name, last_name, avatar_url)').eq('user_id', profile?.id);
            if (data) {
               const uniqueUsers = Array.from(new Map(data.filter(d => d.profiles).map(item => [item.owner_id, item.profiles])).values());
               setLibraryUsers(uniqueUsers);
            }
          }
        } catch (e) { console.error(e); }
        setUsersLoading(false);
      };
      fetchLibraryUsers();
    }
  }, [activeTab, selectedLibraryUser, profile?.id]);
`;
content = content.replace("const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');", stateReplacement);

// 2. Update fetchData
const fetchDataRegex = /const fetchData = useCallback\(async \(\) => \{[\s\S]*?\}, \[profile, formatClasses\]\);/;
const newFetchData = `const fetchData = useCallback(async () => {
    if ((activeTab === 'public' || activeTab === 'shared') && !selectedLibraryUser) {
      setClasses([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const isPrivileged = profile?.role === 'admin' || profile?.role === 'creator';
    const cacheKeyBase = \`catalog_struct_\${activeTab}_\${selectedLibraryUser?.id || 'none'}\`;

    const [c, s, basicQuizzes] = await Promise.all([
      fetchWithCache(cacheKeyBase + '_classes', () => {
        let q = supabase.from('quiz_classes').select('*').order('sort_order', { ascending: true });
        if (activeTab === 'official') q = q.eq('is_personal', false);
        else if (activeTab === 'personal') q = q.eq('is_personal', true).eq('author_id', profile?.id);
        else if (selectedLibraryUser) q = q.eq('is_personal', true).eq('author_id', selectedLibraryUser.id);
        return q.then(r => r.data);
      }),
      fetchWithCache(cacheKeyBase + '_sections', () => {
        let q = supabase.from('quiz_sections').select('*').order('sort_order', { ascending: true });
        if (activeTab === 'official') q = q.eq('is_personal', false);
        else if (activeTab === 'personal') q = q.eq('is_personal', true).eq('author_id', profile?.id);
        else if (selectedLibraryUser) q = q.eq('is_personal', true).eq('author_id', selectedLibraryUser.id);
        return q.then(r => r.data);
      }),
      fetchWithCache(cacheKeyBase + \`_quizzes_\${isPrivileged ? 'all' : 'visible'}\`, () => {
        let quizQuery = supabase.from('quizzes').select('id, title, section_id, is_hidden, content').eq('is_archived', false);
        if (!isPrivileged) quizQuery = quizQuery.eq('is_hidden', false);
        
        if (activeTab === 'official') quizQuery = quizQuery.eq('is_personal', false);
        else if (activeTab === 'personal') quizQuery = quizQuery.eq('is_personal', true).eq('author_id', profile?.id);
        else if (selectedLibraryUser) quizQuery = quizQuery.eq('is_personal', true).eq('author_id', selectedLibraryUser.id);

        return quizQuery.then(r => r.data);
      })
    ]);

    if (c && s && basicQuizzes) {
      setClasses(formatClasses(c, s, basicQuizzes));
    } else {
      setClasses([]);
    }
    setLoading(false);
  }, [profile, formatClasses, activeTab, selectedLibraryUser]);`;
content = content.replace(fetchDataRegex, newFetchData);

// 3. Update Sync Caches to depend on activeTab
content = content.replace(
  `useCacheSync('catalog_struct_classes', fetchData);
  useCacheSync('catalog_struct_sections', fetchData);`,
  `// Sync cache
  useCacheSync(\`catalog_struct_\${activeTab}_\${selectedLibraryUser?.id || 'none'}_classes\`, fetchData);
  useCacheSync(\`catalog_struct_\${activeTab}_\${selectedLibraryUser?.id || 'none'}_sections\`, fetchData);`
);

// 4. Add Tabs UI
const headerUI = `<div className="flex-center animate" style={{ justifyContent: 'space-between', marginBottom: '40px', flexWrap: 'wrap', gap: '20px' }}>`;
const tabsUI = `
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '10px' }}>
        {['official', 'personal', 'public', 'shared'].map(tab => {
           const labels = { official: 'Официальный каталог', personal: 'Личная библиотека', public: 'Общая библиотека', shared: 'Доступные мне' };
           return (
             <button
               key={tab}
               onClick={() => { setActiveTab(tab); setSelectedLibraryUser(null); }}
               style={{
                 padding: '10px 20px',
                 borderRadius: '20px',
                 background: activeTab === tab ? 'var(--primary-color)' : 'rgba(0,0,0,0.05)',
                 color: activeTab === tab ? 'white' : 'inherit',
                 boxShadow: 'none',
                 whiteSpace: 'nowrap',
                 fontWeight: 'bold'
               }}
             >
               {labels[tab]}
             </button>
           )
        })}
      </div>
      
      {(activeTab === 'public' || activeTab === 'shared') && !selectedLibraryUser && (
        <div className="grid-2 animate" style={{ marginBottom: '40px' }}>
          {usersLoading ? <div style={{gridColumn:'1/-1', textAlign:'center', padding:'40px'}}><Loader2 className="spinner"/></div> : 
           libraryUsers.length === 0 ? <div style={{gridColumn:'1/-1', textAlign:'center', padding:'40px', opacity:0.5}}>Библиотеки не найдены</div> :
           libraryUsers.map(u => (
             <div key={u.id} className="card" onClick={() => setSelectedLibraryUser(u)} style={{cursor:'pointer', display:'flex', alignItems:'center', gap:'15px', padding:'20px'}}>
               <div style={{width:'50px', height:'50px', borderRadius:'25px', background:'var(--primary-color)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem', fontWeight:'bold'}}>
                 {u.first_name?.[0] || 'U'}
               </div>
               <div>
                 <h4 style={{margin:0}}>{u.last_name} {u.first_name}</h4>
                 <p style={{margin:0, opacity:0.5, fontSize:'0.8rem'}}>Открыть библиотеку</p>
               </div>
             </div>
           ))
          }
        </div>
      )}

      {selectedLibraryUser && (
        <div className="flex-center" style={{marginBottom:'20px', gap:'10px', justifyContent:'flex-start'}}>
          <button onClick={() => setSelectedLibraryUser(null)} style={{padding:'8px 15px', background:'rgba(0,0,0,0.05)', color:'inherit', boxShadow:'none', borderRadius:'10px'}}>Назад</button>
          <h3 style={{margin:0}}>Библиотека пользователя: {selectedLibraryUser.first_name}</h3>
        </div>
      )}

      <div className="flex-center animate" style={{ justifyContent: 'space-between', marginBottom: '40px', flexWrap: 'wrap', gap: '20px', display: ((activeTab === 'public' || activeTab === 'shared') && !selectedLibraryUser) ? 'none' : 'flex' }}>`;
content = content.replace(headerUI, tabsUI);

// 5. Hide empty state if showing users
const emptyStateRegex = /\{!loading && filteredClasses\.length === 0 && \(/;
content = content.replace(emptyStateRegex, '{!loading && filteredClasses.length === 0 && !((activeTab === "public" || activeTab === "shared") && !selectedLibraryUser) && (');

fs.writeFileSync(catalogPath, content, 'utf8');
console.log('QuizCatalog.jsx successfully updated');
