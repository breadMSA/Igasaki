import { Router, Request, Response } from 'express';
import { userDataService } from '@/services/userDataService.js';
import { logger } from '@/lib/logger.js';

const router = Router();

/**
 * 獲取用戶偏好設定
 */
router.get('/preferences', async (req: Request, res: Response) => {
  try {
    const preferences = await userDataService.getPreferences();
    res.json(preferences);
  } catch (error) {
    logger.error('獲取偏好設定失敗', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ 
      error: '無法獲取偏好設定',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * 更新用戶偏好設定
 */
router.put('/preferences', async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const preferences = await userDataService.updatePreferences(updates);
    logger.info('Updated user preferences');
    res.json(preferences);
  } catch (error) {
    logger.error('更新偏好設定失敗', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ 
      error: '無法更新偏好設定',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * 獲取聊天記錄
 */
router.get('/messages', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;
    
    const messages = await userDataService.getMessages(limit, offset);
    res.json(messages);
  } catch (error) {
    logger.error('獲取消息失敗', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ 
      error: '無法獲取消息',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * 添加單條消息
 */
router.post('/messages', async (req: Request, res: Response) => {
  try {
    const message = req.body;
    const newMessage = await userDataService.addMessage(message);
    res.json(newMessage);
  } catch (error) {
    logger.error('添加消息失敗', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ 
      error: '無法添加消息',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * 批量添加消息
 */
router.post('/messages/batch', async (req: Request, res: Response) => {
  try {
    const messages = req.body.messages;
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: '無效的消息格式' });
    }
    
    const newMessages = await userDataService.addMessages(messages);
    res.json({ 
      success: true, 
      count: newMessages.length,
      messages: newMessages
    });
  } catch (error) {
    logger.error('批量添加消息失敗', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ 
      error: '無法批量添加消息',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * 刪除消息
 */
router.delete('/messages/:id', async (req: Request, res: Response) => {
  try {
    const messageId = req.params.id;
    await userDataService.deleteMessage(messageId);
    res.json({ success: true, messageId });
  } catch (error) {
    logger.error('刪除消息失敗', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ 
      error: '無法刪除消息',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * 清空所有消息
 */
router.delete('/messages', async (req: Request, res: Response) => {
  try {
    await userDataService.clearMessages();
    res.json({ success: true, message: '所有消息已清空' });
  } catch (error) {
    logger.error('清空消息失敗', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ 
      error: '無法清空消息',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * 獲取統計數據
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await userDataService.getStats();
    res.json(stats);
  } catch (error) {
    logger.error('獲取統計數據失敗', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ 
      error: '無法獲取統計數據',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * 同步本地數據到服務器
 */
router.post('/sync', async (req: Request, res: Response) => {
  try {
    const { preferences, messages } = req.body;
    await userDataService.syncFromLocal(preferences, messages);
    res.json({ 
      success: true, 
      message: '數據同步成功'
    });
  } catch (error) {
    logger.error('同步數據失敗', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ 
      error: '無法同步數據',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;


