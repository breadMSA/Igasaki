import { useEffect, useState } from 'react';
import { MessageCircle, Settings } from 'lucide-react';
import ChatInterface from '@/components/ChatInterface';
import AnimationModelDisplay from '@/components/AnimationModelDisplay';
import SettingsModal from '@/components/SettingsModal';
import ToastContainer from '@/components/ToastContainer';
import { useMemoryStore } from '@/hooks/useMemoryStore';
import { useAppState } from '@/hooks/useAppState';
import { ServiceStatus } from '@/types';

function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>({
    chat: false,
    tts: false,
    live2d: false,
    memory: false,
    lastChecked: new Date()
  });

  const { isInitialized, preferences, updatePreferences } = useAppState();
  const { isReady: memoryReady } = useMemoryStore();

  // 添加調試信息
  useEffect(() => {
    try {
      console.log('App: 組件已載入');
      console.log('App: isInitialized:', isInitialized);
      console.log('App: memoryReady:', memoryReady);
      console.log('App: preferences:', preferences);
    } catch (error) {
      console.error('App: 調試信息錯誤:', error);
      setHasError(true);
      setErrorMessage('調試信息錯誤: ' + (error as Error).message);
    }
  }, [isInitialized, memoryReady, preferences]);

  // 檢查服務狀態
  useEffect(() => {
    const checkServices = async () => {
      try {
        console.log('App: 開始檢查服務狀態');
        // 檢查後端 API
        const response = await fetch('/api/health');
        const health = await response.json();
        
        setServiceStatus(prev => ({
          ...prev,
          chat: health.services?.gemini || false,
          tts: health.services?.chatProxy || false,
          lastChecked: new Date()
        }));
        console.log('App: 服務狀態檢查完成:', health);
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
    try {
      setServiceStatus(prev => ({
        ...prev,
        live2d: preferences.live2dEnabled,
        memory: memoryReady
      }));
    } catch (error) {
      console.error('App: 更新服務狀態錯誤:', error);
    }
  }, [preferences.live2dEnabled, memoryReady]);

  // 錯誤處理
  if (hasError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-red-50">
        <div className="text-center p-8 bg-white rounded-lg shadow-lg max-w-md">
          <h2 className="text-xl font-bold text-red-600 mb-4">應用程序錯誤</h2>
          <p className="text-gray-600 mb-4">{errorMessage}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            重新載入
          </button>
        </div>
      </div>
    );
  }

  // 如果沒有初始化，顯示載入畫面
  if (!isInitialized) {
    console.log('App: 顯示載入畫面');
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">初始化中...</p>
          <p className="text-sm text-gray-500 mt-2">memoryReady: {memoryReady ? 'true' : 'false'}</p>
        </div>
      </div>
    );
  }

  console.log('App: 渲染主要內容');

  // 應用主題和背景
  const getThemeClasses = () => {
    try {
      const theme = preferences.theme;
      if (theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        return 'dark';
      }
      return 'light';
    } catch (error) {
      console.error('App: 主題處理錯誤:', error);
      return 'light';
    }
  };

  const themeClass = getThemeClasses();

  return (
    <div className={`flex h-screen ${themeClass === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* 背景圖片 */}
      {preferences.backgroundImage && (
        <div 
          className="fixed inset-0 z-0"
          style={{
            backgroundImage: `url(${preferences.backgroundImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: preferences.backgroundOpacity || 0.3,
          }}
        />
      )}
      
      {/* 主要內容 */}
      <div className="relative z-10 flex flex-1">
        {/* 側邊欄 */}
        <div className={`w-16 ${themeClass === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-r flex flex-col items-center py-4 space-y-4`}>
          {/* Logo */}
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">I</span>
          </div>

          {/* 導航按鈕 */}
          <nav className="flex flex-col space-y-2">
            <button
              className={`p-3 ${themeClass === 'dark' ? 'text-gray-400 hover:text-blue-400 hover:bg-gray-700' : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'} rounded-lg transition-colors duration-150`}
              title="聊天"
            >
              <MessageCircle className="w-5 h-5" />
            </button>

            <button
              onClick={() => setShowSettings(true)}
              className={`p-3 ${themeClass === 'dark' ? 'text-gray-400 hover:text-blue-400 hover:bg-gray-700' : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'} rounded-lg transition-colors duration-150`}
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
              title={`Live2D/V皮：${serviceStatus.live2d ? '啟用' : '停用'}`}
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
            <ChatInterface themeClass={themeClass} />
          </div>

          {/* Live2D 顯示區域 */}
          {preferences.live2dEnabled && (
            <div className={`w-80 ${themeClass === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-l`}>
              <div className="h-full p-4">
                <h3 className={`text-sm font-medium ${themeClass === 'dark' ? 'text-gray-200' : 'text-gray-700'} mb-4`}>動畫模型</h3>
                <AnimationModelDisplay />
              </div>
            </div>
          )}
        </div>
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
