import { Request, Response, NextFunction } from 'express';
import { logger } from './logger.js';
import { config } from './config.js';
import { AppError, ValidationError, ExternalServiceError, RateLimitError } from '@/types/index.js';

/**
 * 請求日誌中間件
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const requestId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // 在請求上下文中添加 ID
  (req as any).requestId = requestId;
  
  // 記錄請求開始
  logger.info('Request started', {
    requestId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });

  // 監聽回應完成
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration
    });
  });

  next();
}

/**
 * 錯誤處理中間件
 */
export function errorHandler(
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = (req as any).requestId || 'unknown';
  
  // 記錄錯誤
  logger.error('Request error', {
    requestId,
    error: error.message,
    stack: config.nodeEnv === 'development' ? error.stack : undefined,
    url: req.url,
    method: req.method
  });

  // 確定狀態碼和錯誤訊息
  let statusCode = 500;
  let message = '內部服務器錯誤';
  let code = 'INTERNAL_ERROR';

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    message = error.message;
    code = error.code || 'APP_ERROR';
  } else if (error instanceof ValidationError) {
    statusCode = 400;
    message = error.message;
    code = 'VALIDATION_ERROR';
  } else if (error instanceof ExternalServiceError) {
    statusCode = 502;
    message = error.message;
    code = 'EXTERNAL_SERVICE_ERROR';
  } else if (error instanceof RateLimitError) {
    statusCode = 429;
    message = error.message;
    code = 'RATE_LIMIT_ERROR';
  }

  // 發送錯誤回應
  res.status(statusCode).json({
    error: message,
    code,
    requestId,
    timestamp: new Date().toISOString(),
    ...(config.nodeEnv === 'development' && { 
      stack: error.stack 
    })
  });
}

/**
 * 404 處理中間件
 */
export function notFoundHandler(req: Request, res: Response): void {
  const requestId = (req as any).requestId || 'unknown';
  
  logger.warn('Route not found', {
    requestId,
    method: req.method,
    url: req.url
  });

  res.status(404).json({
    error: '請求的端點不存在',
    code: 'NOT_FOUND',
    requestId,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
}

/**
 * 安全標頭中間件
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // 基本安全標頭
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // CSP（針對 API，相對寬鬆）
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none';");
  
  // 移除 X-Powered-By 標頭
  res.removeHeader('X-Powered-By');
  
  next();
}

/**
 * 請求大小限制中間件
 */
export function requestSizeLimit(maxSize: string = '10mb') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = req.get('Content-Length');
    
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      const maxBytes = parseSize(maxSize);
      
      if (size > maxBytes) {
        const error = new ValidationError(`請求內容過大，最大允許 ${maxSize}`);
        return next(error);
      }
    }
    
    next();
  };
}

/**
 * 簡單的速率限制中間件
 */
export function rateLimit(options: {
  windowMs: number;
  maxRequests: number;
  message?: string;
}) {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const resetTime = now + options.windowMs;

    // 清理過期記錄
    for (const [ip, data] of requests.entries()) {
      if (now > data.resetTime) {
        requests.delete(ip);
      }
    }

    // 檢查當前 IP 的請求次數
    const current = requests.get(key);
    
    if (!current) {
      requests.set(key, { count: 1, resetTime });
      next();
      return;
    }

    if (current.count >= options.maxRequests) {
      const error = new RateLimitError(
        options.message || '請求過於頻繁，請稍後再試'
      );
      return next(error);
    }

    current.count++;
    next();
  };
}

/**
 * 健康檢查排除中間件
 */
export function skipHealthCheck(req: Request, res: Response, next: NextFunction): void {
  // 跳過健康檢查端點的詳細日誌
  if (req.path === '/api/health' || req.path === '/health') {
    return next();
  }
  
  next();
}

/**
 * CORS 預檢處理
 */
export function corsPreflightHandler(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  next();
}

/**
 * 解析大小字符串為字節數
 */
function parseSize(size: string): number {
  const units: Record<string, number> = {
    'b': 1,
    'kb': 1024,
    'mb': 1024 * 1024,
    'gb': 1024 * 1024 * 1024
  };

  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  
  if (!match) {
    throw new Error(`Invalid size format: ${size}`);
  }

  const value = parseFloat(match[1]);
  const unit = match[2] || 'b';

  return Math.floor(value * units[unit]);
}

/**
 * 異步錯誤包裝器
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 開發環境中間件
 */
export function developmentOnly(req: Request, res: Response, next: NextFunction): void {
  if (config.nodeEnv !== 'development') {
    return res.status(403).json({
      error: '此端點僅在開發環境中可用',
      code: 'DEVELOPMENT_ONLY'
    });
  }
  
  next();
}
