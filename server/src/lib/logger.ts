import { config } from './config.js';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

class Logger {
  private logLevel: LogLevel;

  constructor() {
    this.logLevel = this.getLogLevelFromConfig();
  }

  private getLogLevelFromConfig(): LogLevel {
    switch (config.logLevel.toLowerCase()) {
      case 'error':
        return LogLevel.ERROR;
      case 'warn':
        return LogLevel.WARN;
      case 'info':
        return LogLevel.INFO;
      case 'debug':
        return LogLevel.DEBUG;
      default:
        return LogLevel.INFO;
    }
  }

  private formatMessage(level: string, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.logLevel;
  }

  error(message: string, meta?: any): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage('error', message, meta));
    }
  }

  warn(message: string, meta?: any): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('warn', message, meta));
    }
  }

  info(message: string, meta?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage('info', message, meta));
    }
  }

  debug(message: string, meta?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.formatMessage('debug', message, meta));
    }
  }

  // Special methods for security-sensitive content
  logSafeContent(level: 'info' | 'debug' | 'warn' | 'error', message: string, content?: string): void {
    const safeContent = config.logSensitiveTexts 
      ? content 
      : content ? `[CONTENT_LENGTH:${content.length}]` : undefined;
    
    this[level](message, safeContent ? { content: safeContent } : undefined);
  }

  // Method for logging content classification results without exposing sensitive content
  logClassification(message: string, result: any, originalContent?: string): void {
    const logData = {
      ...result,
      originalContent: config.logSensitiveTexts 
        ? originalContent 
        : originalContent ? `[CONTENT_LENGTH:${originalContent.length}]` : undefined
    };
    
    this.info(message, logData);
  }
}

export const logger = new Logger();
export default logger;
