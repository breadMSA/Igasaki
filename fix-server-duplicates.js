/**
 * 清理服務器上的重複消息
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const messagesFile = path.join(__dirname, 'server/data/memory/default/messages.json');

console.log('🔧 開始清理服務器上的重複消息...');

try {
  // 讀取消息文件
  const data = fs.readFileSync(messagesFile, 'utf-8');
  const messages = JSON.parse(data);
  
  console.log(`📊 原始消息數: ${messages.length}`);
  
  // 去重（保留最新的）
  const seen = new Map();
  const unique = [];
  
  messages.forEach(msg => {
    if (!seen.has(msg.id)) {
      seen.set(msg.id, true);
      // 清理處理中的狀態
      if (msg.processing) {
        msg.processing = false;
      }
      unique.push(msg);
    }
  });
  
  console.log(`✅ 去重後消息數: ${unique.length}`);
  console.log(`🗑️  刪除了 ${messages.length - unique.length} 條重複消息`);
  
  // 按時間排序
  unique.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  // 寫回文件
  fs.writeFileSync(messagesFile, JSON.stringify(unique, null, 2), 'utf-8');
  
  console.log('✅ 清理完成！');
  console.log('💡 現在可以重啟服務器了');
  
} catch (error) {
  console.error('❌ 清理失敗:', error.message);
  process.exit(1);
}

