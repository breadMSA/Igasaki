import { Router, Request, Response } from 'express';
import { 
  Conversation, 
  CreateConversationRequest, 
  UpdateConversationRequest,
  ConversationListResponse,
  ConversationMessagesResponse,
  ChatMessage,
  ValidationError 
} from '@/types/index.js';
import { logger } from '@/lib/logger.js';

const router = Router();

// 數據存儲路徑
const CONVERSATIONS_FILE = './data/user/conversations.json';
const MESSAGES_DIR = './data/user/conversations';

/**
 * 確保目錄存在
 */
async function ensureDirectoryExists(dirPath: string): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');
  
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

/**
 * 讀取對話串列表
 */
async function readConversations(): Promise<Conversation[]> {
  const fs = await import('fs/promises');
  
  try {
    await ensureDirectoryExists('./data/user');
    const data = await fs.readFile(CONVERSATIONS_FILE, 'utf-8');
    return JSON.parse(data).map((conv: any) => ({
      ...conv,
      createdAt: new Date(conv.createdAt),
      updatedAt: new Date(conv.updatedAt)
    }));
  } catch (error) {
    // 如果文件不存在，返回空數組
    return [];
  }
}

/**
 * 保存對話串列表
 */
async function saveConversations(conversations: Conversation[]): Promise<void> {
  const fs = await import('fs/promises');
  
  await ensureDirectoryExists('./data/user');
  await fs.writeFile(CONVERSATIONS_FILE, JSON.stringify(conversations, null, 2), 'utf-8');
}

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * GET /api/conversations - 取得所有對話串列表
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const conversations = await readConversations();
    
    const response: ConversationListResponse = {
      conversations: conversations.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
      total: conversations.length
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Failed to fetch conversations', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

/**
 * POST /api/conversations - 創建新對話串
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, settings }: CreateConversationRequest = req.body;
    
    const conversations = await readConversations();
    
    const newConversation: Conversation = {
      id: generateId(),
      title: title || `新對話 ${conversations.length + 1}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      messageCount: 0,
      settings: {
        sharedMemory: true, // 修復：預設為非共享記憶，確保新聊天室完全隔離
        ...settings
      }
    };
    
    conversations.push(newConversation);
    await saveConversations(conversations);
    
    // 修復：不創建子目錄，直接使用 MESSAGES_DIR 存放 JSON 文件
    
    logger.info('Created new conversation', { conversationId: newConversation.id });
    res.status(201).json(newConversation);
  } catch (error) {
    logger.error('Failed to create conversation', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

/**
 * GET /api/conversations/:id - 取得特定對話串詳情
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const conversations = await readConversations();
    const conversation = conversations.find(conv => conv.id === id);
    
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    res.json(conversation);
  } catch (error) {
    logger.error('Failed to fetch conversation', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

/**
 * PUT /api/conversations/:id - 更新對話串（標題、設定）
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, settings }: UpdateConversationRequest = req.body;
    
    const conversations = await readConversations();
    const conversationIndex = conversations.findIndex(conv => conv.id === id);
    
    if (conversationIndex === -1) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    const conversation = conversations[conversationIndex];
    
    // 更新對話串
    if (title !== undefined) {
      conversation.title = title;
    }
    if (settings !== undefined) {
      conversation.settings = { ...conversation.settings, ...settings };
    }
    conversation.updatedAt = new Date();
    
    await saveConversations(conversations);
    
    logger.info('Updated conversation', { conversationId: id });
    res.json(conversation);
  } catch (error) {
    logger.error('Failed to update conversation', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

/**
 * DELETE /api/conversations/:id - 刪除對話串
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const conversations = await readConversations();
    const conversationIndex = conversations.findIndex(conv => conv.id === id);
    
    if (conversationIndex === -1) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    // 刪除對話串
    conversations.splice(conversationIndex, 1);
    await saveConversations(conversations);
    
    // 修復：徹底刪除所有相關數據
    const fs = await import('fs/promises');
    const path = await import('path');
    
    // 1. 刪除訊息 JSON 文件
    const messagesFile = path.join(MESSAGES_DIR, `${id}.json`);
    try {
      await fs.unlink(messagesFile);
      logger.info('Deleted conversation messages file', { conversationId: id });
    } catch (error) {
      logger.debug('Messages file not found or already deleted', { conversationId: id });
    }
    
    // 2. 刪除可能存在的子目錄（舊版本遺留）
    const messagesDir = path.join(MESSAGES_DIR, id);
    try {
      await fs.rm(messagesDir, { recursive: true, force: true });
      logger.info('Deleted conversation messages directory', { conversationId: id });
    } catch (error) {
      logger.debug('Messages directory not found or already deleted', { conversationId: id });
    }
    
    // 3. 刪除向量記憶
    try {
      const { vectorMemoryService } = await import('../services/vectorMemoryService.js');
      await vectorMemoryService.removeConversationById(id);
      logger.info('Deleted conversation vector memories', { conversationId: id });
    } catch (error) {
      logger.warn('Failed to delete conversation vector memories', { 
        error: error instanceof Error ? error.message : String(error),
        conversationId: id
      });
    }
    
    // 4. 從 conversationService 刪除（確保完全清理）
    try {
      const { conversationService } = await import('../services/conversationService.js');
      await conversationService.deleteConversationMessages(id);
      logger.info('Deleted conversation via conversationService', { conversationId: id });
    } catch (error) {
      logger.debug('ConversationService cleanup completed or not needed', { conversationId: id });
    }
    
    logger.info('Deleted conversation', { conversationId: id });
    res.status(204).send();
  } catch (error) {
    logger.error('Failed to delete conversation', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

/**
 * POST /api/conversations/generate-title - 生成對話串標題
 */
router.post('/generate-title', async (req: Request, res: Response) => {
  try {
    const { userMessage, assistantMessage } = req.body;
    
    if (!userMessage) {
      return res.status(400).json({ error: 'User message is required' });
    }
    
    // 使用 Gemini 生成簡短標題
    const { GeminiService } = await import('../services/geminiService.js');
    const geminiService = new GeminiService();
    const prompt = `Based on this conversation, generate a short, concise title (maximum 6 words, in the same language as the user's message):

User: ${userMessage}
Assistant: ${assistantMessage || ''}

Return ONLY the title text, nothing else.`;

    const model = geminiService.getModel();
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let title = response.text().trim();
    
    // 清理標題：移除引號、多餘空格
    title = title.replace(/^["']|["']$/g, '').trim();
    
    // 如果標題太長，截斷
    if (title.length > 50) {
      title = title.substring(0, 47) + '...';
    }
    
    logger.info('Generated conversation title', { title });
    
    res.json({ title });
  } catch (error) {
    logger.error('Failed to generate title', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    res.status(500).json({ error: 'Failed to generate title' });
  }
});

/**
 * GET /api/conversations/:id/messages - 取得特定對話串的訊息
 */
router.get('/:id/messages', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    // 驗證對話串存在
    const conversations = await readConversations();
    const conversation = conversations.find(conv => conv.id === id);
    
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    // 讀取訊息
    const fs = await import('fs/promises');
    const path = await import('path');
    const messagesFile = path.join(MESSAGES_DIR, `${id}.json`);
    
    let messages: ChatMessage[] = [];
    try {
      const data = await fs.readFile(messagesFile, 'utf-8');
      messages = JSON.parse(data).map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      }));
    } catch {
      // 文件不存在，返回空數組
    }
    
    // 分頁處理
    const startIndex = Number(offset);
    const endIndex = startIndex + Number(limit);
    const paginatedMessages = messages.slice(startIndex, endIndex);
    
    const response: ConversationMessagesResponse = {
      messages: paginatedMessages,
      total: messages.length,
      hasMore: endIndex < messages.length
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Failed to fetch conversation messages', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to fetch conversation messages' });
  }
});

/**
 * PUT /api/conversations/:id/settings - 更新記憶共享設定
 */
router.put('/:id/settings', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { sharedMemory }: { sharedMemory: boolean } = req.body;
    
    if (typeof sharedMemory !== 'boolean') {
      throw new ValidationError('sharedMemory must be a boolean');
    }
    
    const conversations = await readConversations();
    const conversationIndex = conversations.findIndex(conv => conv.id === id);
    
    if (conversationIndex === -1) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    const conversation = conversations[conversationIndex];
    conversation.settings.sharedMemory = sharedMemory;
    conversation.updatedAt = new Date();
    
    await saveConversations(conversations);
    
    logger.info('Updated conversation settings', { conversationId: id, sharedMemory });
    res.json(conversation);
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    
    logger.error('Failed to update conversation settings', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to update conversation settings' });
  }
});

export default router;

