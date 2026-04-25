
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://vpnmlgkiaqtlqyjigxzy.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwbm1sZ2tpYXF0bHF5amlneHp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MzIwOTIsImV4cCI6MjA5MDEwODA5Mn0.1uT4uqUOAJsRHXU0MPqgU1KN0NoOEQofzlUZ2DNG_Qo');

async function checkApps() {
    const { data, error } = await supabase.from('class_applications').select('*');
    if (error) console.error("Error:", error);
    else console.log("Current Applications:", data);
}

checkApps();
