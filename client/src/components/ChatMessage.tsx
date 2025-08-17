import React, { useState } from 'react';
import { Play, Pause, ExternalLink, User, Bot } from 'lucide-react';
import { ChatMessage as ChatMessageType } from '@/types';

interface ChatMessageProps {
  message: ChatMessageType;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const [playingUtterance, setPlayingUtterance] = useState<number | null>(null);
  const [loadingAudio, setLoadingAudio] = useState<number | null>(null);

  // 播放語音
  const playUtterance = async (text: string, index: number) => {
    if (playingUtterance === index) {
      // 停止播放
      setPlayingUtterance(null);
      return;
    }

    setLoadingAudio(index);

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        throw new Error('TTS request failed');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onplay = () => {
        setPlayingUtterance(index);
        setLoadingAudio(null);
      };

      audio.onended = () => {
        setPlayingUtterance(null);
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = () => {
        setPlayingUtterance(null);
        setLoadingAudio(null);
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();

    } catch (error) {
      console.error('Play utterance failed:', error);
      setLoadingAudio(null);
    }
  };

  const renderUtterances = () => {
    if (!message.utterances || message.utterances.length <= 1) {
      return (
        <div className="group">
          <p className="whitespace-pre-wrap">{message.content}</p>
          {message.role === 'assistant' && (
            <button
              onClick={() => playUtterance(message.content, 0)}
              disabled={loadingAudio === 0}
              className="inline-flex items-center justify-center w-6 h-6 ml-2 text-xs bg-primary-100 text-primary-700 rounded-full hover:bg-primary-200 opacity-0 group-hover:opacity-100 transition-all duration-150"
              title="播放語音"
            >
              {loadingAudio === 0 ? (
                <div className="w-3 h-3 border border-primary-600 border-t-transparent rounded-full animate-spin"></div>
              ) : playingUtterance === 0 ? (
                <Pause className="w-3 h-3" />
              ) : (
                <Play className="w-3 h-3" />
              )}
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {message.utterances.map((utterance, index) => (
          <div key={index} className="group flex items-start space-x-2">
            <div className="flex-1">
              <p className="whitespace-pre-wrap">{utterance}</p>
            </div>
            {message.role === 'assistant' && (
              <button
                onClick={() => playUtterance(utterance, index)}
                disabled={loadingAudio === index}
                className="flex-shrink-0 inline-flex items-center justify-center w-6 h-6 text-xs bg-primary-100 text-primary-700 rounded-full hover:bg-primary-200 opacity-0 group-hover:opacity-100 transition-all duration-150"
                title="播放語音"
              >
                {loadingAudio === index ? (
                  <div className="w-3 h-3 border border-primary-600 border-t-transparent rounded-full animate-spin"></div>
                ) : playingUtterance === index ? (
                  <Pause className="w-3 h-3" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
              </button>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderCitations = () => {
    if (!message.citations || message.citations.length === 0) {
      return null;
    }

    return (
      <div className="mt-3 pt-3 border-t border-gray-200">
        <p className="text-xs text-gray-500 mb-2">參考來源：</p>
        <div className="space-y-1">
          {message.citations.map((citation, index) => (
            <a
              key={index}
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 transition-colors duration-150"
            >
              <span>{citation.title || `來源 ${index + 1}`}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          ))}
        </div>
      </div>
    );
  };

  const getRouteInfo = () => {
    if (!message.route) return null;

    const routeLabels = {
      gemini: 'Gemini AI',
      charProxy: '外部代理',
      deny: '安全拒絕'
    };

    const routeColors = {
      gemini: 'bg-blue-100 text-blue-800',
      charProxy: 'bg-purple-100 text-purple-800',
      deny: 'bg-red-100 text-red-800'
    };

    return (
      <span className={`inline-flex items-center px-2 py-1 text-xs rounded-full ${routeColors[message.route]}`}>
        {routeLabels[message.route]}
      </span>
    );
  };

  return (
    <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-3xl ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'} space-x-3`}>
        {/* 頭像 */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          message.role === 'user' 
            ? 'bg-primary-600 text-white' 
            : 'bg-gray-200 text-gray-600'
        }`}>
          {message.role === 'user' ? (
            <User className="w-4 h-4" />
          ) : (
            <Bot className="w-4 h-4" />
          )}
        </div>

        {/* 訊息內容 */}
        <div className={`flex-1 ${message.role === 'user' ? 'mr-3' : 'ml-3'}`}>
          <div className={`px-4 py-3 rounded-2xl ${
            message.role === 'user'
              ? 'bg-primary-600 text-white'
              : 'bg-white border border-gray-200 text-gray-900'
          }`}>
            {renderUtterances()}
            {renderCitations()}
            
            {/* 處理中指示器 */}
            {message.processing && (
              <div className="mt-2 flex items-center space-x-2 text-xs text-gray-500">
                <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                <span>處理中...</span>
              </div>
            )}
          </div>

          {/* 元資訊 */}
          <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
            <span>{message.timestamp.toLocaleTimeString()}</span>
            <div className="flex items-center space-x-2">
              {getRouteInfo()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
