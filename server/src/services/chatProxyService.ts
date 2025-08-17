import { 
  ChatProxyRequest, 
  ChatProxyResponse, 
  ChatMessage,
  ExternalServiceError,
  ValidationError 
} from '@/types/index.js';
import { config } from '@/lib/config.js';
import { logger } from '@/lib/logger.js';
import CharacterAI from './characterAI.js';

/**
 * 聊天代理服務
 * 整合外部聊天服務（如 Character.AI）用於情色內容路由和 TTS
 */
export class ChatProxyService {
  private characterAI: CharacterAI;
  private defaultCharacterId: string;
  private activeChatId: string | null = null;

  constructor() {
    this.characterAI = new CharacterAI();
    // 從環境變數獲取預設角色 ID，如果沒有則使用一個通用的
    this.defaultCharacterId = process.env.DEFAULT_CHARACTER_ID || 'default-character-id';
    
    if (config.chatProxyApiKey) {
      this.characterAI.setToken(config.chatProxyApiKey);
    }
  }

  /**
   * 處理聊天請求
   */
  async *handleChatRequest(request: ChatProxyRequest): AsyncGenerator<{ type: 'utterance' | 'error'; data: any }> {
    try {
      this.validateChatRequest(request);
      
      logger.logSafeContent('info', 'Processing chat proxy request', request.message);

      // 確保有聊天會話
      const chatId = await this.ensureChatSession(request.characterId);
      
      // 發送訊息
      const response = await this.characterAI.sendMessage(
        request.characterId || this.defaultCharacterId,
        chatId,
        request.message
      );

      // 將回應轉換為多段式
      const utterances = this.parseResponseToUtterances(response.text);
      
      for (const utterance of utterances) {
        yield { 
          type: 'utterance', 
          data: { text: utterance } 
        };
      }

      logger.info('Chat proxy request completed successfully');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Chat proxy request failed', { error: errorMessage });
      
      yield { 
        type: 'error', 
        data: { message: `聊天代理暫時無法使用：${errorMessage}` } 
      };
    }
  }

  /**
   * 生成語音（chat-say 模式）
   */
  async generateSpeech(text: string, voiceId?: string): Promise<Buffer> {
    try {
      this.validateSpeechRequest(text);
      
      logger.logSafeContent('info', 'Generating speech via chat-say mode', text);

      // 清理文字
      const cleanedText = this.cleanTextForSpeech(text);
      
      // 構造語音生成訊息
      const speechMessage = this.buildSpeechMessage(cleanedText);
      
      // 確保有聊天會話
      const chatId = await this.ensureChatSession();
      
      // 發送語音請求（使用特殊的 TTS 角色或設定）
      const response = await this.characterAI.sendMessage(
        this.defaultCharacterId,
        chatId,
        speechMessage
      );

      // 如果 Character.AI 支援直接語音生成
      if (response.turn_id && response.candidates[0]?.candidate_id) {
        try {
          const audioBuffer = await this.characterAI.generateSpeech(
            chatId,
            response.turn_id,
            response.candidates[0].candidate_id,
            voiceId || config.chatProxyVoiceId
          );
          
          logger.info('Speech generated successfully via Character.AI');
          return audioBuffer;
        } catch (speechError) {
          logger.warn('Direct speech generation failed, falling back to error response', { error: speechError });
          throw new ExternalServiceError('ChatProxy', 'Speech generation not available');
        }
      }

      throw new ExternalServiceError('ChatProxy', 'Speech generation not supported');

    } catch (error) {
      logger.error('Speech generation failed', { error: error instanceof Error ? error.message : String(error) });
      throw new ExternalServiceError('ChatProxy', `Speech generation failed: ${error}`);
    }
  }

