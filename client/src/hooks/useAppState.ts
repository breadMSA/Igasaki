import { useState, useEffect } from 'react';
import { UserPreferences } from '@/types';

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
    // 從 localStorage 載入偏好設定
    const loadPreferences = () => {
      try {
        const saved = localStorage.getItem('app-preferences');
        if (saved) {
          const parsed = JSON.parse(saved);
          setPreferences({
            ...defaultPreferences,
            ...parsed,
            createdAt: new Date(parsed.createdAt),
            updatedAt: new Date(parsed.updatedAt)
          });
        }
      } catch (error) {
        console.warn('Failed to load preferences:', error);
      }
    };

    loadPreferences();
    setIsInitialized(true);
  }, []);

  const updatePreferences = (updates: Partial<UserPreferences>) => {
    const newPreferences = {
      ...preferences,
      ...updates,
      updatedAt: new Date()
    };
    
    setPreferences(newPreferences);
    
    // 保存到 localStorage
    try {
      localStorage.setItem('app-preferences', JSON.stringify(newPreferences));
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
