import React, { useState } from 'react';
import { Settings, ToggleLeft, ToggleRight, X } from 'lucide-react';
import { Conversation } from '@/types';

interface ConversationSettingsProps {
  conversation: Conversation | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateSettings: (id: string, settings: { sharedMemory: boolean }) => void;
  themeClass?: 'light' | 'dark';
}

export default function ConversationSettings({
  conversation,
  isOpen,
  onClose,
  onUpdateSettings,
  themeClass = 'light'
}: ConversationSettingsProps) {
  const [sharedMemory, setSharedMemory] = useState(conversation?.settings.sharedMemory ?? true);
  const [isUpdating, setIsUpdating] = useState(false);

  React.useEffect(() => {
    if (conversation) {
      setSharedMemory(conversation.settings.sharedMemory);
    }
  }, [conversation]);

  const handleSave = async () => {
    if (!conversation) return;
    
    setIsUpdating(true);
    try {
      await onUpdateSettings(conversation.id, { sharedMemory });
      onClose();
    } catch (error) {
      console.error('Failed to update settings:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  if (!isOpen || !conversation) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={`${themeClass === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-xl max-w-md w-full mx-4`}>
        {/* 標題列 */}
        <div className={`${themeClass === 'dark' ? 'bg-gray-700' : 'bg-gray-50'} px-6 py-4 rounded-t-lg flex items-center justify-between`}>
          <div className="flex items-center space-x-3">
            <Settings className={`w-5 h-5 ${themeClass === 'dark' ? 'text-gray-300' : 'text-gray-600'}`} />
            <h2 className={`text-lg font-semibold ${themeClass === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              聊天室設定
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`p-1 ${themeClass === 'dark' ? 'text-gray-400 hover:text-white hover:bg-gray-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'} rounded-lg transition-colors duration-150`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 內容 */}
        <div className="p-6">
          <div className="mb-6">
            <h3 className={`text-sm font-medium mb-2 ${themeClass === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
              聊天室名稱
            </h3>
            <p className={`text-sm ${themeClass === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
              {conversation.title}
            </p>
          </div>

          <div className="mb-6">
            <h3 className={`text-sm font-medium mb-3 ${themeClass === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
              記憶設定
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className={`font-medium text-sm ${themeClass === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    共享記憶
                  </div>
                  <div className={`text-xs mt-1 ${themeClass === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                    {sharedMemory 
                      ? '此聊天室可以存取所有其他聊天室的記憶'
                      : '此聊天室只能存取自己的歷史記錄'
                    }
                  </div>
                </div>
                <button
                  onClick={() => setSharedMemory(!sharedMemory)}
                  className="ml-4"
                  disabled={isUpdating}
                >
                  {sharedMemory ? (
                    <ToggleRight className="w-8 h-8 text-blue-500" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-gray-400" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className={`p-4 rounded-lg ${themeClass === 'dark' ? 'bg-gray-700' : 'bg-gray-50'}`}>
            <h4 className={`text-sm font-medium mb-2 ${themeClass === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
              記憶模式說明
            </h4>
            <div className={`text-xs space-y-2 ${themeClass === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
              <div>
                <strong>共享記憶（開啟）：</strong>
                <ul className="ml-4 mt-1 space-y-1">
                  <li>• AI 可以記住所有聊天室的內容</li>
                  <li>• 適合需要連續性的對話</li>
                  <li>• AI 個性和回憶會保持</li>
                </ul>
              </div>
              <div>
                <strong>獨立記憶（關閉）：</strong>
                <ul className="ml-4 mt-1 space-y-1">
                  <li>• 每個聊天室都是獨立的</li>
                  <li>• 適合不同主題的討論</li>
                  <li>• 隱私性更好</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* 底部按鈕 */}
        <div className={`${themeClass === 'dark' ? 'bg-gray-700' : 'bg-gray-50'} px-6 py-4 rounded-b-lg flex space-x-3`}>
          <button
            onClick={onClose}
            className={`flex-1 px-4 py-2 ${themeClass === 'dark' ? 'bg-gray-600 hover:bg-gray-500 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'} rounded-lg transition-colors duration-150`}
            disabled={isUpdating}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isUpdating}
          >
            {isUpdating ? '儲存中...' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  );
}
