
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vpnmlgkiaqtlqyjigxzy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbm1sZ2tpYXF0bHF5amlneHp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MzIwOTIsImV4cCI6MjA5MDEwODA5Mn0.1uT4uqUOAJsRHXU0MPqgU1KN0NoOEQofzlUZ2DNG_Qo';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  const { data } = await supabase.from('quizzes').select('title, content').limit(50);
  if (!data) return;
  data.forEach(q => {
    const questions = q.content?.questions || [];
    questions.forEach(ques => {
      if (ques.images && ques.images.length > 0) {
        console.log(`Quiz: ${q.title}, Image: ${ques.images[0]}`);
      }
    });
  });
}
check();
