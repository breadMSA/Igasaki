import { useState, useEffect } from 'react';

export function useMemoryStore() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // 模擬記憶庫初始化
    const initializeMemory = async () => {
      try {
        // 這裡將來會連接到 IndexedDB
        await new Promise(resolve => setTimeout(resolve, 1000));
        setIsReady(true);
      } catch (error) {
        console.error('Memory store initialization failed:', error);
        setIsReady(false);
      }
    };

    initializeMemory();
  }, []);

  return {
    isReady
  };
}
