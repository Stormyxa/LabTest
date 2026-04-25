const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, '..', 'src', 'pages', 'Dashboard.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add Realtime for Applications
const useCacheSyncLine = 'useCacheSync(`dashboard_users_${cacheSuffix}`, (data) => { if (data) setUsers(data); });';
const realtimeCode = `
  // --- REALTIME SUBSCRIPTIONS ---
  useEffect(() => {
    if (!profile) return;
    
    // Подписка на новые заявки
    const appsChannel = supabase.channel('class_apps_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'class_applications' }, (payload) => {
        const newApp = payload.new;
        // Если заявка в класс этого учителя (или он админ)
        if (profile.role === 'admin' || profile.role === 'creator' || teacherClasses.includes(newApp.class_id)) {
           // Перезагружаем список заявок для этого класса
           fetchClassApplications(newApp.class_id);
           setActionFeedback({ type: 'success', message: 'Получена новая заявка в класс!' });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(appsChannel);
    };
  }, [profile, teacherClasses]);
`;

if (content.includes(useCacheSyncLine) && !content.includes('class_apps_realtime')) {
    content = content.replace(useCacheSyncLine, useCacheSyncLine + realtimeCode);
}

// 2. Harden removeStudentFromClass with Feedback
const oldRemoval = /const removeStudentFromClass = async \(\) => \{[\s\S]*?if \(!error\) \{/;
const newRemoval = `const removeStudentFromClass = async () => {
    if (!removingStudent) return;
    
    const cid = removingStudent.class_id;
    let email = removingStudent.email;
    const isBlacklist = removingStudent.blacklist;

    // Свежая проверка почты
    if (isBlacklist && !email) {
      const { data: fresh } = await supabase.from('profiles').select('email').eq('id', removingStudent.id).single();
      if (fresh?.email) email = fresh.email;
    }

    if (isBlacklist && !email) {
       setRemovingStudent(null);
       setActionFeedback({ type: 'error', message: 'Ошибка: Почта ученика не найдена. Бан невозможен.' });
       return;
    }

    // 1. Убираем из состава
    const { error } = await supabase.from('profiles').update({ class_id: null }).eq('id', removingStudent.id);
    
    if (error) {
      setActionFeedback({ type: 'error', message: 'Ошибка при удалении: ' + error.message });
      return;
    }

    // 2. Бан
    if (isBlacklist && cid && email) {
      const { error: blockError } = await supabase.from('class_black_list').insert({ class_id: cid, email: email });
      if (blockError) {
        console.error("Blacklist Error:", blockError);
        setActionFeedback({ type: 'error', message: 'Сам бан не удался: ' + blockError.message });
      } else {
        setActionFeedback({ type: 'success', message: 'Ученик исключен и занесен в черный список.' });
      }
    } else {
      setActionFeedback({ type: 'success', message: 'Ученик успешно убран из состава.' });
    }

    if (!error) {`;

content = content.replace(oldRemoval, newRemoval);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully added Realtime and hardened Blacklist logic');
