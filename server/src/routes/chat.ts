import { Router, Request, Response } from 'express';
import { 
  ChatRequest, 
  SSEEvent, 
  ValidationError, 
  ExternalServiceError 
} from '@/types/index.js';
import { logger } from '@/lib/logger.js';
import ContentClassifier from '@/services/contentClassifier.js';
import GeminiService from '@/services/geminiService.js';
import ChatProxyService from '@/services/chatProxyService.js';
import { conversationService } from '@/services/conversationService.js';

const router = Router();

// 服務實例
const geminiService = new GeminiService();
const chatProxyService = new ChatProxyService();
const contentClassifier = new ContentClassifier(geminiService);

/**
 * POST /api/chat - SSE 串流聊天 API
 */
router.post('/', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  // 生成請求 ID
  const requestId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    // 設定 SSE 標頭
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    
    // 驗證請求
    const chatRequest = validateChatRequest(req.body);
    
    logger.logSafeContent('info', `Chat request started [${requestId}]`, chatRequest.message);

    // 發送初始心跳
    sendSSEEvent(res, 'meta', { requestId, status: 'processing' });

    // 處理對話串邏輯
    let conversationId = chatRequest.conversationId;
    let sharedMemory = true;
    
    if (conversationId) {
      // 獲取對話串設定
      try {
        const fs = await import('fs/promises');
        const conversationsFile = './data/user/conversations.json';
        
        try {
          const data = await fs.readFile(conversationsFile, 'utf-8');
          const conversations = JSON.parse(data);
          const conversation = conversations.find((conv: any) => conv.id === conversationId);
          
          if (conversation) {
            sharedMemory = conversation.settings.sharedMemory;
            logger.info('Using conversation settings', { conversationId, sharedMemory });
          }
        } catch {
          // 文件不存在或解析失敗，使用預設值
        }
      } catch (error) {
        logger.warn('Failed to read conversation settings', { error: error instanceof Error ? error.message : String(error) });
      }
    }

    // 優先使用客戶端發送的正確過濾的history
    let optimizedHistory: any[] = [];
    
    if (chatRequest.history && chatRequest.history.length > 0) {
      // 使用客戶端發送的已過濾的歷史記錄
      optimizedHistory = optimizeChatHistory(chatRequest.history);
      logger.info(`Using client-provided history: ${optimizedHistory.length} messages`);
    } else {
      // 備用：從服務器獲取歷史記錄
      let relevantHistory: any[] = [];
      if (conversationId) {
        try {
          // 修復：無論是否共享記憶，都只使用當前對話串的訊息作為上下文
          // 共享記憶的"回憶"功能由向量搜尋提供，而非直接載入所有訊息
          const conversationMessages = await conversationService.getMessages(conversationId);
          relevantHistory = conversationMessages;
          logger.info(`Loaded ${relevantHistory.length} messages from current conversation (shared memory: ${sharedMemory})`);
        } catch (error) {
          logger.warn('Failed to get conversation messages', { error: error instanceof Error ? error.message : String(error) });
        }
      }
      optimizedHistory = optimizeChatHistory(relevantHistory);
    }

    // 直接使用 Gemini，不進行內容分類
    sendSSEEvent(res, 'meta', { 
      route: 'gemini',
      confidence: 1.0,
      category: 'default',
      conversationId,
      sharedMemory
    });

    // 直接處理為 Gemini 路由
    await handleGeminiRoute(res, { ...chatRequest, history: optimizedHistory, conversationId, sharedMemory }, { action: 'gemini' }, requestId, conversationId, sharedMemory, optimizedHistory);

    // 發送完成事件
    const processingTime = Date.now() - startTime;
    sendSSEEvent(res, 'meta', { processingTime, status: 'completed' });
    sendSSEEvent(res, 'done', {});

    logger.info(`Chat request completed [${requestId}]`, { 
      route: 'gemini', 
      processingTime 
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Chat request failed [${requestId}]`, { error: errorMessage });

    // 發送錯誤事件
    sendSSEEvent(res, 'error', { 
      message: error instanceof ValidationError ? errorMessage : '聊天服務暫時無法使用，請稍後再試。' 
    });
    sendSSEEvent(res, 'done', {});
  }
});

/**
 * 處理拒絕路由
 */
async function handleDenyRoute(
  res: Response, 
  classification: any, 
  requestId: string
): Promise<void> {
  logger.info(`Handling deny route [${requestId}]`, { reason: classification.reason });
  
  sendSSEEvent(res, 'utterance', { 
    text: '抱歉，我無法處理這個請求。請確保內容符合使用規範。' 
  });
}

/**
 * 處理外部聊天代理路由
 */
async function handleCharProxyRoute(
  res: Response, 
  chatRequest: ChatRequest, 
  classification: any, 
  requestId: string
): Promise<void> {
  logger.logSafeContent('info', `Handling char proxy route [${requestId}]`, chatRequest.message);

  try {
    const proxyRequest = {
      message: chatRequest.message,
      characterId: chatRequest.personaId,
      history: chatRequest.history
    };

    // 串流處理代理回應
    for await (const chunk of chatProxyService.handleChatRequest(proxyRequest)) {
      if (chunk.type === 'utterance') {
        sendSSEEvent(res, 'utterance', chunk.data);
      } else if (chunk.type === 'error') {
        sendSSEEvent(res, 'error', chunk.data);
        break;
      }
    }

  } catch (error) {
    logger.error(`Char proxy route failed [${requestId}]`, { error: error instanceof Error ? error.message : String(error) });
    sendSSEEvent(res, 'error', { message: '外部聊天服務暫時無法使用，請稍後再試。' });
  }
}

/**
 * 處理 Gemini 路由
 */
async function handleGeminiRoute(
  res: Response, 
  chatRequest: ChatRequest, 
  classification: any, 
  requestId: string,
  conversationId?: string,
  sharedMemory?: boolean,
  relevantHistory?: any[]
): Promise<void> {
  logger.logSafeContent('info', `Handling Gemini route [${requestId}]`, chatRequest.message);

  try {
    let fullResponse = '';
    let userMessage: any = null;
    let assistantMessage: any = null;

    // 保存用戶訊息
    if (chatRequest.conversationId) {
      userMessage = {
        id: `msg_${Date.now()}_user`,
        role: 'user',
        content: chatRequest.message,
        timestamp: new Date(),
        conversationId: chatRequest.conversationId,
        source: chatRequest.source || 'web'
      };
      
      try {
        await conversationService.saveMessage(chatRequest.conversationId, userMessage);
      } catch (error) {
        logger.warn('Failed to save user message', { error: error instanceof Error ? error.message : String(error) });
      }
    }

    // 串流處理 Gemini 回應
    const utterances: string[] = []; // 收集所有分段
    for await (const chunk of geminiService.generateChatResponse(
      chatRequest.message,
      relevantHistory, // 使用處理過的歷史記錄
      chatRequest.images,
      chatRequest.personality,
      chatRequest.customPersonalityText,
      chatRequest.jailbreakEnabled,
      conversationId,
      sharedMemory
    )) {
      switch (chunk.type) {
        case 'utterance':
          fullResponse += chunk.data.text || '';
          utterances.push(chunk.data.text || ''); // 收集分段
          sendSSEEvent(res, 'utterance', chunk.data);
          break;
        case 'citation':
          sendSSEEvent(res, 'citation', chunk.data);
          break;
        case 'memory':
          sendSSEEvent(res, 'memory', chunk.data);
          break;
        case 'error':
          sendSSEEvent(res, 'error', chunk.data);
          break;
      }
    }

    // 修復：保存助手回應 - 保存每個分段作為獨立消息
    if (chatRequest.conversationId && fullResponse.trim()) {
      try {
        // 如果有多個分段，保存每個分段
        if (utterances.length > 1) {
          const groupId = `group_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
          const baseTimestamp = Date.now();
          
          for (let i = 0; i < utterances.length; i++) {
            const segmentMessage = {
              id: i === 0 
                ? `msg_${baseTimestamp}_assistant` 
                : `msg_${baseTimestamp + i}_assistant_segment_${Math.random().toString(36).substring(2, 11)}`,
              role: 'assistant' as const,
              content: utterances[i],
              timestamp: new Date(baseTimestamp + i),
              conversationId: chatRequest.conversationId,
              source: chatRequest.source || 'web',
              isSegment: i > 0,
              segmentGroupId: groupId,
              segmentIndex: i
            };
            
            await conversationService.saveMessage(chatRequest.conversationId, segmentMessage);
          }
        } else {
          // 單個回應，正常保存
          assistantMessage = {
            id: `msg_${Date.now()}_assistant`,
            role: 'assistant',
            content: fullResponse.trim(),
            timestamp: new Date(),
            conversationId: chatRequest.conversationId,
            source: chatRequest.source || 'web'
          };
          
          await conversationService.saveMessage(chatRequest.conversationId, assistantMessage);
        }
        
        // 更新對話串預覽
        const preview = fullResponse.trim().substring(0, 100);
        await conversationService.updateConversationPreview(chatRequest.conversationId, preview);

        // 添加到向量記憶
        try {
          const { vectorMemoryService } = await import('../services/vectorMemoryService.js');
          await vectorMemoryService.addConversation(
            chatRequest.message, 
            fullResponse.trim(), 
            chatRequest.conversationId
          );
          logger.info('Added conversation to vector memory', { conversationId: chatRequest.conversationId });
        } catch (error) {
          logger.warn('Failed to add conversation to vector memory', { error: error instanceof Error ? error.message : String(error) });
        }
      } catch (error) {
        logger.warn('Failed to save assistant message', { error: error instanceof Error ? error.message : String(error) });
      }
    }

  } catch (error) {
    logger.error(`Gemini route failed [${requestId}]`, { error: error instanceof Error ? error.message : String(error) });
    sendSSEEvent(res, 'error', { message: 'AI 服務暫時無法使用，請稍後再試。' });
  }
}

