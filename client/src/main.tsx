import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './utils/reloadMessages'  // 載入調試工具

// 全域錯誤處理
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  event.preventDefault();
});

window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
});

// 檢查瀏覽器支援
function checkBrowserSupport(): boolean {
  const requiredFeatures = {
    'Web Audio API': 'AudioContext' in window || 'webkitAudioContext' in window,
    'IndexedDB': 'indexedDB' in window,
    'WebGL': (() => {
      try {
        const canvas = document.createElement('canvas');
        return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
      } catch {
        return false;
      }
    })(),
    'Fetch API': 'fetch' in window,
    'Promise': 'Promise' in window,
    'EventSource': 'EventSource' in window,
  };

  const unsupportedFeatures = Object.entries(requiredFeatures)
    .filter(([, supported]) => !supported)
    .map(([feature]) => feature);

  if (unsupportedFeatures.length > 0) {
    console.warn('Unsupported browser features:', unsupportedFeatures);
    
    // 顯示瀏覽器不支援警告
    const warningDiv = document.createElement('div');
    warningDiv.innerHTML = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        font-family: Arial, sans-serif;
        text-align: center;
        padding: 20px;
      ">
        <h2 style="margin-bottom: 20px;">瀏覽器不支援</h2>
        <p style="margin-bottom: 20px;">
          您的瀏覽器不支援以下功能，可能影響應用程式正常運作：
        </p>
        <ul style="margin-bottom: 20px;">
          ${unsupportedFeatures.map(feature => `<li>${feature}</li>`).join('')}
        </ul>
        <p style="margin-bottom: 20px;">
          建議使用最新版本的 Chrome、Firefox 或 Edge 瀏覽器。
        </p>
        <button onclick="this.parentElement.parentElement.remove()" style="
          background: #0ea5e9;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 16px;
        ">
          仍要繼續
        </button>
      </div>
    `;
    document.body.appendChild(warningDiv);
    
    return false;
  }

  return true;
}

// 初始化應用程式
function initializeApp() {
  const rootElement = document.getElementById('root');
  
  if (!rootElement) {
    throw new Error('Root element not found');
  }

  // 檢查瀏覽器支援
  const isSupported = checkBrowserSupport();
  
  if (isSupported) {
    console.log('✅ Browser compatibility check passed');
  }

  // 創建 React 根節點
  const root = ReactDOM.createRoot(rootElement);
  
  // 渲染應用程式
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  // 註冊 Service Worker（如果在生產環境且支援）
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('SW registered: ', registration);
        })
        .catch((registrationError) => {
          console.log('SW registration failed: ', registrationError);
        });
    });
  }

  // 性能監控
  if (import.meta.env.DEV) {
    // 開發環境性能監控
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        console.log(`Performance: ${entry.name} took ${entry.duration}ms`);
      }
    });
    
    observer.observe({ entryTypes: ['measure', 'navigation'] });
  }
}

// 啟動應用程式
try {
  initializeApp();
} catch (error) {
  console.error('Failed to initialize app:', error);
  
  // 顯示初始化錯誤
  const errorDiv = document.createElement('div');
  errorDiv.innerHTML = `
    <div style="
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      text-align: center;
      max-width: 400px;
    ">
      <h3 style="color: #dc2626; margin-bottom: 10px;">應用程式載入失敗</h3>
      <p style="color: #6b7280; margin-bottom: 20px;">
        ${error instanceof Error ? error.message : '未知錯誤'}
      </p>
      <button onclick="location.reload()" style="
        background: #0ea5e9;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 5px;
        cursor: pointer;
      ">
        重新載入
      </button>
    </div>
  `;
  document.body.appendChild(errorDiv);
}
