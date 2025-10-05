import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import { Live2DModel } from 'pixi-live2d-display/cubism4';
import { AlertCircle, Play, Pause, RotateCcw, Upload } from 'lucide-react';
import * as THREE from 'three';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import { GLTFLoader } from 'three-stdlib';

declare global {
  interface Window {
    Live2DCubismCore: any;
    PIXI: any;
  }
}

interface ModelFile {
  name: string;
  file: File;
  type: 'model' | 'texture' | 'motion' | 'physics' | 'other';
}

interface UploadedModel {
  id: string;
  name: string;
  type: 'live2d' | 'vrm';
  files: ModelFile[];
  modelFile?: ModelFile;
  createdAt: Date;
}

export default function AnimationModelDisplay() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<PIXI.Application | null>(null);
  const modelRef = useRef<any>(null);
  const mountedRef = useRef(true);
  
  const threeContainerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const vrmModelRef = useRef<any>(null);
  
  const [modelError, setModelError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentModel, setCurrentModel] = useState<UploadedModel | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [modelType, setModelType] = useState<'live2d' | 'vrm' | null>(null);
  
  const [userSelectedModel, setUserSelectedModel] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const modelSetupDoneRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    
    if (typeof window !== 'undefined') {
      window.PIXI = PIXI;
    }
    
    const checkUserPreferences = () => {
      try {
        const storedPrefs = localStorage.getItem('userPreferences');
        if (storedPrefs) {
          const prefs = JSON.parse(storedPrefs);
          if (prefs.live2dModelId) {
            setUserSelectedModel(prefs.live2dModelId);
            console.log('用戶選擇的模型:', prefs.live2dModelId);
          }
        }
      } catch (error) {
        console.log('無法讀取用戶設定:', error);
      }
    };
    
    checkUserPreferences();

    const checkLive2DEnvironment = () => {
      if (!window.Live2DCubismCore) {
        console.error('Live2D Cubism Core not found');
        setModelError('Live2D 核心未載入，請確認 live2dcubismcore.min.js 已載入');
        return false;
      }
      console.log('Live2D Cubism Core loaded successfully');
      return true;
    };

    const initWhenReady = async () => {
      if (!mountedRef.current) return;
      
      if (!containerRef.current) {
        setTimeout(initWhenReady, 100);
        return;
      }

      if (!checkLive2DEnvironment()) {
        setTimeout(initWhenReady, 100);
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      
      if (rect.width > 0 && rect.height > 0) {
        await initializePixiApp(rect.width, rect.height);
        await checkLocalModels();
      } else {
        setTimeout(initWhenReady, 200);
      }
    };

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

  const checkLocalModels = async () => {
    try {
      // 完全禁用本地模型掃描，因為它會檢查不存在的硬編碼資料夾
      console.log('已禁用本地模型掃描，等待用戶上傳');
      setIsLoading(false);
    } catch (error) {
      console.log('無法檢查本地模型目錄:', error);
      setIsLoading(false);
    }
  };

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

      if (containerRef.current) {
        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(app.view as HTMLCanvasElement);
      }
      pixiAppRef.current = app;

      setIsLoading(false);
    } catch (error) {
      console.error('Failed to initialize PixiJS app:', error);
      const errorMessage = error instanceof Error ? error.message : '未知錯誤';
      setModelError(`PixiJS 初始化失敗: ${errorMessage}`);
      setIsLoading(false);
    }
  };

  const loadModel = async (modelData: UploadedModel) => {
    try {
      setIsLoading(true);
      setModelError(null);
      setCurrentModel(modelData);

      if (modelData.type === 'live2d') {
        setModelType('live2d');
        if (!pixiAppRef.current) {
          throw new Error('PixiJS app is not initialized.');
        }
        
        if (modelData.id.startsWith('local_')) {
          await loadLocalLive2DModel(modelData);
        } else {
          await loadLive2DModel(modelData);
        }
      } else if (modelData.type === 'vrm') {
        setModelType('vrm');
        await loadVRMModel(modelData);
      }
    } catch (error) {
      console.error('Failed to load model:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setModelError(`模型載入失敗: ${errorMessage}`);
      setIsLoading(false);
    }
  };

  const loadLive2DModel = async (modelData: UploadedModel) => {
    const modelFile = modelData.files.find(f => f.type === 'model');
    if (!modelFile) {
      throw new Error('找不到模型檔案');
    }

    try {
      const formData = new FormData();
      modelData.files.forEach(({ file, name }) => {
        formData.append('files', file, name);
      });

      const uploadResponse = await fetch('/api/upload-model', {
        method: 'POST',
        body: formData
      });

      if (!uploadResponse.ok) {
        throw new Error('模型上傳失敗');
      }

      const { modelUrl } = await uploadResponse.json();

      const model = Live2DModel.fromSync(modelUrl, {
        onLoad: () => {
          if (mountedRef.current) {
            try {
              setupLive2DModel(model, modelData);
            } catch (e) {
              console.error('Live2D 模型設置錯誤:', e);
              const errorMessage = e instanceof Error ? e.message : String(e);
              setModelError(`Live2D 模型設置失敗: ${errorMessage}`);
            }
          }
        },
        onError: (error: any) => {
          if (mountedRef.current) {
            console.error('Live2D 模型載入錯誤:', error);
            setModelError(`Live2D 載入失敗: ${error.message}`);
          }
        }
      });

      modelRef.current = model;
      
    } catch (error) {
      console.error('Live2D 模型載入失敗:', error);
      await loadLocalLive2DModel(modelData);
    }
  };

  const loadLocalLive2DModel = async (modelData: UploadedModel) => {
    try {
      const modelName = modelData.name;
      const modelPath = `/models/${modelName}/${modelName}.model3.json`;
      
      const model = Live2DModel.fromSync(modelPath, {
        onLoad: () => {
          if (mountedRef.current) {
            try {
              setupLive2DModel(model, modelData);
            } catch (e) {
              console.error('本地 Live2D 模型設置錯誤:', e);
              const errorMessage = e instanceof Error ? e.message : String(e);
              setModelError(`本地 Live2D 模型設置失敗: ${errorMessage}`);
            }
          }
        },
        onError: (error: any) => {
          if (mountedRef.current) {
            console.error('本地 Live2D 模型載入錯誤:', error);
            setModelError(`本地 Live2D 載入失敗: ${error.message}`);
          }
        }
      });

      modelRef.current = model;
      
    } catch (error) {
      console.error('本地 Live2D 模型載入失敗:', error);
      throw error;
    }
  };

  const loadVRMModel = async (modelData: UploadedModel) => {
    try {
      if (!sceneRef.current || !rendererRef.current || !cameraRef.current) {
        await initializeThreeJS();
      }

      const modelPath = `/models/${modelData.name}/${modelData.name}.vrm`;
      await loadVRMModelWithLoader(modelPath);
      
      setModelType('vrm');
      setCurrentModel(modelData);
      setIsLoading(false);
    } catch (error) {
      console.error('VRM 模型載入失敗:', error);
      setModelError(`VRM 模型載入失敗: ${error instanceof Error ? error.message : '未知錯誤'}`);
      setIsLoading(false);
    }
  };

  const loadVRMModelWithLoader = async (modelPath: string) => {
    if (!sceneRef.current || !rendererRef.current || !cameraRef.current) return;

    const loader = new GLTFLoader();
    // Fix type compatibility issue by using comprehensive type assertion
    (loader as any).register((parser: any) => {
      return new VRMLoaderPlugin(parser);
    });
  
    try {
      console.log('載入 VRM 模型:', modelPath);
      const gltf = await loader.loadAsync(modelPath);
      
      const vrm = gltf.userData.vrm;
      
      if (vrmModelRef.current && sceneRef.current) {
        sceneRef.current.remove(vrmModelRef.current);
      }
      
      if (sceneRef.current) {
        sceneRef.current.add(vrm.scene);
      }
      vrmModelRef.current = vrm.scene;
      
      vrm.scene.position.set(0, -2, 0);
      vrm.scene.scale.set(3, 3, 3);
      
      const light = new THREE.DirectionalLight(0xffffff);
      light.position.set(1, 1, 1).normalize();
      sceneRef.current.add(light);

      const animate = (t: number) => {
        if (!mountedRef.current) return;
        requestAnimationFrame(animate);
        if (isPlaying) {
          vrm.update(t);
        }
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      };
      animate(0);
      
      setModelError(null);
      setIsLoading(false);
      
      console.log('VRM 模型設置完成');
    } catch (error) {
      console.error('VRM 載入失敗:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setModelError(`VRM 載入失敗，請確認檔案格式正確: ${errorMessage}`);
      setIsLoading(false);
    }
  };
  
  const initializeThreeJS = async () => {
    if (!threeContainerRef.current) return;

    sceneRef.current = new THREE.Scene();
    sceneRef.current.background = new THREE.Color(0x1f2937);

    const container = threeContainerRef.current;
    const aspect = container.clientWidth / container.clientHeight;
    cameraRef.current = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
    cameraRef.current.position.set(0, 0, 5);

    rendererRef.current = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    rendererRef.current.setSize(container.clientWidth, container.clientHeight);
    rendererRef.current.setPixelRatio(window.devicePixelRatio);
    rendererRef.current.shadowMap.enabled = true;
    rendererRef.current.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(rendererRef.current.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    sceneRef.current.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    sceneRef.current.add(directionalLight);

    animate();
  };

  const animate = () => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;

    requestAnimationFrame(animate);
    
    if (modelType !== 'vrm' && vrmModelRef.current && isPlaying) {
      vrmModelRef.current.rotation.x += 0.01;
      vrmModelRef.current.rotation.y += 0.01;
    }

    rendererRef.current.render(sceneRef.current, cameraRef.current);
  };
  
  const setupLive2DModel = (model: any, modelData: UploadedModel) => {
    try {
      if (!mountedRef.current || !pixiAppRef.current) {
        return;
      }

      if (modelSetupDoneRef.current) {
        return;
      }

      modelSetupDoneRef.current = true;

      if (pixiAppRef.current.stage.children.length > 0) {
        pixiAppRef.current.stage.removeChildren();
      }

      model.scale.set(0.08);
      model.interactive = true;
      model.buttonMode = true;

      const centerX = pixiAppRef.current.screen.width / 2;
      const centerY = pixiAppRef.current.screen.height * 0.6;
      model.x = centerX;
      model.y = centerY;
      model.anchor.set(0.5, 0.5);

      model.on('pointerdown', () => {
        console.log('點擊模型，播放隨機動作');
        playRandomMotion(model, modelData);
      });

      model.on('pointerover', () => {
        model.scale.set(0.13);
      });

      model.on('pointerout', () => {
        model.scale.set(0.12);
      });

      pixiAppRef.current.stage.addChild(model);

      if (model.internalModel && model.internalModel.motionManager) {
        model.internalModel.motionManager.startMotion('idle', 0);
      }

      setIsLoading(false);
    } catch (error) {
      console.error('Live2D 模型設置錯誤:', error);
      const errorMessage = error instanceof Error ? error.message : '未知錯誤';
      setModelError(`Live2D 模型設置失敗: ${errorMessage}`);
      setIsLoading(false);
    }
  };

  const playRandomMotion = (model: any, modelData: UploadedModel) => {
    if (!model.internalModel || !model.internalModel.motionManager) {
      console.log('模型不支援動作管理器');
      return;
    }

    try {
      const motionManager = model.internalModel.motionManager;
      const availableMotions = motionManager.motionGroups || {};
      
      fetch(`/models/${modelData.name}/${modelData.name}.model3.json`)
        .then(response => response.json())
        .then(modelJson => {
          if (modelJson.FileReferences && modelJson.FileReferences.Motions) {
            const motions = modelJson.FileReferences.Motions;
            const interactiveMotions = Object.keys(motions).filter(motionName => {
              return !motionName.toLowerCase().includes('idle') &&
                     !motionName.toLowerCase().includes('loop') &&
                     motionName !== 'complete' &&
                     motionName !== 'effect';
            });
            
            if (interactiveMotions.length > 0) {
              const randomMotion = interactiveMotions[Math.floor(Math.random() * interactiveMotions.length)];
              try {
                motionManager.startMotion(randomMotion, 0, 3);
              } catch (e) {
                playFallbackMotion(motionManager, availableMotions);
              }
            } else {
              playFallbackMotion(motionManager, availableMotions);
            }
          } else {
            playFallbackMotion(motionManager, availableMotions);
          }
        })
        .catch(() => {
          playFallbackMotion(motionManager, availableMotions);
        });
        
    } catch (error) {
      console.warn('播放動畫失敗:', error);
    }
  };

  const playFallbackMotion = (motionManager: any, availableMotions: any) => {
    const interactiveMotions = Object.keys(availableMotions).filter(motionName => {
      const motionArray = availableMotions[motionName];
      return motionArray && motionArray.length > 0 && 
               !motionName.toLowerCase().includes('idle') &&
               !motionName.toLowerCase().includes('loop');
    });
    
    if (interactiveMotions.length > 0) {
      const randomMotion = interactiveMotions[Math.floor(Math.random() * interactiveMotions.length)];
      motionManager.startMotion(randomMotion, 0, 3);
    } else {
      const specificMotions = ['tap', 'shake', 'nod', 'wave', 'jump', 'dance'];
      for (const motion of specificMotions) {
        try {
          if (availableMotions[motion] && availableMotions[motion].length > 0) {
            motionManager.startMotion(motion, 0, 3);
            return;
          }
        } catch (e) {
          console.log(`動作 ${motion} 播放失敗:`, e);
        }
      }
    }
  };

  const togglePlayPause = () => {
    if (!modelRef.current) return;
    
    if (isPlaying) {
      if (modelRef.current.internalModel && modelRef.current.internalModel.motionManager) {
        modelRef.current.internalModel.motionManager.stopAllMotions();
      }
    } else {
      if (modelRef.current.internalModel && modelRef.current.internalModel.motionManager) {
        modelRef.current.internalModel.motionManager.startMotion('idle', 0);
      }
    }
    
    setIsPlaying(!isPlaying);
  };

  const resetModel = () => {
    if (!modelRef.current || !currentModel) return;
    
    if (pixiAppRef.current) {
      const centerX = pixiAppRef.current.screen.width / 2;
      const centerY = pixiAppRef.current.screen.height / 2;
      modelRef.current.x = centerX;
      modelRef.current.y = centerY;
      modelRef.current.rotation = 0;
      modelRef.current.scale.set(0.2);
    }
    
    if (modelRef.current.internalModel && modelRef.current.internalModel.motionManager) {
      modelRef.current.internalModel.motionManager.startMotion('idle', 0);
    }
    
    setIsPlaying(true);
  };
  
  const processFolderEntry = async (entry: any, files: File[]) => {
    return new Promise<void>(resolve => {
      const reader = entry.createReader();
      const readEntries = () => {
        reader.readEntries(async (entries: any[]) => {
          if (entries.length === 0) {
            resolve();
            return;
          }
          for (const entry of entries) {
            if (entry.isFile) {
              await new Promise<void>(fileResolve => {
                entry.file((file: File) => {
                  files.push(file);
                  fileResolve();
                });
              });
            } else if (entry.isDirectory) {
              await processFolderEntry(entry, files);
            }
          }
          readEntries();
        });
      };
      readEntries();
    });
  };

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    
    console.log('檔案拖放事件觸發');

    const droppedFiles: File[] = [];
    // 處理 dataTransfer.items
    if (event.dataTransfer.items) {
      for (let i = 0; i < event.dataTransfer.items.length; i++) {
        const item = event.dataTransfer.items[i];
        if (item.kind === 'file') {
          // 處理資料夾
          const entry = item.webkitGetAsEntry();
          if (entry && entry.isDirectory) {
            console.log(`拖放了資料夾: ${entry.name}`);
            await processFolderEntry(entry as any, droppedFiles);
          } else {
            const file = item.getAsFile();
            if (file) {
              droppedFiles.push(file);
            }
          }
        }
      }
    } else {
      // 處理 dataTransfer.files (舊版 API)
      for (let i = 0; i < event.dataTransfer.files.length; i++) {
        droppedFiles.push(event.dataTransfer.files[i]);
      }
    }
    
    if (droppedFiles.length > 0) {
        await loadModelFromFiles(droppedFiles);
    }
  }, []);

  const loadModelFromFiles = async (files: File[]) => {
      try {
          setIsLoading(true);
          setModelError(null);
          
          const modelFile = files.find(f => f.name.endsWith('.model3.json') || f.name.endsWith('.vrm'));
          if (!modelFile) {
              throw new Error('找不到主要模型檔案 (.model3.json 或 .vrm)');
          }

          const modelType = modelFile.name.endsWith('.vrm') ? 'vrm' : 'live2d';
          const modelName = modelFile.name.split('.').slice(0, -1).join('.');
          
          const uploadedModelData: UploadedModel = {
              id: `upload_${Date.now()}`,
              name: modelName,
              type: modelType,
              files: files.map(file => ({
                  name: file.name,
                  file: file,
                  type: (file.name.endsWith('.vrm') || file.name.endsWith('.glb') || file.name.endsWith('.gltf')) ? 'model' : 
                        (file.name.endsWith('.model3.json')) ? 'model' :
                        (file.name.endsWith('.png') || file.name.endsWith('.jpg')) ? 'texture' :
                        (file.name.endsWith('.moc3')) ? 'model' :
                        (file.name.endsWith('.motion3.json')) ? 'motion' :
                        (file.name.endsWith('.physics3.json')) ? 'physics' : 'other'
              })),
              createdAt: new Date()
          };
          
          if (modelType === 'vrm') {
            const vrmFile = uploadedModelData.files.find(f => f.type === 'model' && f.name.endsWith('.vrm'));
            if (!vrmFile) {
              throw new Error('找不到 VRM 模型檔案');
            }
            await loadVRMModelFromBlob(vrmFile.file);
          } else {
            await loadLive2DModelFromBlob(uploadedModelData);
          }

      } catch (error) {
          console.error('拖放上傳模型失敗:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          setModelError(`拖放上傳失敗: ${errorMessage}`);
          setIsLoading(false);
      }
  };
  
  const loadLive2DModelFromBlob = async (modelData: UploadedModel) => {
    try {
      console.log('正在從拖放的檔案載入 Live2D 模型...');

      const modelFile = modelData.files.find(f => f.name.endsWith('.model3.json'));
      if (!modelFile) {
        throw new Error('找不到主要的 .model3.json 檔案');
      }
      
      // 使用 PIXI.Assets 預先載入所有資源
      console.log('開始預載入所有資源到 PIXI.Assets...');
      
      const assetPromises: Promise<any>[] = [];
      const blobUrlMap = new Map<string, string>();
      
      // 為每個檔案創建 Blob URL 並添加到 PIXI.Assets
      for (const { file, name } of modelData.files) {
        const blobUrl = URL.createObjectURL(file);
        blobUrlMap.set(name, blobUrl);
        
        // 使用檔案名作為資源鍵
        const assetKey = name;
        PIXI.Assets.add(assetKey, blobUrl);
        
        console.log(`添加資源到 PIXI.Assets: ${assetKey} -> ${blobUrl}`);
        
        // 載入資源到 PIXI.Assets 快取
        const loadPromise = PIXI.Assets.load(assetKey).catch(error => {
          console.warn(`載入資源失敗: ${assetKey}`, error);
        });
        assetPromises.push(loadPromise);
      }
      
      // 等待所有資源載入完成
      await Promise.all(assetPromises);
      console.log('所有資源已預載入到 PIXI.Assets');
      
      // 讀取並處理 model3.json，將路徑改為資源鍵
      const jsonContent = await modelFile.file.text();
      const modelJson = JSON.parse(jsonContent);
      
      // 修改路徑為資源鍵（檔案名）
      if (modelJson.FileReferences?.Textures) {
        modelJson.FileReferences.Textures = modelJson.FileReferences.Textures.map((texturePath: string) => {
          const fileName = texturePath.split('/').pop() || texturePath;
          console.log(`更新貼圖路徑: ${texturePath} -> ${fileName}`);
          return fileName;
        });
      }
      
      if (modelJson.FileReferences?.Motions) {
        Object.keys(modelJson.FileReferences.Motions).forEach(key => {
          modelJson.FileReferences.Motions[key] = modelJson.FileReferences.Motions[key].map((motion: any) => {
            if (motion.File) {
              const fileName = motion.File.split('/').pop() || motion.File;
              console.log(`更新動作路徑: ${motion.File} -> ${fileName}`);
              motion.File = fileName;
            }
            return motion;
          });
        });
      }
      
      if (modelJson.FileReferences?.Expressions) {
        modelJson.FileReferences.Expressions = modelJson.FileReferences.Expressions.map((expr: any) => {
          if (expr.File) {
            const fileName = expr.File.split('/').pop() || expr.File;
            console.log(`更新表情路徑: ${expr.File} -> ${fileName}`);
            expr.File = fileName;
          }
          return expr;
        });
      }
      
      if (modelJson.FileReferences?.Moc) {
        const fileName = modelJson.FileReferences.Moc.split('/').pop() || modelJson.FileReferences.Moc;
        console.log(`更新模型路徑: ${modelJson.FileReferences.Moc} -> ${fileName}`);
        modelJson.FileReferences.Moc = fileName;
      }
      
      if (modelJson.FileReferences?.Physics) {
        const fileName = modelJson.FileReferences.Physics.split('/').pop() || modelJson.FileReferences.Physics;
        console.log(`更新物理路徑: ${modelJson.FileReferences.Physics} -> ${fileName}`);
        modelJson.FileReferences.Physics = fileName;
      }
      
      // 創建處理後的 model3.json blob
      const processedJsonBlob = new Blob([JSON.stringify(modelJson)], { type: 'application/json' });
      const modelBlobUrl = URL.createObjectURL(processedJsonBlob);
      
      console.log('處理後的模型數據:', modelJson);
      console.log('模型 Blob URL:', modelBlobUrl);
      
      // 載入模型
      console.log('開始載入 Live2D 模型...');
      
      try {
        const model = await Live2DModel.from(modelBlobUrl);
        
        if (mountedRef.current) {
          console.log('Live2D 模型載入成功');
          setModelError(null);
          setupLive2DModel(model, modelData);
          
          // 模型載入成功後，延遲清理資源
          setTimeout(() => {
            console.log('模型載入成功，清理資源...');
            
            // 從 PIXI.Assets 移除資源
            blobUrlMap.forEach((blobUrl, fileName) => {
              try {
                PIXI.Assets.unload(fileName);
                console.log(`從 PIXI.Assets 移除: ${fileName}`);
              } catch (e) {
                console.warn(`移除資源失敗: ${fileName}`, e);
              }
            });
            
            // 清理 Blob URLs
            URL.revokeObjectURL(modelBlobUrl);
            blobUrlMap.forEach((blobUrl, fileName) => {
              URL.revokeObjectURL(blobUrl);
              console.log(`清理 Blob URL: ${fileName}`);
            });
            
          }, 10000); // 10秒後清理
        }
        
        modelRef.current = model;
        
      } catch (loadError) {
        console.error('Live2D 模型載入錯誤:', loadError);
        const errorMessage = loadError instanceof Error ? loadError.message : String(loadError);
        setModelError(`Live2D 載入失敗: ${errorMessage}`);
        
        // 載入失敗時也要清理資源
        setTimeout(() => {
          console.log('模型載入失敗，清理資源...');
          
          blobUrlMap.forEach((blobUrl, fileName) => {
            try {
              PIXI.Assets.unload(fileName);
              URL.revokeObjectURL(blobUrl);
            } catch (e) {
              console.warn(`清理資源失敗: ${fileName}`, e);
            }
          });
          
          URL.revokeObjectURL(modelBlobUrl);
        }, 5000);
        
        setIsLoading(false);
      }
      
    } catch (error) {
      console.error('從 Blob 載入 Live2D 模型失敗:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setModelError(`Live2D 模型載入失敗: ${errorMessage}`);
      setIsLoading(false);
    }
  };

const loadVRMModelFromBlob = async (file: File) => {
    if (!sceneRef.current || !rendererRef.current || !cameraRef.current) return;
    
    try {
      console.log('正在載入 VRM Blob 模型...');
      const url = URL.createObjectURL(file);
      
      const loader = new GLTFLoader();
      // Fix type compatibility issue by using comprehensive type assertion
      (loader as any).register((parser: any) => {
        return new VRMLoaderPlugin(parser);
      });
      
      const gltf = await loader.loadAsync(url);
      const vrm = gltf.userData.vrm;
      
      if (vrmModelRef.current && sceneRef.current) {
        sceneRef.current.remove(vrmModelRef.current);
      }
      
      if (sceneRef.current) {
        sceneRef.current.add(vrm.scene);
      }
      vrmModelRef.current = vrm.scene;
      
      vrm.scene.position.set(0, -2, 0);
      vrm.scene.scale.set(3, 3, 3);
      
      const animate = (t: number) => {
        if (!mountedRef.current) return;
        requestAnimationFrame(animate);
        if (isPlaying) {
          vrm.update(t);
        }
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      };
      animate(0);
      
      setModelError(null);
      setIsLoading(false);
      setModelType('vrm');
      
      URL.revokeObjectURL(url);
      console.log('VRM Blob 模型設置完成');
    } catch (error) {
      console.error('VRM Blob 載入失敗:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setModelError(`VRM Blob 載入失敗: ${errorMessage}`);
      setIsLoading(false);
    }
  };
  
return (
    <div 
      className="h-96 w-full relative" 
      style={{ minHeight: '384px', minWidth: '100%' }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {modelType === 'vrm' ? (
        <div ref={threeContainerRef} className="w-full h-full" style={{ width: '100%', height: '100%' }} />
      ) : (
        <div ref={containerRef} className="w-full h-full" style={{ width: '100%', height: '100%' }} />
      )}
      
      {isLoading && (
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-sm text-gray-600">載入動畫模型...</p>
          </div>
        </div>
      )}
      
      {modelError && (
        <div className="absolute inset-0 bg-gradient-to-br from-red-50 to-orange-50 rounded-lg flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
            <p className="text-sm text-red-600 mb-4">{modelError}</p>
            <div className="text-sm text-gray-500">
              請檢查模型檔案格式是否正確，或嘗試重新上傳
            </div>
          </div>
        </div>
      )}
      
      {/* 當沒有模型時顯示上傳區域 */}
      {!isLoading && !modelError && !currentModel && (
        <div className={`absolute inset-0 rounded-lg flex items-center justify-center transition-all duration-200 ${
          dragOver 
            ? 'bg-gradient-to-br from-blue-100 to-purple-100 border-2 border-dashed border-blue-400' 
            : 'bg-gradient-to-br from-gray-50 to-blue-50 border-2 border-dashed border-gray-300'
        }`}>
          <div className="text-center p-6">
            <div className={`w-16 h-16 border-2 border-dashed rounded-lg flex items-center justify-center mx-auto mb-4 transition-colors duration-200 ${
              dragOver ? 'border-blue-400 bg-blue-50' : 'border-blue-300'
            }`}>
              <Upload className={`w-8 h-8 transition-colors duration-200 ${
                dragOver ? 'text-blue-500' : 'text-blue-400'
              }`} />
            </div>
            <h3 className="text-lg font-medium text-gray-700 mb-2">
              {dragOver ? '放開以上傳模型' : '上傳動畫模型'}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              支援 Live2D (.model3.json + 相關文件) 和 VRM (.vrm, .glb, .gltf) 格式
            </p>
            <div className="text-xs text-gray-500 mb-4">
              {dragOver ? '拖放資料夾到此區域即可上傳完整模型' : '拖放文件到此區域，或點擊選擇文件'}
            </div>
            <div className="flex space-x-3 justify-center">
              <input
                type="file"
                multiple
                accept=".model3.json,.moc3,.png,.jpg,.jpeg,.json,.vrm,.glb,.gltf"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) {
                    loadModelFromFiles(files);
                  }
                }}
                className="hidden"
                id="model-file-input"
              />
              <label
                htmlFor="model-file-input"
                className="inline-block px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 cursor-pointer transition-colors duration-200"
              >
                選擇文件
              </label>
              
              <input
                type="file"
                multiple
                {...{ webkitdirectory: '', directory: '' } as any}
                accept=".model3.json,.moc3,.png,.jpg,.jpeg,.json,.vrm,.glb,.gltf"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) {
                    loadModelFromFiles(files);
                  }
                }}
                className="hidden"
                id="model-folder-input"
              />
              <label
                htmlFor="model-folder-input"
                className="inline-block px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 cursor-pointer transition-colors duration-200"
              >
                選擇資料夾
              </label>
            </div>
          </div>
        </div>
      )}
      
      {!isLoading && !modelError && currentModel && (
        <>
          <div className="absolute bottom-4 left-4 flex space-x-2">
            <button
              onClick={togglePlayPause}
              className="p-2 bg-black bg-opacity-50 text-white rounded-lg hover:bg-opacity-70 transition-all duration-150"
              title={isPlaying ? '暫停' : '播放'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              onClick={resetModel}
              className="p-2 bg-black bg-opacity-50 text-white rounded-lg hover:bg-opacity-70 transition-all duration-150"
              title="重置"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          <div className="absolute bottom-4 right-4">
            <div className="bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
              {currentModel ? `${currentModel.type.toUpperCase()} 已載入` : '動畫模型已載入'}
              {modelType && ` (${modelType === 'vrm' ? 'VRM' : 'Live2D'})`}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
