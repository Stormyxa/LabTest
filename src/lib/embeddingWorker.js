import { pipeline, env } from '@xenova/transformers';

// Configure transformers.js to use local cache
env.allowLocalModels = false;
env.useBrowserCache = true;
env.disableRemoteModels = false;

let embeddingPipeline = null;

// Handle messages from the main thread
self.onmessage = async (e) => {
  const { type, payload } = e.data;

  try {
    if (type === 'init') {
      if (!embeddingPipeline) {
        embeddingPipeline = await pipeline(
          'feature-extraction',
          'Xenova/multilingual-e5-small',
          {
            quantized: true,
            progress_callback: (progress) => {
              self.postMessage({ type: 'progress', payload: progress });
            }
          }
        );
      }
      self.postMessage({ type: 'init_done' });
    } 
    
    else if (type === 'embed') {
      if (!embeddingPipeline) {
        throw new Error('Pipeline not initialized');
      }

      const { texts } = payload;
      const prefixedTexts = texts.map(t => `query: ${t}`);
      
      const outputs = await embeddingPipeline(prefixedTexts, {
        pooling: 'mean',
        normalize: true
      });

      const flatData = outputs.data;
      const batchSize = texts.length;
      const dimension = 384;
      
      const vectors = [];
      for (let i = 0; i < batchSize; i++) {
        const start = i * dimension;
        const end = start + dimension;
        vectors.push(Array.from(flatData.slice(start, end)));
      }

      self.postMessage({ type: 'embed_done', payload: { vectors } });
    }
  } catch (error) {
    self.postMessage({ type: 'error', payload: { message: error.message } });
  }
};
