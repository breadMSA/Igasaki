import React, { useState, useEffect } from 'react';
import { X, Check, AlertCircle, User, Bot, RefreshCw } from 'lucide-react';
import { UserPreferences, ServiceStatus } from '@/types';
import { avatarMemory } from '@/hooks/useMemoryStore';
import { scanModels, ScannedModel } from '@/utils/modelScanner';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  preferences: UserPreferences;
  onUpdatePreferences: (updates: Partial<UserPreferences>) => void;
  serviceStatus: ServiceStatus;
}

export default function SettingsModal({ 
  isOpen, 
  onClose, 
  preferences, 
  onUpdatePreferences, 
  serviceStatus 
}: SettingsModalProps) {
  const [scannedModels, setScannedModels] = useState<ScannedModel[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    if (isOpen) {
      scanAvailableModels();
    }
  }, [isOpen]);

  const scanAvailableModels = async () => {
    setIsScanning(true);
    try {
      const models = await scanModels();
      setScannedModels(models);
    } catch (error) {
      console.error('掃描模型失敗:', error);
    } finally {
      setIsScanning(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-screen overflow-y-auto">
        <form onSubmit={handleSubmit}>
          {/* 標題 */}
          <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">設定</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors duration-150"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 內容 */}
          <div className="px-6 py-4 space-y-6">
            {/* 服務狀態 */}
            <div>
              <h3 className="text-sm font-medium text-gray-200 mb-3">服務狀態</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-300">聊天服務</span>
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${
                      serviceStatus.chat ? 'bg-green-500' : 'bg-red-500'
                    }`}></div>
                    <span className="text-xs text-gray-400">
                      {serviceStatus.chat ? '正常' : '異常'}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-300">語音服務</span>
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${
                      serviceStatus.tts ? 'bg-green-500' : 'bg-red-500'
                    }`}></div>
                    <span className="text-xs text-gray-400">
                      {serviceStatus.tts ? '正常' : '異常'}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-300">Live2D/V皮</span>
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${
                      serviceStatus.live2d ? 'bg-green-500' : 'bg-gray-400'
                    }`}></div>
                    <span className="text-xs text-gray-400">
                      {serviceStatus.live2d ? '啟用' : '停用'}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-300">記憶庫</span>
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${
                      serviceStatus.memory ? 'bg-green-500' : 'bg-yellow-500'
                    }`}></div>
                    <span className="text-xs text-gray-400">
                      {serviceStatus.memory ? '就緒' : '載入中'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 用戶設定 */}
            <div>
              <h3 className="text-sm font-medium text-gray-200 mb-3">用戶設定</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">
                    用戶名稱
                  </label>
                  <input
                    type="text"
                    value={preferences.userName || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value.length <= 15) {
                        onUpdatePreferences({ userName: value });
                      }
                    }}
                    placeholder="輸入您的名稱 (最多15字)"
                    maxLength={15}
                    className="w-full px-3 py-2 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-gray-700 text-gray-200"
                  />
                  <div className="text-xs text-gray-400 mt-1">
                    {preferences.userName ? `${preferences.userName.length}/15` : '0/15'}
                  </div>
                </div>
              </div>
            </div>

            {/* 語音設定 */}
            <div>
              <h3 className="text-sm font-medium text-gray-200 mb-3">語音設定</h3>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={preferences.autoplay}
                      onChange={(e) => onUpdatePreferences({ autoplay: e.target.checked })}
                      className="rounded border-gray-600 text-blue-600 focus:ring-blue-500 bg-gray-700"
                    />
                    <span className="ml-2 text-sm text-gray-300">自動播放語音</span>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">
                    音量
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={preferences.volume}
                    onChange={(e) => onUpdatePreferences({ volume: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>0%</span>
                    <span>{Math.round(preferences.volume * 100)}%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 動畫模型設定 */}
            <div>
              <h3 className="text-sm font-medium text-gray-200 mb-3">動畫模型設定</h3>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={preferences.live2dEnabled}
                      onChange={(e) => onUpdatePreferences({ live2dEnabled: e.target.checked })}
                      className="rounded border-gray-600 text-blue-600 focus:ring-blue-500 bg-gray-700"
                    />
                    <span className="ml-2 text-sm text-gray-300">啟用動畫模型顯示</span>
                  </label>
                </div>

                {preferences.live2dEnabled && (
                  <>
                    {/* 移除硬編碼的模型選擇，用戶應該上傳自己的模型 */}
                    <div className="p-3 bg-blue-900 bg-opacity-30 rounded-md">
                      <div className="flex items-start space-x-2">
                        <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                        <div className="text-xs text-blue-200">
                          <p className="font-medium mb-1">模型上傳說明：</p>
                          <p>支援 Live2D (.model3.json + 相關文件) 和 VRM (.vrm, .glb, .gltf) 格式。</p>
                          <p>請直接拖放模型文件到動畫模型顯示區域進行上傳。</p>
                        </div>
                      </div>
                    </div>


                  </>
                )}
              </div>
            </div>

            {/* 主題設定 */}
            <div>
              <h3 className="text-sm font-medium text-gray-200 mb-3">介面設定</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">
                    主題
                  </label>
                  <select
                    value={preferences.theme}
                    onChange={(e) => onUpdatePreferences({ theme: e.target.value as 'light' | 'dark' | 'auto' })}
                    className="w-full px-3 py-2 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-gray-700 text-gray-200"
                  >
                    <option value="light">淺色</option>
                    <option value="dark">深色</option>
                    <option value="auto">跟隨系統</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">
                    語言
                  </label>
                  <select
                    value={preferences.language}
                    onChange={(e) => onUpdatePreferences({ language: e.target.value as 'zh-TW' | 'en-US' })}
                    className="w-full px-3 py-2 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-gray-700 text-gray-200"
                  >
                    <option value="zh-TW">繁體中文</option>
                    <option value="en-US">English</option>
                  </select>
                </div>

                {/* 背景圖片設定 */}
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">
                    背景圖片
                  </label>
                  <div className="space-y-3">
                    <div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (e) => {
                              onUpdatePreferences({ 
                                backgroundImage: e.target?.result as string 
                              });
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-gray-700 text-gray-200"
                      />
                    </div>
                    
                    {preferences.backgroundImage && (
                      <div className="relative">
                        <img 
                          src={preferences.backgroundImage} 
                          alt="背景預覽" 
                          className="w-full h-20 object-cover rounded-md"
                        />
                        <button
                          type="button"
                          onClick={() => onUpdatePreferences({ backgroundImage: '' })}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                        >
                          ×
                        </button>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-200 mb-1">
                        背景透明度
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={preferences.backgroundOpacity || 0.3}
                        onChange={(e) => onUpdatePreferences({ 
                          backgroundOpacity: parseFloat(e.target.value) 
                        })}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-gray-400 mt-1">
                        <span>0%</span>
                        <span>{Math.round((preferences.backgroundOpacity || 0.3) * 100)}%</span>
                        <span>100%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* AI 個性設定 */}
            <div>
              <h3 className="text-sm font-medium text-gray-200 mb-3">AI 個性設定</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">
                    個性模式
                  </label>
                  <select
                    value={preferences.aiPersonality || 'default'}
                    onChange={(e) => onUpdatePreferences({ aiPersonality: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-gray-700 text-gray-200"
                  >
                    <option value="default">預設個性</option>
                    <option value="friendly">友善活潑</option>
                    <option value="professional">專業嚴謹</option>
                    <option value="casual">輕鬆隨意</option>
                    <option value="creative">創意豐富</option>
                    <option value="custom">自訂個性（推薦）</option>
                  </select>
                </div>

                {preferences.aiPersonality === 'custom' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-200 mb-2">
                      自訂個性描述
                    </label>
                    <textarea
                      value={preferences.customPersonalityText || ''}
                      onChange={(e) => onUpdatePreferences({ customPersonalityText: e.target.value })}
                      placeholder="請描述你希望 AI 具有的個性特質，例如：友善、幽默、專業、創意等..."
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-gray-700 text-gray-200 resize-none"
                    />
                  </div>
                )}

                {/* 越獄選項 */}
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={preferences.jailbreakEnabled || false}
                      onChange={(e) => onUpdatePreferences({ jailbreakEnabled: e.target.checked })}
                      className="rounded border-gray-600 text-red-600 focus:ring-red-500 bg-gray-700"
                    />
                    <span className="ml-2 text-sm text-gray-300">啟用越獄模式</span>
                  </label>
                  <div className="mt-2 p-3 bg-red-900 bg-opacity-30 rounded-md">
                    <div className="flex items-start space-x-2">
                      <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                      <div className="text-xs text-red-200">
                        <p className="font-medium mb-1">⚠️ 警告：</p>
                        <p>啟用此選項將移除 AI 的內容限制。請謹慎使用，並對自己的行為負責。</p>
                        <p className="mt-1">此功能僅供測試和研究用途。</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 頭像設定 */}
            <div>
              <h3 className="text-sm font-medium text-gray-200 mb-3">頭像設定</h3>
              <div className="space-y-4">
                {/* 用戶頭像 */}
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">
                    用戶頭像
                  </label>
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-full bg-blue-900 flex items-center justify-center overflow-hidden">
                      {preferences.userAvatar ? (
                        <img src={preferences.userAvatar} alt="用戶頭像" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-6 h-6 text-blue-400" />
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = async (e) => {
                            const dataUrl = e.target?.result as string;
                            await avatarMemory.saveAvatar({
                              name: '用戶頭像',
                              type: 'user',
                              dataUrl
                            });
                            onUpdatePreferences({ userAvatar: dataUrl });
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="flex-1 px-3 py-2 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-gray-700 text-gray-200"
                    />
                  </div>
                </div>

                {/* 機器人頭像 */}
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">
                    機器人頭像
                  </label>
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden">
                      {preferences.botAvatar ? (
                        <img src={preferences.botAvatar} alt="機器人頭像" className="w-full h-full object-cover" />
                      ) : (
                        <Bot className="w-6 h-6 text-gray-400" />
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = async (e) => {
                            const dataUrl = e.target?.result as string;
                            await avatarMemory.saveAvatar({
                              name: '機器人頭像',
                              type: 'bot',
                              dataUrl
                            });
                            onUpdatePreferences({ botAvatar: dataUrl });
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="flex-1 px-3 py-2 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-gray-700 text-gray-200"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 記憶設定 */}
            <div>
              <h3 className="text-sm font-medium text-gray-200 mb-3">記憶設定</h3>
              <div className="space-y-4">
                <div className="p-3 bg-gray-700 rounded-md">
                  <p className="text-xs text-gray-300 mb-2">
                    記憶庫會永久保存您的對話歷史和偏好設定。敏感內容將被安全處理。
                  </p>
                  <div className="space-y-2">
                    <button
                      type="button"
                      className="text-xs text-red-400 hover:text-red-300 underline"
                      onClick={() => {
                        if (confirm('確定要清除所有記憶資料嗎？此操作無法復原。')) {
                          // 這裡將來會實作清除記憶功能
                          console.log('Clear memory requested');
                        }
                      }}
                    >
                      清除所有記憶
                    </button>
                    
                    <div className="border-t border-gray-600 pt-2">
                      <button
                        type="button"
                        className="text-xs text-orange-400 hover:text-orange-300 underline"
                        onClick={async () => {
                          if (confirm('確定要重新建構向量資料庫嗎？這將清除所有現有的向量記憶並重新開始。')) {
                            try {
                              const response = await fetch('/api/rebuild-vector-database', { method: 'POST' });
                              if (response.ok) {
                                alert('向量資料庫重建完成！');
                              } else {
                                alert('向量資料庫重建失敗！');
                              }
                            } catch (error) {
                              alert('向量資料庫重建失敗：' + error);
                            }
                          }
                        }}
                      >
                        強制重新建構向量資料庫
                      </button>
                      <p className="text-xs text-gray-400 mt-1">⚠️ 此操作將清除所有向量記憶</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 按鈕 */}
          <div className="px-6 py-4 border-t border-gray-700 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors duration-150"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors duration-150 flex items-center space-x-2"
            >
              <Check className="w-4 h-4" />
              <span>儲存</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
