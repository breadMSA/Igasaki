/**
 * 測試永久存儲功能
 * 驗證所有用戶數據 API 端點是否正常工作
 */

const API_BASE = 'http://localhost:3001/api/user-data';

// 顏色輸出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function test(name, fn) {
  try {
    log(`\n📝 測試: ${name}`, 'blue');
    await fn();
    log(`✅ 通過: ${name}`, 'green');
    return true;
  } catch (error) {
    log(`❌ 失敗: ${name}`, 'red');
    console.error(error.message);
    return false;
  }
}

async function main() {
  log('\n🚀 開始測試永久存儲功能\n', 'blue');
  
  let passed = 0;
  let failed = 0;

  // 測試 1: 獲取偏好設定
  if (await test('獲取偏好設定', async () => {
    const response = await fetch(`${API_BASE}/preferences`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    console.log('  偏好設定:', JSON.stringify(data, null, 2));
    if (!data.id) throw new Error('偏好設定缺少 id');
  })) passed++; else failed++;

  // 測試 2: 更新偏好設定
  if (await test('更新偏好設定', async () => {
    const updates = {
      userName: '測試用戶',
      theme: 'dark',
      volume: 0.75
    };
    const response = await fetch(`${API_BASE}/preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    console.log('  更新後:', JSON.stringify(data, null, 2));
    if (data.userName !== '測試用戶') throw new Error('用戶名未更新');
  })) passed++; else failed++;

  // 測試 3: 添加消息
  if (await test('添加消息', async () => {
    const message = {
      role: 'user',
      content: '這是一條測試消息',
      timestamp: new Date().toISOString()
    };
    const response = await fetch(`${API_BASE}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    console.log('  新消息 ID:', data.id);
    if (!data.id) throw new Error('消息缺少 id');
  })) passed++; else failed++;

  // 測試 4: 批量添加消息
  if (await test('批量添加消息', async () => {
    const messages = [
      {
        role: 'user',
        content: '批量測試消息 1',
        timestamp: new Date().toISOString()
      },
      {
        role: 'assistant',
        content: '批量測試回覆 1',
        timestamp: new Date().toISOString()
      }
    ];
    const response = await fetch(`${API_BASE}/messages/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    console.log('  添加了', data.count, '條消息');
    if (data.count !== 2) throw new Error('批量添加數量不正確');
  })) passed++; else failed++;

  // 測試 5: 獲取消息
  if (await test('獲取消息', async () => {
    const response = await fetch(`${API_BASE}/messages?limit=10`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    console.log('  獲取到', data.length, '條消息');
    if (!Array.isArray(data)) throw new Error('消息應該是數組');
  })) passed++; else failed++;

  // 測試 6: 獲取統計數據
  if (await test('獲取統計數據', async () => {
    const response = await fetch(`${API_BASE}/stats`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    console.log('  統計數據:', JSON.stringify(data, null, 2));
    if (typeof data.totalMessages !== 'number') throw new Error('統計數據格式不正確');
  })) passed++; else failed++;

  // 測試 7: 同步數據
  if (await test('同步數據', async () => {
    const syncData = {
      preferences: {
        userName: '同步測試用戶',
        volume: 0.9
      },
      messages: [
        {
          id: 'sync_test_1',
          role: 'user',
          content: '同步測試消息',
          timestamp: new Date().toISOString()
        }
      ]
    };
    const response = await fetch(`${API_BASE}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(syncData)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    console.log('  同步結果:', data.message);
    if (!data.success) throw new Error('同步失敗');
  })) passed++; else failed++;

  // 總結
  log('\n' + '='.repeat(50), 'blue');
  log(`\n測試完成！`, 'blue');
  log(`✅ 通過: ${passed}`, 'green');
  log(`❌ 失敗: ${failed}`, 'red');
  log(`📊 總計: ${passed + failed}`, 'yellow');
  
  if (failed === 0) {
    log('\n🎉 所有測試都通過了！永久存儲功能正常工作！', 'green');
    log('\n💡 提示：', 'yellow');
    log('  1. 您的數據現在會永久保存在服務器端', 'yellow');
    log('  2. 清除瀏覽器緩存不會影響數據', 'yellow');
    log('  3. 數據保存在: server/data/memory/default/', 'yellow');
  } else {
    log('\n⚠️  有測試失敗，請檢查服務器日誌', 'red');
  }
  
  log('\n' + '='.repeat(50) + '\n', 'blue');
}

main().catch(error => {
  log('\n❌ 測試過程出錯:', 'red');
  console.error(error);
  process.exit(1);
});


