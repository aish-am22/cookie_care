import { ingestDocument } from './src/ai/ingest/ingestionService.js';
import fs from 'fs';

async function run() {
  try {
    const filePath = './test.txt';
    const content = fs.readFileSync(filePath, 'utf8');
    
    console.log('🧠 Munching on the YC Safe (test.txt)...');
    
    const result = await ingestDocument({
      content: content,
      meta: {
        orgId: 'test-org',
        userId: 'cmnwqzdby0000nq8dhsckcv7n',
        title: 'YC Safe Agreement',
        filename: 'test.txt',
        mimeType: 'text/plain',
        docType: 'CONTRACT'
      }
    });
    
    if (result.status === 'INDEXED') {
      console.log('✅ Ingestion complete! Chunks indexed:', result.chunksIndexed);
    } else {
      console.error('❌ Ingestion failed:', result.errorMsg);
    }
  } catch (err) {
    console.error('❌ Script error:', err);
  }
}
run();