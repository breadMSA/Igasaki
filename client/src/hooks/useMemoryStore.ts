import { useState, useEffect } from 'react';
import Dexie, { Table } from 'dexie';
import { ChatMessage, UserPreferences } from '@/types';

interface Avatar {
  id: string;
  name: string;
  type: 'user' | 'bot';
  dataUrl: string;
  createdAt: Date;
}

// 定義資料庫
class IgasakiDatabase extends Dexie {
  messages!: Table<ChatMessage>;
  preferences!: Table<UserPreferences>;
  avatars!: Table<Avatar>;

  constructor() {
    super('IgasakiDatabase');
    this.version(1).stores({
      messages: 'id, role, timestamp, conversationId',
      preferences: 'id',
      avatars: 'id, type'
    });
  }
}

const db = new IgasakiDatabase();

export function useMemoryStore() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initializeMemory = async () => {
      try {
        // 初始化資料庫
        await db.open();
        console.log('📦 IndexedDB 初始化成功');
        
        // 檢查是否有預設偏好設定
        let existingPrefs = await db.preferences.get('default');
        if (!existingPrefs) {
          existingPrefs = {
            id: 'default',
            ttsMode: 'chat-say',
            autoplay: false,
            volume: 1.0,
            theme: 'auto',
            language: 'zh-TW',
            backgroundOpacity: 0.3,
            live2dEnabled: true,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          await db.preferences.add(existingPrefs);
          console.log('✨ 創建默認偏好設定');
        }
        
        // 嘗試與服務器同步數據（只在本地沒有數據時才從服務器恢復）
        try {
          const { fetchPreferencesFromServer, fetchMessagesFromServer, syncLocalDataToServer } = await import('@/utils/serverSync');
          
          // 檢查本地數據
          const localMessages = await db.messages.toArray();
          const localMessageCount = localMessages.length;
          
          console.log(`💾 本地已有 ${localMessageCount} 條對話記錄`);
          
          if (localMessageCount === 0) {
            // 本地沒有數據，嘗試從服務器恢復
            console.log('🌐 本地無數據，從服務器恢復...');
            
            const serverPrefs = await fetchPreferencesFromServer();
            const serverMessages = await fetchMessagesFromServer(10000);
            
            if (serverPrefs) {
              await db.preferences.put({
                ...serverPrefs,
                createdAt: new Date(serverPrefs.createdAt),
                updatedAt: new Date(serverPrefs.updatedAt)
              });
              console.log('✅ 已恢復偏好設定');
            }
            
            if (serverMessages.length > 0) {
              // 去重後添加
              const uniqueMessages = Array.from(
                new Map(serverMessages.map(msg => [msg.id, msg])).values()
              );
              
              await db.messages.bulkAdd(uniqueMessages.map(msg => ({
                ...msg,
                timestamp: new Date(msg.timestamp),
                processing: false  // 清除處理中狀態
              })));
              console.log(`✅ 已恢復 ${uniqueMessages.length} 條對話記錄`);
            }
          } else {
            // 本地有數據，同步到服務器（如果服務器沒有的話）
            console.log('💾 使用本地數據，檢查服務器同步狀態...');
            
            try {
              const serverMessages = await fetchMessagesFromServer(1);
              if (serverMessages.length === 0) {
                console.log('⬆️ 服務器無數據，同步本地數據到服務器...');
                await syncLocalDataToServer(existingPrefs, localMessages);
                console.log('✅ 同步完成');
              } else {
                console.log('✅ 服務器已有數據，跳過同步');
              }
            } catch (e) {
              console.log('⚠️ 無法連接服務器，使用本地數據');
            }
          }
        } catch (serverError) {
          console.warn('⚠️ 服務器同步失敗，僅使用本地數據:', serverError instanceof Error ? serverError.message : serverError);
          console.log('💾 當前本地數據仍然可用');
        }
        
        setIsReady(true);
        console.log('✅ 記憶系統初始化完成');
      } catch (error) {
        console.error('❌ Memory store initialization failed:', error);
        setIsReady(false);
      }
    };

    initializeMemory();
  }, []);

  return {
    isReady,
    db
  };
}

// 清理舊的聊天記錄（僅在超過限制時）
async function cleanupOldMessages() {
  try {
    // 只在超過 100000 條消息時才清理（幾乎永不觸發）
    const totalMessages = await db.messages.count();
    if (totalMessages > 100000) {
      const messagesToDelete = totalMessages - 100000;
      const oldMessages = await db.messages
        .orderBy('timestamp')
        .limit(messagesToDelete)
        .toArray();
      
      const idsToDelete = oldMessages.map(msg => msg.id);
      await db.messages.bulkDelete(idsToDelete);
      
      console.log(`⚠️ 已清理 ${messagesToDelete} 條舊消息（超過 100000 條限制）`);
    }
  } catch (error) {
    console.warn('清理舊消息失敗:', error);
  }
}

