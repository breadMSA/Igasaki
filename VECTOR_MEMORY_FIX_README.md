# 向量記憶服務修復說明

## 問題描述

之前的向量記憶服務存在以下問題：

1. **每次重啟都強制重新向量化**：服務重啟後，即使已經有向量數據庫文件，也會重新處理所有歷史記錄
2. **沒有利用已存在的向量數據**：浪費了之前已經計算好的向量，導致性能低下
3. **IndexedDB 中的歷史記錄沒有被正確利用**：雖然前端獲取了所有消息，但後端沒有正確地持久化和重用

## 修復內容

### 1. 自動加載已存在的向量數據庫

在 `VectorMemoryService` 構造函數中，現在會自動嘗試從文件加載已存在的向量數據庫：

```typescript
// 重要：在初始化時嘗試加載已存在的向量數據庫
this.loadFromFile().then(loaded => {
  if (loaded) {
    console.log(`✅ 成功從文件加載向量數據庫，包含 ${this.conversations.length} 條對話`);
  } else {
    console.log('📁 沒有找到已存在的向量數據庫文件，將在首次搜尋時創建');
  }
}).catch(error => {
  console.error('❌ 加載向量數據庫失敗:', error);
});
```

### 2. 智能搜尋邏輯

修改了 `searchRelevantHistory` 方法，現在會：

1. 首先檢查內存中是否已有向量數據
2. 如果沒有，嘗試從文件加載
3. 只有在文件加載失敗時，才重新構建向量數據庫

```typescript
// 重要修復：如果沒有預先構建的向量數據庫，先嘗試從文件加載
if (this.conversations.length === 0) {
  console.log('🔄 首次搜尋，嘗試從文件加載向量數據庫...');
  const loaded = await this.loadFromFile();
  
  if (!loaded) {
    console.log('📁 文件加載失敗，從歷史記錄構建向量數據庫...');
    await this.buildVectorDatabaseFromHistory(messages);
  }
}
```

### 3. 新增API端點

#### 檢查數據庫狀態
```
GET /api/vector-memory/database-status
```

返回詳細的數據庫狀態，包括：
- 內存中的對話數量
- 文件是否存在
- 文件大小和最後修改時間
- 配置信息

#### 強制重新加載
```
POST /api/vector-memory/reload
```

用於手動重新加載向量數據庫（如果需要的話）

## 使用方法

### 1. 檢查修復是否生效

重啟服務後，查看控制台日誌：
- 如果看到 "✅ 成功從文件加載向量數據庫，包含 X 條對話"，說明修復成功
- 如果看到 "📁 沒有找到已存在的向量數據庫文件，將在首次搜尋時創建"，說明是首次運行

### 2. 監控數據庫狀態

使用新的API端點檢查狀態：
```bash
curl http://localhost:3000/api/vector-memory/database-status
```

### 3. 測試搜尋功能

發送一條消息，觀察控制台日誌：
- 應該不會再看到 "強制重新構建向量數據庫"
- 應該會看到 "從文件加載向量數據庫成功"

## 預期效果

1. **首次運行**：會創建向量數據庫並保存到文件
2. **後續重啟**：會自動從文件加載，不再重新向量化
3. **搜尋性能**：大幅提升，因為不需要重新計算向量
4. **記憶準確性**：能夠正確檢索到之前的對話內容

## 注意事項

1. 確保 `MEMORY_API_KEY` 環境變量已設置
2. 向量數據庫文件會保存在 `./data/memory/{character_name}/` 目錄下
3. 如果遇到問題，可以使用 `/reload` 端點強制重新加載

## 測試腳本

運行 `server/test-vector-memory.js` 來測試修復是否有效：

```bash
cd server
node test-vector-memory.js
```

這個腳本會：
1. 創建服務實例
2. 檢查初始狀態
3. 測試搜尋功能
4. 檢查搜尋後的狀態
5. 驗證向量數據庫是否正確加載

