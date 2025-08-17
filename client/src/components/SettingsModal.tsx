import React from 'react';
import { X, Check, AlertCircle } from 'lucide-react';
import { UserPreferences, ServiceStatus } from '@/types';

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
  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-screen overflow-y-auto">
        <form onSubmit={handleSubmit}>
          {/* 標題 */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">設定</h2>
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
              <h3 className="text-sm font-medium text-gray-700 mb-3">服務狀態</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-600">聊天服務</span>
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${
                      serviceStatus.chat ? 'bg-green-500' : 'bg-red-500'
                    }`}></div>
                    <span className="text-xs text-gray-500">
                      {serviceStatus.chat ? '正常' : '異常'}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-600">語音服務</span>
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${
                      serviceStatus.tts ? 'bg-green-500' : 'bg-red-500'
                    }`}></div>
                    <span className="text-xs text-gray-500">
                      {serviceStatus.tts ? '正常' : '異常'}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-600">Live2D</span>
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${
                      serviceStatus.live2d ? 'bg-green-500' : 'bg-gray-400'
                    }`}></div>
                    <span className="text-xs text-gray-500">
                      {serviceStatus.live2d ? '啟用' : '停用'}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-600">記憶庫</span>
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${
                      serviceStatus.memory ? 'bg-green-500' : 'bg-yellow-500'
                    }`}></div>
                    <span className="text-xs text-gray-500">
                      {serviceStatus.memory ? '就緒' : '載入中'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 語音設定 */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">語音設定</h3>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={preferences.autoplay}
                      onChange={(e) => onUpdatePreferences({ autoplay: e.target.checked })}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">自動播放語音</span>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0%</span>
                    <span>{Math.round(preferences.volume * 100)}%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Live2D 設定 */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Live2D 設定</h3>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={preferences.live2dEnabled}
                      onChange={(e) => onUpdatePreferences({ live2dEnabled: e.target.checked })}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">啟用 Live2D 虛擬角色</span>
                  </label>
                </div>

                {preferences.live2dEnabled && (
                  <div className="ml-6 p-3 bg-blue-50 rounded-md">
                    <div className="flex items-start space-x-2">
                      <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      <div className="text-xs text-blue-700">
                        <p className="font-medium mb-1">Live2D 模型放置說明：</p>
                        <p>請將 Live2D 模型檔案放置在 <code className="bg-blue-100 px-1 rounded">client/public/models/</code> 目錄中。</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 主題設定 */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">介面設定</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    主題
                  </label>
                  <select
                    value={preferences.theme}
                    onChange={(e) => onUpdatePreferences({ theme: e.target.value as 'light' | 'dark' | 'auto' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="light">淺色</option>
                    <option value="dark">深色</option>
                    <option value="auto">跟隨系統</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    語言
                  </label>
                  <select
                    value={preferences.language}
                    onChange={(e) => onUpdatePreferences({ language: e.target.value as 'zh-TW' | 'en-US' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="zh-TW">繁體中文</option>
                    <option value="en-US">English</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 記憶設定 */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">記憶設定</h3>
              <div className="space-y-4">
                <div className="p-3 bg-gray-50 rounded-md">
                  <p className="text-xs text-gray-600 mb-2">
                    記憶庫會永久保存您的對話歷史和偏好設定。敏感內容將被安全處理。
                  </p>
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:text-red-800 underline"
                    onClick={() => {
                      if (confirm('確定要清除所有記憶資料嗎？此操作無法復原。')) {
                        // 這裡將來會實作清除記憶功能
                        console.log('Clear memory requested');
                      }
                    }}
                  >
                    清除所有記憶
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 按鈕 */}
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors duration-150"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm text-white bg-primary-600 hover:bg-primary-700 rounded-md transition-colors duration-150 flex items-center space-x-2"
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
