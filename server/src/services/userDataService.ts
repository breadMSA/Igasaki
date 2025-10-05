import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '@/lib/logger.js';

export interface UserPreferences {
  id: string;
  userName?: string;
  voiceId?: string;
  personaId?: string;
  ttsMode: 'chat-say' | 'direct';
  autoplay: boolean;
  volume: number;
  live2dEnabled: boolean;
  live2dModelId?: string;
  theme: 'light' | 'dark' | 'auto';
  language: 'zh-TW' | 'en-US';
  backgroundImage?: string;
  backgroundOpacity?: number;
  userAvatar?: string;
  botAvatar?: string;
  aiPersonality?: string;
  customPersonalityText?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  utterances?: string[];
  metadata?: {
    model?: string;
    tokens?: number;
    processingTime?: number;
  };
}

export interface UserStats {
  totalMessages: number;
  totalConversations: number;
  lastActive: string;
  createdAt: string;
}

export class UserDataService {
  private dataDir: string;
  private preferencesFile: string;
  private messagesFile: string;
  private statsFile: string;

  constructor() {
    // 使用與向量記憶相同的數據目錄
    this.dataDir = path.join(process.env.MEMORY_DATA_DIR || './data/memory', 'default');
    this.preferencesFile = path.join(this.dataDir, 'preferences.json');
    this.messagesFile = path.join(this.dataDir, 'messages.json');
    this.statsFile = path.join(this.dataDir, 'stats.json');
    
    this.initialize();
  }

