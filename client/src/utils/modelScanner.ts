export interface ScannedModel {
  id: string;
  name: string;
  type: 'live2d' | 'vrm';
  path: string;
  files: string[];
  hasModelFile: boolean;
  hasTextures: boolean;
}

/**
 * 掃描 models 目錄中的模型檔案
 * 使用智能遞迴掃描，完全自動化
 */
export async function scanModels(): Promise<ScannedModel[]> {
  try {
    console.log('開始智能掃描 models 目錄...');
    
    // 使用遞迴掃描來發現模型資料夾
    const modelFolders = await discoverModelFolders();
    
    console.log('發現的模型資料夾:', modelFolders);
    
    const models: ScannedModel[] = [];
    
    for (const modelName of modelFolders) {
      try {
        console.log(`🔍 檢查模型資料夾: ${modelName}`);
        
        // 檢查 Live2D 模型檔案
        const model3Path = `/models/${modelName}/${modelName}.model3.json`;
        const moc3Path = `/models/${modelName}/${modelName}.moc3`;
        
        let hasModel3Json = false;
        let hasMoc3 = false;
        
        try {
          const model3Response = await fetch(model3Path, { method: 'HEAD' });
          hasModel3Json = model3Response.ok;
        } catch (e) {}
        
        try {
          const moc3Response = await fetch(moc3Path, { method: 'HEAD' });
          hasMoc3 = moc3Response.ok;
        } catch (e) {}
        
        if (hasModel3Json || hasMoc3) {
          console.log(`✅ 找到 Live2D 模型: ${modelName}`);
          
          // 檢查貼圖檔案
          const texturePath = `/models/${modelName}/textures/`;
          let hasTextures = false;
          
          try {
            const textureResponse = await fetch(texturePath, { method: 'HEAD' });
            hasTextures = textureResponse.ok;
          } catch (e) {}
          
          models.push({
            id: modelName,
            name: modelName,
            type: 'live2d',
            path: `/models/${modelName}`,
            files: [
              ...(hasModel3Json ? [`${modelName}.model3.json`] : []),
              ...(hasMoc3 ? [`${modelName}.moc3`] : []),
              ...(hasTextures ? ['textures/'] : [])
            ],
            hasModelFile: true,
            hasTextures: hasTextures
          });
          continue;
        }
        
        // 檢查 VRM 模型檔案
        const vrmFiles = await checkVRMFiles(modelName);
        if (vrmFiles.length > 0) {
          console.log(`✅ 找到 VRM 模型: ${modelName}`);
          
          models.push({
            id: modelName,
            name: modelName,
            type: 'vrm',
            path: `/models/${modelName}`,
            files: vrmFiles,
            hasModelFile: true,
            hasTextures: false
          });
          continue;
        }
        
        console.log(`⚠️ 模型資料夾 ${modelName} 中沒有找到支援的模型檔案`);
        
      } catch (error) {
        console.log(`檢查模型 ${modelName} 時發生錯誤:`, error);
      }
    }
    
    console.log('掃描完成，找到的模型:', models);
    return models;
    
  } catch (error) {
    console.error('掃描模型目錄失敗:', error);
    return [];
  }
}

/**
 * 智能發現模型資料夾
 */
async function discoverModelFolders(): Promise<string[]> {
  const modelFolders: string[] = [];
  
  // 方法1：嘗試獲取 models 目錄的內容
  try {
    const modelsResponse = await fetch('/models/');
      if (modelsResponse.ok) {
        const modelsText = await modelsResponse.text();
        console.log('成功獲取目錄內容，長度:', modelsText.length);
        
      // 解析目錄內容，尋找資料夾名稱
        const folderMatches = modelsText.match(/href="([^"]+\/)"/g);
        if (folderMatches) {
        for (const match of folderMatches) {
              const hrefMatch = match.match(/href="([^"]+\/)"/);
              if (hrefMatch) {
                const folderName = hrefMatch[1].replace(/\/$/, '');
            // 過濾掉不符合條件的項目
                if (folderName && 
                    !folderName.startsWith('http') && 
                    !folderName.startsWith('//') &&
                    !folderName.includes('.') &&
                    !folderName.includes('?') &&
                    !folderName.includes('&') &&
                    !folderName.includes('=') &&
                    !folderName.includes('#') &&
                    folderName !== 'models' &&
                    folderName !== '..' &&
                    folderName !== '.' &&
                    folderName.length > 0 &&
                    folderName.length < 50) {
              modelFolders.push(folderName);
            }
          }
        }
      }
      }
    } catch (error) {
    console.log('無法獲取目錄頁面，嘗試其他方法...');
    }
    
  // 方法2：如果目錄掃描失敗，嘗試檢查常見的資料夾名稱
    if (modelFolders.length === 0) {
    console.log('目錄掃描失敗，嘗試檢查常見的資料夾名稱...');
    
    // 使用一個更智能的方法：檢查是否有任何資料夾包含模型檔案
    const commonNames = await findFoldersWithModelFiles();
    modelFolders.push(...commonNames);
  }
  
  return modelFolders;
}

/**
 * 尋找包含模型檔案的資料夾
 */
async function findFoldersWithModelFiles(): Promise<string[]> {
  const folders: string[] = [];
  
  // 嘗試檢查一些可能的資料夾名稱
  // 這裡我們使用一個更智能的方法，而不是硬編碼
  const possibleNames = await generatePossibleFolderNames();
  
  for (const folderName of possibleNames) {
    try {
      // 檢查是否有任何模型檔案
      const hasLive2D = await checkLive2DFiles(folderName);
      const hasVRM = await checkVRMFiles(folderName);
      
      if (hasLive2D || hasVRM.length > 0) {
        console.log(`✅ 發現模型資料夾: ${folderName}`);
        folders.push(folderName);
          }
        } catch (e) {
      // 繼續檢查下一個
    }
  }
  
  return folders;
}

