/**
 * 清理空的對話串資料夾
 * 這些資料夾是舊版本遺留的，新版本不再使用子目錄
 */

import fs from 'fs/promises';
import path from 'path';

const MESSAGES_DIR = './data/user/conversations';

async function cleanupEmptyDirectories() {
  try {
    console.log('🔍 檢查空資料夾...');
    
    const entries = await fs.readdir(MESSAGES_DIR, { withFileTypes: true });
    
    let removedCount = 0;
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirPath = path.join(MESSAGES_DIR, entry.name);
        
        try {
          // 檢查目錄是否為空
          const files = await fs.readdir(dirPath);
          
          if (files.length === 0) {
            // 刪除空目錄
            await fs.rmdir(dirPath);
            console.log(`✅ 已刪除空資料夾: ${entry.name}`);
            removedCount++;
          } else {
            console.log(`⚠️ 資料夾不為空，跳過: ${entry.name} (包含 ${files.length} 個文件)`);
          }
        } catch (error) {
          console.warn(`⚠️ 無法處理資料夾 ${entry.name}:`, error.message);
        }
      }
    }
    
    if (removedCount === 0) {
      console.log('✅ 沒有找到空資料夾');
    } else {
      console.log(`✅ 總共刪除了 ${removedCount} 個空資料夾`);
    }
  } catch (error) {
    console.error('❌ 清理失敗:', error);
    process.exit(1);
  }
}

cleanupEmptyDirectories();

