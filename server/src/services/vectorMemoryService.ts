import { ChatMessage } from '@/types';
import OpenAI from 'openai';

interface VectorSearchResult {
  text: string;
  score: number;
  timestamp?: Date;
  role: 'user' | 'assistant';
  source?: 'vector' | 'keyword'; // 新增來源標記
}

export class VectorMemoryService {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private vectorDimension: number;
  private dataDir: string; // 數據存儲目錄
  private characterName: string = 'default'; // 當前角色名稱
  private client: OpenAI | null; // 參考 CABM：使用 OpenAI 客戶端
  
  // 參考 CABM：直接存儲對話文本和向量
  private conversations: Array<{
    text: string;
    vector: number[];
    timestamp: Date;
    role: 'user' | 'assistant';
  }> = [];

  constructor() {
    this.apiKey = process.env.MEMORY_API_KEY || '';
    this.baseUrl = 'https://api.siliconflow.cn/v1';
    this.model = 'BAAI/bge-m3';
    this.vectorDimension = 1024;
    
    // 設置數據存儲目錄
    this.dataDir = process.env.MEMORY_DATA_DIR || './data/memory';
    
    // 參考 CABM：初始化 OpenAI 客戶端
    if (this.apiKey) {
      try {
        this.client = new OpenAI({
          apiKey: this.apiKey,
          baseURL: this.baseUrl
        });
        console.log('✅ OpenAI 客戶端初始化成功');
        
        // 重要：在初始化時嘗試加載已存在的向量數據庫
        this.loadFromFile().then(loaded => {
          if (loaded) {
            console.log(`✅ 成功從文件加載向量數據庫，包含 ${this.conversations.length} 條對話`);
          } else {
            console.log('📁 沒有找到已存在的向量數據庫文件，將在首次搜尋時創建');
          }
        }).catch(error => {
          console.error('❌ 加載向量數據庫失敗:', error);
        });
        
      } catch (error) {
        console.error('❌ OpenAI 客戶端初始化失敗:', error);
        this.client = null;
      }
    } else {
      console.warn('MEMORY_API_KEY 未設置，向量搜尋功能將不可用');
      this.client = null;
    }
  }

  /**
   * 將文本轉換為向量（參考 CABM 的 OpenAI 客戶端實現）
   */
  private async textToVector(text: string): Promise<number[]> {
    if (!this.client) {
      throw new Error('OpenAI 客戶端未初始化');
    }

    try {
      console.log(`🔍 開始向量化文本: "${text.substring(0, 50)}..."`);
      
      // 參考 CABM：使用 OpenAI 客戶端調用 embeddings API
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text
      });

      console.log('✅ 向量化成功，回應結構:', Object.keys(response));
      
