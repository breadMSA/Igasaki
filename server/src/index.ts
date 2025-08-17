import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, validateConfig } from '@/lib/config.js';
import { logger } from '@/lib/logger.js';
import {
  requestLogger,
  errorHandler,
  notFoundHandler,
  securityHeaders,
  requestSizeLimit,
  rateLimit,
  corsPreflightHandler,
  skipHealthCheck
} from '@/lib/middleware.js';
import apiRoutes from '@/routes/index.js';

/**
 * 個人 AI 助手後端服務器
 * 支援成人內容路由、Gemini Grounding、按需語音、永久記憶
 */
class Server {
  private app: express.Application;
  private server: any;

  constructor() {
    this.app = express();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  /**
   * 初始化中間件
   */
  private initializeMiddleware(): void {
    // 安全中間件
    this.app.use(helmet({
      contentSecurityPolicy: false, // API 服務器不需要 CSP
      crossOriginEmbedderPolicy: false
    }));

    // 自定義安全標頭
    this.app.use(securityHeaders);

    // CORS 設定
    this.app.use(cors({
      origin: config.corsOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['X-Request-ID', 'X-Processing-Time']
    }));

    // CORS 預檢處理
    this.app.use(corsPreflightHandler);

    // 請求大小限制
    this.app.use(requestSizeLimit('10mb'));

    // JSON 解析
    this.app.use(express.json({ 
      limit: '10mb',
      strict: true 
    }));

    // URL 編碼解析
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: '10mb' 
    }));

    // 速率限制（開發環境較寬鬆）
    this.app.use(rateLimit({
      windowMs: config.nodeEnv === 'development' ? 60 * 1000 : 15 * 60 * 1000, // 開發：1分鐘，生產：15分鐘
      maxRequests: config.nodeEnv === 'development' ? 1000 : 100, // 開發：1000次，生產：100次
      message: '請求過於頻繁，請稍後再試。'
    }));

    // 請求日誌（跳過健康檢查）
    this.app.use(skipHealthCheck);
    this.app.use(requestLogger);

    logger.info('Middleware initialized successfully');
  }

  /**
   * 初始化路由
   */
  private initializeRoutes(): void {
    // 根路徑
    this.app.get('/', (req, res) => {
      res.json({
        name: 'Personal AI Assistant API',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        environment: config.nodeEnv,
        endpoints: {
          api: '/api',
          health: '/health',
          docs: '/docs'
        }
      });
    });

    // 健康檢查（根級別）
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        }
      });
    });

    // API 路由
    this.app.use('/api', apiRoutes);

    logger.info('Routes initialized successfully');
  }

  /**
   * 初始化錯誤處理
   */
  private initializeErrorHandling(): void {
    // 404 處理
    this.app.use('*', notFoundHandler);

    // 全域錯誤處理
    this.app.use(errorHandler);

    // 未捕獲的異常處理
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', { 
        error: error.message, 
        stack: error.stack 
      });
      this.gracefulShutdown('uncaughtException');
    });

    // 未處理的 Promise 拒絕
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', { 
        reason: reason instanceof Error ? reason.message : String(reason),
        promise: promise.toString()
      });
      this.gracefulShutdown('unhandledRejection');
    });

    // 信號處理
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      this.gracefulShutdown('SIGTERM');
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully');
      this.gracefulShutdown('SIGINT');
    });

    logger.info('Error handling initialized successfully');
  }

  /**
   * 啟動服務器
   */
  public async start(): Promise<void> {
    try {
      // 驗證配置
      validateConfig();

      // 啟動服務器
      this.server = this.app.listen(config.port, () => {
        logger.info(`🚀 Server started successfully`, {
          port: config.port,
          environment: config.nodeEnv,
          corsOrigin: config.corsOrigin,
          pid: process.pid
        });

        if (config.debug) {
          logger.debug('Debug mode enabled');
        }

        // 在開發環境顯示有用的資訊
        if (config.nodeEnv === 'development') {
          console.log(`
🎯 個人 AI 助手後端服務已啟動！

📡 API 端點：
   • 聊天：     POST http://localhost:${config.port}/api/chat
   • 語音：     POST http://localhost:${config.port}/api/tts
   • 聲線列表： GET  http://localhost:${config.port}/api/tts/voices
   • 健康檢查： GET  http://localhost:${config.port}/api/health

🔧 功能特色：
   ✅ 成人內容智能路由
   ✅ Gemini AI + Google Search
   ✅ Character.AI 整合
   ✅ 按需語音合成
   ✅ SSE 串流回應

📊 監控端點：
   • 服務狀態： GET  http://localhost:${config.port}/health
   • API 文檔：  GET  http://localhost:${config.port}/api

⚠️  請確保已設定必要的環境變數！
          `);
        }
      });

      // 設定服務器超時
      this.server.timeout = 60000; // 60 秒
      this.server.keepAliveTimeout = 65000; // 65 秒
      this.server.headersTimeout = 66000; // 66 秒

    } catch (error) {
      logger.error('Failed to start server', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      process.exit(1);
    }
  }

  /**
   * 優雅關閉
   */
  private gracefulShutdown(signal: string): void {
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    if (this.server) {
      this.server.close((error: Error | undefined) => {
        if (error) {
          logger.error('Error during server shutdown', { error: error.message });
          process.exit(1);
        }

        logger.info('Server closed successfully');
        process.exit(0);
      });

      // 強制退出保護
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
      }, 30000); // 30 秒後強制退出
    } else {
      process.exit(0);
    }
  }
}

// 創建並啟動服務器
const server = new Server();
server.start().catch((error) => {
  logger.error('Server startup failed', { 
    error: error instanceof Error ? error.message : String(error) 
  });
  process.exit(1);
});

export default server;
