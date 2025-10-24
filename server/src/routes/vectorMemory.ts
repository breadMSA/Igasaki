import express from 'express';
import { vectorMemoryService } from '../services/vectorMemoryService';

const router = express.Router();

/**
 * 搜尋相關的歷史記錄
 */
router.post('/search', async (req, res) => {
  try {
    const { query, messages, topK = 10, conversationId, sharedMemory = true } = req.body;

    if (!query || !messages) {
      return res.status(400).json({ 
        error: '缺少必要參數: query 和 messages' 
      });
    }

    console.log(`🔍 向量搜尋: "${query}" (topK: ${topK}, conversationId: ${conversationId}, sharedMemory: ${sharedMemory})`);
    
    const results = await vectorMemoryService.searchRelevantHistory(
      query, 
      messages, 
      topK,
      conversationId,
      sharedMemory
    );

    console.log(`✅ 找到 ${results.length} 條相關記錄`);
    
    res.json({
      success: true,
      results,
      query,
      totalFound: results.length,
      conversationId,
      sharedMemory
    });

  } catch (error) {
    console.error('向量搜尋失敗:', error);
    res.status(500).json({ 
      error: '向量搜尋失敗',
      details: error instanceof Error ? error.message : '未知錯誤'
    });
  }
});

/**
 * 批量向量化歷史消息
 */
router.post('/vectorize', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ 
        error: '缺少必要參數: messages (必須是陣列)' 
      });
    }

    console.log(`🚀 開始批量向量化 ${messages.length} 條消息...`);
    
    // 非阻塞執行向量化
    vectorMemoryService.batchVectorize(messages).catch(error => {
      console.error('批量向量化失敗:', error);
    });

    res.json({
      success: true,
      message: `已開始處理 ${messages.length} 條消息的向量化`,
      totalMessages: messages.length
    });

  } catch (error) {
    console.error('批量向量化失敗:', error);
    res.status(500).json({ 
      error: '批量向量化失敗',
      details: error instanceof Error ? error.message : '未知錯誤'
    });
  }
});

/**
 * 添加新對話到向量記憶
 */
router.post('/add', async (req, res) => {
  try {
    const { userMessage, assistantMessage, conversationId } = req.body;

    if (!userMessage || !assistantMessage) {
      return res.status(400).json({ 
        error: '缺少必要參數: userMessage 和 assistantMessage' 
      });
    }

    console.log(`💾 添加新對話到向量記憶: ${userMessage.substring(0, 50)}... (conversationId: ${conversationId})`);
    
    await vectorMemoryService.addConversation(userMessage, assistantMessage, conversationId);

    res.json({
      success: true,
      message: '新對話已添加到向量記憶'
    });

  } catch (error) {
    console.error('添加對話失敗:', error);
    res.status(500).json({ 
      error: '添加對話失敗',
      details: error instanceof Error ? error.message : '未知錯誤'
    });
  }
});

/**
 * 檢查服務狀態
 */
router.get('/status', (req, res) => {
  const hasApiKey = !!process.env.MEMORY_API_KEY;
  
  res.json({
    success: true,
    status: {
      apiKeyConfigured: hasApiKey,
      service: 'BAAI/bge-m3',
      vectorDimension: 1024,
      baseUrl: 'https://api.siliconflow.cn/v1'
    }
  });
});

/**
 * 檢查向量數據庫詳細狀態
 */
router.get('/database-status', async (req, res) => {
  try {
    const databaseStatus = await vectorMemoryService.getDatabaseStatus();
    
    res.json({
      success: true,
      databaseStatus
    });
    
  } catch (error) {
    console.error('獲取數據庫狀態失敗:', error);
    res.status(500).json({ 
      error: '獲取數據庫狀態失敗',
      details: error instanceof Error ? error.message : '未知錯誤'
    });
  }
});

/**
 * 強制重新加載向量數據庫
 */
router.post('/reload', async (req, res) => {
  try {
    console.log('�� 強制重新加載向量數據庫...');
    const success = await vectorMemoryService.forceReloadDatabase();
    if (success) {
      res.json({ success: true, message: '向量數據庫重新加載成功' });
    } else {
      res.status(500).json({ success: false, error: '向量數據庫重新加載失敗' });
    }
  } catch (error) {
    console.error('強制重新加載失敗:', error);
    res.status(500).json({ error: '強制重新加載失敗', details: error instanceof Error ? error.message : '未知錯誤' });
  }
});

/**
 * 強制重新構建所有歷史記錄的向量數據庫
 */
router.post('/rebuild-all', async (req, res) => {
  try {
    console.log('🔄 強制重新構建所有歷史記錄的向量數據庫...');
    const { messages } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: '缺少messages參數或格式錯誤' });
    }
    
    await vectorMemoryService.forceRebuildAllHistory(messages);
    
    const status = await vectorMemoryService.getDatabaseStatus();
    
    res.json({ 
      success: true, 
      message: '向量數據庫重新構建成功',
      totalConversations: status.inMemoryConversations
    });
  } catch (error) {
    console.error('強制重新構建失敗:', error);
    res.status(500).json({ error: '強制重新構建失敗', details: error instanceof Error ? error.message : '未知錯誤' });
  }
});

export default router;
