import React, { useEffect, useState } from 'react';
import { MessageCircle, Settings, Volume2, Bot } from 'lucide-react';
import ChatInterface from '@/components/ChatInterface';
import Live2DDisplay from '@/components/Live2DDisplay';
import SettingsModal from '@/components/SettingsModal';
import ToastContainer from '@/components/ToastContainer';
import { useMemoryStore } from '@/hooks/useMemoryStore';
import { useAppState } from '@/hooks/useAppState';
import { ServiceStatus } from '@/types';

function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>({
    chat: false,
    tts: false,
    live2d: false,
    memory: false,
    lastChecked: new Date()
  });

  const { isInitialized, preferences, updatePreferences } = useAppState();
  const { isReady: memoryReady } = useMemoryStore();

  // 檢查服務狀態
  useEffect(() => {
    const checkServices = async () => {
      try {
        // 檢查後端 API
        const response = await fetch('/api/health');
        const health = await response.json();
        
        setServiceStatus(prev => ({
          ...prev,
          chat: health.services?.gemini || false,
          tts: health.services?.chatProxy || false,
          lastChecked: new Date()
        }));
      } catch (error) {
        console.warn('Service health check failed:', error);
        setServiceStatus(prev => ({
          ...prev,
          chat: false,
          tts: false,
          lastChecked: new Date()
        }));
      }
    };

    checkServices();
    const interval = setInterval(checkServices, 60000); // 每分鐘檢查一次

    return () => clearInterval(interval);
  }, []);

  // 更新 Live2D 狀態
  useEffect(() => {
    setServiceStatus(prev => ({
      ...prev,
      live2d: preferences.live2dEnabled,
      memory: memoryReady
    }));
  }, [preferences.live2dEnabled, memoryReady]);

  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">初始化中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 側邊欄 */}
      <div className="w-16 bg-white border-r border-gray-200 flex flex-col items-center py-4 space-y-4">
        {/* Logo */}
        <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-lg flex items-center justify-center">
          <Bot className="w-6 h-6 text-white" />
        </div>

        {/* 導航按鈕 */}
        <nav className="flex flex-col space-y-2">
          <button
            className="p-3 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors duration-150"
            title="聊天"
          >
            <MessageCircle className="w-5 h-5" />
          </button>

          <button
            className="p-3 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors duration-150"
            title="語音"
          >
            <Volume2 className="w-5 h-5" />
          </button>

          <button
            onClick={() => setShowSettings(true)}
            className="p-3 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors duration-150"
            title="設定"
          >
            <Settings className="w-5 h-5" />
          </button>
        </nav>

        {/* 服務狀態指示器 */}
        <div className="flex-1"></div>
        <div className="space-y-1">
          <div 
            className={`w-2 h-2 rounded-full ${serviceStatus.chat ? 'bg-green-500' : 'bg-red-500'}`}
            title={`聊天服務：${serviceStatus.chat ? '正常' : '異常'}`}
          ></div>
          <div 
            className={`w-2 h-2 rounded-full ${serviceStatus.tts ? 'bg-green-500' : 'bg-red-500'}`}
            title={`語音服務：${serviceStatus.tts ? '正常' : '異常'}`}
          ></div>
          <div 
            className={`w-2 h-2 rounded-full ${serviceStatus.live2d ? 'bg-green-500' : 'bg-gray-400'}`}
            title={`Live2D：${serviceStatus.live2d ? '啟用' : '停用'}`}
          ></div>
          <div 
            className={`w-2 h-2 rounded-full ${serviceStatus.memory ? 'bg-green-500' : 'bg-yellow-500'}`}
            title={`記憶庫：${serviceStatus.memory ? '就緒' : '載入中'}`}
          ></div>
        </div>
      </div>

      {/* 主要內容區域 */}
      <div className="flex-1 flex">
        {/* 聊天介面 */}
        <div className="flex-1 flex flex-col">
          <ChatInterface />
        </div>

        {/* Live2D 顯示區域 */}
        {preferences.live2dEnabled && (
          <div className="w-80 bg-white border-l border-gray-200">
            <div className="h-full p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-4">虛擬助手</h3>
              <Live2DDisplay />
            </div>
          </div>
        )}
      </div>

      {/* 設定模態框 */}
      {showSettings && (
        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          preferences={preferences}
          onUpdatePreferences={updatePreferences}
          serviceStatus={serviceStatus}
        />
      )}

      {/* Toast 通知容器 */}
      <ToastContainer />
    </div>
  );
}

export default App;
