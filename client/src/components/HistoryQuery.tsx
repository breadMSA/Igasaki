import { useState, useEffect } from 'react';
import { Search, Clock, TrendingUp, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { chatMemory } from '@/hooks/useMemoryStore';
import { ChatMessage } from '@/types';

interface HistoryQueryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMessage?: (message: ChatMessage) => void;
  userAvatar?: string;
  botAvatar?: string;
  userName?: string;
  botName?: string;
}

export default function HistoryQuery({ isOpen, onClose, onSelectMessage, userAvatar, botAvatar, userName, botName }: HistoryQueryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'search' | 'recent' | 'stats'>('search');
  const [recentMessages, setRecentMessages] = useState<ChatMessage[]>([]);
  const [statistics, setStatistics] = useState<any>(null);
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month' | 'all'>('all');
  
  // 分頁功能
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);

  useEffect(() => {
    if (isOpen) {
      loadRecentMessages();
      loadStatistics();
    }
  }, [isOpen]);

  const loadRecentMessages = async () => {
    try {
      const messages = await chatMemory.getMessages(20);
      setRecentMessages(messages);
    } catch (error) {
      console.error('載入最近消息失敗:', error);
    }
  };

  const loadStatistics = async () => {
    try {
      const stats = await chatMemory.getChatStatistics();
      setStatistics(stats);
    } catch (error) {
      console.error('載入統計信息失敗:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      // 移除限制，獲取所有結果
      const results = await chatMemory.searchMessages(searchQuery, 10000);
      setSearchResults(results);
    } catch (error) {
      console.error('搜索失敗:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleTimeRangeSearch = async () => {
    const now = new Date();
    let startDate: Date;
    
    switch (timeRange) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        break;
      default:
        startDate = new Date(0);
    }
    
    try {
      const results = await chatMemory.getMessagesByTimeRange(startDate, now, 100);
      setSearchResults(results);
      setSelectedTab('search');
    } catch (error) {
      console.error('按時間範圍搜索失敗:', error);
    }
  };

  // 分頁計算
  const totalPages = Math.ceil(searchResults.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentResults = searchResults.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const formatTimestamp = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    
    if (diff < 24 * 60 * 60 * 1000) {
      return timestamp.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    } else if (diff < 7 * 24 * 60 * 60 * 1000) {
      return timestamp.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
    } else {
      return timestamp.toLocaleDateString('zh-TW', { year: 'numeric', month: 'short', day: 'numeric' });
    }
  };

  const truncateContent = (content: string, maxLength: number = 100) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-screen overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* 標題欄 */}
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">聊天歷史記錄查詢</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors duration-150"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 標籤頁 */}
        <div className="px-6 py-2 border-b border-gray-700">
          <div className="flex space-x-1">
            <button
              onClick={() => setSelectedTab('search')}
              className={`px-4 py-2 text-sm rounded-lg transition-colors duration-150 ${
                selectedTab === 'search'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
              }`}
            >
              <Search className="w-4 h-4 inline mr-2" />
              搜索
            </button>
            <button
              onClick={() => setSelectedTab('recent')}
              className={`px-4 py-2 text-sm rounded-lg transition-colors duration-150 ${
                selectedTab === 'recent'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
              }`}
            >
              <Clock className="w-4 h-4 inline mr-2" />
              最近記錄
            </button>
            <button
              onClick={() => setSelectedTab('stats')}
              className={`px-4 py-2 text-sm rounded-lg transition-colors duration-150 ${
                selectedTab === 'stats'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
              }`}
            >
              <TrendingUp className="w-4 h-4 inline mr-2" />
              統計信息
            </button>
          </div>
        </div>

        {/* 內容區域 */}
        <div className="flex-1 overflow-y-auto p-6" style={{ maxHeight: 'calc(100vh - 200px)' }}>
          {/* 搜索標籤頁 */}
          {selectedTab === 'search' && (
            <div className="space-y-4">
              {/* 搜索框 */}
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="輸入關鍵詞搜索聊天記錄..."
                  className="flex-1 px-3 py-2 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-gray-700 text-gray-200"
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
                <button
                  onClick={handleSearch}
                  disabled={isSearching || !searchQuery.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
                >
                  {isSearching ? '搜索中...' : '搜索'}
                </button>
              </div>

              {/* 時間範圍搜索 */}
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-300">按時間範圍搜索：</span>
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value as any)}
                  className="px-3 py-1 border border-gray-600 rounded-md bg-gray-700 text-gray-200 text-sm"
                >
                  <option value="today">今天</option>
                  <option value="week">最近一週</option>
                  <option value="month">最近一個月</option>
                  <option value="all">全部時間</option>
                </select>
                <button
                  onClick={handleTimeRangeSearch}
                  className="px-3 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-500 transition-colors duration-150 text-sm"
                >
                  搜索
                </button>
              </div>

              {/* 搜索結果 */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-200">
                  搜索結果 ({searchResults.length})
                </h3>
                
                {/* 分頁控制 */}
                {totalPages > 1 && (
                  <div className="flex justify-center space-x-2 mb-4">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="px-3 py-1 text-sm bg-gray-600 text-gray-200 rounded hover:bg-gray-500 disabled:opacity-50 disabled:hover:bg-gray-600"
                    >
                      上一頁
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                      <button
                        key={page}
                        onClick={() => handlePageChange(page)}
                        className={`px-3 py-1 text-sm rounded ${
                          page === currentPage 
                            ? 'bg-blue-600 text-white hover:bg-blue-700' 
                            : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 text-sm bg-gray-600 text-gray-200 rounded hover:bg-gray-500 disabled:opacity-50 disabled:hover:bg-gray-600"
                    >
                      下一頁
                    </button>
                  </div>
                )}
                
                {currentResults.map((message) => (
                  <div
                    key={message.id}
                    className="p-3 bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-600 transition-colors duration-150"
                    onClick={() => onSelectMessage?.(message)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          {/* 頭像 */}
                          <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
                            {message.role === 'user' ? (
                              userAvatar ? (
                                <img src={userAvatar} alt="用戶頭像" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-blue-500 flex items-center justify-center">
                                  <span className="text-white text-xs font-bold">U</span>
                                </div>
                              )
                            ) : (
                              botAvatar ? (
                                <img src={botAvatar} alt="AI頭像" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-green-500 flex items-center justify-center">
                                  <span className="text-white text-xs font-bold">A</span>
                                </div>
                              )
                            )}
                          </div>
                          <span className={`px-2 py-1 rounded text-xs ${
                            message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'
                          }`}>
                            {message.role === 'user' ? (userName || '用戶') : (botName || 'AI')}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatTimestamp(message.timestamp)}
                          </span>
                        </div>
                        <div className="text-sm text-gray-200">
                          <ReactMarkdown 
                            remarkPlugins={[remarkGfm, remarkBreaks]}
                            components={{
                              p: ({ children }: any) => <p className="mb-1 last:mb-0">{children}</p>,
                              code: ({ children, className }: any) => (
                                <code className={`${className} bg-gray-800 px-1 py-0.5 rounded text-xs`}>
                                  {children}
                                </code>
                              ),
                              pre: ({ children }: any) => (
                                <pre className="bg-gray-800 p-2 rounded text-xs overflow-x-auto mb-1">
                                  {children}
                                </pre>
                              ),
                              strong: ({ children }: any) => <strong className="font-bold">{children}</strong>,
                              em: ({ children }: any) => <em className="italic">{children}</em>,
                              ul: ({ children }: any) => <ul className="list-disc list-inside mb-1">{children}</ul>,
                              ol: ({ children }: any) => <ol className="list-decimal list-inside mb-1">{children}</ol>,
                              li: ({ children }: any) => <li className="mb-0.5">{children}</li>,
                            }}
                          >
                            {truncateContent(message.content)}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {searchResults.length === 0 && searchQuery && !isSearching && (
                  <p className="text-gray-400 text-center py-8">沒有找到相關的聊天記錄</p>
                )}
              </div>
            </div>
          )}

          {/* 最近記錄標籤頁 */}
          {selectedTab === 'recent' && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-200 mb-4">
                最近聊天記錄 ({recentMessages.length})
              </h3>
              {recentMessages.map((message) => (
                <div
                  key={message.id}
                  className="p-3 bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-600 transition-colors duration-150"
                  onClick={() => onSelectMessage?.(message)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        {/* 頭像 */}
                        <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
                          {message.role === 'user' ? (
                            userAvatar ? (
                              <img src={userAvatar} alt="用戶頭像" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-blue-500 flex items-center justify-center">
                                <span className="text-white text-xs font-bold">U</span>
                              </div>
                            )
                          ) : (
                            botAvatar ? (
                              <img src={botAvatar} alt="AI頭像" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-green-500 flex items-center justify-center">
                                <span className="text-white text-xs font-bold">A</span>
                              </div>
                            )
                          )}
                        </div>
                        <span className={`px-2 py-1 rounded text-xs ${
                          message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'
                        }`}>
                          {message.role === 'user' ? (userName || '用戶') : (botName || 'AI')}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatTimestamp(message.timestamp)}
                        </span>
                      </div>
                      <div className="text-sm text-gray-200">
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm, remarkBreaks]}
                          components={{
                            p: ({ children }: any) => <p className="mb-1 last:mb-0">{children}</p>,
                            code: ({ children, className }: any) => (
                              <code className={`${className} bg-gray-800 px-1 py-0.5 rounded text-xs`}>
                                {children}
                              </code>
                            ),
                            pre: ({ children }: any) => (
                              <pre className="bg-gray-800 p-2 rounded text-xs overflow-x-auto mb-1">
                                {children}
                              </pre>
                            ),
                            strong: ({ children }: any) => <strong className="font-bold">{children}</strong>,
                            em: ({ children }: any) => <em className="italic">{children}</em>,
                            ul: ({ children }: any) => <ul className="list-disc list-inside mb-1">{children}</ul>,
                            ol: ({ children }: any) => <ol className="list-decimal list-inside mb-1">{children}</ol>,
                            li: ({ children }: any) => <li className="mb-0.5">{children}</li>,
                          }}
                        >
                          {truncateContent(message.content)}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 統計信息標籤頁 */}
          {selectedTab === 'stats' && statistics && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 基本統計 */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-200">基本統計</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-gray-700 rounded-lg text-center">
                    <div className="text-2xl font-bold text-blue-400">{statistics.totalMessages}</div>
                    <div className="text-xs text-gray-400">總消息數</div>
                  </div>
                  <div className="p-3 bg-gray-700 rounded-lg text-center">
                    <div className="text-2xl font-bold text-green-400">{statistics.totalConversations}</div>
                    <div className="text-xs text-gray-400">對話數</div>
                  </div>
                  <div className="p-3 bg-gray-700 rounded-lg text-center">
                    <div className="text-2xl font-bold text-purple-400">{statistics.userMessages}</div>
                    <div className="text-xs text-gray-400">用戶消息</div>
                  </div>
                  <div className="p-3 bg-gray-700 rounded-lg text-center">
                    <div className="text-2xl font-bold text-yellow-400">{statistics.botMessages}</div>
                    <div className="text-xs text-gray-400">AI回覆</div>
                  </div>
                </div>
              </div>

              {/* 活躍時段 */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-200">最活躍時段</h3>
                <div className="space-y-2">
                  {statistics.mostActiveHours?.map(({ hour, count }: { hour: number; count: number }) => (
                    <div key={hour} className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">{hour}:00</span>
                      <div className="flex-1 mx-3">
                        <div className="bg-gray-600 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${(count / Math.max(...statistics.mostActiveHours.map((h: any) => h.count))) * 100}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-sm text-gray-400">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 最近話題 */}
              <div className="space-y-4 md:col-span-2">
                <h3 className="text-sm font-medium text-gray-200">最近話題</h3>
                <div className="flex flex-wrap gap-2">
                  {statistics.recentTopics?.map((topic: string, index: number) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-gray-700 text-gray-300 rounded-full text-sm"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 底部按鈕 */}
        <div className="px-6 py-4 border-t border-gray-700 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors duration-150"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
