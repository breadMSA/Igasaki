/**
 * 服務器同步工具
 * 負責將用戶數據同步到服務器，實現永久存儲
 */

import { UserPreferences, ChatMessage } from '@/types';

const API_BASE = '/api/user-data';

/**
 * 從服務器獲取用戶偏好設定
 */
export async function fetchPreferencesFromServer(): Promise<UserPreferences | null> {
  try {
    const response = await fetch(`${API_BASE}/preferences`);
    if (!response.ok) {
      if (response.status === 404) {
        return null; // 服務器上沒有數據
      }
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.warn('從服務器獲取偏好設定失敗:', error);
    return null;
  }
}

/**
 * 將偏好設定保存到服務器
 */
export async function savePreferencesToServer(preferences: Partial<UserPreferences>): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/preferences`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preferences),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    console.log('✅ 偏好設定已保存到服務器');
    return true;
  } catch (error) {
    console.error('保存偏好設定到服務器失敗:', error);
    return false;
  }
}

/**
 * 從服務器獲取聊天記錄
 */
export async function fetchMessagesFromServer(limit?: number, offset?: number): Promise<ChatMessage[]> {
  try {
    const params = new URLSearchParams();
    if (limit !== undefined) params.append('limit', limit.toString());
    if (offset !== undefined) params.append('offset', offset.toString());
    
    const response = await fetch(`${API_BASE}/messages?${params}`);
    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.warn('從服務器獲取消息失敗:', error);
    return [];
  }
}

/**
 * 將單條消息保存到服務器
 */
export async function saveMessageToServer(message: Omit<ChatMessage, 'id'>): Promise<ChatMessage | null> {
  try {
    const response = await fetch(`${API_BASE}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('保存消息到服務器失敗:', error);
    return null;
  }
}

/**
 * 批量保存消息到服務器
 */
export async function saveMessagesToServer(messages: ChatMessage[]): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/messages/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    console.log(`✅ ${messages.length} 條消息已保存到服務器`);
    return true;
  } catch (error) {
    console.error('批量保存消息到服務器失敗:', error);
    return false;
  }
}

/**
 * 從服務器獲取統計數據
 */
export async function fetchStatsFromServer(): Promise<any> {
  try {
    const response = await fetch(`${API_BASE}/stats`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.warn('從服務器獲取統計數據失敗:', error);
    return null;
  }
}

/**
 * 同步本地數據到服務器（用於首次遷移）
 */
export async function syncLocalDataToServer(
  preferences?: Partial<UserPreferences>, 
  messages?: ChatMessage[]
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ preferences, messages }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    console.log('✅ 本地數據已同步到服務器');
    return true;
  } catch (error) {
    console.error('同步本地數據到服務器失敗:', error);
    return false;
  }
}

/**
 * 刪除服務器上的消息
 */
export async function deleteMessageFromServer(messageId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/messages/${messageId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return true;
  } catch (error) {
    console.error('從服務器刪除消息失敗:', error);
    return false;
  }
}

/**
 * 清空服務器上的所有消息
 */
export async function clearMessagesOnServer(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/messages`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    console.log('✅ 服務器上的所有消息已清空');
    return true;
  } catch (error) {
    console.error('清空服務器消息失敗:', error);
    return false;
  }
}