  /**
   * 初始化數據目錄和默認文件
   */
  private async initialize(): Promise<void> {
    try {
      // 確保數據目錄存在
      await fs.mkdir(this.dataDir, { recursive: true });
      logger.info(`用戶數據目錄已創建或已存在: ${this.dataDir}`);

      // 檢查並創建默認偏好設定文件
      try {
        await fs.access(this.preferencesFile);
      } catch {
        const defaultPreferences: UserPreferences = {
          id: 'default',
          ttsMode: 'chat-say',
          autoplay: false,
          volume: 0.8,
          live2dEnabled: false,
          theme: 'light',
          language: 'zh-TW',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await fs.writeFile(this.preferencesFile, JSON.stringify(defaultPreferences, null, 2), 'utf-8');
        logger.info('創建默認偏好設定文件');
      }

      // 檢查並創建默認消息文件
      try {
        await fs.access(this.messagesFile);
      } catch {
        await fs.writeFile(this.messagesFile, JSON.stringify([], null, 2), 'utf-8');
        logger.info('創建默認消息文件');
      }

      // 檢查並創建默認統計文件
      try {
        await fs.access(this.statsFile);
      } catch {
        const defaultStats: UserStats = {
          totalMessages: 0,
          totalConversations: 0,
          lastActive: new Date().toISOString(),
          createdAt: new Date().toISOString()
        };
        await fs.writeFile(this.statsFile, JSON.stringify(defaultStats, null, 2), 'utf-8');
        logger.info('創建默認統計文件');
      }

      logger.info('✅ 用戶數據服務初始化完成');
    } catch (error) {
      logger.error('用戶數據服務初始化失敗', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * 獲取用戶偏好設定
   */
  async getPreferences(): Promise<UserPreferences> {
    try {
      const data = await fs.readFile(this.preferencesFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('讀取偏好設定失敗', { error: error instanceof Error ? error.message : String(error) });
      throw new Error('無法讀取偏好設定');
    }
  }

  /**
   * 更新用戶偏好設定
   */
  async updatePreferences(updates: Partial<UserPreferences>): Promise<UserPreferences> {
    try {
      const current = await this.getPreferences();
      const updated: UserPreferences = {
        ...current,
        ...updates,
        updatedAt: new Date().toISOString()
      };
      
      await fs.writeFile(this.preferencesFile, JSON.stringify(updated, null, 2), 'utf-8');
      logger.info('更新偏好設定成功', { updates: Object.keys(updates) });
      return updated;
    } catch (error) {
      logger.error('更新偏好設定失敗', { error: error instanceof Error ? error.message : String(error) });
      throw new Error('無法更新偏好設定');
    }
  }

  /**
   * 獲取聊天記錄
   */
  async getMessages(limit?: number, offset?: number): Promise<ChatMessage[]> {
    try {
      const data = await fs.readFile(this.messagesFile, 'utf-8');
      let messages: ChatMessage[] = JSON.parse(data);
      
      // 按時間戳排序（最新的在前）
      messages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      // 分頁
      if (offset !== undefined && limit !== undefined) {
        messages = messages.slice(offset, offset + limit);
      } else if (limit !== undefined) {
        messages = messages.slice(0, limit);
      }
      
      return messages;
    } catch (error) {
      logger.error('讀取消息失敗', { error: error instanceof Error ? error.message : String(error) });
      throw new Error('無法讀取消息');
    }
  }

  /**
   * 添加消息
   */
  async addMessage(message: Omit<ChatMessage, 'id'>): Promise<ChatMessage> {
    try {
      const messages = await this.getAllMessages();
      const newMessage: ChatMessage = {
        ...message,
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };
      
      messages.push(newMessage);
      
      // 只保留最近 10000 條消息
      if (messages.length > 10000) {
        messages.splice(0, messages.length - 10000);
      }
      
      await fs.writeFile(this.messagesFile, JSON.stringify(messages, null, 2), 'utf-8');
      
      // 更新統計數據
      await this.updateStats();
      
      logger.info('添加消息成功', { messageId: newMessage.id });
      return newMessage;
    } catch (error) {
      logger.error('添加消息失敗', { error: error instanceof Error ? error.message : String(error) });
      throw new Error('無法添加消息');
    }
  }

  /**
   * 批量添加消息
   */
  async addMessages(newMessages: Omit<ChatMessage, 'id'>[]): Promise<ChatMessage[]> {
    try {
      const messages = await this.getAllMessages();
      const addedMessages: ChatMessage[] = newMessages.map(msg => ({
        ...msg,
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }));
      
      messages.push(...addedMessages);
      
      // 只保留最近 10000 條消息
      if (messages.length > 10000) {
        messages.splice(0, messages.length - 10000);
      }
      
      await fs.writeFile(this.messagesFile, JSON.stringify(messages, null, 2), 'utf-8');
      
      // 更新統計數據
      await this.updateStats();
      
      logger.info('批量添加消息成功', { count: addedMessages.length });
      return addedMessages;
    } catch (error) {
      logger.error('批量添加消息失敗', { error: error instanceof Error ? error.message : String(error) });
      throw new Error('無法批量添加消息');
    }
  }

  /**
   * 刪除消息
   */
  async deleteMessage(messageId: string): Promise<void> {
    try {
      const messages = await this.getAllMessages();
      const filteredMessages = messages.filter(msg => msg.id !== messageId);
      
      if (filteredMessages.length === messages.length) {
        throw new Error('消息不存在');
      }
      
      await fs.writeFile(this.messagesFile, JSON.stringify(filteredMessages, null, 2), 'utf-8');
      logger.info('刪除消息成功', { messageId });
    } catch (error) {
      logger.error('刪除消息失敗', { error: error instanceof Error ? error.message : String(error) });
      throw new Error('無法刪除消息');
    }
  }

  /**
   * 清空所有消息
   */
  async clearMessages(): Promise<void> {
    try {
      await fs.writeFile(this.messagesFile, JSON.stringify([], null, 2), 'utf-8');
      logger.info('清空所有消息成功');
    } catch (error) {
      logger.error('清空消息失敗', { error: error instanceof Error ? error.message : String(error) });
      throw new Error('無法清空消息');
    }
  }

  /**
   * 獲取統計數據
   */
  async getStats(): Promise<UserStats> {
    try {
      const data = await fs.readFile(this.statsFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('讀取統計數據失敗', { error: error instanceof Error ? error.message : String(error) });
      throw new Error('無法讀取統計數據');
    }
  }

  /**
   * 更新統計數據
   */
  private async updateStats(): Promise<void> {
    try {
      const messages = await this.getAllMessages();
      const stats: UserStats = {
        totalMessages: messages.length,
        totalConversations: this.countConversations(messages),
        lastActive: new Date().toISOString(),
        createdAt: (await this.getStats()).createdAt || new Date().toISOString()
      };
      
      await fs.writeFile(this.statsFile, JSON.stringify(stats, null, 2), 'utf-8');
    } catch (error) {
      logger.warn('更新統計數據失敗', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * 計算對話數量（簡單實現：連續的消息算一次對話）
   */
  private countConversations(messages: ChatMessage[]): number {
    if (messages.length === 0) return 0;
    
    let conversations = 1;
    const sortedMessages = [...messages].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    for (let i = 1; i < sortedMessages.length; i++) {
      const prevTime = new Date(sortedMessages[i - 1].timestamp).getTime();
      const currTime = new Date(sortedMessages[i].timestamp).getTime();
      
      // 如果間隔超過 30 分鐘，視為新對話
      if (currTime - prevTime > 30 * 60 * 1000) {
        conversations++;
      }
    }
    
    return conversations;
  }

  /**
   * 獲取所有消息（內部使用）
   */
  private async getAllMessages(): Promise<ChatMessage[]> {
    try {
      const data = await fs.readFile(this.messagesFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return [];
    }
  }

  /**
   * 同步本地數據到服務器（用於從 IndexedDB 遷移）
   */
  async syncFromLocal(preferences?: Partial<UserPreferences>, messages?: ChatMessage[]): Promise<void> {
    try {
      if (preferences) {
        await this.updatePreferences(preferences);
        logger.info('同步偏好設定成功');
      }
      
      if (messages && messages.length > 0) {
        // 合併現有消息和新消息，避免重複
        const existingMessages = await this.getAllMessages();
        const existingIds = new Set(existingMessages.map(m => m.id));
        const newMessages = messages.filter(m => !existingIds.has(m.id));
        
        if (newMessages.length > 0) {
          existingMessages.push(...newMessages);
          
          // 排序並限制數量
          existingMessages.sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          
          if (existingMessages.length > 10000) {
            existingMessages.splice(10000);
          }
          
          await fs.writeFile(this.messagesFile, JSON.stringify(existingMessages, null, 2), 'utf-8');
          await this.updateStats();
          logger.info('同步消息成功', { count: newMessages.length });
        }
      }
    } catch (error) {
      logger.error('同步本地數據失敗', { error: error instanceof Error ? error.message : String(error) });
      throw new Error('無法同步本地數據');
    }
  }
}

// 導出單例
export const userDataService = new UserDataService();