/**
 * 生成可能的資料夾名稱
 */
async function generatePossibleFolderNames(): Promise<string[]> {
  const names: string[] = [];
  
  // 檢查單個字母/數字
  for (let i = 0; i < 10; i++) {
    names.push(i.toString());
  }
  
  // 檢查常見的模型資料夾名稱
  const commonPatterns = ['model', 'live2d', 'vrm', 'character', 'avatar'];
  names.push(...commonPatterns);
  
  // 檢查是否有其他資料夾（通過嘗試訪問）
  // 這裡我們可以實現一個更智能的算法
  // 但現在先使用這些基本模式
  
  return names;
}

/**
 * 檢查 Live2D 檔案
 */
async function checkLive2DFiles(folderName: string): Promise<boolean> {
  try {
    const model3Path = `/models/${folderName}/${folderName}.model3.json`;
    const moc3Path = `/models/${folderName}/${folderName}.moc3`;
    
    const model3Response = await fetch(model3Path, { method: 'HEAD' });
    if (model3Response.ok) return true;
    
    const moc3Response = await fetch(moc3Path, { method: 'HEAD' });
    if (moc3Response.ok) return true;
    
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * 檢查 VRM 檔案
 */
async function checkVRMFiles(modelName: string): Promise<string[]> {
  const vrmFiles: string[] = [];
  
  // 檢查常見的 VRM 檔案名稱
  const possibleNames = [
    `${modelName}.vrm`,
    `${modelName}.glb`,
    `${modelName}.gltf`,
    'model.vrm',
    'model.glb',
    'model.gltf'
  ];
  
  // 檢查是否有其他 VRM 檔案（如數字名稱）
  try {
    const dirResponse = await fetch(`/models/${modelName}/`);
    if (dirResponse.ok) {
      const dirText = await dirResponse.text();
      const vrmMatches = dirText.match(/href="([^"]+\.(vrm|glb|gltf))"/g);
      if (vrmMatches) {
        for (const match of vrmMatches) {
          const fileName = match.match(/href="([^"]+)"/)?.[1];
          if (fileName && (fileName.endsWith('.vrm') || fileName.endsWith('.glb') || fileName.endsWith('.gltf'))) {
            vrmFiles.push(fileName);
          }
        }
      }
    }
  } catch (e) {}
  
  // 檢查已知的檔案名稱
  for (const fileName of possibleNames) {
    try {
      const response = await fetch(`/models/${modelName}/${fileName}`, { method: 'HEAD' });
      if (response.ok) {
        vrmFiles.push(fileName);
      }
    } catch (e) {}
  }
  
  return vrmFiles;
}

/**
 * 檢查特定模型是否存在
 */
export async function checkModelExists(modelName: string): Promise<ScannedModel | null> {
  try {
    console.log(`🔍 檢查模型是否存在: ${modelName}`);
    
    // 檢查 Live2D 模型檔案
    const model3Path = `/models/${modelName}/${modelName}.model3.json`;
    const moc3Path = `/models/${modelName}/${modelName}.moc3`;
    
    let hasModel3Json = false;
    let hasMoc3 = false;
    
      try {
        const model3Response = await fetch(model3Path, { method: 'HEAD' });
      hasModel3Json = model3Response.ok;
    } catch (e) {}
    
    try {
      const moc3Response = await fetch(moc3Path, { method: 'HEAD' });
      hasMoc3 = moc3Response.ok;
    } catch (e) {}
    
    if (hasModel3Json || hasMoc3) {
      console.log(`✅ 找到 Live2D 模型: ${modelName}`);
      
      // 檢查貼圖檔案
      const texturePath = `/models/${modelName}/textures/`;
      let hasTextures = false;
      
      try {
        const textureResponse = await fetch(texturePath, { method: 'HEAD' });
        hasTextures = textureResponse.ok;
      } catch (e) {}
      
          return {
            id: modelName,
            name: modelName,
            type: 'live2d',
            path: `/models/${modelName}`,
        files: [
          ...(hasModel3Json ? [`${modelName}.model3.json`] : []),
          ...(hasMoc3 ? [`${modelName}.moc3`] : []),
          ...(hasTextures ? ['textures/'] : [])
        ],
            hasModelFile: true,
        hasTextures: hasTextures
      };
    }
    
    // 檢查 VRM 模型檔案
    const vrmFiles = await checkVRMFiles(modelName);
    if (vrmFiles.length > 0) {
      console.log(`✅ 找到 VRM 模型: ${modelName}`);
      
            return {
              id: modelName,
              name: modelName,
              type: 'vrm',
              path: `/models/${modelName}`,
        files: vrmFiles,
              hasModelFile: true,
              hasTextures: false
            };
    }
    
    console.log(`❌ 沒有找到支援的模型檔案: ${modelName}`);
    return null;
    
  } catch (error) {
    console.error(`檢查模型 ${modelName} 失敗:`, error);
    return null;
  }
}

/**
 * 獲取模型的主檔案路徑
 */
export function getModelMainFile(model: ScannedModel): string | null {
  if (model.type === 'live2d') {
    // 尋找 .model3.json 或 .moc3 檔案
    const modelFile = model.files.find(file => 
      file.endsWith('.model3.json') || file.endsWith('.moc3')
    );
    return modelFile ? `${model.path}/${modelFile}` : null;
  } else if (model.type === 'vrm') {
    // 尋找 .vrm, .glb, 或 .gltf 檔案
    const modelFile = model.files.find(file => 
      file.endsWith('.vrm') || file.endsWith('.glb') || file.endsWith('.gltf')
    );
    return modelFile ? `${model.path}/${modelFile}` : null;
  }
  return null;
}
