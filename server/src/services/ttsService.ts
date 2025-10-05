import axios from 'axios';
import { spawn } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import { 
  TTSRequest, 
  VoiceInfo, 
  ExternalServiceError, 
  ValidationError 
} from '@/types/index.js';
import { config } from '@/lib/config.js';
import { logger } from '@/lib/logger.js';
import ChatProxyService from './chatProxyService.js';
import CharacterAI from './characterAI.js';

/**
 * TTS 服務
 * 基於 Character.AI TTS API 生成語音
 */
export class TTSService {
  private chatProxyService: ChatProxyService;
  private characterAI: CharacterAI;
  private supportedFormats: Set<string> = new Set(['mp3', 'wav', 'ogg']);

  // 將 CharacterAI 實例作為參數傳入
  constructor(chatProxyService: ChatProxyService, characterAI: CharacterAI) {
    this.chatProxyService = chatProxyService;
    this.characterAI = characterAI; // 使用已經驗證的實例
  }

  /**
   * 生成語音
   */
  async generateSpeech(request: TTSRequest): Promise<{ audio: Buffer; mimeType: string }> {
    try {
      this.validateTTSRequest(request);
      
      logger.logSafeContent('info', 'Starting TTS generation', request.text);

      // 清理並準備文字
      const cleanedText = this.prepareTextForSpeech(request.text);
      
      // 驗證清理後的文字
      if (!cleanedText || cleanedText.trim().length === 0) {
        throw new ValidationError('Text is empty after cleaning');
      }

      // 使用 Character.AI 生成語音
      if (config.characterAIToken) {
        try {
          logger.info('Generating speech via Character.AI...');
          
          const audioBuffer = await this.generateSpeechWithCharacterAI(cleanedText, request.voiceId);
          
          const mimeType = this.getMimeType(config.ttsFormat);
          
          logger.info('Character.AI TTS generation completed successfully', {
            textLength: cleanedText.length,
            audioSize: audioBuffer.length,
            format: config.ttsFormat
          });

          return {
            audio: audioBuffer,
            mimeType
          };
        } catch (characterAIError) {
          logger.warn('Character.AI TTS failed, falling back to chat proxy', { 
            error: characterAIError instanceof Error ? characterAIError.message : String(characterAIError) 
          });
        }
      }

      // 後備：使用聊天代理服務
      const isAvailable = await this.chatProxyService.checkAvailability();
      if (!isAvailable) {
        throw new ExternalServiceError('TTS', 'No TTS service available');
      }

      const audioBuffer = await this.chatProxyService.generateSpeech(
        cleanedText,
        request.voiceId
      );

      const mimeType = this.getMimeType(config.ttsFormat);

      logger.info('Chat proxy TTS generation completed successfully', {
        textLength: cleanedText.length,
        audioSize: audioBuffer.length,
        format: config.ttsFormat
      });

      return {
        audio: audioBuffer,
        mimeType
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('TTS generation failed', { 
        error: errorMessage,
        textLength: request.text?.length || 0
      });

      if (error instanceof ValidationError) {
        throw error;
      }

      throw new ExternalServiceError('TTS', `語音生成失敗：${errorMessage}`);
    }
  }

  /**
   * 使用 Character.AI 生成語音（通過 Python 腳本）
   */
  private async generateSpeechWithCharacterAI(text: string, voiceId?: string): Promise<Buffer> {
    try {
      // 確保有 Character.AI Token
      if (!config.characterAIToken) {
        throw new ExternalServiceError('CharacterAI', 'Token not configured');
      }

      logger.info('Generating speech using Python scripts...');
      
      // 第一步：使用 send.py 發送消息給 Character.AI
      const sendScript = join(process.cwd(), 'py/send.py');
      await this.executePythonScript(sendScript, [text]);
      
      // 第二步：使用 speak.py 生成語音
      const speakScript = join(process.cwd(), 'py/speak.py');
      const audioBuffer = await this.executePythonScript(speakScript, []);
      
      return audioBuffer;
      
    } catch (error) {
      logger.error('Character.AI speech generation failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  /**
   * 執行 Python 腳本
   */
  private async executePythonScript(scriptPath: string, args: string[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const allArgs = [scriptPath, ...args];
      
      logger.info('Executing Python script:', { script: scriptPath, args });
      
      const pythonProcess = spawn('python', allArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      pythonProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      
      pythonProcess.on('close', (code: number) => {
        if (code !== 0) {
          logger.error('Python script failed:', { code, stderr });
          reject(new ExternalServiceError('CharacterAI', `Python script failed: ${stderr}`));
          return;
        }
        
        try {
          logger.info('Python script completed successfully');
          
          // 如果是 speak.py，嘗試讀取生成的音頻文件
          if (scriptPath.includes('speak.py')) {
            const audioPath = join(process.cwd(), 'bot_speech.mp3');
            
            if (existsSync(audioPath)) {
              const audioBuffer = readFileSync(audioPath);
              resolve(audioBuffer);
            } else {
              reject(new ExternalServiceError('CharacterAI', 'Audio file not found'));
            }
          } else {
            // 對於其他腳本，返回空 Buffer
            resolve(Buffer.from(''));
          }
          
        } catch (parseError) {
          logger.error('Failed to process Python script output:', { stdout, parseError });
          reject(new ExternalServiceError('CharacterAI', 'Failed to process Python script output'));
        }
      });
      
      pythonProcess.on('error', (error: Error) => {
        logger.error('Failed to execute Python script:', error);
        reject(new ExternalServiceError('CharacterAI', `Failed to execute Python script: ${error.message}`));
      });
    });
  }





  /**
   * 確保有聊天會話
   */
  private async ensureChatSession(): Promise<string> {
    // 檢查是否有配置的現有聊天 ID
    if (config.characterAIChatId) {
      try {
        const existingChat = await this.characterAI.getChatById(config.characterAIChatId);
        if (existingChat) {
          logger.info('Using existing chat session for TTS', { chatId: existingChat.chat_id });
          return existingChat.chat_id;
        }
      } catch (error) {
        logger.warn('Failed to get existing chat for TTS, creating new one', { error });
      }
    }

    // 創建新的聊天會話
    const characterId = config.characterAICharacterId || '7ZSNhkW6YSiCxrGweo4zoIbSKsE1unLljfLXZV2g-Xc';
    const chatResult = await this.characterAI.createChat(characterId);
    return chatResult.chat.chat_id;
  }



  /**
   * 獲取可用聲線
   */
  async getAvailableVoices(): Promise<VoiceInfo[]> {
    try {
      logger.debug('Fetching available voices');

      // 簡化：直接使用聊天代理服務獲取語音

      // 後備：使用聊天代理服務
      const voices = await this.chatProxyService.getAvailableVoices();
      
      // 轉換為標準格式
      const formattedVoices: VoiceInfo[] = voices.map(voice => ({
        id: voice.voice_id || voice.id || 'unknown',
        name: voice.name || voice.voice_name || 'Unknown Voice',
        language: voice.language || voice.lang || 'zh-TW',
        gender: this.detectGender(voice.name || voice.voice_name || '')
      }));

      logger.info('Retrieved available voices', { count: formattedVoices.length });
      return formattedVoices;

    } catch (error) {
      logger.warn('Failed to fetch voices, returning empty list', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return [];
    }
  }

  /**
   * 檢查 TTS 服務可用性
   */
  async checkAvailability(): Promise<boolean> {
    try {
      // 如果有 Character.AI Token，直接返回 true
      if (config.characterAIToken) {
        return true;
      }
      
      // 否則檢查聊天代理服務
      return await this.chatProxyService.checkAvailability();
    } catch (error) {
      logger.warn('TTS service availability check failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * 驗證 TTS 請求
   */
  private validateTTSRequest(request: TTSRequest): void {
    if (!request) {
      throw new ValidationError('TTS request is required');
    }

    if (!request.text || typeof request.text !== 'string') {
      throw new ValidationError('Text is required and must be a string');
    }

    if (request.text.trim().length === 0) {
      throw new ValidationError('Text cannot be empty');
    }

    if (request.text.length > 1000) {
      throw new ValidationError('Text is too long (max 1000 characters)');
    }

    // 驗證語音參數
    if (request.rate !== undefined) {
      if (typeof request.rate !== 'number' || request.rate < 0.1 || request.rate > 3.0) {
        throw new ValidationError('Rate must be a number between 0.1 and 3.0');
      }
    }

    if (request.pitch !== undefined) {
      if (typeof request.pitch !== 'number' || request.pitch < 0.1 || request.pitch > 3.0) {
        throw new ValidationError('Pitch must be a number between 0.1 and 3.0');
      }
    }

    if (request.voiceId !== undefined) {
      if (typeof request.voiceId !== 'string' || request.voiceId.trim().length === 0) {
        throw new ValidationError('Voice ID must be a non-empty string');
      }
    }
  }

  /**
   * 準備文字進行語音合成
   */
  private prepareTextForSpeech(text: string): string {
    return text
      // 移除控制字元
      .replace(/[\x00-\x1F\x7F]/g, '')
      // 正規化換行
      .replace(/[\r\n]+/g, ' ')
      // 合併多個空格
      .replace(/\s+/g, ' ')
      // 移除不必要的標點符號組合
      .replace(/[。，！？]{2,}/g, match => match[0])
      // 處理引號
      .replace(/["「」『』]/g, '')
      // 移除 URL
      .replace(/https?:\/\/[^\s]+/g, '')
      // 移除 email
      .replace(/\S+@\S+\.\S+/g, '')
      // 移除特殊符號但保留基本標點
      .replace(/[^\u4e00-\u9fff\u3400-\u4dbf\w\s.,!?，。！？、；：]/g, '')
      // 限制標點符號
      .replace(/[,，]{2,}/g, '，')
      .replace(/[.。]{2,}/g, '。')
      // 確保句子結尾有標點
      .replace(/([^\s.,!?，。！？；：])(\s*$)/, '$1。')
      .trim();
  }

  /**
   * 獲取 MIME 類型
   */
  private getMimeType(format: string): string {
    const mimeTypes: Record<string, string> = {
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'ogg': 'audio/ogg'
    };

    return mimeTypes[format] || 'audio/mpeg';
  }

  /**
   * 從聲線名稱檢測性別
   */
  private detectGender(name: string): 'male' | 'female' | 'neutral' {
    const lowerName = name.toLowerCase();
    
    const femaleKeywords = ['female', 'woman', 'girl', 'lady', '女', '女性', '女聲'];
    const maleKeywords = ['male', 'man', 'boy', 'gentleman', '男', '男性', '男聲'];
    
    if (femaleKeywords.some(keyword => lowerName.includes(keyword))) {
      return 'female';
    }
    
    if (maleKeywords.some(keyword => lowerName.includes(keyword))) {
      return 'male';
    }
    
    return 'neutral';
  }

  /**
   * 獲取支援的音訊格式
   */
  getSupportedFormats(): string[] {
    return Array.from(this.supportedFormats);
  }

  /**
   * 獲取當前配置的格式
   */
  getCurrentFormat(): string {
    return config.ttsFormat;
  }

  /**
   * 獲取服務統計資訊
   */
  async getServiceStats(): Promise<{
    available: boolean;
    format: string;
    supportedFormats: string[];
    voiceCount: number;
  }> {
    try {
      const available = await this.checkAvailability();
      const voices = available ? await this.getAvailableVoices() : [];
      
      return {
        available,
        format: this.getCurrentFormat(),
        supportedFormats: this.getSupportedFormats(),
        voiceCount: voices.length
      };
    } catch (error) {
      return {
        available: false,
        format: this.getCurrentFormat(),
        supportedFormats: this.getSupportedFormats(),
        voiceCount: 0
      };
    }
  }
}

export default TTSService;
