# RAG Integration Setup Guide

This document explains how to set up the RAG (Retrieval-Augmented Generation) system for LabTest using Qdrant vector database.

## Overview

The RAG system replaces the previous JSON-heavy approach (10-150KB per request) with intelligent vector-based retrieval. This allows:
- Personalized AI analysis for each student
- Efficient retrieval of relevant learning facts
- Scalable long-term memory for user learning patterns

## Architecture

1. **Fact Extraction**: When a student completes a quiz, facts are extracted from their attempt (errors, timing, performance)
2. **Embedding**: Facts are converted to 384-dimensional vectors using `Xenova/multilingual-e5-small`
3. **Storage**: Vectors are stored in Qdrant with metadata (userId, quizId, classId, subject)
4. **Retrieval**: When AI analysis is requested, relevant facts are retrieved based on semantic similarity
5. **Analysis**: AI uses retrieved facts instead of full JSON for personalized recommendations

## Environment Variables

Add these variables to both `.env.local` files:

1. **`temp_app/.env.local`** - For client-side (Vite)
2. **`../.env.local`** (parent directory) - For reference

### Qdrant Configuration (Required for RAG)
```
VITE_QDRANT_URL=https://782f351a-291d-422c-bd09-88c135a771c2.europe-west3-0.gcp.cloud.qdrant.io
VITE_QDRANT_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3MiOiJtIiwic3ViamVjdCI6ImFwaS1rZXk6YjUyYzFhOTMtMWM4My00YTQzLTkxMDEtNTdmNTQwMGE0OWI2In0.U4_u87w43QHAXUNGcJxbqzDNjS6jCB-3NsKilzawglg
```

**Important**: 
- Client-side environment variables in Vite must be prefixed with `VITE_`
- Add the same variables to Vercel Environment Variables (without `VITE_` prefix) for server-side API:
  - `QDRANT_URL`
  - `QDRANT_API_KEY`

### Existing Variables (Already configured)
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_GEMINI_API_KEY=your_gemini_key (optional)
```

## Installation

Install the required dependencies:

```bash
npm install @qdrant/js-client-rest @xenova/transformers @supabase/supabase-js
```

## Qdrant Collection Details

The collection `user_memory` is already configured with:
- **Vector dimension**: 384 (matches Xenova/multilingual-e5-small)
- **Distance metric**: Cosine
- **Tenant field**: userId (for multi-tenant isolation)
- **Keyword indexes**: userId, quizId, classId, subject

## Files Created

### Client-side Libraries
- `src/lib/qdrantClient.js` - Qdrant client utility for vector operations
- `src/lib/embeddingService.js` - Embedding generation using Xenova/multilingual-e5-small
- `src/lib/factExtractor.js` - Fact extraction from quiz attempts
- `src/lib/ragService.js` - RAG-enabled AI analysis service

### Server-side API
- `api/store-facts.js` - Vercel server function for automatic fact extraction

### Modified Files
- `src/lib/quizEvaluation.js` - Added trigger for fact storage after quiz completion

## How It Works

### Automatic Fact Storage
When a student completes a quiz:
1. `quizEvaluation.js` saves the result to Supabase
2. It calls `/api/store-facts` with attemptId, quizId, userId
3. The API extracts facts from the attempt (errors, timing, performance)
4. Facts are embedded and stored in Qdrant

### RAG-Enabled AI Analysis
When AI analysis is requested:
1. `ragService.js` generates a query embedding based on analysis type
2. Relevant facts are retrieved from Qdrant (sorted by similarity)
3. Facts are included in the AI prompt instead of full JSON
4. AI provides personalized recommendations based on retrieved facts

## Fact Types Extracted

1. **Error Facts**: Specific questions the student got wrong, with chosen vs correct answers
2. **Timing Facts**: Questions with extreme time spent (too fast or too slow)
3. **Performance Facts**: Overall scores, pass rates, completion status
4. **Behavior Facts**: Suspicious attempts, incomplete attempts, early exits
5. **Context Facts**: User name, class, school, city

## Benefits

- **Reduced Payload**: Instead of 10-150KB JSON, only relevant facts (~1-2KB) are sent to AI
- **Personalization**: AI sees only the most relevant facts for each query
- **Scalability**: Vector database scales better than JSON payload limits
- **Long-term Memory**: All historical attempts contribute to the knowledge base
- **Semantic Search**: Facts are retrieved based on meaning, not exact matches

## Migration from Old System

The old JSON-based system (`aiPromptBuilder.js`) still works as a fallback. To enable RAG:

1. Set Qdrant environment variables
2. Install dependencies
3. The system automatically uses RAG when available
4. If Qdrant is not configured, it falls back to JSON-based prompts

## Testing

Test the RAG system:

1. Complete a quiz as a student
2. Check console for "✅ RAG: Stored X facts for user {userId}"
3. Request AI analysis in Profile or Analytics
4. Check if analysis uses retrieved facts instead of full JSON

## Troubleshooting

### Facts not being stored
- Check Qdrant credentials in environment variables
- Check browser console for errors
- Verify `/api/store-facts` is accessible

### AI analysis still using JSON
- Check if Qdrant is configured (check console warnings)
- Verify facts are being stored (check Qdrant collection info)
- Check if RAG context is being built (check console logs)

### Embedding model not loading
- The model is downloaded from Hugging Face on first use (~200MB)
- Check browser console for download progress
- Ensure sufficient disk space for model cache

## Future Enhancements

- ✅ Add fact expiration (old facts become less relevant) - **IMPLEMENTED**
  - Time decay with configurable half-life (default 30 days)
  - Exponential decay formula: score = 0.5 ^ (days / halfLife)
  - Clamped between 0.1 and 1 to prevent complete exclusion

- ✅ Implement fact deduplication - **IMPLEMENTED**
  - Hash-based exact duplicate detection
  - Semantic similarity detection using Jaccard index
  - Configurable similarity threshold (default 0.8)

- ✅ Add fact importance scoring - **IMPLEMENTED**
  - Error facts: +0.3 importance
  - Suspicious behavior: +0.4 importance
  - Performance facts: +0.2 importance
  - Incomplete attempts: +0.3 importance
  - Timing facts: +0.1 importance

- ✅ Support for multi-language embeddings - **IMPLEMENTED**
  - Language detection for Russian, Kazakh, English
  - Xenova/multilingual-e5-small model supports 100+ languages
  - Language stored in fact metadata for filtering

- Real-time fact updates during quiz attempts - **PENDING**
  - Send facts to Qdrant as student answers each question
  - Update AI analysis in real-time during quiz
