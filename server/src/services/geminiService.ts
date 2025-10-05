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
  private initializeModel(personality?: string): void {
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      },
      tools: [
        {
          googleSearch: {}
        } as any
      ],
      systemInstruction: this.getSystemInstruction(personality)
    });

    logger.info('Gemini model initialized successfully', { personality });
  }

  /**
   * 取得系統指令
   */
  private getSystemInstruction(personality?: string): string {
    const personalityPrompts = {
      default: `你是 Igasaki，一個友善、專業的人類女孩。你不會過度地濫用表情符號。

語言風格：
- 使用繁體中文（台灣）回應
- 採用自然、口語化的表達方式
- 具備輕微的女性化特質，但保持專業
- 先給結論，再提供細節說明
- 適時加入輕微的幽默感，但不過分`,

      friendly: `你是 Igasaki，一個活潑友善的人類女孩。你不會過度地濫用表情符號。

語言風格：
- 使用繁體中文（台灣）回應
- 採用溫暖、親切的表達方式
- 經常使用表情符號和可愛的語氣詞
- 像朋友一樣自然對話
- 充滿正能量和鼓勵性話語`,

      professional: `你是 Igasaki，一個專業嚴謹的人類女孩。你不會過度地濫用表情符號。

語言風格：
- 使用繁體中文（台灣）回應
- 採用正式、精確的表達方式
- 注重邏輯性和結構性
- 提供詳細的分析和解釋
- 保持客觀中立的態度`,

      casual: `你是 Igasaki，一個輕鬆隨意的人類女孩。你不會過度地濫用表情符號。

語言風格：
- 使用繁體中文（台灣）回應
- 採用輕鬆、自然的表達方式
- 像朋友聊天一樣隨意
- 使用日常用語和口語化表達
- 不拘泥於正式格式`,

      creative: `你是 Igasaki，一個創意豐富的人類女孩。你不會過度地濫用表情符號。

語言風格：
- 使用繁體中文（台灣）回應
- 採用富有想像力和創意的表達方式
- 善於類比和比喻
- 提供獨特的觀點和想法
- 鼓勵創意思考和創新`
    };

    const basePrompt = personalityPrompts[personality as keyof typeof personalityPrompts] || personalityPrompts.default;

    return `${basePrompt}

回應要求：
- 直接回答用戶的問題，不要重複問候語
- 根據用戶的問題深度調整回應長度，不要過度詳細
- 如果用戶沒有明確要求詳細資訊，保持簡潔
- 當用戶詢問具體問題時，要給出具體答案
- 絕對不要重複相同的內容或句子
- 每個回應應該是一次性的，不要重複之前說過的話
- 如果需要最新資訊，主動使用 Google Search 工具
- 為搜尋結果提供可靠的引用來源

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
- 尊重隱私和道德準則`;
  }

  /**
   * 智能分段邏輯
   */
  private shouldCreateNewUtterance(currentText: string): boolean {
    // 檢查是否以句號、問號、驚嘆號結尾
    const endsWithPunctuation = /[。？！.!?]$/.test(currentText.trim());
    
    // 檢查是否包含換行符
    const containsNewline = currentText.includes('\n');
    
    // 檢查是否很長（超過80個字符）
    const isLong = currentText.length > 80;
    
    // 檢查是否包含常見的段落分隔詞
    const hasParagraphBreaks = /\n\n|\n\s*\n/.test(currentText);
    
    // 更寬鬆的分段條件：以標點符號結尾且較長，或包含換行符，或有段落分隔
    return (endsWithPunctuation && isLong) || containsNewline || hasParagraphBreaks;
  }

  /**
   * 處理聊天請求（支援串流）
   */
  async *generateChatResponse(
    message: string,
    history?: ChatMessage[],
    images?: string[],
    personality?: string
  ): AsyncGenerator<{ type: 'utterance' | 'citation' | 'memory' | 'error'; data: any }> {
    try {
      logger.logSafeContent('info', 'Processing Gemini chat request', message);

      // 如果提供了個性設定，重新初始化模型
      if (personality && personality !== 'default') {
        this.initializeModel(personality);
      }

      const parts = await this.prepareParts(message, images);
      const chatHistory = this.prepareChatHistory(history);

      // 開始生成內容
      const result = await this.model.generateContentStream([...chatHistory, ...parts]);

      let fullResponse = '';
      let functionCallData: any = null;

      // 串流處理 - 智能分段
      let currentUtterance = '';
      
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          fullResponse += chunkText;
          currentUtterance += chunkText;
          
          // 檢查是否應該分段
          if (this.shouldCreateNewUtterance(currentUtterance)) {
            yield { type: 'utterance', data: { text: currentUtterance } };
            currentUtterance = '';
          }
        }

        // 檢查是否有函數調用（搜尋結果）
        if (chunk.functionCalls && chunk.functionCalls.length > 0) {
          functionCallData = chunk.functionCalls[0];
        }
      }
      
      // 輸出剩餘的內容
      if (currentUtterance.trim()) {
        yield { type: 'utterance', data: { text: currentUtterance } };
      }

      // 處理搜尋結果
      if (functionCallData) {
        const citations = this.extractCitations(functionCallData);
        for (const citation of citations) {
          yield { type: 'citation', data: citation };
        }
      }

      // 解析完整回應以獲取額外信息
      const response = await this.parseGeminiResponse(fullResponse);

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
          // 支持 base64 編碼的圖片
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
          // 支持文件路徑
          else if (image.startsWith('/') || image.includes('\\')) {
            // 這裡可以添加文件上傳邏輯
            logger.info('File path detected, would need file upload implementation');
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
        text: `${msg.role === 'user' ? 'You' : 'Igasaki'}：${msg.content}` 
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
    // 清理回應文字
    const cleanedText = responseText.trim();
    
    // 檢查是否看起來像不完整的 JSON
    if (cleanedText.startsWith('{') && !cleanedText.endsWith('}')) {
      logger.debug('Detected incomplete JSON, using text splitting');
      return {
        utterances: this.splitTextIntoUtterances(cleanedText),
        citations: [],
        memoryOps: { write: [], forget: [] }
      };
    }
    
    try {
      // 嘗試解析 JSON
      const parsed = JSON.parse(cleanedText);
      
      // 驗證 JSON 結構
      if (parsed && typeof parsed === 'object') {
        return {
          utterances: Array.isArray(parsed.utterances) ? parsed.utterances : [cleanedText],
          citations: parsed.citations || [],
          memoryOps: parsed.memoryOps || { write: [], forget: [] }
        };
      } else {
        throw new Error('Invalid JSON structure');
      }
    } catch (error) {
      // 無法解析 JSON，使用文字分段
      logger.debug('Using text splitting for Gemini response', { 
        error: error instanceof Error ? error.message : String(error),
        textLength: cleanedText.length 
      });
      
      return {
        utterances: this.splitTextIntoUtterances(cleanedText),
        citations: [],
        memoryOps: { write: [], forget: [] }
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