  /**
   * 獲取可用聲線
   */
  async getAvailableVoices(): Promise<any[]> {
    try {
      const voices = await this.characterAI.searchVoices('');
      logger.debug('Retrieved available voices', { count: voices.length });
      return voices;
    } catch (error) {
      logger.warn('Failed to retrieve voices', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }

  /**
   * 驗證聊天請求
   */
  private validateChatRequest(request: ChatProxyRequest): void {
    if (!request.message || typeof request.message !== 'string') {
      throw new ValidationError('Message is required and must be a string');
    }

    if (request.message.trim().length === 0) {
      throw new ValidationError('Message cannot be empty');
    }

    if (request.message.length > 4000) {
      throw new ValidationError('Message is too long (max 4000 characters)');
    }
  }

  /**
   * 驗證語音請求
   */
  private validateSpeechRequest(text: string): void {
    if (!text || typeof text !== 'string') {
      throw new ValidationError('Text is required and must be a string');
    }

    if (text.trim().length === 0) {
      throw new ValidationError('Text cannot be empty');
    }

    if (text.length > 1000) {
      throw new ValidationError('Text is too long for speech generation (max 1000 characters)');
    }
  }

  /**
   * 確保聊天會話存在
   */
  private async ensureChatSession(characterId?: string): Promise<string> {
    try {
      // 如果已有活動聊天，直接使用
      if (this.activeChatId) {
        return this.activeChatId;
      }

      // 創建新的聊天會話
      const targetCharacterId = characterId || this.defaultCharacterId;
      const chatResult = await this.characterAI.createChat(targetCharacterId);
      
      this.activeChatId = chatResult.chat.chat_id;
      logger.info('Created new chat session', { chatId: this.activeChatId, characterId: targetCharacterId });
      
      return this.activeChatId;
    } catch (error) {
      logger.error('Failed to ensure chat session', { error: error instanceof Error ? error.message : String(error) });
      throw new ExternalServiceError('ChatProxy', 'Failed to create chat session');
    }
  }

  /**
   * 將回應解析為多段式訊息
   */
  private parseResponseToUtterances(text: string): string[] {
    if (!text || text.trim().length === 0) {
      return ['抱歉，我沒有回應。'];
    }

    // 按段落分割
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    if (paragraphs.length > 1) {
      return paragraphs.map(p => p.trim());
    }

    // 按句子分割
    const sentences = text.split(/[。！？.!?]/).filter(s => s.trim().length > 10);
    
    if (sentences.length > 1 && sentences.length <= 5) {
      return sentences.map(s => s.trim() + (s.includes('。') ? '' : '。'));
    }

    // 如果太長，強制分割
    if (text.length > 200) {
      const midPoint = Math.floor(text.length / 2);
      const splitPoint = text.lastIndexOf('。', midPoint) || text.lastIndexOf('，', midPoint) || midPoint;
      
      return [
        text.substring(0, splitPoint + 1).trim(),
        text.substring(splitPoint + 1).trim()
      ].filter(p => p.length > 0);
    }

    return [text.trim()];
  }

  /**
   * 清理文字以進行語音合成
   */
  private cleanTextForSpeech(text: string): string {
    return text
      .replace(/[\r\n]+/g, ' ') // 移除換行
      .replace(/\s+/g, ' ') // 合併多個空格
      .replace(/[^\u4e00-\u9fff\u3400-\u4dbf\w\s.,!?，。！？、]/g, '') // 保留中文、英文、基本標點
      .trim();
  }

  /**
   * 構造語音生成訊息（chat-say 模式）
   */
  private buildSpeechMessage(text: string): string {
    // 使用配置的模板，替換 {{TEXT}} 占位符
    return config.ttsUserTemplate.replace('{{TEXT}}', text);
  }

  /**
   * 重置聊天會話
   */
  resetChatSession(): void {
    this.activeChatId = null;
    logger.info('Chat session reset');
  }

  /**
   * 設定預設角色 ID
   */
  setDefaultCharacterId(characterId: string): void {
    this.defaultCharacterId = characterId;
    logger.info('Default character ID updated', { characterId });
  }

  /**
   * 檢查服務可用性
   */
  async checkAvailability(): Promise<boolean> {
    try {
      await this.characterAI.fetchMe();
      return true;
    } catch (error) {
      logger.warn('Chat proxy service unavailable', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }
}

export default ChatProxyService;
