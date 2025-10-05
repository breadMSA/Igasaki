# 向量記憶系統設置指南

## 概述

本系統使用 **BAAI/bge-m3** 模型來實現智能的語義搜尋，比傳統關鍵詞搜尋更準確。

## 設置步驟

### 1. 獲取 API Key

1. 訪問 [SiliconFlow](https://api.siliconflow.cn/)
2. 註冊帳號並獲取 API Key
3. 或者使用其他支援 BAAI/bge-m3 的 API 服務

### 2. 配置環境變數

在 `.env` 文件中添加：

```bash
MEMORY_API_KEY=your_api_key_here
```

### 3. 重啟服務

```bash
# 重啟後端服務
cd server
npm run dev

# 重啟前端服務
cd client
npm run dev
```

## 功能特點

### 🧠 智能語義搜尋
- 使用 BAAI/bge-m3 模型將文本轉換為 1024 維向量
- 通過餘弦相似度計算相關性
- 比關鍵詞搜尋更準確，能理解語義

### 🔄 自動備用方案
- 如果向量搜尋失敗，自動回退到關鍵詞搜尋
- 確保系統的穩定性和可用性

### 📊 相關性評分
- 每條搜尋結果都有相似度分數 (0-1)
- 按相關性自動排序
- 只返回相似度 > 0.3 的結果

## API 端點

### 搜尋相關歷史
```
POST /api/vector-memory/search
```

**請求體：**
```json
{
  "query": "用戶的查詢文本",
  "messages": [...], // 歷史消息陣列
  "topK": 20        // 返回結果數量
}
```

**回應：**
```json
{
  "success": true,
  "results": [
    {
      "text": "相關的歷史消息",
      "score": 0.85,
      "timestamp": "2024-01-01T00:00:00.000Z",
      "role": "assistant"
    }
  ],
  "totalFound": 15
}
```

### 批量向量化
```
POST /api/vector-memory/vectorize
```

### 服務狀態檢查
```
GET /api/vector-memory/status
```

## 技術細節

### 向量化流程
1. 用戶發送消息
2. 系統將查詢文本轉換為向量
3. 與所有歷史消息的向量計算相似度
4. 按相似度排序並返回最相關的結果

### 性能優化
- 批量處理：每次處理 10 條消息
- 非阻塞執行：向量化過程不影響對話響應
- 智能快取：避免重複向量化相同內容

## 故障排除

### 常見問題

**Q: 向量搜尋失敗怎麼辦？**
A: 系統會自動回退到關鍵詞搜尋，確保功能正常

**Q: API Key 無效？**
A: 檢查 `.env` 文件中的 `MEMORY_API_KEY` 是否正確

**Q: 搜尋結果不準確？**
A: 調整 `topK` 參數或相似度閾值

### 日誌檢查

查看後端控制台輸出：
```
🧠 向量搜尋: "查詢文本" (topK: 20)
✅ 找到 15 條相關記錄
```

## 進階配置

### 自定義相似度閾值
在 `vectorMemoryService.ts` 中修改：
```typescript
.filter(result => result.score > 0.3) // 調整此值
```

### 使用本地模型
如果需要離線使用，可以下載 BAAI/bge-m3 模型到本地。

## 支援

如有問題，請檢查：
1. 環境變數配置
2. API Key 有效性
3. 網路連線狀態
4. 後端服務日誌
