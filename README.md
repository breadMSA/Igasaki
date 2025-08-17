# 個人 AI 助手 - Personal AI Assistant

## ⚠️ 重要安全與合規聲明

**本專案僅提供「與外部代理整合」的抽象接法。請確保你對外部服務（包括任何聊天或語音服務）的使用具有合法授權並遵守其服務條款。本專案不提供繞過付費、身份驗證或使用限制的教學或程式碼。**

使用本專案時，你需要：
- 自行確保對使用的外部 API 服務具有合法授權
- 遵守所有相關服務的服務條款（Terms of Service）
- 承擔使用外部服務的法律責任
- 不將本專案用於任何違法或違反服務條款的用途

## 專案概述

本專案是一個可在本機運行的 AI 助手，具備以下特色：

### 主要功能
- **智能內容路由**：自動分類用戶輸入，將不同類型的對話導向適當的處理管道
- **Gemini AI 整合**：使用 Google Gemini 2.5 Flash 與 Grounding 搜尋功能
- **外部聊天代理**：支援 Character.AI 等外部服務整合
- **按需語音合成**：點擊播放才生成語音，不自動播放或快取
- **Live2D 虛擬角色**：音量驅動的嘴型同步
- **永久記憶系統**：使用 IndexedDB 保存對話歷史與偏好設定

### 技術架構

#### 後端 (Node.js + Express + TypeScript)
- **內容分類與路由**：兩段式安全檢查（規則 + AI 分類）
- **SSE 串流 API**：多段式訊息實時推送
- **TTS 服務**：基於外部代理的 chat-say 模式
- **安全機制**：嚴禁內容直接拒絕，敏感內容不記錄

#### 前端 (React + Vite + TypeScript)
- **Chat UI**：多段式訊息顯示，每段獨立播放按鈕
- **音頻處理**：WebAudio API 音量分析與 Live2D 同步
- **記憶管理**：Dexie (IndexedDB) 永久儲存
- **Live2D 渲染**：PIXI.js 驅動的虛擬角色

## 快速開始

### 環境要求
- Node.js 20.0.0 或更高版本
- 現代瀏覽器（Chrome/Edge 推薦）
- Windows 10/11 （主要測試環境）

### 安裝與配置

1. **克隆專案並安裝依賴**
```bash
git clone <repository-url>
cd personal-ai-assistant
npm run install:all
```

2. **配置環境變數**
```bash
# 複製環境變數範本
cp .env.example .env
```

編輯 `.env` 檔案：
```env
# Gemini API 設定
GEMINI_API_KEY=your_gemini_api_key_here

# 外部聊天代理設定（需自行確保合法授權）
CHAT_PROXY_URL=your_proxy_base_url
CHAT_PROXY_API_KEY=your_proxy_api_key
CHAT_PROXY_CHAT_PATH=/v1/chat
CHAT_PROXY_VOICE_ID=default_voice_id

# TTS 設定
TTS_MODE=chat-say
TTS_FORMAT=mp3

# 安全設定
SAFETY_ENABLE_HARDBLOCK=true
SAFETY_CLASSIFY_WITH_GEMINI=true
LOG_SENSITIVE_TEXTS=false
```

3. **啟動開發環境**
```bash
npm run dev
```

這會同時啟動後端服務器（預設 port 3001）和前端開發服務器（預設 port 5173）。

### Live2D 模型配置

將 Live2D 模型檔案放置在 `client/public/models/` 目錄下：
```
client/public/models/
├── your_model.model3.json
├── your_model.moc3
├── textures/
└── motions/
```

如果沒有模型，前端會顯示放置指引。

## API 文檔

### POST /api/chat
SSE 串流聊天 API

**請求格式：**
```json
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

**SSE 事件：**
- `utterance`: 訊息段落
- `citation`: 引用來源（僅 Gemini 路徑）
- `memory`: 記憶操作
- `meta`: 路由資訊
- `error`: 錯誤訊息
- `done`: 完成標記

### POST /api/tts
按需語音合成

**請求格式：**
```json
{
  "text": "要朗讀的文字",
  "voiceId": "voice_id",     // 可選
  "rate": 1.0,               // 可選
  "pitch": 1.0               // 可選
}
```

**回應：** 音頻檔案（MP3/OGG/WAV）

### GET /api/voices
取得可用聲線列表

**回應：**
```json
{
  "voices": [
    {"id": "voice_1", "name": "聲線名稱", "language": "zh-TW"}
  ]
}
```

## 內容分類與路由

系統使用兩段式分類機制：

### 第一階段：規則分類
- **嚴禁類別**：未成年、非自願、亂倫、獸交等 → 直接安全拒絕
- **明顯情色意圖**：露骨描述、挑逗內容等 → 路由至外部代理
- **教育/醫療類**：性教育、醫療諮詢等 → 標記為非情色

### 第二階段：AI 分類
對不確定內容使用 Gemini 進行輕量分類：
```json
{
  "sexualIntent": false,
  "educational": true,
  "hardBlock": false
}
```

### 路由決策
- `hardBlock=true` → 安全拒絕
- `sexualIntent=true && !educational` → 外部代理
- 其他情況 → Gemini + Grounding

## 記憶策略

### 儲存政策
- **非情色內容**：完整保存對話內容
- **情色內容**：僅保存必要元資料與安全摘要
- **嚴禁內容**：僅記錄拒絕事件，不保存原文

### 資料結構
```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: Date;
  conversationId: string;
  route: 'gemini' | 'charProxy' | 'deny';
  attachments?: string[];
}

interface MemoryCard {
  type: string;
  content: string;
  confidence: number;
  createdAt: Date;
}
```

## 開發指南

### 專案結構
```
personal-ai-assistant/
├── server/                 # 後端服務
│   ├── src/
│   │   ├── routes/         # API 路由
│   │   ├── services/       # 業務邏輯
│   │   ├── lib/           # 核心函式庫
│   │   └── types/         # TypeScript 類型定義
│   └── package.json
├── client/                 # 前端應用
│   ├── src/
│   │   ├── components/     # React 組件
│   │   ├── services/       # 前端服務
│   │   ├── hooks/         # 自定義 Hooks
│   │   └── types/         # TypeScript 類型定義
│   └── package.json
└── README.md
```

### 建置與部署

**開發環境：**
```bash
npm run dev          # 同時啟動前後端
npm run server:dev   # 僅啟動後端
npm run client:dev   # 僅啟動前端
```

**生產建置：**
```bash
npm run build        # 建置前後端
npm run server:build # 僅建置後端
npm run client:build # 僅建置前端
```

## 故障排除

### 常見問題

1. **WebSocket 連線失敗**
   - 檢查防火牆設定
   - 確認代理服務設定正確

2. **Gemini API 錯誤**
   - 驗證 API 金鑰有效性
   - 檢查 API 配額使用情況

3. **Live2D 模型載入失敗**
   - 確認模型檔案完整性
   - 檢查檔案路徑與權限

4. **音頻播放問題**
   - 確認瀏覽器支援音頻格式
   - 檢查 CORS 設定

### 除錯模式

啟用詳細日誌：
```env
DEBUG=true
LOG_LEVEL=debug
```

## 授權條款

MIT License

## 貢獻指南

歡迎提交 Issue 和 Pull Request。請確保：
- 遵循現有的程式碼風格
- 添加適當的測試
- 更新相關文檔
- 確保安全性與合規性

## 聯絡資訊

如有問題或建議，請通過 GitHub Issues 聯絡。
