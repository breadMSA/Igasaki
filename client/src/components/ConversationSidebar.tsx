import { useState } from 'react';
import { Plus, MessageSquare, Trash2, Edit2, Check, X } from 'lucide-react';
import { Conversation } from '@/types';

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onConversationSelect: (id: string) => void;
  onCreateConversation: () => void;
  onUpdateConversation: (id: string, title: string) => void;
  onDeleteConversation: (id: string) => void;
  themeClass?: 'light' | 'dark';
}

export default function ConversationSidebar({
  conversations,
  activeConversationId,
  onConversationSelect,
  onCreateConversation,
  onUpdateConversation,
  onDeleteConversation,
  themeClass = 'light'
}: ConversationSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const handleEditStart = (conversation: Conversation) => {
    setEditingId(conversation.id);
    setEditingTitle(conversation.title);
  };

  const handleEditSave = () => {
    if (editingId && editingTitle.trim()) {
      onUpdateConversation(editingId, editingTitle.trim());
      setEditingId(null);
      setEditingTitle('');
    }
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditingTitle('');
  };

  const handleDeleteConfirm = (id: string) => {
    onDeleteConversation(id);
    setShowDeleteConfirm(null);
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - d.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      return '今天';
    } else if (diffDays === 2) {
      return '昨天';
    } else if (diffDays <= 7) {
      return `${diffDays - 1} 天前`;
    } else {
      return d.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div className={`w-80 ${themeClass === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-r flex flex-col h-full`}>
      {/* 標題列 */}
      <div className={`${themeClass === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-4 py-3`}>
        <div className="flex items-center justify-between">
          <h2 className={`text-lg font-semibold ${themeClass === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            聊天室
          </h2>
          <button
            onClick={onCreateConversation}
            className={`p-2 ${themeClass === 'dark' ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'} rounded-lg transition-colors duration-150`}
            title="新對話"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 對話串列表 */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="p-4 text-center">
            <MessageSquare className={`w-12 h-12 mx-auto mb-3 ${themeClass === 'dark' ? 'text-gray-600' : 'text-gray-400'}`} />
            <p className={`text-sm ${themeClass === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              還沒有聊天室
            </p>
            <button
              onClick={onCreateConversation}
              className={`mt-3 px-4 py-2 ${themeClass === 'dark' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'} rounded-lg text-sm transition-colors duration-150`}
            >
              開始新對話
            </button>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`group relative rounded-lg transition-colors duration-150 ${
                  activeConversationId === conversation.id
                    ? themeClass === 'dark'
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-500 text-white'
                    : themeClass === 'dark'
                    ? 'hover:bg-gray-700 text-gray-200'
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                <button
                  onClick={() => onConversationSelect(conversation.id)}
                  className="w-full p-3 text-left"
                >
                  {editingId === conversation.id ? (
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEditSave();
                          if (e.key === 'Escape') handleEditCancel();
                        }}
                        className={`flex-1 px-2 py-1 text-sm rounded ${
                          themeClass === 'dark' 
                            ? 'bg-gray-600 text-white border-gray-500' 
                            : 'bg-white text-gray-900 border-gray-300'
                        } border focus:outline-none focus:ring-2 focus:ring-blue-500`}
                        autoFocus
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditSave();
                        }}
                        className="p-1 hover:bg-gray-600 rounded"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditCancel();
                        }}
                        className="p-1 hover:bg-gray-600 rounded"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="pr-16"> {/* 為按鈕預留空間 */}
                      <div className="font-medium text-sm truncate">
                        {conversation.title.length > 20 
                          ? `${conversation.title.substring(0, 20)}...` 
                          : conversation.title
                        }
                      </div>
                      {conversation.preview && (
                        <div className={`text-xs mt-1 truncate ${
                          activeConversationId === conversation.id
                            ? 'text-blue-100'
                            : themeClass === 'dark'
                            ? 'text-gray-400'
                            : 'text-gray-500'
                        }`}>
                          {conversation.preview.length > 30 
                            ? `${conversation.preview.substring(0, 30)}...` 
                            : conversation.preview
                          }
                        </div>
                      )}
                      <div className={`text-xs mt-1 ${
                        activeConversationId === conversation.id
                          ? 'text-blue-200'
                          : themeClass === 'dark'
                          ? 'text-gray-500'
                          : 'text-gray-400'
                      }`}>
                        {formatDate(conversation.updatedAt)}
                      </div>
                    </div>
                  )}
                </button>

                {/* 操作按鈕 */}
                {editingId !== conversation.id && (
                  <div className={`absolute right-2 top-1/2 transform -translate-y-1/2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 ${
                    activeConversationId === conversation.id ? 'text-blue-200' : 'text-gray-400'
                  }`}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditStart(conversation);
                      }}
                      className="p-1 hover:bg-gray-600 rounded"
                      title="重命名"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDeleteConfirm(conversation.id);
                      }}
                      className="p-1 hover:bg-red-600 rounded"
                      title="刪除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 刪除確認彈窗 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`${themeClass === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 max-w-sm w-full mx-4`}>
            <h3 className={`text-lg font-semibold mb-4 ${themeClass === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              確認刪除
            </h3>
            <p className={`text-sm mb-6 ${themeClass === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
              確定要刪除這個聊天室嗎？此操作無法復原。
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className={`flex-1 px-4 py-2 ${themeClass === 'dark' ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'} rounded-lg transition-colors duration-150`}
              >
                取消
              </button>
              <button
                onClick={() => handleDeleteConfirm(showDeleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-150"
              >
                刪除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
