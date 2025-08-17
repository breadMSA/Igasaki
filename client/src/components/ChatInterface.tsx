import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Mic, MicOff } from 'lucide-react';
import ChatMessage from './ChatMessage';
import { ChatMessage as ChatMessageType, ChatRequest } from '@/types';

export default function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 自動滾動到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 發送訊息
  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage: ChatMessageType = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content: inputText.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    try {
      const request: ChatRequest = {
        message: inputText.trim(),
        history: messages.slice(-10).map(msg => ({
          role: msg.role,
          content: msg.content
        }))
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
          if (line.startsWith('event: ') && lines[lines.indexOf(line) + 1]?.startsWith('data: ')) {
            const event = line.substring(7);
            const dataLine = lines[lines.indexOf(line) + 1];
            const data = JSON.parse(dataLine.substring(6));

            if (event === 'utterance') {
              setMessages(prev => prev.map(msg => 
                msg.id === assistantMessage.id 
                  ? {
                      ...msg,
                      content: msg.content + (msg.content ? '\n\n' : '') + data.text,
                      utterances: [...(msg.utterances || []), data.text]
                    }
                  : msg
              ));
            } else if (event === 'citation') {
              setMessages(prev => prev.map(msg => 
                msg.id === assistantMessage.id 
                  ? {
                      ...msg,
                      citations: [...(msg.citations || []), data]
                    }
                  : msg
              ));
            } else if (event === 'meta') {
              setMessages(prev => prev.map(msg => 
                msg.id === assistantMessage.id 
                  ? {
                      ...msg,
                      route: data.route
                    }
                  : msg
              ));
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
            } else if (event === 'done') {
              setMessages(prev => prev.map(msg => 
                msg.id === assistantMessage.id 
                  ? {
                      ...msg,
                      processing: false
                    }
                  : msg
              ));
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

  return (
    <div className="flex flex-col h-full">
      {/* 標題列 */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">個人 AI 助手</h1>
        <p className="text-sm text-gray-500">智能對話、語音合成、永久記憶</p>
      </div>

      {/* 訊息區域 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mic className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">開始對話</h3>
            <p className="text-gray-500 max-w-md mx-auto">
              歡迎使用個人 AI 助手！我支援智能內容路由、實時搜尋、語音合成和永久記憶功能。有什麼我可以幫助您的嗎？
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))
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

      {/* 輸入區域 */}
      <div className="bg-white border-t border-gray-200 p-6">
        <div className="flex items-end space-x-3">
          <button
            onClick={() => {}}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors duration-150"
            title="上傳檔案"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="輸入訊息..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors duration-150"
              rows={Math.min(Math.max(inputText.split('\n').length, 1), 5)}
              disabled={isLoading}
            />
          </div>

          <button
            onClick={toggleVoiceInput}
            className={`p-2 rounded-lg transition-colors duration-150 ${
              isListening 
                ? 'text-red-600 bg-red-100 hover:bg-red-200' 
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
            title={isListening ? '停止語音輸入' : '開始語音輸入'}
          >
            {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <button
            onClick={sendMessage}
            disabled={!inputText.trim() || isLoading}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 flex items-center space-x-2"
          >
            <Send className="w-4 h-4" />
            <span>發送</span>
          </button>
        </div>

        <div className="flex justify-between items-center mt-3 text-xs text-gray-500">
          <span>按 Enter 發送，Shift+Enter 換行</span>
          <span>{inputText.length}/2000</span>
        </div>
      </div>
    </div>
  );
}
