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
import TTSService from './ttsService.js';
import axios from 'axios';

/**
 * 聊天代理服務
 * 整合外部聊天服務（如 Character.AI）用於情色內容路由和 TTS
 */
export class ChatProxyService {
  private characterAI: CharacterAI;
  private defaultCharacterId: string;
  private activeChatId: string | null = null;
  private lastTurnId: string | null = null;
  private lastCandidateId: string | null = null;
  private ttsService: TTSService; // 添加 ttsService 屬性

  constructor() {
    this.characterAI = new CharacterAI();
    // 從環境變數獲取預設角色 ID，如果沒有則使用一個通用的
    this.defaultCharacterId = config.characterAICharacterId || process.env.DEFAULT_CHARACTER_ID || 'default-character-id';
    
    if (config.characterAIToken) {
      this.characterAI.setToken(config.characterAIToken);
    } else if (config.chatProxyApiKey) {
      this.characterAI.setToken(config.chatProxyApiKey);
    }

    // 在這裡初始化 TTSService 並傳入已經驗證的 CharacterAI 實例
    this.ttsService = new TTSService(this, this.characterAI);
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
      
      // 發送訊息（支持 streaming）
      const response = await this.characterAI.sendMessage(
        request.characterId || this.defaultCharacterId,
        chatId,
        request.message,
        true // 啟用 streaming
      );

      // 保存最新的 turn_id 和 candidate_id
      logger.info('Saving chat IDs', { 
        turn_id: response.turn_id, 
        candidate_id: response.candidates?.[0]?.candidate_id 
      });
      
      if (response.turn_id) {
        this.lastTurnId = response.turn_id;
        logger.info('Saved turn_id', { turn_id: this.lastTurnId });
      }
      if (response.candidates && response.candidates.length > 0 && response.candidates[0].candidate_id) {
        this.lastCandidateId = response.candidates[0].candidate_id;
        logger.info('Saved candidate_id', { candidate_id: this.lastCandidateId });
      }

      // 將回應轉換為多段式
      const utterances = this.parseResponseToUtterances(response.text);
      
      for (const utterance of utterances) {
        const utteranceData = { 
          text: utterance,
          // 將 ID 傳回前端
          turnId: this.lastTurnId,
          candidateId: this.lastCandidateId
        };
        
        logger.info('Sending utterance with IDs', { 
          turnId: this.lastTurnId, 
          candidateId: this.lastCandidateId 
        });
        
        yield { 
          type: 'utterance', 
          data: utteranceData
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
   * 生成語音（直接使用 Character.AI TTS API）
   */
  async generateSpeech(text: string, voiceId?: string, turnId?: string, candidateId?: string): Promise<Buffer> {
    try {
      this.validateSpeechRequest(text);
      
      logger.logSafeContent('info', 'Generating speech via Character.AI TTS', text);

      // 清理文字
      const cleanedText = this.cleanTextForSpeech(text);
      
      // 確保有聊天會話
      const chatId = await this.ensureChatSession();
      
      // 直接使用 memo/replay API（參考 PyCharacterAI）
      logger.info('Generating speech using memo/replay API...');
      
      // 使用傳入的 ID 或保存的 ID
      try {
        let actualTurnId = turnId || this.lastTurnId;
        let actualCandidateId = candidateId || this.lastCandidateId;
        
        // 如果沒有 ID，則無法生成語音
        if (!actualTurnId || !actualCandidateId) {
          throw new ExternalServiceError('ChatProxy', 'No valid turn ID or candidate ID available. Please send a chat message first.');
        }
        
        const payload = {
          candidateId: actualCandidateId,
          roomId: chatId,
          turnId: actualTurnId,
          voiceId: voiceId || config.chatProxyVoiceId || 'default'
        };
        
        // 使用 Character.AI 的 memo/replay API 生成語音
        logger.info('Generating speech via Character.AI memo/replay API...');
        
        const endpoint = 'https://neo.character.ai/multimodal/api/v1/memo/replay';
        const urlResponse = await axios({
          method: 'POST',
          url: endpoint,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Token ${config.characterAIToken}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
            'Accept': 'application/json',
            'Origin': 'https://character.ai',
            'Referer': 'https://character.ai/'
          },
          data: payload,
          timeout: 15000
        });
        
        if (urlResponse.status !== 200) {
          const responseData = urlResponse.data;
          if (responseData?.command === 'neo_error') {
            const errorComment = responseData.comment || '';
            throw new ExternalServiceError('CharacterAI', `Cannot generate speech. ${errorComment}`);
          } else if (responseData?.error?.message) {
            throw new ExternalServiceError('CharacterAI', `Cannot generate speech. ${responseData.error.message}`);
          } else if (responseData?.message) {
            throw new ExternalServiceError('CharacterAI', `Cannot generate speech. ${responseData.message}`);
          }
          throw new ExternalServiceError('CharacterAI', 'Cannot generate speech.');
        }

        const audioUrl = urlResponse.data?.replayUrl;
        if (!audioUrl) {
          throw new ExternalServiceError('CharacterAI', 'No audio URL returned');
        }

        // 第二步：下載音頻內容
        const audioResponse = await axios({
          method: 'GET',
          url: audioUrl,
          responseType: 'arraybuffer',
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0'
          }
        });

        if (audioResponse.status === 200 && audioResponse.data) {
          logger.info('Speech generation completed successfully');
          return Buffer.from(audioResponse.data);
        }

        throw new ExternalServiceError('CharacterAI', 'Cannot generate speech.');
        
      } catch (error) {
        logger.error('Character.AI speech generation failed', { error });
        throw new ExternalServiceError('CharacterAI', `Speech generation failed: ${error}`);
      }

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

    // 移除長度限制，允許記憶注入的長消息
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

      // 檢查是否有配置的現有聊天 ID
      if (config.characterAIChatId) {
        try {
          const existingChat = await this.characterAI.getChatById(config.characterAIChatId);
          if (existingChat) {
            this.activeChatId = existingChat.chat_id;
            logger.info('Using existing chat session from config', { chatId: this.activeChatId });
            return this.activeChatId;
          }
        } catch (error) {
          logger.warn('Failed to get existing chat from config, creating new one', { error });
        }
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

    // 如果文字很短（少於100字），不分段
    if (text.trim().length < 100) {
      return [text.trim()];
    }

    // 按段落分割（雙換行）
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    if (paragraphs.length > 1) {
      return paragraphs.map(p => p.trim());
    }

    // 按句子分割，但避免在冒號後分割
    const sentences = text.split(/[。！？.!?]/).filter(s => s.trim().length > 25);
    
    if (sentences.length > 2) {
      const result: string[] = [];
      let currentSentence = '';
      
      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (trimmed.length === 0) continue;
        
        // 如果句子以冒號結尾，不要分割，繼續累積
        if (trimmed.endsWith('：') || trimmed.endsWith(':')) {
          currentSentence += trimmed;
        } else {
          if (currentSentence) {
            result.push((currentSentence + trimmed + '。').trim());
            currentSentence = '';
          } else {
            result.push((trimmed + '。').trim());
          }
        }
      }
      
      // 處理最後的句子
      if (currentSentence) {
        result.push(currentSentence.trim());
      }
      
      // 確保沒有空白內容
      return result.filter(p => p.trim().length > 0).length > 0 ? result.filter(p => p.trim().length > 0) : [text.trim()];
    }

    // 如果太長（超過500字），強制分割
    if (text.length > 500) {
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
   * 獲取最新的聊天 ID
   */
  getLastChatIds(): { turnId: string | null; candidateId: string | null } {
    return {
      turnId: this.lastTurnId,
      candidateId: this.lastCandidateId
    };
  }

  /**
   * 獲取 TTS 服務
   */
  getTTSService(): TTSService {
    return this.ttsService;
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
