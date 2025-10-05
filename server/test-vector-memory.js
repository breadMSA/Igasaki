/**
 * 測試向量記憶服務的腳本
 * 用於驗證修復是否有效
 */

const { VectorMemoryService } = require('./src/services/vectorMemoryService');

async function testVectorMemoryService() {
  console.log('🧪 開始測試向量記憶服務...\n');
  
  // 創建服務實例
  const service = new VectorMemoryService();
  
  // 等待初始化完成
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('\n📊 檢查初始狀態...');
  const status = await service.getDatabaseStatus();
  console.log('數據庫狀態:', JSON.stringify(status, null, 2));
  
  // 測試搜尋（應該會觸發文件加載或數據庫構建）
  console.log('\n🔍 測試搜尋功能...');
  const testMessages = [
    { role: 'user', content: '你好，請介紹一下自己' },
    { role: 'assistant', content: '你好！我是小葵，很高興認識你！' },
    { role: 'user', content: '你叫什麼名字？' },
    { role: 'assistant', content: '我叫小葵，是一個AI助手。' }
  ];
  
  try {
    const results = await service.searchRelevantHistory('小葵', testMessages, 5);
    console.log(`✅ 搜尋成功，找到 ${results.length} 條結果`);
    
    if (results.length > 0) {
      console.log('前3條結果:');
      results.slice(0, 3).forEach((result, index) => {
        console.log(`  ${index + 1}. 分數: ${result.score.toFixed(4)} - 內容: ${result.text.substring(0, 100)}...`);
      });
    }
  } catch (error) {
    console.error('❌ 搜尋失敗:', error);
  }
  
  // 再次檢查狀態
  console.log('\n📊 檢查搜尋後的狀態...');
  const statusAfter = await service.getDatabaseStatus();
  console.log('搜尋後數據庫狀態:', JSON.stringify(statusAfter, null, 2));
  
  console.log('\n✅ 測試完成！');
}

// 運行測試
testVectorMemoryService().catch(console.error);

