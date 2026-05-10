import { pipeline, env } from '@xenova/transformers';

// Configure transformers.js to use local cache
env.allowLocalModels = false;
env.useBrowserCache = true;
env.disableRemoteModels = false;

let worker = null;
let workerReady = false;
let pendingRequest = null;

/**
 * Initialize the worker
 */
const initWorker = () => {
  if (worker) return worker;

  // Create worker from the separate file
  worker = new Worker(new URL('./embeddingWorker.js', import.meta.url), {
    type: 'module'
  });

  worker.onmessage = (e) => {
    const { type, payload } = e.data;
    
    if (type === 'init_done') {
      workerReady = true;
      console.log('✅ Embedding worker ready');
      
      // Clear the loading toast
      window.dispatchEvent(new CustomEvent('rag-status', { 
        detail: { 
          status: 'done', 
          message: 'ИИ-модель готова',
          progress: 100
        } 
      }));

      if (pendingRequest?.type === 'init') {
        pendingRequest.resolve();
        pendingRequest = null;
      }
    } 
    
    else if (type === 'embed_done') {
      if (pendingRequest?.type === 'embed') {
        pendingRequest.resolve(payload.vectors);
        pendingRequest = null;
      }
    }
    
    else if (type === 'progress') {
      // Dispatch event for UI progress bars
      // transformers.js sends progress as 0-1, so multiply by 100
      const percent = payload.progress ? Math.round(payload.progress * 100) : 0;
      
      window.dispatchEvent(new CustomEvent('rag-status', { 
        detail: { 
          status: 'loading_model', 
          progress: percent,
          message: 'Загрузка ИИ-модели...'
        } 
      }));
    }
    
    else if (type === 'error') {
      console.error('❌ Embedding worker error:', payload.message);
      if (pendingRequest) {
        pendingRequest.reject(new Error(payload.message));
        pendingRequest = null;
      }
    }
  };

  return worker;
};

/**
 * Generate embeddings for multiple texts in batch via Worker
 */
export const generateEmbeddingsBatch = async (texts) => {
  if (!Array.isArray(texts) || texts.length === 0) return [];

  const w = initWorker();
  
  // Wait for worker initialization if needed
  if (!workerReady) {
    await new Promise((resolve, reject) => {
      pendingRequest = { type: 'init', resolve, reject };
      w.postMessage({ type: 'init' });
    });
  }

  return new Promise((resolve, reject) => {
    pendingRequest = { type: 'embed', resolve, reject };
    w.postMessage({ type: 'embed', payload: { texts } });
  });
};

/**
 * Generate embedding for a single text
 */
export const generateEmbedding = async (text) => {
  const vectors = await generateEmbeddingsBatch([text]);
  return vectors[0];
};

/**
 * Preload the embedding model
 */
export const preloadEmbeddingModel = async () => {
  const w = initWorker();
  if (workerReady) return true;

  return new Promise((resolve, reject) => {
    pendingRequest = { type: 'init', resolve, reject };
    w.postMessage({ type: 'init' });
  });
};

export const isEmbeddingReady = () => workerReady;
