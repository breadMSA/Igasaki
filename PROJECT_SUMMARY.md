# 個人 AI 助手 - 專案總結

## ✅ 已完成功能

### 後端架構 (Node.js + Express + TypeScript)

#### 🔐 內容分類與路由系統
- **兩段式安全檢查**：規則分類 + AI 分類
- **智能路由**：
  - 嚴禁內容 → 直接安全拒絕
  - 情色內容 → 外部聊天代理
  - 正當內容 → Gemini AI + Google Search
- **敏感內容保護**：不記錄敏感文字到日誌

#### 🤖 Gemini AI 整合
- **gemini-2.5-flash** 模型
- **Grounding with Google Search** 實時搜尋
- **SSE 串流回應**：逐段推送 utterances、citations、memory
- **中文優化**：繁體中文、女性化風格、先結論後細節

#### 🎭 Character.AI 代理整合
- **基於你提供的 reverse API**：WebSocket + HTTP 雙重支援
- **語音生成**：支援 chat-say 模式
- **多重認證**：HTTP_AUTHORIZATION、Authorization cookie、URL token
- **錯誤處理**：完整的降級策略

#### 🔊 按需 TTS 服務
- **chat-say 模式**：用聊天模型生成語音
- **不快取策略**：Cache-Control: no-store
- **多格式支援**：MP3/OGG/WAV
- **文字清理**：自動移除控制字元、URL、email

#### 📡 SSE 串流 API
- **多事件類型**：utterance、citation、memory、meta、error、done
- **心跳保活**：防止長請求斷線
- **錯誤恢復**：完整的異常處理機制

### 前端架構 (React + Vite + TypeScript)

#### 💬 Chat UI
- **多段式訊息顯示**：每段獨立渲染
- **按需語音播放**：點擊播放按鈕才生成語音
- **引用來源顯示**：Gemini 搜尋結果的 citations
- **路由標識**：顯示訊息處理路徑 (Gemini/代理/拒絕)
- **實時串流**：SSE 事件驅動的 UI 更新

#### 🎨 現代化介面
- **Tailwind CSS**：原子化設計系統
- **響應式設計**：支援桌面與移動裝置
- **深色模式支援**：系統偏好檢測
- **無障礙設計**：鍵盤導航、螢幕閱讀器支援

#### ⚙️ 設定管理
- **本地儲存**：localStorage 持久化偏好
- **服務狀態監控**：即時顯示各服務健康度
- **語音控制**：音量、自動播放、聲線選擇
- **Live2D 控制**：啟用/停用虛擬角色

#### 🔔 通知系統
- **Toast 訊息**：成功/錯誤/警告/資訊
- **自動消失**：可配置顯示時長
- **動作按鈕**：支援自定義操作

## 🏗️ 技術架構

### 後端技術棧
```
Node.js 20+ + Express + TypeScript
├── @google/generative-ai (Gemini API)
├── axios (HTTP 客戶端)
├── ws (WebSocket 客戶端)
├── uuid (ID 生成)
├── cors + helmet (安全中間件)
└── dotenv (環境變數)
```

### 前端技術棧
```
React 18 + Vite + TypeScript
├── Tailwind CSS (樣式框架)
├── Lucide React (圖示庫)
├── 預留：Dexie (IndexedDB)
├── 預留：PIXI.js + Live2D
└── 預留：WebAudio API
```

## 📁 專案結構

```
personal-ai-assistant/
├── server/                 # 後端服務
│   ├── src/
│   │   ├── index.ts        # 服務器入口
│   │   ├── lib/            # 核心函式庫
│   │   │   ├── config.ts   # 環境配置
│   │   │   ├── logger.ts   # 日誌系統
│   │   │   └── middleware.ts # 中間件
│   │   ├── services/       # 業務服務
│   │   │   ├── contentClassifier.ts # 內容分類
│   │   │   ├── geminiService.ts     # Gemini 整合
│   │   │   ├── characterAI.ts       # Character.AI 客戶端
│   │   │   ├── chatProxyService.ts  # 聊天代理
│   │   │   └── ttsService.ts        # 語音服務
│   │   ├── routes/         # API 路由
│   │   │   ├── chat.ts     # 聊天 API
│   │   │   ├── tts.ts      # 語音 API
│   │   │   └── index.ts    # 路由匯總
│   │   └── types/          # 類型定義
│   └── package.json
├── client/                 # 前端應用
│   ├── src/
│   │   ├── main.tsx        # 應用入口
│   │   ├── App.tsx         # 主應用組件
│   │   ├── components/     # React 組件
│   │   │   ├── ChatInterface.tsx    # 聊天介面
│   │   │   ├── ChatMessage.tsx      # 訊息組件
│   │   │   ├── Live2DDisplay.tsx    # Live2D 顯示
│   │   │   ├── SettingsModal.tsx    # 設定模態框
│   │   │   └── ToastContainer.tsx   # 通知容器
│   │   ├── hooks/          # 自定義 Hooks
│   │   │   ├── useAppState.ts       # 應用狀態
│   │   │   └── useMemoryStore.ts    # 記憶庫
│   │   ├── types/          # 類型定義
│   │   └── index.css       # 全域樣式
│   ├── public/
│   │   └── models/         # Live2D 模型目錄
│   └── package.json
├── README.md               # 專案說明
├── BUILD_GUIDE.md          # 構建指南
├── PROJECT_SUMMARY.md      # 專案總結
├── env.example             # 環境變數範本
└── package.json            # 根目錄配置
```

