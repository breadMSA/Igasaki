/**
 * 清除所有聊天記錄
 * 使用方法：node clear-all-data.cjs
 */

const fs = require('fs');
const path = require('path');

console.log('🗑️  開始清除所有數據...\n');

// 清除服務器數據
const serverDataPaths = [
  'server/data/user/messages.json',
  'server/data/memory/default/messages.json',
  'server/data/memory/default/default_memory.json',
  'server/data/memory/default/stats.json'
];

serverDataPaths.forEach(filePath => {
  try {
    if (fs.existsSync(filePath)) {
      // 寫入空數組
      fs.writeFileSync(filePath, '[]', 'utf8');
      console.log(`✅ 已清除: ${filePath}`);
    } else {
      console.log(`⚠️  文件不存在: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ 清除失敗: ${filePath}`, error.message);
  }
});

console.log('\n✅ 服務器數據已清除！');
console.log('\n📝 接下來請在瀏覽器控制台運行：');
console.log('   indexedDB.deleteDatabase("IgasakiMemory");');
console.log('   location.reload();');
console.log('\n這樣可以清除瀏覽器本地數據。');

