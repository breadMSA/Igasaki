import { useState, useEffect, useCallback } from 'react';
import { Conversation, CreateConversationRequest, UpdateConversationRequest } from '@/types';

interface UseConversationsReturn {
  conversations: Conversation[];
  activeConversationId: string | null;
  isLoading: boolean;
  error: string | null;
  createConversation: (request?: CreateConversationRequest) => Promise<Conversation>;
  updateConversation: (id: string, request: UpdateConversationRequest) => Promise<Conversation>;
  deleteConversation: (id: string) => Promise<void>;
  setActiveConversationId: (id: string | null) => void;
  refreshConversations: () => Promise<void>;
}

export const useConversations = (): UseConversationsReturn => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 從 localStorage 載入活躍對話串 ID
  useEffect(() => {
    const savedActiveId = localStorage.getItem('activeConversationId');
    if (savedActiveId) {
      setActiveConversationId(savedActiveId);
    }
  }, []);

  // 保存活躍對話串 ID 到 localStorage
  useEffect(() => {
    if (activeConversationId) {
      localStorage.setItem('activeConversationId', activeConversationId);
    } else {
      localStorage.removeItem('activeConversationId');
    }
  }, [activeConversationId]);

  // 獲取對話串列表
  const fetchConversations = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/conversations');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      const conversationsList = data.conversations || [];
      
      // 如果沒有對話串，創建一個空的新聊天室
      if (conversationsList.length === 0) {
        try {
          const createResponse = await fetch('/api/conversations', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              title: '新聊天室',
              settings: { sharedMemory: true }
            }),
          });
          
          if (createResponse.ok) {
            const newConversation = await createResponse.json();
            setConversations([newConversation]);
            setActiveConversationId(newConversation.id);
            return;
          }
        } catch (error) {
          console.error('Failed to create default conversation:', error);
        }
      }
      
      setConversations(conversationsList);
      
      // 如果沒有活躍對話串，選擇第一個
      if (!activeConversationId && conversationsList.length > 0) {
        setActiveConversationId(conversationsList[0].id);
      }
      
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch conversations');
    } finally {
      setIsLoading(false);
    }
  }, [activeConversationId]);

  // 修復：自動生成聊天室標題
  const generateConversationTitle = useCallback(async (conversationId: string): Promise<void> => {
    try {
      // 獲取對話串的前幾條消息
      const response = await fetch(`/api/conversations/${conversationId}/messages`);
      if (!response.ok) return;
      
      const messages = await response.json();
      if (messages.length < 2) return; // 至少需要一輪問答
      
      // 提取用戶的第一個問題和AI的第一個回答
      const userMessage = messages.find((m: any) => m.role === 'user')?.content || '';
      const assistantMessage = messages.find((m: any) => m.role === 'assistant')?.content || '';
      
      if (!userMessage) return;
      
      // 請求後端生成標題
      const titleResponse = await fetch('/api/conversations/generate-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: userMessage.substring(0, 200),
          assistantMessage: assistantMessage.substring(0, 200)
        })
      });
      
      if (titleResponse.ok) {
        const { title } = await titleResponse.json();
        // 更新對話串標題
        await updateConversation(conversationId, { title: title.substring(0, 50) });
        console.log(`✅ 自動生成標題: ${title}`);
      }
    } catch (error) {
      console.error('Failed to generate conversation title:', error);
    }
  }, []);

  // 創建新對話串
  const createConversation = useCallback(async (request?: CreateConversationRequest): Promise<Conversation> => {
    try {
      setError(null);
      
      // 修復：新聊天室預設為非共享記憶，確保完全隔離
      const defaultRequest = {
        title: '新聊天室',
        settings: { sharedMemory: false }, // 預設為非共享記憶，確保新聊天室不會接續其他話題
        ...request
      };
      
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(defaultRequest),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const newConversation = await response.json();
      setConversations(prev => [newConversation, ...prev]);
      setActiveConversationId(newConversation.id);
      
      console.log('✅ 創建新聊天室，預設為非共享記憶模式，確保隔離');
      
      return newConversation;
    } catch (error) {
      console.error('Failed to create conversation:', error);
      setError(error instanceof Error ? error.message : 'Failed to create conversation');
      throw error;
    }
  }, []);

  // 更新對話串
  const updateConversation = useCallback(async (id: string, request: UpdateConversationRequest): Promise<Conversation> => {
    try {
      setError(null);
      
      const response = await fetch(`/api/conversations/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const updatedConversation = await response.json();
      setConversations(prev => 
        prev.map(conv => conv.id === id ? updatedConversation : conv)
      );
      
      return updatedConversation;
    } catch (error) {
      console.error('Failed to update conversation:', error);
      setError(error instanceof Error ? error.message : 'Failed to update conversation');
      throw error;
    }
  }, []);

  // 刪除對話串
  const deleteConversation = useCallback(async (id: string): Promise<void> => {
    try {
      setError(null);
      
      const response = await fetch(`/api/conversations/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      setConversations(prev => prev.filter(conv => conv.id !== id));
      
      // 修復：刪除IndexedDB中的相關訊息
      try {
        const { chatMemory } = await import('@/hooks/useMemoryStore');
        await (chatMemory as any).deleteConversation(id);
        console.log('✅ 已從 IndexedDB 刪除對話串相關訊息');
      } catch (error) {
        console.warn('Failed to delete messages from IndexedDB:', error);
      }
      
      // 如果刪除的是活躍對話串，切換到其他對話串
      if (activeConversationId === id) {
        const remainingConversations = conversations.filter(conv => conv.id !== id);
        if (remainingConversations.length > 0) {
          setActiveConversationId(remainingConversations[0].id);
        } else {
          setActiveConversationId(null);
        }
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete conversation');
      throw error;
    }
  }, [activeConversationId, conversations]);

  // 刷新對話串列表
  const refreshConversations = useCallback(async () => {
    await fetchConversations();
  }, [fetchConversations]);

  // 初始載入
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  return {
    conversations,
    activeConversationId,
    isLoading,
    error,
    createConversation,
    updateConversation,
    deleteConversation,
    setActiveConversationId,
    refreshConversations,
    generateConversationTitle,
  };
};
