import { supabase } from './supabase';
import { transliterate } from './transliterate';

export const syncGithubRenames = async (classId, oldSectionName, newSectionName, oldQuizName, newQuizName) => {
  try {
    const isSectionRename = oldSectionName !== newSectionName;
    const isQuizRename = oldQuizName !== newQuizName;
    if (!isSectionRename && !isQuizRename) return;

    const oldPrefix = isSectionRename 
      ? `${transliterate(oldSectionName)}-` 
      : `${transliterate(oldSectionName)}-${transliterate(oldQuizName)}-`;

    const newPrefix = isSectionRename 
      ? `${transliterate(newSectionName)}-` 
      : `${transliterate(oldSectionName)}-${transliterate(newQuizName)}-`;

    // 1. Rename files in GitHub
    const res = await fetch('/api/github-rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classNumber: classId,
        oldPrefix,
        newPrefix
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const renamedMap = data.renamed;
    if (!renamedMap || Object.keys(renamedMap).length === 0) {
      return; // No files renamed
    }

    // 2. We need to update Supabase.
    // If it's a quiz rename, we only need to update that specific quiz.
    // If it's a section rename, we might need to update multiple quizzes.

    // Let's query quizzes strictly in the old section (which might have been recently renamed in Supabase, 
    // but the ID remains the same! So we can query by checking whose content contains the old urls).
    // Actually, we can fetch all quizzes in the class, or we can just fetch all quizzes that have ANY of the old URLs in their JSON.
    // A simpler way: we pass the actual quiz IDs if it's a quiz, or section ID if it's a section?
    // Let's just fetch ALL quizzes since it's a client-side sync. No, that's heavy.
    // It's better to export this function to be used WHERE we know the IDs.
    
    return renamedMap;
  } catch (error) {
    console.error('GitHub Sync Error:', error);
    // Don't throw, just fail silently to not break the primary platform functionality
  }
};

export const updateQuizzesWithNewUrls = async (quizzesToUpdate, renamedMap) => {
  if (!renamedMap || Object.keys(renamedMap).length === 0) return;

  for (const quiz of quizzesToUpdate) {
    if (!quiz.content || !quiz.content.questions) continue;
    
    let hasChanges = false;
    const newQuestions = quiz.content.questions.map(q => {
      if (!q.images) return q;
      const newImages = q.images.map(img => {
        if (renamedMap[img]) {
          hasChanges = true;
          return renamedMap[img];
        }
        return img;
      });
      return { ...q, images: newImages };
    });

    if (hasChanges) {
      await supabase.from('quizzes').update({
        content: { ...quiz.content, questions: newQuestions }
      }).eq('id', quiz.id);
    }
  }
};