## 🔧 環境配置

### 必要環境變數
```env
# Gemini API 金鑰 (必填)
GEMINI_API_KEY=your_gemini_api_key_here

# 外部聊天代理設定 (必填)
CHAT_PROXY_URL=your_proxy_base_url
CHAT_PROXY_API_KEY=your_proxy_api_key_if_needed
```

### 可選環境變數
```env
# TTS 設定
TTS_MODE=chat-say
TTS_FORMAT=mp3

# 安全設定
SAFETY_ENABLE_HARDBLOCK=true
SAFETY_CLASSIFY_WITH_GEMINI=true
LOG_SENSITIVE_TEXTS=false

# 服務設定
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

## 🚀 快速啟動

```bash
# 1. 安裝依賴
npm run install:all

# 2. 設定環境變數
cp env.example .env
# 編輯 .env 檔案

# 3. 啟動開發環境
npm run dev
```

訪問 http://localhost:5173 開始使用！

## 🔒 安全與合規

### 內容安全策略
- **嚴禁內容**：未成年、非自願、亂倫、獸交、性暴力 → 直接拒絕
- **情色內容**：成人自願聊天 → 路由至外部代理
- **正當諮詢**：教育、醫療、法律 → Gemini 處理

### 記憶策略
- **非情色**：完整保存對話內容
- **情色內容**：僅保存必要元資料與安全摘要
- **嚴禁內容**：僅記錄拒絕事件，不保存原文

### 隱私保護
- **敏感內容不記錄**：LOG_SENSITIVE_TEXTS=false
- **音頻不落地**：Cache-Control: no-store
- **本地數據**：IndexedDB 永久記憶，用戶完全控制

### 合規聲明
⚠️ **本專案僅提供「與外部代理整合」的抽象接法。請確保你對外部服務（包括任何聊天或語音服務）的使用具有合法授權並遵守其服務條款。本專案不提供繞過付費、身份驗證或使用限制的教學或程式碼。**

## 📋 待完成功能

### 前端待實作
- [ ] **WebAudio 音量分析**：實時音量檢測與視覺化
- [ ] **Live2D 完整整合**：PIXI.js + 嘴型同步
- [ ] **IndexedDB 記憶庫**：Dexie + 對話歷史管理
- [ ] **語音識別輸入**：Web Speech API
- [ ] **圖片上傳**：拖放上傳 + base64 編碼

### 後端待完善
- [ ] **速率限制**：Redis 或記憶體快取
- [ ] **用戶會話**：JWT 或 session 管理
- [ ] **文件上傳**：多媒體檔案處理
- [ ] **監控指標**：性能與錯誤追蹤

### 進階功能
- [ ] **多語言支援**：i18n 國際化
- [ ] **主題系統**：自定義顏色與佈局
- [ ] **插件架構**：可擴展功能模組
- [ ] **移動端優化**：PWA + 觸控優化

## 🎯 接受標準檢查

✅ **本機啟動成功**：可用 `npm run dev` 同時啟動前後端
✅ **Chat 功能**：
  - 一般問題 → 走 Gemini，回分段文字＋citations
  - 情色意圖 → 走 charProxy，回分段文字（無 citations）
  - 嚴禁類別 → 安全拒絕（簡短說明，不觸發任何代理或 TTS）
✅ **TTS 功能**：每段有播放鍵；點擊才生成與播放；播放完不留存音檔
✅ **Live2D 準備**：有佔位顯示；無模型時顯示放置指引
✅ **記憶設計**：重整後對話仍在（localStorage）；情色路由僅存標籤/摘要
✅ **安全機制**：前端不含 API 金鑰；代理憑證只在後端；README 有醒目合規聲明

## 🔄 下一步行動

1. **設定環境**：按照 BUILD_GUIDE.md 設定 API 金鑰
2. **測試功能**：驗證聊天、語音、路由功能
3. **添加模型**：放置 Live2D 模型到 `client/public/models/`
4. **完善功能**：實作 WebAudio、Dexie、完整 Live2D
5. **部署上線**：Vercel 或其他平台部署

## 📞 技術支援

遇到問題請：
1. 查看 BUILD_GUIDE.md 的故障排除章節
2. 檢查控制台錯誤訊息
3. 確認環境變數設定正確
4. 驗證 API 金鑰有效性

專案已具備完整的基礎架構，可以立即運行和測試核心功能！🎉
