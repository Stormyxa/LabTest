import { supabase } from './lib/supabase';

async function checkSchema() {
  const { data, error } = await supabase.from('quiz_attempts').select('*').limit(1);
  if (error) {
    console.error('Error fetching quiz_attempts:', error);
  } else {
    console.log('Columns in quiz_attempts:', Object.keys(data[0] || {}));
  }
}

checkSchema();
