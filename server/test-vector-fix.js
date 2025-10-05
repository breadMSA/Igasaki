import { VectorMemoryService } from './src/services/vectorMemoryService.js';

async function testVectorSearchFix() {
  console.log('🧪 測試向量記憶搜尋修復...');
  
  const vectorService = new VectorMemoryService();
  
  // 等待初始化完成
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 測試搜尋小葵相關內容
  console.log('\n🔍 測試搜尋 "小葵" 相關內容...');
  
  try {
    const results = await vectorService.searchRelevantHistory('小葵花店故事', [], 20);
    
    console.log(`✅ 搜尋結果: ${results.length} 條`);
    
    if (results.length > 0) {
      console.log('\n📝 前5條結果:');
      results.slice(0, 5).forEach((result, index) => {
        console.log(`${index + 1}. 分數: ${result.score.toFixed(4)}`);
        console.log(`   內容: ${result.text.substring(0, 150)}...`);
        console.log('');
      });
      
      // 檢查是否包含真正的小葵故事
      const hasRealStory = results.some(result => 
        result.text.includes('小葵') && 
        (result.text.includes('花店') || result.text.includes('日落') || result.text.includes('店主'))
      );
      
      if (hasRealStory) {
        console.log('🎉 成功找到真正的小葵故事！');
      } else {
        console.log('⚠️ 沒有找到真正的小葵故事，只有AI的回覆');
      }
    } else {
      console.log('❌ 沒有找到任何結果');
    }
    
  } catch (error) {
    console.error('❌ 搜尋失敗:', error);
  }
  
  // 測試數據庫狀態
  console.log('\n📊 測試數據庫狀態...');
  try {
    const status = await vectorService.getDatabaseStatus();
    console.log('✅ 數據庫狀態:', status);
  } catch (error) {
    console.error('❌ 獲取數據庫狀態失敗:', error);
  }
}

testVectorSearchFix().catch(console.error);