/**
 * 優化聊天歷史記錄，避免卡頓
 */
function optimizeChatHistory(history?: any[]): any[] {
  if (!history || history.length === 0) {
    return [];
  }

  // 只保留最近的 20 條訊息，避免歷史記錄過長導致卡頓
  const maxHistoryLength = 20;
  if (history.length <= maxHistoryLength) {
    return history;
  }

  logger.debug(`Optimizing chat history: ${history.length} -> ${maxHistoryLength} messages`);
  return history.slice(-maxHistoryLength);
}

/**
 * 驗證聊天請求
 */
function validateChatRequest(body: any): ChatRequest {
  if (!body) {
    throw new ValidationError('Request body is required');
  }

  if (!body.message || typeof body.message !== 'string') {
    throw new ValidationError('Message is required and must be a string');
  }

  if (body.message.trim().length === 0) {
    throw new ValidationError('Message cannot be empty');
  }

      // 移除長度限制，允許記憶注入的長消息

  const request: ChatRequest = {
    message: body.message.trim()
  };

  // 可選參數
  if (body.history !== undefined) {
    if (!Array.isArray(body.history)) {
      throw new ValidationError('History must be an array');
    }
    request.history = body.history;
  }

  if (body.images !== undefined) {
    if (!Array.isArray(body.images)) {
      throw new ValidationError('Images must be an array');
    }
    request.images = body.images;
  }

  if (body.personality !== undefined) {
    if (typeof body.personality !== 'string') {
      throw new ValidationError('Personality must be a string');
    }
    request.personality = body.personality;
  }

  if (body.personaId !== undefined) {
    if (typeof body.personaId !== 'string') {
      throw new ValidationError('PersonaId must be a string');
    }
    request.personaId = body.personaId;
  }

  if (body.jailbreakEnabled !== undefined) {
    if (typeof body.jailbreakEnabled !== 'boolean') {
      throw new ValidationError('JailbreakEnabled must be a boolean');
    }
    request.jailbreakEnabled = body.jailbreakEnabled;
  }

  if (body.customPersonalityText !== undefined) {
    if (typeof body.customPersonalityText !== 'string') {
      throw new ValidationError('CustomPersonalityText must be a string');
    }
    request.customPersonalityText = body.customPersonalityText;
  }

  if (body.conversationId !== undefined) {
    if (typeof body.conversationId !== 'string') {
      throw new ValidationError('ConversationId must be a string');
    }
    request.conversationId = body.conversationId;
  }

  if (body.source !== undefined) {
    if (!['web', 'extension'].includes(body.source)) {
      throw new ValidationError('Source must be either "web" or "extension"');
    }
    request.source = body.source;
  }

  return request;
}

/**
 * 發送 SSE 事件
 */
function sendSSEEvent(res: Response, eventType: string, data: any): void {
  const event = {
    type: eventType,
    data
  };

  const eventString = `data: ${JSON.stringify(event)}\n\n`;
  res.write(eventString);
}

/**
 * GET /api/chat/health - 健康檢查
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        gemini: false,
        chatProxy: false
      }
    };

    // 檢查 Gemini 服務
    try {
      // 這裡可以添加 Gemini 健康檢查
      health.services.gemini = true;
    } catch (error) {
      logger.warn('Gemini health check failed', { error: error instanceof Error ? error.message : String(error) });
    }

    // 檢查聊天代理服務
    try {
      health.services.chatProxy = await chatProxyService.checkAvailability();
    } catch (error) {
      logger.warn('Chat proxy health check failed', { error: error instanceof Error ? error.message : String(error) });
    }

    res.json(health);
  } catch (error) {
    logger.error('Health check failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({
      status: 'unhealthy',
      error: 'Health check failed'
    });
  }
});

export default router;
