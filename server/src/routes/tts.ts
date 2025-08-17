import { Router, Request, Response } from 'express';
import { 
  TTSRequest, 
  ValidationError, 
  ExternalServiceError 
} from '@/types/index.js';
import { logger } from '@/lib/logger.js';
import TTSService from '@/services/ttsService.js';
import ChatProxyService from '@/services/chatProxyService.js';

const router = Router();

// 服務實例
const chatProxyService = new ChatProxyService();
const ttsService = new TTSService(chatProxyService);

/**
 * POST /api/tts - 按需語音合成
 */
router.post('/', async (req: Request, res: Response) => {
  const startTime = Date.now();
  let requestId: string;

  try {
    // 生成請求 ID
    requestId = `tts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 驗證請求
    const ttsRequest = validateTTSRequest(req.body);
    
    logger.logSafeContent('info', `TTS request started [${requestId}]`, ttsRequest.text);

    // 檢查服務可用性
    const isAvailable = await ttsService.checkAvailability();
    if (!isAvailable) {
      logger.warn(`TTS service unavailable [${requestId}]`);
      return res.status(503).json({
        error: '語音服務暫時無法使用',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    // 生成語音
    const result = await ttsService.generateSpeech(ttsRequest);
    
    const processingTime = Date.now() - startTime;
    
    // 設定回應標頭
    res.set({
      'Content-Type': result.mimeType,
      'Content-Length': result.audio.length.toString(),
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Processing-Time': processingTime.toString(),
      'X-Request-ID': requestId
    });

    // 發送音訊資料
    res.send(result.audio);

    logger.info(`TTS request completed [${requestId}]`, {
      audioSize: result.audio.length,
      processingTime,
      format: result.mimeType
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`TTS request failed [${requestId || 'unknown'}]`, { error: errorMessage });

    // 根據錯誤類型回傳適當的狀態碼
    if (error instanceof ValidationError) {
      res.status(400).json({
        error: errorMessage,
        code: 'VALIDATION_ERROR'
      });
    } else if (error instanceof ExternalServiceError) {
      res.status(502).json({
        error: '語音生成服務暫時無法使用',
        code: 'EXTERNAL_SERVICE_ERROR'
      });
    } else {
      res.status(500).json({
        error: '生成語音時發生錯誤',
        code: 'INTERNAL_ERROR'
      });
    }
  }
});

/**
 * GET /api/tts/voices - 獲取可用聲線
 */
router.get('/voices', async (req: Request, res: Response) => {
  try {
    logger.debug('Fetching available voices');

    const voices = await ttsService.getAvailableVoices();
    
    res.json({
      voices,
      total: voices.length,
      timestamp: new Date().toISOString()
    });

    logger.info('Voices fetched successfully', { count: voices.length });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to fetch voices', { error: errorMessage });

    res.status(500).json({
      error: '無法獲取聲線列表',
      code: 'VOICES_FETCH_ERROR',
      voices: [] // 回傳空陣列作為後備
    });
  }
});

/**
 * GET /api/tts/health - TTS 服務健康檢查
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const stats = await ttsService.getServiceStats();
    
    res.json({
      status: stats.available ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      ...stats
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('TTS health check failed', { error: errorMessage });

    res.status(500).json({
      status: 'unhealthy',
      error: 'TTS service health check failed',
      available: false,
      format: 'unknown',
      supportedFormats: [],
      voiceCount: 0
    });
  }
});

/**
 * POST /api/tts/test - 測試語音生成（開發用途）
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    const testText = req.body.text || '這是一個語音測試。';
    const voiceId = req.body.voiceId;

    logger.info('TTS test request', { testText: testText.substring(0, 50), voiceId });

    const ttsRequest: TTSRequest = {
      text: testText,
      voiceId
    };

    const result = await ttsService.generateSpeech(ttsRequest);

    res.set({
      'Content-Type': result.mimeType,
      'Content-Disposition': 'attachment; filename="test-audio"',
      'Cache-Control': 'no-store'
    });

    res.send(result.audio);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('TTS test failed', { error: errorMessage });

    res.status(500).json({
      error: '測試語音生成失敗',
      details: errorMessage
    });
  }
});

/**
 * 驗證 TTS 請求
 */
function validateTTSRequest(body: any): TTSRequest {
  if (!body) {
    throw new ValidationError('Request body is required');
  }

  if (!body.text || typeof body.text !== 'string') {
    throw new ValidationError('Text is required and must be a string');
  }

  if (body.text.trim().length === 0) {
    throw new ValidationError('Text cannot be empty');
  }

  if (body.text.length > 1000) {
    throw new ValidationError('Text is too long (max 1000 characters)');
  }

  // 驗證可選參數
  const request: TTSRequest = {
    text: body.text.trim()
  };

  if (body.voiceId !== undefined) {
    if (typeof body.voiceId !== 'string') {
      throw new ValidationError('VoiceId must be a string');
    }
    request.voiceId = body.voiceId;
  }

  if (body.rate !== undefined) {
    if (typeof body.rate !== 'number' || body.rate < 0.1 || body.rate > 3.0) {
      throw new ValidationError('Rate must be a number between 0.1 and 3.0');
    }
    request.rate = body.rate;
  }

  if (body.pitch !== undefined) {
    if (typeof body.pitch !== 'number' || body.pitch < 0.1 || body.pitch > 3.0) {
      throw new ValidationError('Pitch must be a number between 0.1 and 3.0');
    }
    request.pitch = body.pitch;
  }

  return request;
}

export default router;
