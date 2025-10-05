# Character.AI 整合設定指南

## 問題解決方案

### 1. 空白聊天氣泡問題 ✅ 已修復

**問題**：Character.AI 在發送訊息時會先回傳一個空的 turn，然後才是實際內容。

**解決方案**：
- 添加了 `hasReceivedUserEcho` 標記來追蹤用戶訊息回聲
- 跳過空的回應，只處理有實際內容的回應
- 檢查 `candidate.raw_content` 是否為空，避免顯示空白氣泡

### 2. 長期記憶問題 ✅ 已修復

**問題**：每次重啟伺服器都會創建新的聊天會話，沒有持久化。

**解決方案**：
- 在 `.env` 中設定 `CHARACTERAI_CHAT_ID` 來保存現有聊天 ID
- 服務啟動時會先嘗試獲取現有聊天會話
- 如果現有聊天不存在，才會創建新的聊天會話

**設定步驟**：
1. 在 `.env` 檔案中添加：
```env
CHARACTERAI_CHAT_ID=your_existing_chat_id_here
```

2. 獲取聊天 ID 的方法：
   - 從 Character.AI 網頁版聊天 URL 中獲取
   - 或使用 API 創建聊天後保存返回的 chat_id

### 3. 聊天串卡頓問題 ✅ 已修復

**問題**：長對話歷史導致輸入卡頓。

**解決方案**：
- 添加了 `optimizeChatHistory()` 函數
- 只保留最近的 20 條訊息，避免歷史記錄過長
- 在發送請求前自動優化歷史記錄

### 4. 語音功能問題 ✅ 已修復

**問題**：TTS 服務無法正常運作。

**解決方案**：
- 直接使用 Character.AI 的 `memo/replay` API
- 參考 PyCharacterAI 的正確實作
- 簡化了語音生成流程

## 環境變數配置

### 必需設定

```env
# Character.AI Token（從瀏覽器開發者工具獲取）
CHARACTERAI_TOKEN=your_token_here

# 角色 ID（從 Character.AI 角色頁面 URL 獲取）
CHARACTERAI_CHARACTER_ID=your_character_id_here

# 現有聊天 ID（可選，用於持久化）
CHARACTERAI_CHAT_ID=your_chat_id_here
```

### 可選設定

```env
# 語音 ID（可選，預設使用角色預設語音）
CHAT_PROXY_VOICE_ID=your_voice_id_here

# TTS 模式
TTS_MODE=characterai

# 音訊格式
TTS_FORMAT=mp3
```

## 獲取 Token 和 ID 的方法

### 1. 獲取 Character.AI Token

1. 登入 Character.AI 網站
2. 打開瀏覽器開發者工具（F12）
3. 進入 Network 標籤
4. 發送一條訊息
5. 在請求中找到 `Authorization: Token xxx` 的 token 值

### 2. 獲取角色 ID

1. 前往你想要聊天的角色頁面
2. 從 URL 中獲取角色 ID
   - 例如：`https://character.ai/character-name` → 角色 ID 就是 `character-name`

### 3. 獲取聊天 ID

1. 開始與角色聊天
2. 從聊天頁面 URL 中獲取聊天 ID
   - 例如：`https://character.ai/chat?char=xxx&hist=yyy` → 聊天 ID 就是 `yyy`

## 測試步驟

1. **設定環境變數**：
   ```bash
   cp env.example .env
   # 編輯 .env 檔案，填入你的 Character.AI 資訊
   ```

2. **啟動服務**：
   ```bash
   npm run dev
   ```

3. **測試聊天功能**：
   - 訪問 http://localhost:5173
   - 發送訊息測試聊天功能
   - 檢查是否還有空白氣泡

4. **測試語音功能**：
   - 點擊訊息旁的播放按鈕
   - 檢查是否能正常生成語音

5. **測試持久化**：
   - 重啟伺服器
   - 檢查是否還記得之前的對話

## 故障排除

### 常見錯誤

1. **Token 無效**：
   - 重新獲取 Character.AI Token
   - 確保 Token 格式正確

2. **角色 ID 無效**：
   - 檢查角色是否存在
   - 確保角色 ID 格式正確

3. **聊天 ID 無效**：
   - 如果聊天 ID 無效，系統會自動創建新聊天
   - 可以移除 `CHARACTERAI_CHAT_ID` 讓系統自動處理

4. **語音生成失敗**：
   - 檢查角色是否支援語音
   - 嘗試不同的語音 ID

### 日誌檢查

查看伺服器日誌來診斷問題：

```bash
# 查看即時日誌
npm run dev

# 或查看日誌檔案
tail -f logs/app.log
```

## 注意事項

⚠️ **重要提醒**：
- 請確保你對使用 Character.AI 服務具有合法授權
- 遵守 Character.AI 的服務條款
- 不要將 Token 分享給他人
- 定期更新 Token 以確保安全

## 更新日誌

- **v1.0.0**：初始版本
- **v1.1.0**：修復空白氣泡問題
- **v1.2.0**：添加持久化聊天支援
- **v1.3.0**：優化長對話處理
- **v1.4.0**：修復語音功能
