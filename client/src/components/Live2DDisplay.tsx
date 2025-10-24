import React, { useRef, useEffect, useState } from 'react';
import * as PIXI from 'pixi.js';
import { Live2DModel } from 'pixi-live2d-display/cubism4';
import { AlertCircle, Upload } from 'lucide-react';
import { scanModels, ScannedModel } from '../utils/modelScanner';

declare global {
  interface Window {
    Live2DCubismCore: any;
    PIXI: any;
  }
}

export default function Live2DDisplay() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<PIXI.Application | null>(null);
  const modelRef = useRef<any>(null);
  const mountedRef = useRef(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const modelSetupDoneRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    
    // 僅在首次掛載時初始化
    // 設定 window.PIXI (必需)
    if (typeof window !== 'undefined') {
      window.PIXI = PIXI;
    }

    const checkLive2DEnvironment = () => {
      if (!window.Live2DCubismCore) {
        console.error('Live2D Cubism Core not found');
        setModelError('Live2D 核心未載入，請確認 live2dcubismcore.min.js 已載入');
        return false;
      }
      console.log('Live2D Cubism Core loaded successfully');
      console.log('Cubism Core version:', window.Live2DCubismCore.version);
      return true;
    };

    const initWhenReady = async () => {
      if (!mountedRef.current) return;
      
      if (!containerRef.current) {
        console.log('Container ref not available, retrying...');
        setTimeout(initWhenReady, 100);
        return;
      }

      if (!checkLive2DEnvironment()) {
        console.log('Live2D environment not ready, retrying...');
        setTimeout(initWhenReady, 100);
        return;
      }

      // 使用 getBoundingClientRect 來獲取實際尺寸
      const rect = containerRef.current.getBoundingClientRect();
      console.log('Container rect:', rect);
      
      if (rect.width > 0 && rect.height > 0) {
        console.log('Container has valid size, initializing...');
        await initializePixiApp(rect.width, rect.height);
      } else {
        console.warn('Container has no size, retrying...');
        setTimeout(initWhenReady, 200);
      }
    };

    // 延遲初始化，確保 DOM 完全渲染
    const timer = setTimeout(initWhenReady, 100);

    return () => {
      mountedRef.current = false;
      modelSetupDoneRef.current = false;
      clearTimeout(timer);
      if (modelRef.current) {
        modelRef.current.removeAllListeners();
      }
      if (pixiAppRef.current) {
        pixiAppRef.current.destroy(true);
        pixiAppRef.current = null;
      }
    };
  }, []);

  const initializePixiApp = async (width: number, height: number) => {
    try {
      if (pixiAppRef.current) {
        pixiAppRef.current.destroy(true);
        pixiAppRef.current = null;
      }
      
      const app = new PIXI.Application({
        width,
        height,
        backgroundColor: 0x1f2937,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        backgroundAlpha: 1,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      });

      console.log('PixiJS 應用創建成功');
      
      // 確保將 canvas 添加到容器中
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(app.view as HTMLCanvasElement);
      }
      pixiAppRef.current = app;
      console.log('PixiJS 應用已添加到容器');

      await loadModel();
    } catch (error) {
      console.error('Failed to initialize PixiJS app:', error);
      const errorMessage = error instanceof Error ? error.message : '未知錯誤';
      setModelError(`PixiJS 初始化失敗: ${errorMessage}`);
      setIsLoading(false);
    }
  };

  const loadModel = async () => {
    try {
      if (!pixiAppRef.current) {
        throw new Error('PixiJS app is not initialized.');
      }
      
      setIsLoading(true);
      setModelError(null);
      console.log('Starting to load Live2D model...');

      // 掃描可用的 Live2D 模型
      const availableModels = await scanModels();
      const live2dModels = availableModels.filter((m: ScannedModel) => m.type === 'live2d');
      
      if (live2dModels.length === 0) {
        throw new Error('沒有找到可用的 Live2D 模型');
      }
      
      // 使用第一個可用的 Live2D 模型
      const defaultModel = live2dModels[0];
      const modelPath = `${defaultModel.path}/${defaultModel.name}.model3.json`;
      
      console.log('Attempting to load model from:', modelPath);

      // 先檢查檔案是否存在
      console.log('檢查模型檔案是否存在...');
      const response = await fetch(modelPath);
      if (!response.ok) {
        throw new Error(`模型檔案不存在: ${response.status} ${response.statusText}`);
      }
      console.log('模型檔案檢查成功');

      // 使用 fromSync 來監聽載入過程
      const model = Live2DModel.fromSync(modelPath, {
        onLoad: () => {
          if (mountedRef.current) {
            console.log('模型載入完成，執行 setupModel');
            try {
              setupModel(model);
            } catch (e) {
              console.error('在 onLoad 執行 setupModel 發生錯誤:', e);
              const errorMessage = e instanceof Error ? e.message : String(e);
              setModelError(`模型設置失敗: ${errorMessage}`);
              setIsLoading(false);
            }
          }
        },
        onError: (error: any) => {
          if (mountedRef.current) {
            console.error('模型載入錯誤:', error);
            setModelError(`載入失敗: ${error.message}`);
            setIsLoading(false);
          }
        }
      });

      modelRef.current = model;
      console.log('Model object created successfully:', model);
      
      // 監聽載入階段
      (model as any).on('settingsJSONLoaded', () => {
        if (mountedRef.current) console.log('JSON 載入完成');
      });
      (model as any).on('settingsLoaded', () => {
        if (mountedRef.current) console.log('設定載入完成');
      });
      (model as any).on('textureLoaded', () => {
        if (mountedRef.current) console.log('材質載入完成');
      });
      (model as any).on('modelLoaded', () => {
        if (mountedRef.current) console.log('模型載入完成');
      });
      (model as any).on('ready', () => {
        if (mountedRef.current) {
          console.log('模型準備就緒');
          setupModel(model);
        }
      });

      // 不要在這裡檢查 internalModel，因為它還沒載入完成
      // 也不要立即設置模型屬性，等待 ready 事件
    } catch (error) {
      console.error('Failed to load Live2D model:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setModelError(`Live2D 模型載入失敗，請檢查檔案路徑: ${errorMessage}`);
      setIsLoading(false);
    }
  };

  const setupModel = (model: any) => {
    try {
      // 檢查組件是否還在掛載狀態
      if (!mountedRef.current) {
        console.warn('Component unmounted, skipping model setup');
        return;
      }

      console.log('setupModel called with model:', !!model);
      console.log('mountedRef.current:', mountedRef.current);
      console.log('pixiAppRef.current:', !!pixiAppRef.current);
      console.log('containerRef.current:', !!containerRef.current);

      if (!pixiAppRef.current || !containerRef.current) {
        console.warn('PixiJS app or container not available, skipping model setup');
        return;
      }

      if (modelSetupDoneRef.current) {
        console.warn('setupModel already executed; skipping');
        return;
      }

      console.log('開始設置模型...');
      console.log('Model internal structure:', {
        internalModel: !!model.internalModel,
        motionManager: !!model.internalModel?.motionManager,
        motions: model.motions?.length || 0,
        textures: model.textures?.length || 0
      });

      // 現在檢查 internalModel，因為模型已經準備就緒
      if (!model.internalModel) {
        setModelError('模型內部組件載入失敗');
        setIsLoading(false);
        return;
      }

      // 防止重複設置
      modelSetupDoneRef.current = true;

      // 清除舊模型 (如果存在)
      if (pixiAppRef.current.stage.children.length > 0) {
        pixiAppRef.current.stage.removeChildren();
      }

      // 設置模型屬性
      model.scale.set(0.2);
      model.interactive = true;
      model.buttonMode = true;

      // 居中模型
      const centerX = pixiAppRef.current.screen.width / 2;
      const centerY = pixiAppRef.current.screen.height / 2;
      model.x = centerX;
      model.y = centerY;
      model.anchor.set(0.5, 0.5);

      // 添加到舞台
      pixiAppRef.current.stage.addChild(model);

      console.log('模型已添加到舞台，開始播放動畫...');

      // 播放閒置動畫
      if (model.internalModel && model.internalModel.motionManager) {
        console.log('播放閒置動畫...');
        model.internalModel.motionManager.startMotion('idle', 0);
      } else {
        console.warn('無法播放動畫，motionManager 不可用。');
      }

      console.log('Live2D 模型設置完成');
      setIsLoading(false);

    } catch (error) {
      console.error('模型設置錯誤:', error);
      const errorMessage = error instanceof Error ? error.message : '未知錯誤';
      setModelError(`模型設置失敗: ${errorMessage}`);
      setIsLoading(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    console.log('Model files selected:', Array.from(files).map(f => f.name));
  };

  return (
    <div className="h-96 w-full relative" style={{ minHeight: '384px', minWidth: '100%' }}>
      <div 
        ref={containerRef} 
        className="w-full h-full" 
        style={{ width: '100%', height: '100%' }}
      />
      
      {isLoading && (
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-sm text-gray-600">載入 Live2D...</p>
          </div>
        </div>
      )}
      
      {modelError && (
        <div className="absolute inset-0 bg-gradient-to-br from-red-50 to-orange-50 rounded-lg flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
            <p className="text-sm text-red-600 mb-4">{modelError}</p>
            <label className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 cursor-pointer transition-colors duration-150">
              <Upload className="w-4 h-4 mr-2" />
              上傳模型檔案
              <input
                type="file"
                multiple
                accept=".model3.json,.moc3,.png,.jpg,.jpeg,.motion3.json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>
      )}
      
      {!isLoading && !modelError && (
        <div className="absolute bottom-4 right-4">
          <div className="bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
            Live2D 已載入
          </div>
        </div>
      )}
    </div>
  );
}