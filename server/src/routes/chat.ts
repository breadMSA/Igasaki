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
router.post('/chat', async (req: Request, res: Response) => {
  const startTime = Date.now();
  let requestId: string;

  try {
    // 設定 SSE 標頭
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    });

    // 生成請求 ID
    requestId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 驗證請求
    const chatRequest = validateChatRequest(req.body);
    
    logger.logSafeContent('info', `Chat request started [${requestId}]`, chatRequest.message);

    // 發送初始心跳
    sendSSEEvent(res, 'meta', { requestId, status: 'processing' });

    // 第一階段：內容分類與路由
    const classification = await contentClassifier.classifyContent(chatRequest.message);
    
    // 發送路由資訊
    sendSSEEvent(res, 'meta', { 
      route: classification.action,
      confidence: classification.confidence,
      category: classification.category
    });

    // 根據分類結果路由處理
    switch (classification.action) {
      case 'deny':
        await handleDenyRoute(res, classification, requestId);
        break;
      
      case 'charProxy':
        await handleCharProxyRoute(res, chatRequest, classification, requestId);
        break;
      
      case 'gemini':
        await handleGeminiRoute(res, chatRequest, classification, requestId);
        break;
      
      default:
        throw new ValidationError(`Unknown classification action: ${classification.action}`);
    }

    // 發送完成事件
    const processingTime = Date.now() - startTime;
    sendSSEEvent(res, 'meta', { processingTime, status: 'completed' });
    sendSSEEvent(res, 'done', {});

    logger.info(`Chat request completed [${requestId}]`, { 
      route: classification.action, 
      processingTime 
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Chat request failed [${requestId || 'unknown'}]`, { error: errorMessage });

    // 發送錯誤事件
    sendSSEEvent(res, 'error', { 
      message: error instanceof ValidationError 
        ? errorMessage 
        : '處理請求時發生錯誤，請稍後再試。'
    });
    sendSSEEvent(res, 'done', {});
  } finally {
    // 確保連接關閉
    res.end();
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
  logger.info(`Handling deny route [${requestId}]`, { category: classification.category });

  const safetyMessage = contentClassifier.getSafetyDenialMessage(classification.category);
  
  sendSSEEvent(res, 'utterance', { text: safetyMessage });
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
      chatRequest.images
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
 * 發送 SSE 事件
 */
function sendSSEEvent(res: Response, event: string, data: any): void {
  try {
    const sseData = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    res.write(sseData);
  } catch (error) {
    logger.error('Failed to send SSE event', { event, error: error instanceof Error ? error.message : String(error) });
  }
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

  if (body.message.length > 10000) {
    throw new ValidationError('Message is too long (max 10000 characters)');
  }

  // 驗證可選欄位
  if (body.images && !Array.isArray(body.images)) {
    throw new ValidationError('Images must be an array');
  }

  if (body.personaId && typeof body.personaId !== 'string') {
    throw new ValidationError('PersonaId must be a string');
  }

  if (body.history && !Array.isArray(body.history)) {
    throw new ValidationError('History must be an array');
  }

  // 驗證歷史訊息格式
  if (body.history) {
    for (const msg of body.history) {
      if (!msg.role || !msg.content) {
        throw new ValidationError('History messages must have role and content');
      }
      if (!['user', 'assistant'].includes(msg.role)) {
        throw new ValidationError('History message role must be "user" or "assistant"');
      }
      if (typeof msg.content !== 'string') {
        throw new ValidationError('History message content must be a string');
      }
    }
  }

  return {
    message: body.message.trim(),
    images: body.images || [],
    personaId: body.personaId,
    history: body.history || []
  };
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
