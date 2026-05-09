import { createClient } from '@supabase/supabase-js';
import { upsertFact } from '../src/lib/qdrantClient.js';
import { generateEmbedding } from '../src/lib/embeddingService.js';
import { extractAllFacts, limitFacts } from '../src/lib/factExtractor.js';

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { attemptId, quizId, userId } = req.body;

  if (!attemptId || !quizId || !userId) {
    return res.status(400).json({ error: 'Missing required parameters: attemptId, quizId, userId' });
  }

  try {
    console.log(`🔄 Extracting facts for attempt ${attemptId}, user ${userId}, quiz ${quizId}`);

    // 1. Fetch the attempt with full details
    const { data: attempt, error: attemptError } = await supabase
      .from('quiz_attempts')
      .select('*')
      .eq('id', attemptId)
      .single();

    if (attemptError || !attempt) {
      console.error('Failed to fetch attempt:', attemptError);
      return res.status(404).json({ error: 'Attempt not found' });
    }

    // 2. Fetch the quiz with questions
    const { data: quiz, error: quizError } = await supabase
      .from('quizzes')
      .select('*, quiz_sections(name)')
      .eq('id', quizId)
      .single();

    if (quizError || !quiz) {
      console.error('Failed to fetch quiz:', quizError);
      return res.status(404).json({ error: 'Quiz not found' });
    }

    // 3. Fetch user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.error('Failed to fetch profile:', profileError);
      return res.status(404).json({ error: 'Profile not found' });
    }

    // 4. Extract facts from the attempt
    const subject = quiz.quiz_sections?.name || 'Неизвестный предмет';
    const facts = await extractAllFacts({
      attempt,
      quiz,
      profile,
      subject
    });

    // Limit to most important facts (max 20)
    const limitedFacts = limitFacts(facts, 20);

    console.log(`📝 Extracted ${limitedFacts.length} facts from attempt`);

    // 5. Generate embeddings and upsert to Qdrant
    const upsertResults = [];
    for (const fact of limitedFacts) {
      try {
        const vector = await generateEmbedding(fact);
        
        const result = await upsertFact({
          userId,
          quizId,
          classId: profile.class_id || null,
          subject,
          fact,
          vector,
          metadata: {
            attemptId,
            score: attempt.score,
            maxScore: attempt.max_score,
            isPassed: attempt.is_passed,
            isSuspicious: attempt.is_suspicious,
            isIncomplete: attempt.is_incomplete
          }
        });

        upsertResults.push({ fact, success: true });
      } catch (error) {
        console.error('Failed to upsert fact:', error);
        upsertResults.push({ fact, success: false, error: error.message });
      }
    }

    const successCount = upsertResults.filter(r => r.success).length;

    console.log(`✅ Successfully stored ${successCount}/${limitedFacts.length} facts in Qdrant`);

    return res.status(200).json({
      success: true,
      factsExtracted: limitedFacts.length,
      factsStored: successCount,
      results: upsertResults
    });

  } catch (error) {
    console.error('❌ Error in store-facts API:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