// 聊天記錄管理
export const chatMemory = {
  async saveMessage(message: ChatMessage): Promise<void> {
    try {
      // 檢查是否已存在（防止重複）
      const existing = await db.messages.get(message.id);
      if (existing) {
        // 已存在，只更新
        await db.messages.put(message);
        console.log(`📝 更新消息: ${message.id}`);
      } else {
        // 新消息，添加
        await db.messages.add(message);
        console.log(`➕ 新增消息: ${message.id}`);
      }
      
      // 同時保存到服務器（異步，不阻塞）
      import('@/utils/serverSync')
        .then(({ saveMessageToServer }) => saveMessageToServer(message))
        .catch(serverError => {
          console.warn('⚠️ 保存到服務器失敗（本地已保存）');
        });
      
    } catch (error) {
      console.error('❌ 保存消息失敗:', error);
      throw error;
    }
  },

  async getMessages(limit: number = 50): Promise<ChatMessage[]> {
    // 移除限制，允許獲取所有消息
    const actualLimit = limit || 1000; // 如果沒有指定限制，默認1000條
    
    return await db.messages
      .orderBy('timestamp')
      .reverse()
      .limit(actualLimit)
      .toArray();
  },

  async getMessagesByConversation(conversationId: string, limit: number = 50): Promise<ChatMessage[]> {
    return await db.messages
      .where('conversationId')
      .equals(conversationId)
      .toArray()
      .then(messages => 
        messages
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, limit)
      );
  },

  async deleteMessage(messageId: string): Promise<void> {
    await db.messages.delete(messageId);
    console.log(`🗑️ 刪除消息: ${messageId}`);
    
    // 同時從服務器刪除
    import('@/utils/serverSync')
      .then(({ deleteMessageFromServer }) => deleteMessageFromServer(messageId))
      .catch(() => {
        console.warn('⚠️ 從服務器刪除失敗（本地已刪除）');
      });
  },

  async deleteConversation(conversationId: string): Promise<void> {
    await db.messages.where('conversationId').equals(conversationId).delete();
  },

  async clearMessages(): Promise<void> {
    await db.messages.clear();
  },

  // 清理重複消息
  async removeDuplicateMessages(): Promise<number> {
    try {
      const allMessages = await db.messages.toArray();
      console.log(`🔍 檢查 ${allMessages.length} 條消息是否有重複...`);
      
      const messageMap = new Map<string, ChatMessage>();
      const contentSet = new Set<string>();
      const duplicateIds: string[] = [];
      
      for (const msg of allMessages) {
        // 創建內容指紋（角色 + 內容 + 時間範圍）
        const contentFingerprint = `${msg.role}_${msg.content}_${Math.floor(new Date(msg.timestamp).getTime() / 60000)}`;
        
        // 如果這個內容指紋已經存在，標記為重複
        if (contentSet.has(contentFingerprint)) {
          duplicateIds.push(msg.id);
          console.log(`⚠️ 發現重複消息: ${msg.id}`);
        } else {
          contentSet.add(contentFingerprint);
          messageMap.set(msg.id, msg);
        }
      }
      
      // 刪除重複消息
      if (duplicateIds.length > 0) {
        await db.messages.bulkDelete(duplicateIds);
        console.log(`🗑️ 已刪除 ${duplicateIds.length} 條重複消息`);
      } else {
        console.log('✅ 沒有發現重複消息');
      }
      
      return duplicateIds.length;
    } catch (error) {
      console.error('清理重複消息失敗:', error);
      return 0;
    }
  },

  async getMessageCount(): Promise<number> {
    return await db.messages.count();
  },

  // 獲取優化的歷史記錄（用於 API 請求）
  async getOptimizedHistory(limit: number = 20): Promise<ChatMessage[]> {
    try {
      // 返回最近的消息，按時間正序排列
      const messages = await db.messages
        .orderBy('timestamp')
        .reverse()
        .limit(limit)
        .toArray();
      
      // 反轉回時間順序（舊的在前，新的在後）
      return messages.reverse();
    } catch (error) {
      console.error('獲取優化歷史記錄失敗:', error);
      return [];
    }
  },

  // 新增：搜索聊天歷史記錄
  async searchMessages(query: string, limit: number = 50): Promise<ChatMessage[]> {
    try {
      const allMessages = await db.messages.toArray();
      console.log('🔍 搜索庫中的總消息數:', allMessages.length);
      console.log('🔍 搜索關鍵詞:', query);
      
      const searchResults = allMessages
        .filter(message => 
          message.content.toLowerCase().includes(query.toLowerCase()) ||
          message.role.toLowerCase().includes(query.toLowerCase())
        )
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);
      
      console.log('🔍 搜索結果數量:', searchResults.length);
      if (searchResults.length > 0) {
        console.log('🔍 搜索結果樣本:', searchResults.slice(0, 3).map(m => ({
          role: m.role,
          content: m.content.substring(0, 100) + '...'
        })));
      }
      
      return searchResults;
    } catch (error) {
      console.error('搜索聊天記錄失敗:', error);
      return [];
    }
  },

  // 新增：獲取特定時間範圍的聊天記錄
  async getMessagesByTimeRange(startDate: Date, endDate: Date, limit: number = 100): Promise<ChatMessage[]> {
    try {
      return await db.messages
        .where('timestamp')
        .between(startDate, endDate)
        .reverse()
        .limit(limit)
        .toArray();
    } catch (error) {
      console.error('按時間範圍獲取聊天記錄失敗:', error);
      return [];
    }
  },

  // 新增：獲取與特定主題相關的聊天記錄
  async getMessagesByTopic(topic: string, limit: number = 50): Promise<ChatMessage[]> {
    try {
      const allMessages = await db.messages.toArray();
      const topicResults = allMessages
        .filter(message => 
          message.content.toLowerCase().includes(topic.toLowerCase())
        )
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);
      
      return topicResults;
    } catch (error) {
      console.error('按主題獲取聊天記錄失敗:', error);
      return [];
    }
  },

  // 新增：獲取用戶的聊天統計信息
  async getChatStatistics(): Promise<{
    totalMessages: number;
    userMessages: number;
    botMessages: number;
    totalConversations: number;
    averageMessagesPerConversation: number;
    mostActiveHours: { hour: number; count: number }[];
    recentTopics: string[];
  }> {
    try {
      const allMessages = await db.messages.toArray();
      const userMessages = allMessages.filter(m => m.role === 'user');
      const botMessages = allMessages.filter(m => m.role === 'assistant');
      
      // 計算對話數量
      const conversationIds = new Set(allMessages.map(m => m.conversationId));
      
      // 計算最活躍時段
      const hourCounts = new Array(24).fill(0);
      allMessages.forEach(message => {
        const hour = new Date(message.timestamp).getHours();
        hourCounts[hour]++;
      });
      
      const mostActiveHours = hourCounts
        .map((count, hour) => ({ hour, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      
      // 提取最近的話題（簡單的關鍵詞提取）
      const recentTopics = allMessages
        .slice(-20) // 最近20條消息
        .map(m => m.content)
        .join(' ')
        .split(/\s+/)
        .filter(word => word.length > 3)
        .slice(0, 10);
      
      return {
        totalMessages: allMessages.length,
        userMessages: userMessages.length,
        botMessages: botMessages.length,
        totalConversations: conversationIds.size,
        averageMessagesPerConversation: allMessages.length / conversationIds.size || 0,
        mostActiveHours,
        recentTopics
      };
    } catch (error) {
      console.error('獲取聊天統計信息失敗:', error);
      return {
        totalMessages: 0,
        userMessages: 0,
        botMessages: 0,
        totalConversations: 0,
        averageMessagesPerConversation: 0,
        mostActiveHours: [],
        recentTopics: []
      };
    }
  },

  // 新增：智能歷史記錄查詢（供 AI 使用）
  async getIntelligentHistory(context: string, limit: number = 30): Promise<{
    relevantMessages: ChatMessage[];
    summary: string;
    suggestions: string[];
  }> {
    try {
      // 根據上下文搜索相關消息
      const relevantMessages = await chatMemory.searchMessages(context, limit);
      
      // 生成摘要
      const summary = chatMemory.generateSummary(relevantMessages);
      
      // 生成建議
      const suggestions = chatMemory.generateSuggestions(relevantMessages, context);
      
      return {
        relevantMessages,
        summary,
        suggestions
      };
    } catch (error) {
      console.error('智能歷史記錄查詢失敗:', error);
      return {
        relevantMessages: [],
        summary: '無法獲取相關歷史記錄',
        suggestions: []
      };
    }
  },

  // 生成摘要
  generateSummary(messages: ChatMessage[]): string {
    if (messages.length === 0) return '沒有相關的聊天記錄';
    
    const userMessages = messages.filter(m => m.role === 'user');
    const botMessages = messages.filter(m => m.role === 'assistant');
    
    return `找到 ${messages.length} 條相關記錄，包含 ${userMessages.length} 條用戶消息和 ${botMessages.length} 條AI回覆。`;
  },

  // 生成建議
  generateSuggestions(messages: ChatMessage[], _context: string): string[] {
    const suggestions: string[] = [];
    
    if (messages.length === 0) {
      suggestions.push('這是我們第一次討論這個話題');
      return suggestions;
    }
    
    return suggestions;
  }
};

// 偏好設定管理
export const preferenceMemory = {
  async getPreferences(): Promise<UserPreferences | null> {
    // 直接從本地 IndexedDB 讀取（已在初始化時同步）
    const prefs = await db.preferences.get('default');
    return prefs || null;
  },

  async updatePreferences(updates: Partial<UserPreferences>): Promise<void> {
    const existing = await db.preferences.get('default');
    const updatedPrefs: UserPreferences = existing ? {
      ...existing,
      ...updates,
      updatedAt: new Date()
    } as UserPreferences : {
      id: 'default',
      ttsMode: (updates.ttsMode || 'chat-say') as 'chat-say' | 'direct',
      autoplay: updates.autoplay || false,
      volume: updates.volume || 1.0,
      theme: (updates.theme || 'auto') as 'light' | 'dark' | 'auto',
      language: (updates.language || 'zh-TW') as 'zh-TW' | 'en-US',
      backgroundOpacity: updates.backgroundOpacity || 0.3,
      live2dEnabled: updates.live2dEnabled !== undefined ? updates.live2dEnabled : true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...updates
    } as UserPreferences;
    
    // 保存到本地
    if (existing) {
      await db.preferences.put(updatedPrefs);
    } else {
      await db.preferences.add(updatedPrefs);
    }
    
    // 同時保存到服務器（異步，不阻塞）
    import('@/utils/serverSync')
      .then(({ savePreferencesToServer }) => savePreferencesToServer(updates))
      .catch(serverError => {
        console.warn('⚠️ 保存偏好設定到服務器失敗，但已保存到本地:', serverError instanceof Error ? serverError.message : serverError);
      });
  }
};

// 頭像管理
export const avatarMemory = {
  async saveAvatar(avatar: Omit<Avatar, 'id' | 'createdAt'>): Promise<string> {
    const id = `avatar_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.avatars.add({
      ...avatar,
      id,
      createdAt: new Date()
    });
    return id;
  },

  async getAvatar(type: 'user' | 'bot'): Promise<Avatar | null> {
    return await db.avatars.where('type').equals(type).first() || null;
  },

  async deleteAvatar(id: string): Promise<void> {
    await db.avatars.delete(id);
  }
};

// 資料庫維護工具
export const dbMaintenance = {
  async getStats(): Promise<{
    messageCount: number;
    preferenceCount: number;
    avatarCount: number;
    totalSize: number;
  }> {
    const messageCount = await db.messages.count();
    const preferenceCount = await db.preferences.count();
    const avatarCount = await db.avatars.count();
    
    // 估算資料庫大小
    const totalSize = messageCount * 500 + preferenceCount * 200 + avatarCount * 1000;
    
    return {
      messageCount,
      preferenceCount,
      avatarCount,
      totalSize
    };
  },

  async cleanup(): Promise<void> {
    await cleanupOldMessages();
  },

  async exportData(): Promise<{
    messages: ChatMessage[];
    preferences: UserPreferences[];
    avatars: Avatar[];
  }> {
    return {
      messages: await db.messages.toArray(),
      preferences: await db.preferences.toArray(),
      avatars: await db.avatars.toArray()
    };
  },

  async importData(data: {
    messages: ChatMessage[];
    preferences: UserPreferences[];
    avatars: Avatar[];
  }): Promise<void> {
    await db.transaction('rw', [db.messages, db.preferences, db.avatars], async () => {
      await db.messages.clear();
      await db.preferences.clear();
      await db.avatars.clear();
      
      if (data.messages.length > 0) {
        await db.messages.bulkAdd(data.messages);
      }
      if (data.preferences.length > 0) {
        await db.preferences.bulkAdd(data.preferences);
      }
      if (data.avatars.length > 0) {
        await db.avatars.bulkAdd(data.avatars);
      }
    });
  }
};

// 全局導出清理重複消息函數
if (typeof window !== 'undefined') {
  (window as any).removeDuplicateMessages = async () => {
    const count = await chatMemory.removeDuplicateMessages();
    console.log(`🧹 清理完成！刪除了 ${count} 條重複消息`);
    console.log('🔄 請刷新頁面查看結果');
    return count;
  };
}
