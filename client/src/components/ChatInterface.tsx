import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Mic, MicOff, History, Settings, Search } from 'lucide-react';
import ChatMessage from './ChatMessage';
import { ChatMessage as ChatMessageType, ChatRequest } from '@/types';
import { chatMemory, preferenceMemory } from '@/hooks/useMemoryStore';
import HistoryQuery from './HistoryQuery';

interface ChatInterfaceProps {
  themeClass?: 'light' | 'dark';
}

export default function ChatInterface({ themeClass = 'light' }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [userAvatar, setUserAvatar] = useState<string>('');
  const [botAvatar, setBotAvatar] = useState<string>('');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [preferences, setPreferences] = useState<any>({});
  const [showHistory, setShowHistory] = useState(false);
  const [showHistoryQuery, setShowHistoryQuery] = useState(false);
  const [allMessages, setAllMessages] = useState<ChatMessageType[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const messagesPerPage = 20;

  // 處理圖片貼上
  const handlePaste = async (event: React.ClipboardEvent) => {
    const items = event.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          setUploadedFiles(prev => [...prev, file]);
        }
      }
    }
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 智能分段邏輯
  const shouldCreateNewUtterance = (currentContent: string, newText: string): boolean => {
    // 如果當前內容為空，不創建新段落
    if (!currentContent.trim()) return false;
    
    // 檢查是否以句號、問號、驚嘆號結尾
    const endsWithPunctuation = /[。？！.!?]$/.test(currentContent.trim());
    
    // 檢查新文本是否以大寫字母或數字開頭（可能是新句子）
    const startsWithCapital = /^[A-Z0-9]/.test(newText.trim());
    
    // 檢查新文本是否包含換行符
    const containsNewline = newText.includes('\n');
    
    // 如果當前內容以標點符號結尾，且新文本以大寫字母開頭，創建新段落
    if (endsWithPunctuation && startsWithCapital) return true;
    
    // 如果新文本包含換行符，創建新段落
    if (containsNewline) return true;
    
    // 如果新文本很長（超過50個字符），可能是新段落
    if (newText.length > 50) return true;
    
    return false;
  };

  // 智能分段函數 - 生成完成後分段
  const splitMessageIntoSegments = (content: string): string[] => {
    if (!content || content.trim().length === 0) {
      return [];
    }

    // 按段落分割（雙換行）
    const paragraphs = content.split(/\n\s*\n/);
    
    const segments: string[] = [];
    
    for (const paragraph of paragraphs) {
      const trimmedParagraph = paragraph.trim();
      if (trimmedParagraph.length === 0) continue;
      
      // 檢查段落是否很長，需要進一步分割
      if (trimmedParagraph.length > 200) {
        // 按句子分割長段落
        const sentences = trimmedParagraph.split(/(?<=[。？！.!?])\s+/);
        let currentSegment = '';
        
        for (const sentence of sentences) {
          const trimmedSentence = sentence.trim();
          if (trimmedSentence.length === 0) continue;
          
          // 如果當前段落加上新句子會太長，創建新段落
          if (currentSegment.length + trimmedSentence.length > 150) {
            if (currentSegment.length > 0) {
              segments.push(currentSegment.trim());
              currentSegment = '';
            }
          }
          
          currentSegment += (currentSegment ? ' ' : '') + trimmedSentence;
        }
        
        if (currentSegment.length > 0) {
          segments.push(currentSegment.trim());
        }
      } else {
        // 短段落直接添加
        segments.push(trimmedParagraph);
      }
    }
    
    return segments;
  };

  // 智能提取關鍵詞函數 - 使用 AI 判斷
  const extractKeywords = async (text: string): Promise<string[]> => {
    try {
      // 使用 Gemini 來智能提取關鍵詞
      const response = await fetch('/api/extract-keywords', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          model: 'gemini-2.0-flash'
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('🤖 AI 提取的關鍵詞:', result.keywords);
        return result.keywords;
      } else {
        console.warn('AI 關鍵詞提取失敗，使用備用方法');
        return extractKeywordsFallback(text);
      }
    } catch (error) {
      console.warn('AI 關鍵詞提取錯誤，使用備用方法:', error);
      return extractKeywordsFallback(text);
    }
  };

  // 備用關鍵詞提取方法
  const extractKeywordsFallback = (text: string): string[] => {
    // 提取引號內的內容（通常是重要概念）
    const quotedContent = text.match(/[""「」]([^""「」]+)[""「」]/g);
    const quotedKeywords = quotedContent ? quotedContent.map(q => q.replace(/[""「」]/g, '')) : [];
    
    // 提取其他可能的重要詞彙
    const words = text
      .replace(/[""「」]/g, '') // 移除引號
      .replace(/[，。！？；：、]/g, ' ') // 替換中文標點為空格
      .replace(/[,.!?;:,]/g, ' ') // 替換英文標點為空格
      .split(/\s+/)
      .filter(word => 
        word.length >= 2 && // 至少2個字符
        !/^[0-9]+$/.test(word) && // 不是純數字
        !/^[a-zA-Z]+$/.test(word) && // 不是純英文
        word.trim() !== '' // 不是空字符串
      );
    
    // 合併引號內容和其他關鍵詞，去重
    const allKeywords = [...quotedKeywords, ...words];
    const uniqueKeywords = [...new Set(allKeywords)];
    
    // 限制關鍵詞數量，避免過多
    return uniqueKeywords.slice(0, 3);
  };

  // 載入聊天記錄和頭像
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('💬 開始載入對話記錄...');
        
        // 延遲一下，確保 IndexedDB 已經完全初始化
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // 載入消息
        const savedMessages = await chatMemory.getMessages(10000);
        console.log(`💬 從數據庫載入 ${savedMessages.length} 條記錄`);
        
        // 強力去重：根據 ID 和內容
        const messageMap = new Map<string, ChatMessageType>();
        const contentSet = new Set<string>();
        
        for (const msg of savedMessages) {
          // 跳過處理中的消息
          if (msg.processing) continue;
          
          // 創建內容指紋（角色 + 內容 + 時間範圍）
          const contentFingerprint = `${msg.role}_${msg.content}_${Math.floor(new Date(msg.timestamp).getTime() / 60000)}`; // 1分鐘內算相同
          
          // 如果這個內容指紋已經存在，跳過
          if (contentSet.has(contentFingerprint)) {
            console.log(`⚠️ 發現重複消息，已跳過: ${msg.id}`);
            continue;
          }
          
          contentSet.add(contentFingerprint);
          messageMap.set(msg.id, msg);
        }
        
        const uniqueMessages = Array.from(messageMap.values());
        
        // 按時間排序
        const sortedMessages = uniqueMessages
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
          .slice(-100); // 顯示最近100條
        
        setMessages(sortedMessages);
        console.log(`💬 顯示 ${sortedMessages.length} 條對話（已去重和清理）`);
        
        // 從 preferences 載入頭像和設定
        const preferences = await preferenceMemory.getPreferences();
        setPreferences(preferences);
        if (preferences?.userAvatar) setUserAvatar(preferences.userAvatar);
        if (preferences?.botAvatar) setBotAvatar(preferences.botAvatar);
        
        console.log('✅ 對話記錄載入完成');
      } catch (error) {
        console.error('❌ 載入對話數據失敗:', error);
      }
    };
    
    loadData();


    
    // 移除自動批量向量化，改為只在第一次搜索時按需構建
    console.log('🧠 向量記憶系統已初始化，將在第一次搜索時按需構建數據庫');

    // 監聽頭像更新事件
    const handleAvatarUpdate = (e: CustomEvent) => {
      if (e.detail.userAvatar) setUserAvatar(e.detail.userAvatar);
      if (e.detail.botAvatar) setBotAvatar(e.detail.botAvatar);
    };

    // 監聽偏好設定更新事件
    const handlePreferencesUpdate = async () => {
      const updatedPreferences = await preferenceMemory.getPreferences();
      setPreferences(updatedPreferences);
    };

    window.addEventListener('avatarUpdated', handleAvatarUpdate as EventListener);
    window.addEventListener('preferencesUpdated', handlePreferencesUpdate);

    return () => {
      window.removeEventListener('avatarUpdated', handleAvatarUpdate as EventListener);
      window.removeEventListener('preferencesUpdated', handlePreferencesUpdate);
    };
  }, []);

  // 自動滾動到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 追蹤是否應該滾動到底部
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true);

  useEffect(() => {
    if (shouldScrollToBottom) {
      scrollToBottom();
    }
  }, [messages, shouldScrollToBottom]);

  // 載入歷史記錄
  const loadHistory = async () => {
    try {
      const allSavedMessages = await chatMemory.getMessages(1000); // 載入大量消息
      setAllMessages(allSavedMessages);
      setShowHistory(true);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  };

  // 刪除訊息
  const deleteMessage = async (messageId: string) => {
    try {
      // 從記憶體中刪除
      await chatMemory.deleteMessage(messageId);
      
      // 從 UI 中移除，但不觸發滾動
      setMessages(prev => {
        const newMessages = prev.filter(msg => msg.id !== messageId);
        // 如果刪除的是最後一條訊息，不滾動
        if (newMessages.length < prev.length) {
          setShouldScrollToBottom(false);
        }
        return newMessages;
      });
      
      setAllMessages(prev => prev.filter(msg => msg.id !== messageId));
      
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  };

  // 發送訊息
  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    // 重新啟用自動滾動
    setShouldScrollToBottom(true);

    // 處理圖片文件
    const imageFiles = uploadedFiles.filter(file => file.type.startsWith('image/'));
    const imageUrls: string[] = [];
    
    for (const imageFile of imageFiles) {
      const base64 = await fileToBase64(imageFile);
      imageUrls.push(base64);
    }
    
    const userMessage: ChatMessageType = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content: inputText.trim(),
      timestamp: new Date(),
      attachments: imageUrls // 保存圖片附件
    };

    setMessages(prev => [...prev, userMessage]);
    await chatMemory.saveMessage(userMessage);
    setInputText('');
    setUploadedFiles([]); // 清空已上傳的檔案
    setIsLoading(true);
    setIsProcessing(true);

    try {
      // 使用向量搜尋進行歷史記錄搜索
      console.log('🧠 使用向量搜尋歷史記錄...');
      
      let relevantHistory: any[] = [];
      
      try {
        // 先檢查向量搜尋服務狀態
        const statusResponse = await fetch('/api/vector-memory/status');
        const statusResult = await statusResponse.json();
        
        if (statusResult.success && statusResult.status.apiKeyConfigured) {
          console.log('🧠 向量搜尋服務可用，開始搜尋...');
          
          // 嘗試使用向量搜尋
          // 獲取真正的聊天記錄，包括所有歷史消息
          const allMessages = await chatMemory.getMessages(10000);
          console.log(`🔍 從 IndexedDB 獲取到 ${allMessages.length} 條真實聊天記錄`);
          
          // 修復：確保時間戳格式正確
          const normalizedMessages = allMessages.map(msg => ({
            ...msg,
            timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : msg.timestamp
          }));
          
          const vectorResponse = await fetch('/api/vector-memory/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: inputText.trim(),
              messages: normalizedMessages, // 使用標準化的消息
              topK: 20
            })
          });

          if (vectorResponse.ok) {
            const vectorResult = await vectorResponse.json();
            console.log('🧠 向量搜尋成功:', vectorResult.totalFound, '條結果');
            
            // 將搜尋結果轉換為可用的歷史記錄
            relevantHistory = [];
            for (const result of vectorResult.results) {
              if (result.text) {
                // 檢查是否包含用戶和助手的對話
                if (result.text.includes('用戶:') && result.text.includes('助手:')) {
                  const lines = result.text.split('\n');
                  const userLine = lines.find((line: string) => line.startsWith('用戶:'));
                  const assistantLine = lines.find((line: string) => line.startsWith('助手:'));
                  
                  if (userLine && assistantLine) {
                    const userContent = userLine.replace('用戶:', '').trim();
                    const assistantContent = assistantLine.replace('助手:', '').trim();
                    
                    if (userContent && assistantContent) {
                      relevantHistory.push({
                        role: 'user',
                        content: userContent,
                        score: result.score
                      });
                      relevantHistory.push({
                        role: 'assistant',
                        content: assistantContent,
                        score: result.score
                      });
                    }
                  }
                } else {
                  // 如果沒有用戶/助手標記，直接作為內容使用
                  relevantHistory.push({
                    role: 'assistant',
                    content: result.text,
                    score: result.score
                  });
                }
              }
            }
            
            // 按分數排序
            relevantHistory.sort((a, b) => (b.score || 0) - (a.score || 0));
            
            if (relevantHistory.length > 0) {
              console.log('📝 向量搜尋結果樣本:', relevantHistory.slice(0, 3).map(m => ({ 
                role: m.role, 
                content: m.content.substring(0, 50) + '...',
                score: m.score
              })));
            }
          } else {
            const errorText = await vectorResponse.text();
            console.error('❌ 向量搜尋請求失敗:', vectorResponse.status, errorText);
            throw new Error(`向量搜尋請求失敗: ${vectorResponse.status}`);
          }
        } else {
          console.warn('⚠️ 向量搜尋服務不可用:', statusResult);
          throw new Error('向量搜尋服務未配置');
        }
      } catch (vectorError) {
        console.warn('向量搜尋失敗，使用關鍵詞搜尋作為備用:', vectorError);
        
        // 備用方案：關鍵詞搜尋
        const keywords = await extractKeywords(inputText.trim());
        console.log('🔍 備用關鍵詞搜尋:', keywords);
        
        if (keywords.length > 0) {
          const allResults = new Map<string, any>();
          
          for (const keyword of keywords) {
            const results = await chatMemory.searchMessages(keyword, 1000);
            results.forEach(msg => {
              if (!allResults.has(msg.id)) {
                allResults.set(msg.id, msg);
              }
            });
          }
          
          const resultsArray = Array.from(allResults.values());
          const scoredResults = resultsArray.map(msg => {
            const content = msg.content.toLowerCase();
            const score = keywords.filter(keyword => 
              content.includes(keyword.toLowerCase())
            ).length;
            return { ...msg, score };
          });
          
          const sortedResults = scoredResults.sort((a, b) => {
            if (b.score !== a.score) {
              return b.score - a.score;
            }
            return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          });
          
          relevantHistory = sortedResults.slice(0, 20).map(msg => ({
            role: msg.role,
            content: msg.content.trim()
          }));
          
          console.log('📚 關鍵詞搜尋結果:', relevantHistory.length, '條');
        }
      }
      
      const recentHistory = messages.slice(-10).filter(msg => msg.content && msg.content.trim()).map(msg => ({
        role: msg.role,
        content: msg.content.trim()
      }));
      
      console.log('🕐 最近歷史記錄:', recentHistory.length, '條');
      console.log('🎯 相關歷史記錄:', relevantHistory.length, '條');
      console.log('📨 總歷史記錄發送給 AI:', recentHistory.length + relevantHistory.length, '條');
      
      // 參考 CABM：將記憶直接注入到用戶消息中
      let messageWithMemory = inputText.trim();
      
      if (relevantHistory.length > 0) {
        // 格式化記憶內容（改進格式）
        const memoryContent = relevantHistory.map(msg => 
          `${msg.role === 'user' ? '用戶' : '助手'}: ${msg.content}`
        ).join('\n\n');
        
        const memoryPrompt = `請仔細閱讀以下相關的歷史記錄，這些是我們之前討論過的內容。請基於這些記錄來回答，不要說"我不記得"。如果用戶要求完整的故事，請盡可能提供完整的內容：\n\n${memoryContent}\n\n現在用戶說：`;
        
        messageWithMemory = memoryPrompt + inputText.trim();
        
        console.log('🧠 記憶已注入到用戶消息中，記憶內容:', memoryContent.substring(0, 100) + '...');
      }
      
      // 添加最近的對話作為上下文，幫助 AI 理解用戶意圖
      const contextHistory = recentHistory.slice(-5); // 最近5條對話
      
      const request: ChatRequest = {
        message: messageWithMemory,
        images: imageUrls, // 使用已處理的圖片
        personality: preferences.aiPersonality,
        customPersonalityText: preferences.customPersonalityText,
        history: contextHistory, // 發送最近歷史作為上下文
        jailbreakEnabled: preferences.jailbreakEnabled
      };

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const assistantMessage: ChatMessageType = {
        id: `msg_${Date.now()}_assistant`,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        utterances: [],
        citations: [],
        processing: true
      };

      setMessages(prev => [...prev, assistantMessage]);
      // 不要在這裡保存，等完成後再保存，避免重複

      // 處理 SSE 串流
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if ((line as string).startsWith('data: ')) {
            try {
              const sseData = JSON.parse((line as string).substring(6));
              const { type: event, data } = sseData;

            if (event === 'utterance') {
              // 檢查文字內容，避免空白氣泡
              const textContent = data.text ? data.text.trim() : '';
              if (textContent.length > 0) {
                // 保存 turnId 和 candidateId 到訊息中
                const turnId = data.turnId;
                const candidateId = data.candidateId;
                
                console.log('Received utterance with IDs:', { turnId, candidateId });
                
                // 累積所有文本到當前消息
                assistantMessage.content = (assistantMessage.content || '') + textContent;
                assistantMessage.turnId = turnId;
                assistantMessage.candidateId = candidateId;
                
                setMessages(prev => prev.map(msg => 
                  msg.id === assistantMessage.id 
                    ? { ...msg, content: assistantMessage.content, turnId, candidateId }
                    : msg
                ));
                // 不要在串流過程中保存，只更新 UI
              }
            } else if (event === 'citation') {
              setMessages(prev => prev.map(msg => 
                msg.id === assistantMessage.id 
                  ? {
                      ...msg,
                      citations: [...(msg.citations || []), data]
                    }
                  : msg
              ));
              assistantMessage.citations = [...(assistantMessage.citations || []), data];
              // 不要在串流過程中保存
            } else if (event === 'meta') {
              setMessages(prev => prev.map(msg => 
                msg.id === assistantMessage.id 
                  ? {
                      ...msg,
                      route: data.route
                    }
                  : msg
              ));
              assistantMessage.route = data.route;
              // 不要在串流過程中保存
            } else if (event === 'error') {
              setMessages(prev => prev.map(msg => 
                msg.id === assistantMessage.id 
                  ? {
                      ...msg,
                      content: msg.content || `錯誤：${data.message}`,
                      processing: false
                    }
                  : msg
              ));
              assistantMessage.content = assistantMessage.content || `錯誤：${data.message}`;
              assistantMessage.processing = false;
              await chatMemory.saveMessage(assistantMessage);
            } else if (event === 'done') {
              // 生成完成後進行智能分段
              if (assistantMessage.content) {
                const segments = splitMessageIntoSegments(assistantMessage.content);
                
                if (segments.length > 1) {
                  // 如果有多個段落，創建多個消息
                  const newMessages: ChatMessageType[] = [];
                  const baseTimestamp = new Date().getTime();
                  
                  segments.forEach((segment: string, index: number) => {
                    const segmentMessage: ChatMessageType = {
                      id: `segment_${assistantMessage.id}_${index}`,
                      role: 'assistant',
                      content: segment,
                      timestamp: new Date(baseTimestamp + index), // 確保順序正確
                      processing: false,
                      turnId: assistantMessage.turnId,
                      candidateId: assistantMessage.candidateId,
                      route: assistantMessage.route,
                      citations: assistantMessage.citations
                    };
                    newMessages.push(segmentMessage);
                  });
                  
                  // 移除原始消息，添加分段後的消息
                  setMessages(prev => {
                    const filtered = prev.filter(msg => msg.id !== assistantMessage.id);
                    return [...filtered, ...newMessages];
                  });
                  
                  // 從記憶庫中刪除原始消息，保存分段後的消息
                  await chatMemory.deleteMessage(assistantMessage.id);
                  for (const segmentMessage of newMessages) {
                    await chatMemory.saveMessage(segmentMessage);
                  }
                } else {
                  // 只有一個段落，直接標記為完成
                  setMessages(prev => prev.map(msg => 
                    msg.id === assistantMessage.id 
                      ? { ...msg, processing: false }
                      : msg
                  ));
                  assistantMessage.processing = false;
                  await chatMemory.saveMessage(assistantMessage);
                }
              } else {
                // 沒有內容，直接標記為完成
                setMessages(prev => prev.map(msg => 
                  msg.id === assistantMessage.id 
                    ? { ...msg, processing: false }
                    : msg
                ));
                assistantMessage.processing = false;
                await chatMemory.saveMessage(assistantMessage);
              }
              
              // 立即重置所有處理狀態
              setIsProcessing(false);
              setIsLoading(false);
              
              // 將新對話添加到向量記憶中
              try {
                console.log('💾 將新對話添加到向量記憶...');
                const addResponse = await fetch('/api/vector-memory/add', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    userMessage: userMessage.content,
                    assistantMessage: assistantMessage.content
                  })
                });
                
                if (addResponse.ok) {
                  console.log('✅ 新對話已添加到向量記憶');
                } else {
                  console.warn('❌ 添加對話到向量記憶失敗');
                }
              } catch (error) {
                console.warn('❌ 向量記憶添加對話時發生錯誤:', error);
              }
            }
            } catch (error) {
              console.error('Failed to parse SSE data:', error);
            }
          }
        }
      }

    } catch (error) {
      console.error('Send message failed:', error);
      
      const errorMessage: ChatMessageType = {
        id: `msg_${Date.now()}_error`,
        role: 'assistant',
        content: `發生錯誤：${error instanceof Error ? error.message : '未知錯誤'}`,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setIsProcessing(false);
    }
  };

  // 處理鍵盤事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // 語音輸入（佔位功能）
  const toggleVoiceInput = () => {
    setIsListening(!isListening);
    // 這裡將來會實作語音識別
  };

  // 檔案上傳處理
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      setUploadedFiles(prev => [...prev, ...files]);
      
      // 分離圖片文件和其他文件
      const imageFiles = files.filter(file => file.type.startsWith('image/'));
      const otherFiles = files.filter(file => !file.type.startsWith('image/'));
      
      // 只處理非圖片文件，圖片文件會在發送消息時處理
      let fileContents = '';
      for (const file of otherFiles) {
        try {
          if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md') || 
              file.name.endsWith('.py') || file.name.endsWith('.js') || file.name.endsWith('.ts') ||
              file.name.endsWith('.json') || file.name.endsWith('.xml') || file.name.endsWith('.csv')) {
            
            const content = await file.text();
            fileContents += `\n\n[檔案內容 - ${file.name}]:\n${content}\n`;
          } else {
            fileContents += `\n[檔案: ${file.name} (${(file.size / 1024).toFixed(1)}KB) - 二進制檔案]`;
          }
        } catch (error) {
          console.error('Error reading file:', error);
          fileContents += `\n[檔案: ${file.name} (${(file.size / 1024).toFixed(1)}KB) - 讀取失敗]`;
        }
      }
      
      if (fileContents) {
        setInputText(prev => prev + fileContents);
      }
    }
  };

  // 檔案轉 Base64 函數
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };



  return (
    <div className="flex flex-col h-full">
      {/* 標題列 */}
      <div className={`${themeClass === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-6 py-4`}>
        <div className="flex items-center justify-between">
          <h1 className={`text-xl font-semibold ${themeClass === 'dark' ? 'text-white' : 'text-gray-900'}`}>Igasaki</h1>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowHistoryQuery(true)}
              className={`p-2 ${themeClass === 'dark' ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'} rounded-lg transition-colors duration-150`}
              title="智能歷史記錄查詢"
            >
              <Search className="w-5 h-5" />
            </button>
            <button
              onClick={loadHistory}
              className={`p-2 ${themeClass === 'dark' ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'} rounded-lg transition-colors duration-150`}
              title="查看歷史記錄"
            >
              <History className="w-5 h-5" />
            </button>

          </div>
        </div>
      </div>

      {/* 歷史記錄彈窗 - 星穹鐵道風格 */}
      {showHistory && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 backdrop-blur-sm"
          onClick={() => setShowHistory(false)}
        >
          <div 
            className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl shadow-2xl max-w-5xl w-full mx-4 max-h-[85vh] flex flex-col border border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 標題欄 - 星穹鐵道風格 */}
            <div className="bg-gradient-to-r from-blue-900 via-purple-900 to-blue-900 px-8 py-6 rounded-t-2xl border-b border-gray-700 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-500 rounded-lg flex items-center justify-center">
                  <History className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-xl font-bold text-white tracking-wide">歷史紀錄</h2>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                className="w-8 h-8 bg-gray-700 hover:bg-gray-600 rounded-lg flex items-center justify-center text-gray-300 hover:text-white transition-colors duration-200"
              >
                ✕
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-gray-900 to-gray-800">
              {allMessages.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                    <History className="w-10 h-10 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3 tracking-wide">尚未開始旅程</h3>
                  <p className="text-gray-300 max-w-md mx-auto leading-relaxed">
                    開始與 AI 助手的對話後，您的精彩回憶將在這裡永恆保存。
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {allMessages
                      .slice((currentPage - 1) * messagesPerPage, currentPage * messagesPerPage)
                      .map((message, index) => (
                        <div
                          key={message.id}
                          className="bg-gradient-to-r from-gray-800 to-gray-700 rounded-xl border border-gray-600 p-4 hover:border-gray-500 transition-all duration-200 shadow-lg"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center space-x-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center overflow-hidden ${
                                message.role === 'user' 
                                  ? (userAvatar ? '' : 'bg-gradient-to-br from-blue-500 to-blue-600')
                                  : (botAvatar ? '' : 'bg-gradient-to-br from-purple-500 to-purple-600')
                              }`}>
                                {message.role === 'user' ? (
                                  userAvatar ? (
                                    <img src={userAvatar} alt="用戶頭像" className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-white text-sm font-bold">U</span>
                                  )
                                ) : (
                                  botAvatar ? (
                                    <img src={botAvatar} alt="機器人頭像" className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-white text-sm font-bold">A</span>
                                  )
                                )}
                              </div>
                              <div>
                                <span className={`text-sm font-bold ${
                                  message.role === 'user' 
                                    ? 'text-blue-400' 
                                    : 'text-purple-400'
                                }`}>
                                  {message.role === 'user' ? (preferences?.userName || 'You') : 'Igasaki'}
                                </span>
                                <div className="text-xs text-gray-400 mt-1">
                                  {new Date(message.timestamp).toLocaleString()}
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => deleteMessage(message.id)}
                              className="w-6 h-6 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center text-white text-xs transition-colors duration-200"
                              title="刪除記錄"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="text-sm text-gray-200 leading-relaxed">
                            {message.content.length > 150 
                              ? `${message.content.substring(0, 150)}...` 
                              : message.content
                            }
                          </div>
                        </div>
                      ))
                    }
                  </div>
                  
                  {/* 分頁控制 - 星穹鐵道風格 */}
                  <div className="flex items-center justify-center space-x-4 mt-8">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                        currentPage === 1
                          ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                          : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg hover:shadow-xl'
                      }`}
                    >
                      上一頁
                    </button>
                    <div className="bg-gray-800 px-6 py-2 rounded-lg border border-gray-600">
                      <span className="text-white font-medium">
                        第 {currentPage} 頁，共 {Math.ceil(allMessages.length / messagesPerPage)} 頁
                      </span>
                    </div>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(Math.ceil(allMessages.length / messagesPerPage), prev + 1))}
                      disabled={currentPage >= Math.ceil(allMessages.length / messagesPerPage)}
                      className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                        currentPage >= Math.ceil(allMessages.length / messagesPerPage)
                          ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                          : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg hover:shadow-xl'
                      }`}
                    >
                      下一頁
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 訊息區域 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mic className="w-8 h-8 text-white" />
            </div>
            <h3 className={`text-lg font-medium ${themeClass === 'dark' ? 'text-white' : 'text-gray-900'} mb-2`}>開始對話</h3>
            <p className={`${themeClass === 'dark' ? 'text-gray-300' : 'text-gray-500'} max-w-md mx-auto`}>
              歡迎使用個人 AI 助手！我支援智能內容路由、實時搜尋、語音合成和永久記憶功能。有什麼我可以幫助您的嗎？
            </p>
          </div>
                ) : (
          messages.map((message, index) => {
            // 檢查是否為連續消息
            const prevMessage = index > 0 ? messages[index - 1] : null;
            const nextMessage = index < messages.length - 1 ? messages[index + 1] : null;
            
            const isConsecutive = prevMessage && 
              prevMessage.role === message.role && 
              !message.processing &&
              (new Date(message.timestamp).getTime() - new Date(prevMessage.timestamp).getTime()) < 60000; // 1分鐘內
            
            const isLastInSequence = !nextMessage || 
              nextMessage.role !== message.role || 
              (new Date(nextMessage.timestamp).getTime() - new Date(message.timestamp).getTime()) >= 60000;
            
            return (
              <ChatMessage 
                key={message.id} 
                message={message} 
                userAvatar={userAvatar}
                botAvatar={botAvatar}
                preferences={preferences}
                onDelete={deleteMessage}
                showHeader={!isConsecutive}
                showTime={isLastInSequence}
              />
            );
          })
        )}
        
        {isLoading && (
          <div className="flex justify-center">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* 歷史記錄查詢模態框 */}
      <HistoryQuery
        isOpen={showHistoryQuery}
        onClose={() => setShowHistoryQuery(false)}
        onSelectMessage={(message) => {
          // 當用戶選擇一條歷史記錄時，可以將其內容複製到輸入框
          setInputText(message.content);
          setShowHistoryQuery(false);
        }}
        userAvatar={userAvatar}
        botAvatar={botAvatar}
        userName={preferences?.userName || '用戶'}
        botName="Igasaki"
      />

      {/* 輸入區域 */}
      <div className={`${themeClass === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-t p-6`}>
        <div className="flex items-center space-x-3">
          <button
            onClick={triggerFileUpload}
            className={`p-2 ${themeClass === 'dark' ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'} rounded-lg transition-colors duration-150`}
            title="上傳檔案"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          
          {/* 隱藏的檔案輸入 */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.txt,.md,.py,.js,.ts,.jsx,.tsx,.html,.css,.json,.xml,.csv,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.7z,.mp4,.mp3,.wav,.avi,.mov"
            onChange={handleFileUpload}
            className="hidden"
          />

          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="輸入訊息... (Ctrl+V 貼上圖片)"
              className={`w-full px-4 py-3 border rounded-lg resize-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors duration-150 ${
                themeClass === 'dark' 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'border-gray-300'
              }`}
              rows={Math.min(Math.max(inputText.split('\n').length, 1), 5)}
              disabled={isLoading || isProcessing}
            />
          </div>

          <button
            onClick={sendMessage}
            disabled={!inputText.trim() || isLoading || isProcessing}
            className="px-4 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 flex items-center space-x-2"
          >
            <Send className="w-4 h-4" />
            <span>發送</span>
          </button>
        </div>

        {/* 檔案預覽區域 */}
        {uploadedFiles.length > 0 && (
          <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="flex flex-wrap gap-2">
              {uploadedFiles.map((file, index) => (
                <div key={index} className="flex items-center space-x-2 px-3 py-2 bg-white dark:bg-gray-600 rounded-md border">
                  {file.type.startsWith('image/') ? (
                    <img 
                      src={URL.createObjectURL(file)} 
                      alt={file.name}
                      className="w-8 h-8 object-cover rounded"
                    />
                  ) : (
                    <div className="w-8 h-8 bg-gray-200 dark:bg-gray-500 rounded flex items-center justify-center">
                      <span className="text-xs text-gray-500 dark:text-gray-400">📄</span>
                    </div>
                  )}
                  <span className="text-sm text-gray-700 dark:text-gray-300">{file.name}</span>
                  <button
                    onClick={() => removeFile(index)}
                    className="text-red-500 hover:text-red-700 text-sm"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={`flex justify-between items-center mt-3 text-xs ${themeClass === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
          <span>按 Enter 發送，Shift+Enter 換行</span>
                          {/* 移除字數限制顯示 */}
        </div>
      </div>
    </div>
  );
}
