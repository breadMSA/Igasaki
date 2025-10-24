import { ChatMessage, Conversation } from '@/types/index.js';
import { logger } from '@/lib/logger.js';

export class ConversationService {
  private messagesDir: string;

  constructor() {
    this.messagesDir = './data/user/conversations';
  }

  /**
   * 確保目錄存在
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    const fs = await import('fs/promises');
    
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * 保存訊息到對話串
   */
  async saveMessage(conversationId: string, message: ChatMessage): Promise<void> {
    try {
      await this.ensureDirectoryExists(this.messagesDir);
      
      const fs = await import('fs/promises');
      const path = await import('path');
      const messagesFile = path.join(this.messagesDir, `${conversationId}.json`);
      
      // 讀取現有訊息
      let messages: ChatMessage[] = [];
      try {
        const data = await fs.readFile(messagesFile, 'utf-8');
        messages = JSON.parse(data);
      } catch {
        // 文件不存在，使用空數組
      }
      
      // 添加新訊息
      messages.push({
        ...message,
        conversationId,
        timestamp: message.timestamp || new Date()
      });
      
      // 保存回文件
      await fs.writeFile(messagesFile, JSON.stringify(messages, null, 2), 'utf-8');
      
      // 更新對話串的messageCount
      await this.updateConversationMessageCount(conversationId, messages.length);
      
      logger.debug('Message saved to conversation', { 
        conversationId, 
        messageId: message.id,
        role: message.role,
        totalMessages: messages.length
      });
    } catch (error) {
      logger.error('Failed to save message to conversation', { 
        error: error instanceof Error ? error.message : String(error),
        conversationId,
        messageId: message.id
      });
      throw error;
    }
  }

  /**
   * 更新對話串的訊息計數
   */
  async updateConversationMessageCount(conversationId: string, messageCount: number): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const conversationsFile = './data/user/conversations.json';
      
      let conversations: any[] = [];
      try {
        const data = await fs.readFile(conversationsFile, 'utf-8');
        conversations = JSON.parse(data);
      } catch {
        logger.warn('Conversations file not found, skipping message count update');
        return;
      }
      
      const conversationIndex = conversations.findIndex(conv => conv.id === conversationId);
      if (conversationIndex !== -1) {
        conversations[conversationIndex].messageCount = messageCount;
        conversations[conversationIndex].updatedAt = new Date().toISOString();
        
        await fs.writeFile(conversationsFile, JSON.stringify(conversations, null, 2), 'utf-8');
        logger.debug('Updated conversation message count', { conversationId, messageCount });
      }
    } catch (error) {
      logger.warn('Failed to update conversation message count', { 
        error: error instanceof Error ? error.message : String(error),
        conversationId 
      });
    }
  }

  /**
   * 獲取對話串的所有訊息
   */
  async getMessages(conversationId: string, limit?: number, offset?: number): Promise<ChatMessage[]> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const messagesFile = path.join(this.messagesDir, `${conversationId}.json`);
      
      let messages: ChatMessage[] = [];
      try {
        const data = await fs.readFile(messagesFile, 'utf-8');
        messages = JSON.parse(data).map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }));
      } catch {
        // 文件不存在，返回空數組
        return [];
      }
      
      // 分頁處理
      if (offset !== undefined && limit !== undefined) {
        return messages.slice(offset, offset + limit);
      }
      
      return messages;
    } catch (error) {
      logger.error('Failed to get conversation messages', { 
        error: error instanceof Error ? error.message : String(error),
        conversationId
      });
      throw error;
    }
  }

  /**
   * 獲取對話串的訊息數量
   */
  async getMessageCount(conversationId: string): Promise<number> {
    try {
      const messages = await this.getMessages(conversationId);
      return messages.length;
    } catch (error) {
      logger.error('Failed to get message count', { 
        error: error instanceof Error ? error.message : String(error),
        conversationId
      });
      return 0;
    }
  }

  /**
   * 更新對話串的預覽文字
   */
  async updateConversationPreview(conversationId: string, preview: string): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const conversationsFile = './data/user/conversations.json';
      
      // 讀取對話串列表
      let conversations: Conversation[] = [];
      try {
        const data = await fs.readFile(conversationsFile, 'utf-8');
        conversations = JSON.parse(data).map((conv: any) => ({
          ...conv,
          createdAt: new Date(conv.createdAt),
          updatedAt: new Date(conv.updatedAt)
        }));
      } catch {
        return; // 文件不存在，忽略
      }
      
      // 找到並更新對話串
      const conversationIndex = conversations.findIndex(conv => conv.id === conversationId);
      if (conversationIndex !== -1) {
        conversations[conversationIndex].preview = preview;
        conversations[conversationIndex].updatedAt = new Date();
        
        // 保存回文件
        await fs.writeFile(conversationsFile, JSON.stringify(conversations, null, 2), 'utf-8');
      }
    } catch (error) {
      logger.error('Failed to update conversation preview', { 
        error: error instanceof Error ? error.message : String(error),
        conversationId
      });
    }
  }

  /**
   * 刪除對話串的所有訊息
   */
  async deleteConversationMessages(conversationId: string): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const messagesFile = path.join(this.messagesDir, `${conversationId}.json`);
      
      try {
        await fs.unlink(messagesFile);
        logger.info('Deleted conversation messages', { conversationId });
      } catch {
        // 文件可能不存在，忽略錯誤
      }

      // 同時刪除向量記憶
      try {
        const { vectorMemoryService } = await import('./vectorMemoryService.js');
        await vectorMemoryService.removeConversationById(conversationId);
        logger.info('Deleted conversation vector memories', { conversationId });
      } catch (error) {
        logger.warn('Failed to delete conversation vector memories', { 
          error: error instanceof Error ? error.message : String(error),
          conversationId
        });
      }
    } catch (error) {
      logger.error('Failed to delete conversation messages', { 
        error: error instanceof Error ? error.message : String(error),
        conversationId
      });
      throw error;
    }
  }

  /**
   * 獲取所有對話串的訊息（用於共享記憶）
   */
  async getAllMessagesForSharedMemory(): Promise<ChatMessage[]> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // 讀取對話串列表
      let conversations: Conversation[] = [];
      try {
        const data = await fs.readFile('./data/user/conversations.json', 'utf-8');
        conversations = JSON.parse(data);
      } catch {
        return []; // 文件不存在，返回空數組
      }
      
      // 只獲取共享記憶的對話串
      const sharedConversations = conversations.filter(conv => conv.settings.sharedMemory);
      
      const allMessages: ChatMessage[] = [];
      
      for (const conversation of sharedConversations) {
        try {
          const messages = await this.getMessages(conversation.id);
          allMessages.push(...messages);
        } catch (error) {
          logger.warn('Failed to get messages for shared memory', { 
            conversationId: conversation.id,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      
      // 按時間排序
      allMessages.sort((a, b) => 
        new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
      );
      
      return allMessages;
    } catch (error) {
      logger.error('Failed to get all messages for shared memory', { 
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }
}

export const conversationService = new ConversationService();
