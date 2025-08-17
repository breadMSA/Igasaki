import { GoogleGenerativeAI, GenerateContentResult, Part } from '@google/generative-ai';
import { 
  GeminiResponse, 
  GeminiClassificationResult, 
  ChatMessage,
  CitationEvent,
  MemoryOperation,
  ExternalServiceError,
  ValidationError 
} from '@/types/index.js';
import { config } from '@/lib/config.js';
import { logger } from '@/lib/logger.js';

/**
 * Gemini AI 服務
 * 負責與 Google Gemini API 互動，支援 Grounding with Google Search
 */
export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor() {
    if (!config.geminiApiKey) {
      throw new ExternalServiceError('Gemini', 'API key not configured');
    }

    this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
    this.initializeModel();
  }

  /**
   * 初始化 Gemini 模型
   */
  private initializeModel(): void {
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      },
      tools: [
        {
          googleSearch: {}
        }
      ],
      systemInstruction: this.getSystemInstruction()
    });

    logger.info('Gemini model initialized successfully');
  }

  /**
   * 取得系統指令
   */
  private getSystemInstruction(): string {
    return `你是一個友善、專業的 AI 助手，具備以下特性：

語言風格：
- 使用繁體中文（台灣）回應
- 採用自然、口語化的表達方式
- 具備輕微的女性化特質，但保持專業
- 先給結論，再提供細節說明
- 適時加入輕微的幽默感，但不過分

回應格式：
請嘗試以 JSON 格式回應：
{
  "utterances": ["段落1", "段落2", "段落3"],
  "citations": [{"title": "來源標題", "url": "https://...", "snippet": "摘要"}],
  "memoryOps": {
    "write": [{"type": "fact", "content": "重要資訊", "confidence": 0.8}],
    "forget": ["過時資訊ID"]
  }
}

如果無法輸出 JSON，則直接回應純文字，系統會自動分段。

搜尋使用：
- 當需要最新資訊或驗證事實時，主動使用 Google Search 工具
- 為每個搜尋結果提供可靠的引用來源（1-3個）
- 標註資訊的時效性和可靠性

圖片處理：
- 先描述圖片內容和重點
- 進行 OCR 文字識別（註明可能不準確）
- 分析圖片中的視覺元素

安全與責任：
- 對醫療、法律、財務建議加上免責聲明
- 不確定的資訊要誠實說明並提供驗證方法
- 尊重隱私和道德準則

記憶管理：
- 記錄用戶提到的重要事實和偏好
- 主動遺忘過時或敏感資訊
- 根據對話內容調整記憶操作`;
  }

  /**
   * 處理聊天請求（支援串流）
   */
  async *generateChatResponse(
    message: string,
    history?: ChatMessage[],
    images?: string[]
  ): AsyncGenerator<{ type: 'utterance' | 'citation' | 'memory' | 'error'; data: any }> {
    try {
      logger.logSafeContent('info', 'Processing Gemini chat request', message);

      const parts = await this.prepareParts(message, images);
      const chatHistory = this.prepareChatHistory(history);

      // 開始生成內容
      const result = await this.model.generateContentStream([...chatHistory, ...parts]);

      let fullResponse = '';
      let functionCallData: any = null;

      // 串流處理
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          fullResponse += chunkText;
        }

        // 檢查是否有函數調用（搜尋結果）
        if (chunk.functionCalls && chunk.functionCalls.length > 0) {
          functionCallData = chunk.functionCalls[0];
        }
      }

      // 處理搜尋結果
      if (functionCallData) {
        const citations = this.extractCitations(functionCallData);
        for (const citation of citations) {
          yield { type: 'citation', data: citation };
        }
      }

      // 解析回應
      const response = await this.parseGeminiResponse(fullResponse);

      // 發送 utterances
      for (const utterance of response.utterances) {
        yield { type: 'utterance', data: { text: utterance } };
      }

      // 發送額外的 citations（來自回應解析）
      if (response.citations && response.citations.length > 0) {
        for (const citation of response.citations) {
          yield { type: 'citation', data: citation };
        }
      }

      // 發送記憶操作
      if (response.memoryOps && (response.memoryOps.write || response.memoryOps.forget)) {
        yield { type: 'memory', data: response.memoryOps };
      }

      logger.info('Gemini chat response completed successfully');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Gemini chat response failed', { error: errorMessage });
      
      yield { 
        type: 'error', 
        data: { message: `Gemini 服務暫時無法使用：${errorMessage}` } 
      };
    }
  }

  /**
   * 內容分類（輕量級請求）
   */
  async classifyContent(classificationPrompt: string): Promise<GeminiClassificationResult> {
    try {
      logger.debug('Starting Gemini content classification');

      const result = await this.model.generateContent([
        { text: classificationPrompt }
      ]);

      const response = await result.response;
      const text = response.text();

      // 嘗試解析 JSON 回應
      try {
        const parsed = JSON.parse(text.trim());
        
        return {
          sexualIntent: Boolean(parsed.sexualIntent),
          educational: Boolean(parsed.educational),
          hardBlock: Boolean(parsed.hardBlock),
          confidence: parsed.confidence || 0.7
        };
      } catch (parseError) {
        logger.warn('Failed to parse Gemini classification JSON, using fallback', { 
          text: text.substring(0, 200) 
        });

        // 如果無法解析 JSON，使用文字分析
        return this.fallbackTextClassification(text);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Gemini content classification failed', { error: errorMessage });
      
      throw new ExternalServiceError('Gemini', `Classification failed: ${errorMessage}`);
    }
  }

  /**
   * 準備輸入部分（文字 + 圖片）
   */
  private async prepareParts(message: string, images?: string[]): Promise<Part[]> {
    const parts: Part[] = [{ text: message }];

    if (images && images.length > 0) {
      for (const image of images) {
        try {
          // 假設圖片是 base64 編碼
          if (image.startsWith('data:image/')) {
            const [mimeType, base64Data] = image.split(',');
            const mimeMatch = mimeType.match(/data:(image\/\w+)/);
            
            if (mimeMatch) {
              parts.push({
                inlineData: {
                  mimeType: mimeMatch[1],
                  data: base64Data
                }
              });
            }
          }
        } catch (error) {
          logger.warn('Failed to process image', { error: error instanceof Error ? error.message : String(error) });
        }
      }
    }

    return parts;
  }

  /**
   * 準備聊天歷史
   */
  private prepareChatHistory(history?: ChatMessage[]): Part[] {
    if (!history || history.length === 0) {
      return [];
    }

    const parts: Part[] = [];
    
    // 只取最近的幾則對話以控制 token 使用量
    const recentHistory = history.slice(-10);
    
    for (const msg of recentHistory) {
      parts.push({ 
        text: `${msg.role === 'user' ? '用戶' : '助手'}：${msg.content}` 
      });
    }

    return parts;
  }

  /**
   * 從函數調用中提取引用
   */
  private extractCitations(functionCallData: any): CitationEvent[] {
    const citations: CitationEvent[] = [];

    try {
      if (functionCallData.name === 'google_search_retrieval') {
        const results = functionCallData.args?.results || [];
        
        for (const result of results.slice(0, 3)) { // 最多 3 個引用
          citations.push({
            title: result.title || '搜尋結果',
            url: result.url || '',
            snippet: result.snippet || ''
          });
        }
      }
    } catch (error) {
      logger.warn('Failed to extract citations', { error: error instanceof Error ? error.message : String(error) });
    }

    return citations;
  }

  /**
   * 解析 Gemini 回應
   */
  private async parseGeminiResponse(responseText: string): Promise<GeminiResponse> {
    try {
      // 嘗試解析 JSON
      const parsed = JSON.parse(responseText.trim());
      
      return {
        utterances: Array.isArray(parsed.utterances) ? parsed.utterances : [responseText],
        citations: parsed.citations || [],
        memoryOps: parsed.memoryOps || {}
      };
    } catch (error) {
      // 無法解析 JSON，使用文字分段
      logger.debug('Using text splitting for Gemini response');
      
      return {
        utterances: this.splitTextIntoUtterances(responseText),
        citations: [],
        memoryOps: {}
      };
    }
  }

  /**
   * 將文字分割成多個段落
   */
  private splitTextIntoUtterances(text: string): string[] {
    if (!text || text.trim().length === 0) {
      return ['抱歉，我無法提供回應。'];
    }

    // 按段落分割
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    if (paragraphs.length > 1) {
      return paragraphs.map(p => p.trim());
    }

    // 如果沒有段落分隔，按句子分割
    const sentences = text.split(/[。！？.!?]/).filter(s => s.trim().length > 10);
    
    if (sentences.length > 1 && sentences.length <= 5) {
      return sentences.map(s => s.trim() + (s.includes('。') ? '' : '。'));
    }

    // 如果太長，強制分割
    if (text.length > 200) {
      const midPoint = Math.floor(text.length / 2);
      const splitPoint = text.lastIndexOf('。', midPoint) || text.lastIndexOf('，', midPoint) || midPoint;
      
      return [
        text.substring(0, splitPoint + 1).trim(),
        text.substring(splitPoint + 1).trim()
      ].filter(p => p.length > 0);
    }

    return [text.trim()];
  }

  /**
   * 後備文字分類
   */
  private fallbackTextClassification(text: string): GeminiClassificationResult {
    const lowerText = text.toLowerCase();
    
    const sexualKeywords = ['sexual', 'sex', 'adult', 'intimate', '性', '色情', '成人'];
    const educationalKeywords = ['education', 'medical', 'health', 'learning', '教育', '醫療', '健康'];
    const blockKeywords = ['illegal', 'harmful', 'inappropriate', '違法', '有害', '不當'];

    const hasSexual = sexualKeywords.some(keyword => lowerText.includes(keyword));
    const hasEducational = educationalKeywords.some(keyword => lowerText.includes(keyword));
    const hasBlock = blockKeywords.some(keyword => lowerText.includes(keyword));

    return {
      sexualIntent: hasSexual && !hasEducational,
      educational: hasEducational,
      hardBlock: hasBlock,
      confidence: 0.6
    };
  }
}

export default GeminiService;
