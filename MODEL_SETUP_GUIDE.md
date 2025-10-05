# Live2D 模型設置指南

## 📁 模型檔案放置位置

將你的 Live2D 模型放在以下位置：

```
client/public/models/
├── Shinano/                    # 模型資料夾名稱
│   ├── Shinano.model3.json    # 主模型檔案（必須）
│   ├── Shinano.moc3           # 模型資料檔案（必須）
│   ├── textures/              # 貼圖目錄
│   │   ├── texture_00.png
│   │   └── texture_01.png
│   └── motions/               # 動作檔案目錄
│       ├── idle_01.motion3.json
│       └── talk_01.motion3.json
└── 其他模型/                  # 可以有多個模型
    ├── 其他模型.model3.json
    └── ...
```

## ⚠️ 重要注意事項

1. **資料夾名稱**：必須與 `.model3.json` 檔案名稱完全一致
   - ✅ 正確：`Shinano/Shinano.model3.json`
   - ❌ 錯誤：`Shinano/shinano.model3.json` 或 `Shinano/model.model3.json`

2. **檔案結構**：確保所有相關檔案都在同一個資料夾內
   - `.model3.json` 檔案
   - `.moc3` 檔案
   - `textures/` 目錄（包含所有貼圖）
   - `motions/` 目錄（包含所有動作檔案）

3. **檔案權限**：確保檔案可以被網頁伺服器讀取

## 🔧 故障排除

### 模型沒有顯示在下拉選單中？
- 檢查 `client/public/models/` 目錄是否存在
- 確認資料夾名稱與 `.model3.json` 檔案名稱一致
- 檢查瀏覽器控制台是否有錯誤訊息

### 模型載入失敗？
- 確認 `.model3.json` 檔案格式正確
- 檢查所有相關檔案路徑是否正確
- 確認 `.moc3` 檔案存在且完整

### 貼圖或動作無法載入？
- 檢查 `textures/` 和 `motions/` 目錄結構
- 確認檔案名稱與 `.model3.json` 中的路徑一致

## 📋 支援的檔案格式

- **模型檔案**：`.model3.json`（Cubism 4）
- **模型資料**：`.moc3`
- **貼圖檔案**：`.png`, `.jpg`, `.jpeg`
- **動作檔案**：`.motion3.json`
- **物理檔案**：`.physics3.json`

## 🚀 重啟伺服器

放置模型檔案後，需要重啟開發伺服器：

```bash
# 在 client 目錄下
npm run dev
```

重啟後，模型應該會自動出現在下拉選單中。
