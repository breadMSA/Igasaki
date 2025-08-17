# 個人 AI 助手 - 構建與運行指南

## 🚀 快速開始

### 1. 安裝依賴

```bash
# 安裝根目錄依賴
npm install

# 安裝所有模組依賴
npm run install:all
```

### 2. 環境配置

複製環境變數範本：
```bash
cp env.example .env
```

編輯 `.env` 檔案，設定必要的 API 金鑰：

```env
# Gemini API 設定（必填）
GEMINI_API_KEY=your_gemini_api_key_here

# 外部聊天代理設定（必填，需自行確保合法授權）
CHAT_PROXY_URL=your_proxy_base_url
CHAT_PROXY_API_KEY=your_proxy_api_key_if_needed
CHAT_PROXY_CHAT_PATH=/v1/chat
CHAT_PROXY_VOICE_ID=default_voice_id

# 其他設定（可選）
TTS_MODE=chat-say
TTS_FORMAT=mp3
SAFETY_ENABLE_HARDBLOCK=true
SAFETY_CLASSIFY_WITH_GEMINI=true
LOG_SENSITIVE_TEXTS=false
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

### 3. 啟動開發環境

```bash
# 同時啟動前後端
npm run dev
```

這會啟動：
- 後端服務器：http://localhost:3001
- 前端開發服務器：http://localhost:5173

## 📋 環境需求

### 必要需求
- **Node.js**: 20.0.0 或更高版本
- **現代瀏覽器**: Chrome 90+, Firefox 88+, Edge 90+
- **Gemini API 金鑰**: 從 Google AI Studio 獲取

### 可選需求
- **Character.AI Token**: 用於情色內容路由（需自行確保合法授權）
- **Live2D 模型**: 放置在 `client/public/models/` 目錄

## 🛠️ 功能配置

### Gemini API 設定

1. 前往 [Google AI Studio](https://aistudio.google.com/)
2. 創建 API 金鑰
3. 將金鑰設定到 `GEMINI_API_KEY` 環境變數

### Character.AI 代理設定

⚠️ **重要安全聲明**：本專案僅提供與外部代理整合的抽象接法。請確保你對外部服務的使用具有合法授權並遵守其服務條款。

如果你有合法的 Character.AI 代理服務：

1. 設定 `CHAT_PROXY_URL` 為你的代理基礎 URL
2. 設定 `CHAT_PROXY_API_KEY`（如果需要）
3. 調整 `CHAT_PROXY_CHAT_PATH` 和其他相關設定

### Live2D 模型配置

1. 將 Live2D 模型檔案放置在 `client/public/models/` 目錄
2. 確保模型結構如下：

```
client/public/models/
├── your_model.model3.json
├── your_model.moc3
├── textures/
│   └── texture_00.png
└── motions/
    └── idle_01.motion3.json
```

3. 在設定中啟用 Live2D 功能

## 🔧 開發指南

### 後端開發

```bash
# 僅啟動後端
cd server
npm run dev
```

後端 API 端點：
- `POST /api/chat` - SSE 串流聊天
- `POST /api/tts` - 語音合成
- `GET /api/tts/voices` - 獲取聲線列表
- `GET /api/health` - 健康檢查

### 前端開發

```bash
# 僅啟動前端
cd client
npm run dev
```

前端功能：
- 多段式聊天介面
- 按需語音播放
- Live2D 虛擬角色
- 永久記憶管理
- 響應式設計

### 測試

```bash
# 後端測試
cd server
npm run lint
npm run type-check

# 前端測試
cd client
npm run lint
npm run type-check
```

## 📦 生產建置

### 建置所有模組

```bash
npm run build
```

### 部署

#### 本機部署

```bash
# 建置
npm run build

# 啟動生產服務器
cd server
npm start
```

#### Vercel 部署（推薦）

1. 將專案推送到 GitHub
2. 在 Vercel 中導入專案
3. 設定環境變數
4. 部署

#### Docker 部署

創建 `Dockerfile`：

```dockerfile
FROM node:20-alpine

WORKDIR /app

