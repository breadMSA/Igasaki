import { useState, useEffect } from 'react';
import { UserPreferences } from '@/types';
import { preferenceMemory } from './useMemoryStore';

const defaultPreferences: UserPreferences = {
  id: 'default',
  ttsMode: 'chat-say',
  autoplay: false,
  volume: 0.8,
  live2dEnabled: false,
  theme: 'light',
  language: 'zh-TW',
  createdAt: new Date(),
  updatedAt: new Date()
};

export function useAppState() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);

  useEffect(() => {
    // 從 IndexedDB 載入偏好設定
    const loadPreferences = async () => {
      try {
        console.log('useAppState: 開始載入偏好設定');
        const saved = await preferenceMemory.getPreferences();
        console.log('useAppState: 載入的偏好設定:', saved);
        if (saved) {
          setPreferences({
            ...defaultPreferences,
            ...saved,
            createdAt: new Date(saved.createdAt),
            updatedAt: new Date(saved.updatedAt)
          });
        } else {
          console.log('useAppState: 沒有找到保存的偏好設定，使用預設值');
          setPreferences(defaultPreferences);
        }
      } catch (error) {
        console.warn('Failed to load preferences:', error);
        console.log('useAppState: 載入偏好設定失敗，使用預設值');
        setPreferences(defaultPreferences);
      }
    };

    // 立即設置為已初始化，然後異步載入偏好設定
    console.log('useAppState: 設置 isInitialized 為 true');
    setIsInitialized(true);
    
    // 異步載入偏好設定
    loadPreferences();

    // 監聽偏好設定變化
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'preferences_updated') {
        loadPreferences();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    // 自定義事件監聽器
    const handlePreferencesUpdate = () => {
      loadPreferences();
    };
    
    window.addEventListener('preferencesUpdated', handlePreferencesUpdate);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('preferencesUpdated', handlePreferencesUpdate);
    };
  }, []);

  const updatePreferences = async (updates: Partial<UserPreferences>) => {
    const newPreferences = {
      ...preferences,
      ...updates,
      updatedAt: new Date()
    };
    
    setPreferences(newPreferences);
    
    // 保存到 IndexedDB
    try {
      await preferenceMemory.updatePreferences(updates);
      
      // 觸發偏好設定更新事件
      window.dispatchEvent(new CustomEvent('preferencesUpdated'));
      
      // 如果是頭像更新，觸發特定事件
      if (updates.userAvatar || updates.botAvatar) {
        window.dispatchEvent(new CustomEvent('avatarUpdated', {
          detail: { userAvatar: updates.userAvatar, botAvatar: updates.botAvatar }
        }));
      }
    } catch (error) {
      console.warn('Failed to save preferences:', error);
    }
  };

  return {
    isInitialized,
    preferences,
    updatePreferences
  };
}
