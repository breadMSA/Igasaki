import { Router } from 'express';
import chatRoutes from './chat.js';
import ttsRoutes from './tts.js';
import extractKeywordsRoutes from './extractKeywords.js';
import vectorMemoryRoutes from './vectorMemory.js';
import userDataRoutes from './userData.js';
import conversationsRoutes from './conversations.js';
import { logger } from '@/lib/logger.js';

const router = Router();

// 掛載子路由
router.use('/chat', chatRoutes);
router.use('/tts', ttsRoutes);
router.use('/extract-keywords', extractKeywordsRoutes);
router.use('/vector-memory', vectorMemoryRoutes);
router.use('/user-data', userDataRoutes);
router.use('/conversations', conversationsRoutes);

// API 根路徑 - 基本資訊
router.get('/', (req, res) => {
  res.json({
    name: 'Personal AI Assistant API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      chat: '/api/chat',
      tts: '/api/tts',
      health: '/api/health'
    },
    documentation: 'https://github.com/your-repo/personal-ai-assistant'
  });
});

// 全域健康檢查
router.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version,
      environment: process.env.NODE_ENV || 'development',
      services: {
        gemini: !!process.env.GEMINI_API_KEY,
        chatProxy: !!(process.env.CHARACTERAI_TOKEN || process.env.CHAT_PROXY_URL),
        vectorMemory: !!process.env.MEMORY_API_KEY
      }
    };

    res.json(health);
  } catch (error) {
    logger.error('Global health check failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({
      status: 'unhealthy',
      error: 'Health check failed'
    });
  }
});

// 404 處理
router.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

export default router;