# 複製 package files
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# 安裝依賴
RUN npm ci --only=production
RUN cd server && npm ci --only=production
RUN cd client && npm ci --only=production

# 複製源碼
COPY . .

# 建置
RUN npm run build

EXPOSE 3001

CMD ["node", "server/dist/index.js"]
```

## 🐛 故障排除

### 常見問題

#### 1. 後端啟動失敗

```
Error: Environment variable GEMINI_API_KEY is required but not set
```

**解決方案**：檢查 `.env` 檔案是否正確設定 `GEMINI_API_KEY`

#### 2. 前端無法連接後端

```
Network Error: fetch failed
```

**解決方案**：
- 確認後端服務器正在運行（port 3001）
- 檢查 CORS 設定
- 確認防火牆設定

#### 3. WebSocket 連接失敗

```
WebSocket connection failed
```

**解決方案**：
- 檢查 Character.AI 代理設定
- 驗證 API 金鑰有效性
- 確認網路連接

#### 4. Live2D 模型載入失敗

**解決方案**：
- 檢查模型檔案完整性
- 確認檔案路徑正確
- 驗證模型格式支援

### 日誌偵錯

#### 開啟詳細日誌

```env
DEBUG=true
LOG_LEVEL=debug
```

#### 查看後端日誌

```bash
cd server
npm run dev
```

#### 查看前端控制台

開啟瀏覽器開發者工具 → Console

## 🔒 安全考量

### 環境變數保護

- 永不將 `.env` 檔案提交到版本控制
- 生產環境使用安全的環境變數管理
- 定期輪換 API 金鑰

### 內容安全

- 成人內容會被智能路由處理
- 敏感內容不會記錄到日誌
- 所有音頻檔案不會永久保存

### 網路安全

- 所有 API 請求使用 HTTPS（生產環境）
- 實作了 CORS 保護
- 添加了基本的速率限制

## 📚 進階配置

### 自定義內容分類規則

編輯 `server/src/services/contentClassifier.ts`：

```typescript
// 添加自定義安全模式
this.customPatterns = [
  {
    pattern: /your_custom_pattern/i,
    category: 'custom_category',
    action: 'deny',
    confidence: 0.9
  }
];
```

### 自定義 TTS 提示詞

設定環境變數：

```env
TTS_SYSTEM_PROMPT=你的自定義系統提示詞
TTS_USER_TEMPLATE=請朗讀：{{TEXT}}
```

### Live2D 表情控制

在 `client/src/components/Live2DDisplay.tsx` 中自定義表情：

```typescript
const expressions = [
  { name: '微笑', file: 'smile.exp3.json' },
  { name: '思考', file: 'thinking.exp3.json' },
  // 添加更多表情
];
```

## 📖 API 文檔

### 聊天 API

```typescript
POST /api/chat
Content-Type: application/json

{
  "message": "你好",
  "images": ["base64_image_data"],  // 可選
  "personaId": "persona_id",        // 可選
  "history": [                      // 可選
    {"role": "user", "content": "previous message"},
    {"role": "assistant", "content": "previous response"}
  ]
}
```

### TTS API

```typescript
POST /api/tts
Content-Type: application/json

{
  "text": "要朗讀的文字",
  "voiceId": "voice_id",     // 可選
  "rate": 1.0,               // 可選
  "pitch": 1.0               // 可選
}
```

## 🤝 貢獻指南

1. Fork 專案
2. 創建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 開啟 Pull Request

## 📄 授權條款

本專案採用 MIT 授權條款。詳見 `LICENSE` 檔案。

## ❓ 支援

如遇問題，請：

1. 查看此文檔的故障排除章節
2. 檢查 GitHub Issues
3. 創建新的 Issue 並提供詳細資訊

---

## 🎯 後續開發計劃

- [ ] 完整的 Live2D 整合
- [ ] 更多語音合成選項
- [ ] 記憶搜尋與管理
- [ ] 多語言支援
- [ ] 插件系統
- [ ] 移動端適配
- [ ] 語音識別輸入
- [ ] 主題自定義