      if (response.data && response.data[0] && response.data[0].embedding) {
        const embedding = response.data[0].embedding;
        console.log(`🎯 向量維度: ${embedding.length}`);
        return embedding;
      } else {
        console.error('❌ 回應格式不正確:', response);
        throw new Error('回應格式不正確');
      }
    } catch (error) {
      console.error('❌ 向量化失敗:', error);
      throw error;
    }
  }

  /**
   * 計算兩個向量的餘弦相似度
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('向量維度不匹配');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  /**
   * 搜尋相關的歷史記錄（真正參考 CABM 架構）
   */
  async searchRelevantHistory(query: string, messages: ChatMessage[], topK: number = 10): Promise<VectorSearchResult[]> {
    if (!this.client) {
      console.warn('⚠️ OpenAI 客戶端未初始化，無法進行向量搜尋');
      return [];
    }

    try {
      // 重要修復：如果沒有預先構建的向量數據庫，先嘗試從文件加載
      if (this.conversations.length === 0) {
        console.log('🔄 首次搜尋，嘗試從文件加載向量數據庫...');
        const loaded = await this.loadFromFile();
        if (!loaded) {
          console.log('📁 文件加載失敗，從歷史記錄構建向量數據庫...');
          await this.buildVectorDatabaseFromHistory(messages);
        }
      }
      
      console.log(`🔍 多重召回搜尋: "${query}" (topK: ${topK})`);
      console.log(`📚 已存儲對話數量: ${this.conversations.length}`);
      
      // 多重召回策略：結合向量搜尋和關鍵詞搜尋
      const results: VectorSearchResult[] = [];
      
      // 1. 向量搜尋（語義相似度）
      if (this.conversations.length > 0) {
        console.log('🔄 第一階段：向量搜尋（語義相似度）...');
        const vectorResults = await this.performVectorSearch(query, topK * 4); // 獲取更多候選結果
        results.push(...vectorResults);
        console.log(`✅ 向量搜尋找到 ${vectorResults.length} 條候選結果`);
      }
      
      // 2. 關鍵詞搜尋（精確匹配）
      console.log('🔍 第二階段：關鍵詞搜尋（精確匹配）...');
      const keywordResults = await this.performKeywordSearch(query, messages, topK * 4);
      results.push(...keywordResults);
      console.log(`✅ 關鍵詞搜尋找到 ${keywordResults.length} 條候選結果`);
      
      // 3. 去重和合併
      const uniqueResults = this.deduplicateResults(results);
      console.log(`🔄 去重後共有 ${uniqueResults.length} 條候選結果`);
      
      // 4. 重排序（二次評分）
      console.log('🔄 第三階段：重排序（二次評分）...');
      const rerankedResults = this.rerankResults(uniqueResults, query, topK);
      
      console.log(`🎯 最終結果: ${rerankedResults.length} 條 (多重召回 + 重排序)`);
      
      // 調試：顯示前10個結果
      console.log('🔍 最終結果調試:');
      rerankedResults.slice(0, 10).forEach((result, index) => {
        console.log(`  ${index + 1}. 分數: ${result.score.toFixed(4)} - 內容: ${result.text.substring(0, 100)}...`);
      });
      
      return rerankedResults;

    } catch (error) {
      console.error('❌ 多重召回搜尋失敗，使用備用方法:', error);
      return await this.fallbackKeywordSearch(query, messages, topK);
    }
  }

  /**
   * 執行向量搜尋
   */
  private async performVectorSearch(query: string, topK: number): Promise<VectorSearchResult[]> {
    try {
      const queryVector = await this.textToVector(query);
      
      const results: VectorSearchResult[] = [];
      for (const conversation of this.conversations) {
        try {
          const similarity = this.cosineSimilarity(queryVector, conversation.vector);
          results.push({
            text: conversation.text,
            score: similarity,
            timestamp: conversation.timestamp,
            role: 'assistant', // 對話包含用戶和助手的內容
            source: 'vector'
          });
        } catch (error) {
          console.warn(`⚠️ 計算相似度失敗: ${conversation.text.substring(0, 50)}...`, error);
        }
      }
      
      return results.sort((a, b) => b.score - a.score).slice(0, topK);
    } catch (error) {
      console.error('❌ 向量搜尋失敗:', error);
      return [];
    }
  }

  /**
   * 執行關鍵詞搜尋
   */
  private async performKeywordSearch(query: string, messages: ChatMessage[], topK: number): Promise<VectorSearchResult[]> {
    const keywords = await this.extractKeywords(query);
    console.log(`🔍 關鍵詞搜尋，關鍵詞: [${keywords.join(', ')}]`);
    
    const results: VectorSearchResult[] = [];
    
    // 搜尋所有消息，不只是對話單元
    for (const message of messages) {
      const content = message.content.toLowerCase();
      let score = 0;
      
      // 計算關鍵詞匹配分數
      for (const keyword of keywords) {
        if (content.includes(keyword)) {
          score += 1;
          // 如果關鍵詞在內容中出現多次，增加分數
          const occurrences = (content.match(new RegExp(keyword, 'g')) || []).length;
          score += Math.min(occurrences - 1, 2) * 0.5;
        }
      }
      
      if (score > 0) {
        // 額外的評分邏輯
        const storyScore = this.calculateStoryScore(message.content);
        score += storyScore;
        
        if (message.timestamp) {
          // 修復：確保時間戳是Date對象
          const timestamp = message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp);
          const timeScore = this.calculateTimeScore(timestamp);
          score += timeScore;
        }
        
        results.push({
          text: message.content,
          score: score,
          timestamp: message.timestamp || new Date(),
          role: message.role,
          source: 'keyword'
        });
      }
    }
    
    console.log(`🔍 關鍵詞搜尋找到 ${results.length} 條結果`);
    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  /**
   * 去重結果並添加上下文
   */
  private deduplicateResults(results: VectorSearchResult[]): VectorSearchResult[] {
    const seen = new Set<string>();
    const unique: VectorSearchResult[] = [];
    
    for (const result of results) {
      // 使用內容的前100個字符作為去重鍵
      const key = result.text.substring(0, 100).toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        
        // 嘗試添加上下文（如果可能的話）
        const enrichedResult = this.addContext(result);
        unique.push(enrichedResult);
      }
    }
    
    return unique;
  }

  /**
   * 為搜尋結果添加上下文
   */
  private addContext(result: VectorSearchResult): VectorSearchResult {
    // 如果結果來自向量搜尋，嘗試找到相關的上下文
    if (result.source === 'vector' && this.conversations.length > 0) {
      // 找到最相似的對話，然後包含前後的上下文
      const similarConversations = this.conversations
        .map((conv, index) => ({ conv, index, similarity: this.calculateTextSimilarity(result.text, conv.text) }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 3); // 取最相似的3個
      
      if (similarConversations.length > 0) {
        const contextTexts: string[] = [];
        
        for (const { conv, index } of similarConversations) {
          // 包含前後各2個對話作為上下文
          const startIndex = Math.max(0, index - 2);
          const endIndex = Math.min(this.conversations.length, index + 3);
          
          for (let i = startIndex; i < endIndex; i++) {
            if (i !== index) { // 不重複包含主要結果
              contextTexts.push(this.conversations[i].text);
            }
          }
        }
        
        if (contextTexts.length > 0) {
          // 將上下文添加到結果中
          const enrichedText = `${result.text}\n\n相關上下文：\n${contextTexts.slice(0, 5).join('\n\n')}`;
          return { ...result, text: enrichedText };
        }
      }
    }
    
    return result;
  }

  /**
   * 計算文本相似度（簡單的詞彙重疊）
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    
    const intersection = words1.filter(word => words2.includes(word));
    const union = [...new Set([...words1, ...words2])];
    
    return intersection.length / union.length;
  }

  /**
   * 重排序結果（二次評分）
   */
  private rerankResults(results: VectorSearchResult[], query: string, topK: number): VectorSearchResult[] {
    // 二次評分：結合原始分數和內容相關性
    const reranked = results.map(result => {
      let finalScore = result.score;
      
      // 根據來源調整分數
      if (result.source === 'vector') {
        finalScore *= 1.2; // 向量搜尋結果權重更高
      }
      
      // 根據內容長度調整分數（長內容通常更有價值）
      if (result.text.length > 200) {
        finalScore *= 1.1;
      }
      if (result.text.length > 500) {
        finalScore *= 1.2; // 更長的內容給予更高分數
      }
      
      // 平衡時間相關性：不要讓最近的內容完全淹沒早期內容
      if (result.timestamp) {
        const now = new Date();
        const timestamp = result.timestamp instanceof Date ? result.timestamp : new Date(result.timestamp);
        const diffHours = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60);
        
        // 時間權重調整：新內容稍微加分，但不要過度
        if (diffHours < 1) {
          finalScore *= 1.02; // 1小時內
        } else if (diffHours < 24) {
          finalScore *= 1.01; // 1天內
        } else if (diffHours < 168) {
          finalScore *= 1.0;  // 1週內，不加分
        } else {
          finalScore *= 1.05; // 1週以上，給予加分（避免被新內容淹沒）
        }
      }
      
      return { ...result, score: finalScore };
    });
    
    // 按最終分數排序
    return reranked
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * 使用 Gemini 提取關鍵詞
   */
  private async extractKeywords(text: string): Promise<string[]> {
    console.log(`🔍 原始文本: "${text}"`);
    
    try {
      // 使用 Gemini API 提取關鍵詞
      const response = await fetch('http://localhost:3001/api/extract-keywords', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text })
      });
      
      if (response.ok) {
        const result = await response.json();
        const keywords = result.keywords || [];
        console.log(`🤖 Gemini 提取的關鍵詞: [${keywords.join(', ')}]`);
        return keywords;
      } else {
        throw new Error(`Gemini API 失敗: ${response.status}`);
      }
    } catch (error) {
      console.warn('🔄 Gemini 關鍵詞提取失敗，使用備用方法:', error);
      
      // 備用：智能分詞，保留重要詞彙
      const cleanText = text
        .replace(/真的|真的真的|還是|不|嗎|呢|啊|呀|喔|哦|吧|麼|什麼|怎麼|為什麼|為甚麼|到底|究竟|或者|如果|假如|雖然|但是|所以|因為|由於|的|了|在|是|我|有|和|就|人|都|一|一個|上|也|很|到|說|要|去|你|會|着|沒有|看|好|自己|這/g, '')
        .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')
        .trim();
      
      // 智能分詞：按詞彙邊界分割
      const keywords = [];
      const words = cleanText.split(/\s+/);
      
      for (const word of words) {
        if (word.length > 1 && !/^[0-9]+$/.test(word)) {
          // 如果詞彙太長，進一步分割
          if (word.length > 4) {
            // 嘗試按詞彙邊界分割（完全通用，無特化）
            const subWords = word.match(/[a-zA-Z\u4e00-\u9fa5]+/g);
            if (subWords) {
              keywords.push(...subWords.filter(w => w.length > 1));
            } else {
              keywords.push(word);
            }
          } else {
            keywords.push(word);
          }
        }
      }
      
      // 去重並限制數量
      const uniqueKeywords = [...new Set(keywords)].slice(0, 5);
      
      console.log(`🔄 備用關鍵詞提取結果: [${uniqueKeywords.join(', ')}]`);
      return uniqueKeywords;
    }
  }

  /**
   * 關鍵詞預篩選
   */
  private preFilterByKeywords(messages: ChatMessage[], keywords: string[]): ChatMessage[] {
    if (keywords.length === 0) return messages.slice(0, 50); // 如果沒有關鍵詞，只取前50條
    
    const scoredMessages = messages.map(message => {
      const content = message.content.toLowerCase();
      let score = 0;
      
      for (const keyword of keywords) {
        if (content.includes(keyword)) {
          score += 1;
        }
      }
      
      return { message, score };
    });
    
    // 按分數排序，取分數最高的前100條
    return scoredMessages
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 100)
      .map(item => item.message);
  }

  /**
   * 備用關鍵詞搜尋方法
   */
  private async fallbackKeywordSearch(
    query: string, 
    messages: ChatMessage[], 
    topK: number
  ): Promise<VectorSearchResult[]> {
    const keywords = await this.extractKeywords(query);
    console.log(`🔍 備用關鍵詞搜尋，關鍵詞: [${keywords.join(', ')}]`);
    
    const results: VectorSearchResult[] = [];

    for (const message of messages) {
      const content = message.content.toLowerCase();
      let score = 0;
      
      // 計算關鍵詞匹配分數
      for (const keyword of keywords) {
        if (content.includes(keyword)) {
          score += 1;
          // 如果關鍵詞在內容中出現多次，增加分數
          const occurrences = (content.match(new RegExp(keyword, 'g')) || []).length;
          score += Math.min(occurrences - 1, 2) * 0.5; // 最多額外加2分
        }
      }

      // 額外的評分邏輯
      if (score > 0) {
        // 檢查是否包含故事性內容（長度、描述性詞彙等）
        const storyScore = this.calculateStoryScore(message.content);
        score += storyScore;
        
        // 檢查時間相關性（越新的消息分數越高）
        if (message.timestamp) {
          // 修復：確保時間戳是Date對象
          const timestamp = message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp);
          const timeScore = this.calculateTimeScore(timestamp);
          score += timeScore;
        }
        
        results.push({
          text: message.content,
          score: score,
          timestamp: message.timestamp || new Date(),
          role: message.role
        });
      }
    }

    console.log(`🔍 關鍵詞搜尋找到 ${results.length} 條結果`);
    
    // 重要：採用排名機制，不設分數門檻，總是返回最相關的前N個結果
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * 計算內容質量分數
   */
  private calculateStoryScore(content: string): number {
    let score = 0;
    
    // 檢查內容長度（較長的內容通常更有價值）
    if (content.length > 100) score += 0.3;
    if (content.length > 200) score += 0.3;
    
    // 檢查是否包含對話或描述性內容
    if (content.includes('：') || content.includes(':')) score += 0.2;
    if (content.includes('。') || content.includes('！') || content.includes('？')) score += 0.2;
    
    return score;
  }

  /**
   * 計算時間相關性分數
   */
  private calculateTimeScore(timestamp: Date): number {
    const now = new Date();
    const diffHours = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60);
    
    // 越新的消息分數越高
    if (diffHours < 1) return 0.5;      // 1小時內
    if (diffHours < 24) return 0.3;     // 1天內
    if (diffHours < 168) return 0.1;    // 1週內
    return 0;                           // 更早
  }

  /**
   * 強制重新構建所有歷史記錄的向量數據庫
   */
  async forceRebuildAllHistory(messages: ChatMessage[]): Promise<void> {
    if (!this.client) return;
    
    console.log('🔄 強制重新構建所有歷史記錄的向量數據庫...');
    
    // 清空現有數據
    this.conversations = [];
    
    // 構建新的向量數據庫
    await this.buildVectorDatabaseFromHistory(messages);
    
    console.log(`✅ 強制重新構建完成，共 ${this.conversations.length} 條對話`);
  }

  /**
   * 從歷史記錄構建向量數據庫（只在必要時調用）
   */
  private async buildVectorDatabaseFromHistory(messages: ChatMessage[]): Promise<void> {
    if (!this.client) return;

    console.log(`🚀 構建向量數據庫，處理 ${messages.length} 條訊息...`);
    
    // 重要修復：如果傳入的messages太少，嘗試從文件加載更多歷史記錄
    if (messages.length < 100) {
      console.log('📁 傳入的歷史記錄太少，嘗試從文件加載更多記錄...');
      const loaded = await this.loadFromFile();
      if (loaded && this.conversations.length > 0) {
        console.log(`✅ 已從文件加載 ${this.conversations.length} 條向量化記錄，跳過重新構建`);
        return;
      } else {
        console.log('📁 文件加載失敗或沒有記錄，將使用傳入的歷史記錄進行構建');
      }
    }
    
    // 修復：處理所有消息，不只是連續的 user-assistant 對
    const conversationUnits: string[] = [];
    const userMessages: ChatMessage[] = [];
    const assistantMessages: ChatMessage[] = [];
    
    // 分類所有消息
    for (const message of messages) {
      if (message.role === 'user') {
        userMessages.push(message);
      } else if (message.role === 'assistant') {
        assistantMessages.push(message);
      }
    }
    
    console.log(`📊 分類結果: 用戶消息 ${userMessages.length} 條, 助手消息 ${assistantMessages.length} 條`);
    
    // 創建對話單元（盡可能匹配）
    const minLength = Math.min(userMessages.length, assistantMessages.length);
    for (let i = 0; i < minLength; i++) {
      const conversationText = `用戶: ${userMessages[i].content}\n助手: ${assistantMessages[i].content}`;
      
      // 過濾掉有問題的文本
      if (this.isValidText(conversationText)) {
        conversationUnits.push(conversationText);
      } else {
        console.log(`⚠️ 跳過無效文本: ${conversationText.substring(0, 50)}...`);
      }
    }
    
    // 處理剩餘的單獨消息
    if (userMessages.length > minLength) {
      for (let i = minLength; i < userMessages.length; i++) {
        const conversationText = `用戶: ${userMessages[i].content}`;
        if (this.isValidText(conversationText)) {
          conversationUnits.push(conversationText);
        }
      }
    }
    
    if (assistantMessages.length > minLength) {
      for (let i = minLength; i < assistantMessages.length; i++) {
        const conversationText = `助手: ${assistantMessages[i].content}`;
        if (this.isValidText(conversationText)) {
          conversationUnits.push(conversationText);
        }
      }
    }
    
    console.log(`🔄 構建了 ${conversationUnits.length} 個對話單元`);
    
    // 批量處理對話單元，每批10個
    for (let i = 0; i < conversationUnits.length; i += 10) {
      const batch = conversationUnits.slice(i, i + 10);
      
      try {
        await Promise.all(
          batch.map(async (conversationText) => {
            try {
              const vector = await this.textToVector(conversationText);
              const normalizedVector = this.normalizeVector(vector);
              
              this.conversations.push({
                text: conversationText,
                vector: normalizedVector,
                timestamp: new Date(),
                role: 'assistant' // 對話單元中的角色
              });
            } catch (error) {
              console.warn(`向量化失敗: ${conversationText.substring(0, 50)}...`);
            }
          })
        );
        
        if (i % 50 === 0) {
          console.log(`📝 向量化進度: ${Math.min(i + 10, conversationUnits.length)}/${conversationUnits.length}`);
        }
      } catch (error) {
        console.error(`批次 ${Math.floor(i / 10) + 1} 處理失敗:`, error);
      }
    }
    
    console.log(`✅ 向量數據庫構建完成，共 ${this.conversations.length} 條對話`);
    
    // 保存到文件
    await this.saveToFile();
  }

  /**
   * 檢查文本是否有效（過濾掉有問題的文本）
   */
  private isValidText(text: string): boolean {
    if (!text || text.trim().length === 0) return false;
    
    // 過濾掉只包含省略號的文本
    if (text.trim() === '...' || text.trim() === '…') return false;
    
    // 移除過短限制，只要有中文、英文或數字內容就可以
    const cleanText = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
    if (cleanText.trim().length === 0) return false;
    
    return true;
  }

  /**
   * 文本哈希（用於緩存）
   */
  private hashText(text: string): string {
    // 簡單的哈希函數
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 轉換為32位整數
    }
    return hash.toString();
  }

  /**
   * 向量歸一化（參考 CABM 架構）
   */
  private normalizeVector(vector: number[]): number[] {
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (norm === 0) return vector;
    return vector.map(val => val / norm);
  }

  /**
   * 添加新對話到向量數據庫（參考 CABM 的 add_chat_turn）
   */
  async addConversation(userMessage: string, assistantMessage: string): Promise<void> {
    if (!this.client) return;

    const conversationText = `用戶: ${userMessage}\n助手: ${assistantMessage}`;
    
    // 檢查文本是否有效
    if (!this.isValidText(conversationText)) {
      console.log('⚠️ 跳過無效對話文本');
      return;
    }
    
    // 檢查是否已存在相同對話（參考人家的建議）
    const existingConversation = this.conversations.find(conv => conv.text === conversationText);
    if (existingConversation) {
      console.log('💾 對話已存在，跳過添加');
      return;
    }
    
    try {
      const vector = await this.textToVector(conversationText);
      const normalizedVector = this.normalizeVector(vector);
      
      this.conversations.push({
        text: conversationText,
        vector: normalizedVector,
        timestamp: new Date(),
        role: 'assistant' // 對話單元中的角色
      });
      
      console.log(`💾 新對話已添加到向量數據庫: ${userMessage.substring(0, 50)}...`);
      
      // 保存到文件
      await this.saveToFile();
    } catch (error) {
      console.error('❌ 添加對話到向量數據庫失敗:', error);
    }
  }

  /**
   * 從向量資料庫刪除對話（根據文本內容匹配）
   */
  async removeConversation(conversationText: string): Promise<void> {
    try {
      // 從記憶體中移除
      const initialLength = this.conversations.length;
      this.conversations = this.conversations.filter(conv => conv.text !== conversationText);
      
      if (this.conversations.length < initialLength) {
        // 保存到檔案
        await this.saveToFile();
        console.log(`✅ 對話已從向量資料庫刪除: ${conversationText.substring(0, 50)}...`);
      } else {
        console.log(`⚠️ 未找到要刪除的對話`);
      }
    } catch (error) {
      console.error('❌ 從向量資料庫刪除對話失敗:', error);
    }
  }

  /**
   * 批量刪除對話（根據文本內容匹配）
   */
  async removeConversations(conversationTexts: string[]): Promise<void> {
    try {
      const initialLength = this.conversations.length;
      this.conversations = this.conversations.filter(conv => !conversationTexts.includes(conv.text));
      
      const removedCount = initialLength - this.conversations.length;
      if (removedCount > 0) {
        // 保存到檔案
        await this.saveToFile();
        console.log(`✅ 已從向量資料庫批量刪除 ${removedCount} 個對話`);
      } else {
        console.log(`⚠️ 未找到要刪除的對話`);
      }
    } catch (error) {
      console.error('❌ 批量刪除對話失敗:', error);
    }
  }

  /**
   * 保存向量數據庫到文件（真正參考 CABM 架構）
   */
  private async saveToFile(): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // 確保目錄存在
      const characterDir = path.join(this.dataDir, this.characterName);
      await fs.mkdir(characterDir, { recursive: true });
      
      // 準備保存數據
      const data = {
        character_name: this.characterName,
        model: this.model,
        vector_dimension: this.vectorDimension,
        conversations: this.conversations,
        last_updated: new Date().toISOString()
      };
      
      // 保存到文件
      const filePath = path.join(characterDir, `${this.characterName}_memory.json`);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
      
      console.log(`💾 向量數據庫已保存到: ${filePath}`);
    } catch (error) {
      console.error('❌ 保存向量數據庫失敗:', error);
    }
  }

  /**
   * 從文件加載向量數據庫（真正參考 CABM 架構）
   */
  private async loadFromFile(): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const filePath = path.join(this.dataDir, this.characterName, `${this.characterName}_memory.json`);
      
      // 檢查文件是否存在
      try {
        await fs.access(filePath);
      } catch {
        console.log(`📁 向量數據庫文件不存在: ${filePath}`);
        return false;
      }
      
      // 讀取文件
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(fileContent);
      
      // 恢復數據
      this.characterName = data.character_name || this.characterName;
      this.model = data.model || this.model;
      this.vectorDimension = data.vector_dimension || this.vectorDimension;
      
      // 恢復對話數據
      if (data.conversations && Array.isArray(data.conversations)) {
        this.conversations = data.conversations.map((conv: any) => ({
          text: conv.text,
          vector: conv.vector,
          timestamp: new Date(conv.timestamp),
          role: conv.role || 'assistant' // 對話單元中的角色
        }));
        
        console.log(`📂 從文件加載向量數據庫成功: ${filePath}`);
        console.log(`📊 恢復了 ${this.conversations.length} 條對話向量`);
        return true;
      } else {
        console.log(`⚠️ 文件格式不正確，沒有找到對話數據`);
        return false;
      }
    } catch (error) {
      console.error('❌ 加載向量數據庫失敗:', error);
      return false;
    }
  }

  /**
   * 設置角色名稱（用於文件路徑）
   */
  setCharacterName(characterName: string): void {
    this.characterName = characterName;
    console.log(`👤 切換角色: ${characterName}`);
  }

  /**
   * 獲取向量數據庫詳細狀態
   */
  async getDatabaseStatus(): Promise<any> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const filePath = path.join(this.dataDir, this.characterName, `${this.characterName}_memory.json`);
      
      let fileExists = false;
      let fileSize = 0;
      let lastModified = null;
      
      try {
        const stats = await fs.stat(filePath);
        fileExists = true;
        fileSize = stats.size;
        lastModified = stats.mtime;
      } catch {
        // 文件不存在
      }
      
      return {
        characterName: this.characterName,
        conversationsInMemory: this.conversations.length,
        fileExists,
        fileSize,
        lastModified,
        dataDirectory: this.dataDir,
        model: this.model,
        vectorDimension: this.vectorDimension,
        apiKeyConfigured: !!this.apiKey,
        clientInitialized: !!this.client
      };
    } catch (error) {
      console.error('獲取數據庫狀態失敗:', error);
      return {
        error: error instanceof Error ? error.message : '未知錯誤',
        characterName: this.characterName,
        conversationsInMemory: this.conversations.length,
        apiKeyConfigured: !!this.apiKey,
        clientInitialized: !!this.client
      };
    }
  }

  /**
   * 強制重新加載向量數據庫
   */
  async forceReloadDatabase(): Promise<boolean> {
    try {
      console.log('🔄 清空內存中的向量數據...');
      this.conversations = [];
      
      console.log('🔄 嘗試從文件重新加載...');
      const loaded = await this.loadFromFile();
      
      if (loaded) {
        console.log(`✅ 強制重新加載成功，恢復了 ${this.conversations.length} 條對話向量`);
        return true;
      } else {
        console.log('⚠️ 文件加載失敗，數據庫為空');
        return false;
      }
    } catch (error) {
      console.error('❌ 強制重新加載失敗:', error);
      return false;
    }
  }

  /**
   * 批量向量化消息（用於初始化）
   */
  async batchVectorize(messages: ChatMessage[]): Promise<void> {
    if (!this.client) return;

    console.log(`開始批量向量化 ${messages.length} 條消息...`);
    
    for (let i = 0; i < messages.length; i += 10) { // 每批處理10條
      const batch = messages.slice(i, i + 10);
      
      try {
        await Promise.all(
          batch.map(async (message) => {
            try {
              await this.textToVector(message.content);
            } catch (error) {
              console.warn(`批量向量化失敗: ${message.content.substring(0, 50)}...`);
            }
          })
        );
        
        console.log(`完成批次 ${Math.floor(i / 10) + 1}/${Math.ceil(messages.length / 10)}`);
      } catch (error) {
        console.error(`批次 ${Math.floor(i / 10) + 1} 處理失敗:`, error);
      }
    }
    
    console.log('批量向量化完成');
  }
}

export const vectorMemoryService = new VectorMemoryService();
