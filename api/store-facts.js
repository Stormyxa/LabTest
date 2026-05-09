import { createClient } from '@supabase/supabase-js';
import { QdrantClient } from '@qdrant/js-client-rest';
import { extractAllFacts, limitFacts } from '../src/lib/factExtractor.js';
import { generateEmbedding } from '../src/lib/embeddingService.js';

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Qdrant client for server-side
const QDRANT_URL = process.env.QDRANT_URL || process.env.VITE_QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || process.env.VITE_QDRANT_API_KEY;

let qdrantClient = null;
if (QDRANT_URL && QDRANT_API_KEY) {
  qdrantClient = new QdrantClient({
    url: QDRANT_URL,
    apiKey: QDRANT_API_KEY,
  });
}

const COLLECTION_NAME = 'user_memory';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { attemptId, quizId, userId, sectionName: passedSection, quizClass: passedClass } = req.body;

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

    // 2. Fetch the quiz with questions and section info (including class_id and book_url)
    const { data: quiz, error: quizError } = await supabase
      .from('quizzes')
      .select('*, quiz_sections(name, class_id, book_url)')
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

    // 4. Fetch class name if class_id exists
    let quizClass = passedClass || null;
    if (!quizClass && quiz.quiz_sections?.class_id) {
      const { data: quizClassData } = await supabase
        .from('quiz_classes')
        .select('name')
        .eq('id', quiz.quiz_sections.class_id)
        .single();
      quizClass = quizClassData?.name || null;
    }

    // 4b. Fetch all attempts for this quiz and user to calculate statistics
    const { data: allAttempts, error: allAttemptsError } = await supabase
      .from('quiz_attempts')
      .select('score, max_score, time_spent_total, created_at')
      .eq('quiz_id', quizId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    let summary = null;
    if (allAttempts && allAttempts.length > 0) {
      const totalScorePercent = allAttempts.reduce((sum, a) => sum + (a.score / (a.max_score || 1)) * 100, 0);
      const totalTime = allAttempts.reduce((sum, a) => sum + (a.time_spent_total || 0), 0);
      const bestScorePercent = Math.max(...allAttempts.map(a => (a.score / (a.max_score || 1)) * 100));
      const firstScorePercent = (allAttempts[0].score / (allAttempts[0].max_score || 1)) * 100;
      const currentScorePercent = (attempt.score / (attempt.max_score || 1)) * 100;

      // Fetch user flags from results
      const { data: result } = await supabase
        .from('quiz_results')
        .select('is_suspicious_user, is_incomplete_user')
        .eq('quiz_id', quizId)
        .eq('user_id', userId)
        .maybeSingle();

      summary = {
        avg_score: totalScorePercent / allAttempts.length,
        avg_time: totalTime / allAttempts.length,
        attempts_count: allAttempts.length,
        best_score: bestScorePercent,
        is_first: allAttempts.length === 1 || (allAttempts[0]?.id === attempt.id),
        is_best: currentScorePercent >= bestScorePercent,
        progress: currentScorePercent - firstScorePercent,
        benchmark: quiz.avg_success_rate || null,
        is_suspicious_user: result?.is_suspicious_user || false,
        is_incomplete_user: result?.is_incomplete_user || false
      };
    }

    // 5. Extract facts from the attempt with full metadata
    const sectionName = passedSection || quiz.quiz_sections?.name || null;
    const subject = sectionName || 'Неизвестный предмет';
    const { facts, language } = await extractAllFacts({
      attempt,
      quiz,
      profile,
      subject,
      sectionName,
      quizClass,
      summary
    });

    // Limit to most important facts (max 20) with deduplication and importance scoring
    const limitedFacts = limitFacts(facts, 20, true);

    console.log(`📝 Extracted ${limitedFacts.length} facts from attempt`);

    // 5. Generate embeddings and upsert to Qdrant
    if (!qdrantClient) {
      console.warn('Qdrant not configured on server-side, skipping fact storage');
      return res.status(200).json({ 
        factsStored: 0, 
        message: 'Qdrant not configured, facts not stored' 
      });
    }

    const upsertResults = [];
    for (const fact of limitedFacts) {
      try {
        const vector = await generateEmbedding(fact);
        
        const pointId = `${userId}_${quizId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        await qdrantClient.upsert(COLLECTION_NAME, {
          points: [
            {
              id: pointId,
              vector,
              payload: {
                userId,
                quizId,
                classId: profile.class_id || null,
                subject,
                fact,
                timestamp: new Date().toISOString(),
                attemptId,
                score: attempt.score,
                maxScore: attempt.max_score,
                isPassed: attempt.is_passed,
                isSuspicious: attempt.is_suspicious,
                isIncomplete: attempt.is_incomplete,
                isSuspiciousUser: summary?.is_suspicious_user || false,
                isIncompleteUser: summary?.is_incomplete_user || false,
                language
              }
            }
          ]
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
