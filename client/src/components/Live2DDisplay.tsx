import React, { useRef, useEffect, useState } from 'react';
import { AlertCircle, Upload } from 'lucide-react';

export default function Live2DDisplay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    checkForModel();
  }, []);

  const checkForModel = async () => {
    try {
      setIsLoading(true);
      
      // 檢查是否有 Live2D 模型檔案
      const response = await fetch('/models/');
      
      if (response.ok) {
        // 這裡應該檢查模型檔案是否存在
        // 現在先顯示佔位內容
        setModelLoaded(false);
        setModelError(null);
      } else {
        setModelError('無法載入 Live2D 模型');
      }
    } catch (error) {
      setModelError('Live2D 初始化失敗');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // 這裡將來會處理模型檔案上傳
    console.log('Model files selected:', Array.from(files).map(f => f.name));
  };

  if (isLoading) {
    return (
      <div className="h-96 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">載入 Live2D...</p>
        </div>
      </div>
    );
  }

  if (modelError) {
    return (
      <div className="h-96 bg-gradient-to-br from-red-50 to-pink-50 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <p className="text-sm text-red-600 mb-2">{modelError}</p>
          <button
            onClick={checkForModel}
            className="text-xs text-red-500 hover:text-red-700 underline"
          >
            重新載入
          </button>
        </div>
      </div>
    );
  }

  if (!modelLoaded) {
    return (
      <div className="h-96 bg-gradient-to-br from-gray-50 to-blue-50 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
        <div className="text-center p-6">
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-sm font-medium text-gray-700 mb-2">放置 Live2D 模型</h3>
          <p className="text-xs text-gray-500 mb-4 max-w-xs">
            將 Live2D 模型檔案放置在 <code className="bg-gray-200 px-1 rounded">client/public/models/</code> 目錄中
          </p>
          
          <div className="space-y-2">
            <label className="block">
              <input
                type="file"
                multiple
                accept=".model3.json,.moc3,.png,.jpg,.jpeg"
                onChange={handleFileUpload}
                className="hidden"
              />
              <span className="inline-flex items-center px-3 py-2 text-xs bg-primary-600 text-white rounded-md hover:bg-primary-700 cursor-pointer transition-colors duration-150">
                選擇檔案
              </span>
            </label>
            
            <div className="text-xs text-gray-400">
              支援格式：.model3.json, .moc3, .png, .jpg
            </div>
          </div>

          <div className="mt-4 p-3 bg-blue-50 rounded-md text-left">
            <p className="text-xs text-blue-800 font-medium mb-1">模型結構範例：</p>
            <pre className="text-xs text-blue-700 font-mono">
{`models/
├── your_model.model3.json
├── your_model.moc3
├── textures/
│   └── texture_00.png
└── motions/
    └── idle_01.motion3.json`}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-96 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg relative overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ background: 'transparent' }}
      />
      
      {/* 控制按鈕 */}
      <div className="absolute bottom-2 left-2 right-2 flex justify-center space-x-2">
        <button className="px-3 py-1 text-xs bg-white bg-opacity-80 text-gray-700 rounded-full hover:bg-opacity-100 transition-all duration-150">
          微笑
        </button>
        <button className="px-3 py-1 text-xs bg-white bg-opacity-80 text-gray-700 rounded-full hover:bg-opacity-100 transition-all duration-150">
          思考
        </button>
        <button className="px-3 py-1 text-xs bg-white bg-opacity-80 text-gray-700 rounded-full hover:bg-opacity-100 transition-all duration-150">
          驚喜
        </button>
      </div>

      {/* 音量指示器 */}
      <div className="absolute top-2 right-2">
        <div className="flex items-center space-x-1 px-2 py-1 bg-white bg-opacity-80 rounded-full">
          <div className="w-1 h-3 bg-green-400 rounded-full animate-pulse"></div>
          <div className="w-1 h-2 bg-green-300 rounded-full animate-pulse" style={{ animationDelay: '0.1s' }}></div>
          <div className="w-1 h-4 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
        </div>
      </div>
    </div>
  );
}
