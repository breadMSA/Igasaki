/**
 * 重新載入消息工具
 * 用於調試和恢復消息顯示
 */

import { chatMemory } from '@/hooks/useMemoryStore';

/**
 * 從 IndexedDB 重新載入所有消息並輸出到控制台
 */
export async function debugMessages() {
  try {
    console.log('🔍 開始調試消息...');
    
    const allMessages = await chatMemory.getMessages(10000);
    console.log(`📊 總消息數: ${allMessages.length}`);
    
    if (allMessages.length === 0) {
      console.warn('⚠️ 沒有找到任何消息！');
      return;
    }
    
    // 按角色分組
    const userMessages = allMessages.filter(m => m.role === 'user');
    const assistantMessages = allMessages.filter(m => m.role === 'assistant');
    
    console.log(`👤 用戶消息: ${userMessages.length} 條`);
    console.log(`🤖 AI 消息: ${assistantMessages.length} 條`);
    
    // 顯示最近10條
    const recent = allMessages
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);
    
    console.log('\n📝 最近10條消息:');
    recent.forEach((msg, index) => {
      const time = new Date(msg.timestamp).toLocaleString('zh-TW');
      const preview = msg.content.substring(0, 50) + (msg.content.length > 50 ? '...' : '');
      console.log(`  ${index + 1}. [${msg.role}] ${time}`);
      console.log(`     ${preview}`);
    });
    
    return allMessages;
  } catch (error) {
    console.error('❌ 調試消息失敗:', error);
    return [];
  }
}

/**
 * 清空所有處理中的消息
 */
export async function clearProcessingMessages() {
  try {
    const allMessages = await chatMemory.getMessages(10000);
    const processingMessages = allMessages.filter(m => m.processing);
    
    if (processingMessages.length === 0) {
      console.log('✅ 沒有處理中的消息');
      return;
    }
    
    console.log(`🧹 找到 ${processingMessages.length} 條處理中的消息，準備清理...`);
    
    for (const msg of processingMessages) {
      await chatMemory.deleteMessage(msg.id);
      console.log(`  已刪除: ${msg.content.substring(0, 30)}...`);
    }
    
    console.log('✅ 清理完成');
  } catch (error) {
    console.error('❌ 清理失敗:', error);
  }
}

/**
 * 檢查消息完整性
 */
export async function checkMessageIntegrity() {
  try {
    console.log('🔍 檢查消息完整性...');
    
    const allMessages = await chatMemory.getMessages(10000);
    
    const issues = {
      noContent: [] as any[],
      noTimestamp: [] as any[],
      processing: [] as any[],
      noId: [] as any[]
    };
    
    allMessages.forEach(msg => {
      if (!msg.content || msg.content.trim() === '') {
        issues.noContent.push(msg);
      }
      if (!msg.timestamp) {
        issues.noTimestamp.push(msg);
      }
      if (msg.processing) {
        issues.processing.push(msg);
      }
      if (!msg.id) {
        issues.noId.push(msg);
      }
    });
    
    console.log('\n📊 檢查結果:');
    console.log(`  總消息數: ${allMessages.length}`);
    console.log(`  無內容: ${issues.noContent.length} 條`);
    console.log(`  無時間戳: ${issues.noTimestamp.length} 條`);
    console.log(`  處理中: ${issues.processing.length} 條`);
    console.log(`  無ID: ${issues.noId.length} 條`);
    
    if (issues.processing.length > 0) {
      console.warn('⚠️ 發現處理中的消息，可能是之前的會話被中斷');
      console.log('   運行 clearProcessingMessages() 來清理');
    }
    
    return issues;
  } catch (error) {
    console.error('❌ 檢查失敗:', error);
  }
}

// 導出到全局，方便在控制台使用
if (typeof window !== 'undefined') {
  (window as any).debugMessages = debugMessages;
  (window as any).clearProcessingMessages = clearProcessingMessages;
  (window as any).checkMessageIntegrity = checkMessageIntegrity;
  
  console.log('🛠️ 調試工具已載入！');
  console.log('   - debugMessages() - 查看所有消息');
  console.log('   - clearProcessingMessages() - 清理處理中的消息');
  console.log('   - checkMessageIntegrity() - 檢查消息完整性');
}


