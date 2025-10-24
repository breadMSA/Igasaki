
import { useState } from 'react';
import { User, Bot, Copy, Check, Play, Pause, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { ChatMessage as ChatMessageType } from '@/types';

interface ChatMessageProps {
  message: ChatMessageType;
  userAvatar?: string;
  botAvatar?: string;
  preferences?: any;
  onDelete?: (messageId: string) => void;
  showHeader?: boolean;
  showTime?: boolean;
}

export default function ChatMessage({ message, userAvatar, botAvatar, preferences, onDelete, showHeader = true, showTime = true }: ChatMessageProps) {
  const [loadingAudio, setLoadingAudio] = useState<number | null>(null);
  const [playingUtterance, setPlayingUtterance] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy text:', error);
    }
  };

  const playUtterance = async (text: string, index: number) => {
    if (loadingAudio === index) return;

    try {
      setLoadingAudio(index);
      
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error('TTS request failed');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.addEventListener('ended', () => {
        setPlayingUtterance(null);
        URL.revokeObjectURL(audioUrl);
      });

      if (playingUtterance === index) {
        audio.pause();
        setPlayingUtterance(null);
      } else {
        if (playingUtterance !== null) {
          // 停止其他正在播放的音頻
          const currentAudio = document.querySelector('audio');
          if (currentAudio) {
            currentAudio.pause();
          }
        }
        audio.play();
        setPlayingUtterance(index);
      }
    } catch (error) {
      console.error('Failed to play audio:', error);
    } finally {
      setLoadingAudio(null);
    }
  };

  const renderCitations = () => {
    if (!message.citations || message.citations.length === 0) {
      return null;
    }

    return (
      <div className="mt-3 space-y-2">
        {message.citations.map((citation: any, index: number) => (
          <div key={index} className="p-2 bg-gray-800 rounded-lg border border-gray-600">
            {citation.title && (
              <div className="font-medium text-blue-400 mb-1">{citation.title}</div>
            )}
            {citation.snippet && (
              <div className="text-sm text-gray-300 mb-1">{citation.snippet}</div>
            )}
            <a
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:text-blue-400 underline"
            >
              查看來源
            </a>
          </div>
        ))}
      </div>
    );
  };


  return (
    <div className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
      {/* 名稱和頭像 - 只在需要時顯示 */}
      {showHeader && (
        <div className={`flex items-center space-x-2 mb-2 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
          <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center overflow-hidden ${
            message.role === 'user' 
              ? (userAvatar ? '' : 'bg-blue-600 text-white')
              : (botAvatar ? '' : 'bg-gray-200 text-gray-600')
          }`}>
            {message.role === 'user' ? (
              userAvatar ? (
                <img src={userAvatar} alt="用戶頭像" className="w-full h-full object-cover" />
              ) : (
                <User className="w-3 h-3" />
              )
            ) : (
              botAvatar ? (
                <img src={botAvatar} alt="機器人頭像" className="w-full h-full object-cover" />
              ) : (
                <Bot className="w-3 h-3" />
              )
            )}
          </div>
          <div className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {message.role === 'user' ? (preferences?.userName || 'You') : 'Igasaki'}
          </div>
        </div>
      )}
      
      {/* 消息內容 */}
      <div className={`flex max-w-3xl ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
        <div className={`flex ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'} space-x-3`}>
          {/* 訊息內容 */}
          <div className={`flex-1 ${message.role === 'user' ? 'mr-3' : 'ml-3'} relative group`}>
            <div className={`px-4 py-3 rounded-2xl ${
              message.role === 'user'
                ? 'bg-gray-500 text-white'
                : 'bg-gray-700 border border-gray-600 text-gray-100'
            }`}>
              {message.role === 'user' ? (
                <div>
                  <div className="whitespace-pre-wrap">{message.content}</div>
                  
                  {/* 顯示圖片附件 */}
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {message.attachments.map((attachment: string, index: number) => (
                        <img 
                          key={index}
                          src={attachment} 
                          alt={`附件 ${index + 1}`}
                          className="max-w-full max-h-64 object-contain rounded-lg border border-gray-300"
                        />
                      ))}
                    </div>
                  )}
                  
                  {/* 用戶消息的操作按鈕 */}
                  <div className="flex items-center space-x-1 mt-3 transition-all duration-150">
                    {/* 複製按鈕 */}
                    <button
                      onClick={() => copyText(message.content)}
                      className="inline-flex items-center justify-center w-6 h-6 text-xs bg-gray-400/20 text-gray-300 rounded-full hover:bg-gray-400/30 hover:text-gray-200 transition-colors duration-150"
                      title="複製文字"
                    >
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm, remarkBreaks]}
                    components={{
                      p: ({ children }: any) => <p className="mb-2 last:mb-0 whitespace-pre-wrap">{children}</p>,
                      code: ({ children, className }: any) => (
                        <code className={`${className} bg-gray-800 px-1 py-0.5 rounded text-sm`}>
                          {children}
                        </code>
                      ),
                      pre: ({ children }: any) => (
                        <pre className="bg-gray-800 p-3 rounded-lg overflow-x-auto mb-2">
                          {children}
                        </pre>
                      ),
                      blockquote: ({ children }: any) => (
                        <blockquote className="border-l-4 border-gray-500 pl-4 italic text-gray-300">
                          {children}
                        </blockquote>
                      ),
                      ul: ({ children }: any) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                      ol: ({ children }: any) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                      li: ({ children }: any) => <li className="mb-1">{children}</li>,
                      strong: ({ children }: any) => <strong className="font-bold text-white">{children}</strong>,
                      em: ({ children }: any) => <em className="italic">{children}</em>,
                      h1: ({ children }: any) => <h1 className="text-2xl font-bold mb-3 mt-4 text-white">{children}</h1>,
                      h2: ({ children }: any) => <h2 className="text-xl font-bold mb-2 mt-3 text-white">{children}</h2>,
                      h3: ({ children }: any) => <h3 className="text-lg font-bold mb-2 mt-2 text-white">{children}</h3>,
                      h4: ({ children }: any) => <h4 className="text-base font-bold mb-1 mt-2 text-white">{children}</h4>,
                      h5: ({ children }: any) => <h5 className="text-sm font-bold mb-1 mt-1 text-white">{children}</h5>,
                      h6: ({ children }: any) => <h6 className="text-xs font-bold mb-1 mt-1 text-white">{children}</h6>,
                      a: ({ children, href }: any) => (
                        <a href={href} className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                  
                  {/* 操作按鈕 - 只在非處理中狀態顯示 */}
                  {!message.processing && (
                    <div className="flex items-center space-x-1 mt-3 transition-all duration-150">
                      {/* 複製按鈕 */}
                      <button
                        onClick={() => copyText(message.content)}
                        className="inline-flex items-center justify-center w-6 h-6 text-xs bg-gray-600/20 text-gray-400 rounded-full hover:bg-gray-600/30 hover:text-gray-300 transition-colors duration-150"
                        title="複製文字"
                      >
                        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      </button>
                      
                      {/* TTS 播放按鈕 */}
                      <button
                        onClick={() => playUtterance(message.content, 0)}
                        disabled={loadingAudio === 0}
                        className="inline-flex items-center justify-center w-6 h-6 text-xs bg-gray-600/20 text-gray-400 rounded-full hover:bg-gray-600/30 hover:text-gray-300 transition-colors duration-150"
                        title="播放語音"
                      >
                        {loadingAudio === 0 ? (
                          <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                        ) : playingUtterance === 0 ? (
                          <Pause className="w-3 h-3" />
                        ) : (
                          <Play className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
              {renderCitations()}
              
              {/* 處理中指示器 */}
              {message.processing && (
                <div className="mt-2 flex items-center space-x-2 text-xs text-gray-500">
                  <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                  <span>處理中...</span>
                </div>
              )}
            </div>

            {/* 刪除按鈕 - 在聊天氣泡內右下角 */}
            {onDelete && (
              <button
                onClick={() => onDelete(message.id)}
                className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                title="刪除訊息"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* 時間顯示 - 對齊聊天氣泡 */}
      {showTime && (
        <div className={`flex items-center mt-1 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <span className={`text-xs text-gray-500 dark:text-gray-400 ${message.role === 'user' ? 'mr-3' : 'ml-3'}`}>
            {message.timestamp.toLocaleTimeString()}
          </span>
        </div>
      )}
    </div>
  );
}
