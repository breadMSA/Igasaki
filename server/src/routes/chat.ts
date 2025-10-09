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

    // 優化歷史記錄：只保留最近的對話（避免卡頓）
    const optimizedHistory = optimizeChatHistory(chatRequest.history);

    // 直接使用 Gemini，不進行內容分類
    sendSSEEvent(res, 'meta', { 
      route: 'gemini',
      confidence: 1.0,
      category: 'default'
    });

    // 直接處理為 Gemini 路由
    await handleGeminiRoute(res, { ...chatRequest, history: optimizedHistory }, { action: 'gemini' }, requestId);

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
  requestId: string
): Promise<void> {
  logger.logSafeContent('info', `Handling Gemini route [${requestId}]`, chatRequest.message);

  try {
    // 串流處理 Gemini 回應
    for await (const chunk of geminiService.generateChatResponse(
      chatRequest.message,
      chatRequest.history,
      chatRequest.images,
      chatRequest.personality,
      chatRequest.customPersonalityText,
      chatRequest.jailbreakEnabled
    )) {
      switch (chunk.type) {
        case 'utterance':
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
