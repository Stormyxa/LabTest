
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://vpnmlgkiaqtlqyjigxzy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbm1sZ2tpYXF0bHF5amlneHp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MzIwOTIsImV4cCI6MjA5MDEwODA5Mn0.1uT4uqUOAJsRHXU0MPqgU1KN0NoOEQofzlUZ2DNG_Qo';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkImages() {
  const { data, error } = await supabase
    .from('quizzes')
    .select('id, title, content')
    .limit(10);

  if (error) {
    console.error(error);
    return;
  }

  const withImages = data.filter(q => JSON.stringify(q.content).includes('images'));
  
  if (withImages.length === 0) {
    console.log('No quizzes with images found in first 10.');
    return;
  }

  withImages.forEach(q => {
    console.log('--- Quiz:', q.title, '---');
    q.content.questions.forEach((question, idx) => {
      if (question.images && question.images.length > 0) {
        console.log(`Question ${idx + 1} images:`, question.images);
      }
    });
  });
}

checkImages();
