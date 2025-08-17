import { 
  ContentClassificationResult, 
  GeminiClassificationResult, 
  SafetyPattern,
  ValidationError 
} from '@/types/index.js';
import { config } from '@/lib/config.js';
import { logger } from '@/lib/logger.js';
import { GeminiService } from './geminiService.js';

/**
 * 內容分類服務
 * 實作兩段式分類：規則分類 + AI 分類
 */
export class ContentClassifier {
  private geminiService: GeminiService;
  private hardBlockPatterns: SafetyPattern[];
  private sexualContentPatterns: SafetyPattern[];
  private educationalPatterns: SafetyPattern[];

  constructor(geminiService: GeminiService) {
    this.geminiService = geminiService;
    this.initializePatterns();
  }

  /**
   * 初始化安全檢查模式
   */
  private initializePatterns(): void {
    // 嚴禁類別模式（直接拒絕）
    this.hardBlockPatterns = [
      // 未成年相關
      { 
        pattern: /(?:未成年|小孩|兒童|學生|蘿莉|正太|小學|中學|高中|underage|child|kid|teen|loli|shota)/i,
        category: 'minors',
        action: 'deny',
        confidence: 0.9
      },
      // 非自願內容
      {
        pattern: /(?:強迫|強姦|迷姦|下藥|非自願|不同意|rape|force|drug|unwilling)/i,
        category: 'non_consensual',
        action: 'deny',
        confidence: 0.9
      },
      // 亂倫內容
      {
        pattern: /(?:亂倫|近親|父女|母子|兄妹|姊弟|incest|family)/i,
        category: 'incest',
        action: 'deny',
        confidence: 0.8
      },
      // 獸交內容
      {
        pattern: /(?:獸交|人獸|動物性行為|bestiality|zoophilia)/i,
        category: 'bestiality',
        action: 'deny',
        confidence: 0.9
      },
      // 性暴力
      {
        pattern: /(?:性暴力|性虐待|SM|BDSM|虐待|torture|abuse|violence)/i,
        category: 'sexual_violence',
        action: 'deny',
        confidence: 0.7
      },
      // 商業性剝削
      {
        pattern: /(?:賣淫|性交易|援交|prostitution|sex.work|escort)/i,
        category: 'commercial_exploitation',
        action: 'deny',
        confidence: 0.8
      }
    ];

    // 情色內容模式（轉向外部代理）
    this.sexualContentPatterns = [
      {
        pattern: /(?:聊色|色色|想做愛|做愛|性愛|口交|肛交|自慰|手淫|約炮|一夜情)/i,
        category: 'explicit_sexual',
        action: 'charProxy',
        confidence: 0.9
      },
      {
        pattern: /(?:挑逗|調情|誘惑|性感|撫摸|愛撫|親吻|擁抱|脫衣)/i,
        category: 'flirting',
        action: 'charProxy',
        confidence: 0.7
      },
      {
        pattern: /(?:胸部|乳房|陰莖|陰道|生殖器|性器官|私處|下體)(?!.*(?:醫療|健康|教育|疾病|檢查))/i,
        category: 'sexual_anatomy',
        action: 'charProxy',
        confidence: 0.6
      },
      {
        pattern: /(?:高潮|射精|潮吹|性快感|性高潮|orgasm|climax)/i,
        category: 'sexual_response',
        action: 'charProxy',
        confidence: 0.8
      }
    ];

    // 教育/醫療內容模式（保持在 Gemini）
    this.educationalPatterns = [
      {
        pattern: /(?:性教育|性知識|避孕|保險套|性病|性健康|婦科|泌尿科|醫療|健康)/i,
        category: 'sexual_education',
        action: 'gemini',
        confidence: 0.8
      },
      {
        pattern: /(?:生理期|月經|懷孕|生產|荷爾蒙|青春期|發育|身體發展)/i,
        category: 'reproductive_health',
        action: 'gemini',
        confidence: 0.8
      },
      {
        pattern: /(?:性別認同|性取向|同性戀|異性戀|雙性戀|跨性別|LGBTQ)/i,
        category: 'gender_identity',
        action: 'gemini',
        confidence: 0.7
      }
    ];

    logger.debug('Content classification patterns initialized', {
      hardBlockPatterns: this.hardBlockPatterns.length,
      sexualContentPatterns: this.sexualContentPatterns.length,
      educationalPatterns: this.educationalPatterns.length
    });
  }

  /**
   * 主要分類方法
   */
  async classifyContent(message: string): Promise<ContentClassificationResult> {
    if (!message || typeof message !== 'string') {
      throw new ValidationError('Message is required and must be a string');
    }

    const normalizedMessage = message.trim().toLowerCase();
    
    if (!normalizedMessage) {
      throw new ValidationError('Message cannot be empty');
    }

    logger.logSafeContent('debug', 'Starting content classification', message);

    try {
      // 第一階段：規則分類
      const ruleResult = await this.classifyWithRules(normalizedMessage);
      
      if (ruleResult.confidence >= 0.8) {
        logger.logClassification('Rule-based classification completed', ruleResult, message);
        return ruleResult;
      }

      // 第二階段：如果規則分類不確定且啟用了 Gemini 分類
      if (config.safetyClassifyWithGemini && ruleResult.confidence < 0.8) {
        const aiResult = await this.classifyWithAI(message, ruleResult);
        logger.logClassification('AI-assisted classification completed', aiResult, message);
        return aiResult;
      }

      // 如果都不確定，默認使用 Gemini
      return {
        action: 'gemini',
        confidence: 0.5,
        reason: 'Default routing due to uncertain classification',
        category: 'uncertain'
      };

    } catch (error) {
      logger.error('Content classification failed', { 
        error: error instanceof Error ? error.message : String(error),
        messageLength: message.length
      });

      // 分類失敗時的安全默認行為
      return {
        action: 'gemini',
        confidence: 0.3,
        reason: 'Classification error, defaulting to safe route',
        category: 'error'
      };
    }
  }

  /**
   * 規則分類
   */
  private async classifyWithRules(normalizedMessage: string): Promise<ContentClassificationResult> {
    // 檢查嚴禁內容
    for (const pattern of this.hardBlockPatterns) {
      if (pattern.pattern.test(normalizedMessage)) {
        return {
          action: 'deny',
          confidence: pattern.confidence,
          reason: `Matched hard block pattern: ${pattern.category}`,
          category: pattern.category
        };
      }
    }

    // 檢查教育/醫療內容（優先於情色內容）
    for (const pattern of this.educationalPatterns) {
      if (pattern.pattern.test(normalizedMessage)) {
        return {
          action: 'gemini',
          confidence: pattern.confidence,
          reason: `Matched educational pattern: ${pattern.category}`,
          category: pattern.category
        };
      }
    }

    // 檢查情色內容
    for (const pattern of this.sexualContentPatterns) {
      if (pattern.pattern.test(normalizedMessage)) {
        return {
          action: 'charProxy',
          confidence: pattern.confidence,
          reason: `Matched sexual content pattern: ${pattern.category}`,
          category: pattern.category
        };
      }
    }

    // 沒有匹配任何規則
    return {
      action: 'gemini',
      confidence: 0.4,
      reason: 'No rule pattern matched',
      category: 'default'
    };
  }

  /**
   * AI 分類（使用 Gemini 進行輕量分類）
   */
  private async classifyWithAI(
    message: string, 
    ruleResult: ContentClassificationResult
  ): Promise<ContentClassificationResult> {
    try {
      const classificationPrompt = this.buildClassificationPrompt(message);
      const response = await this.geminiService.classifyContent(classificationPrompt);
      
      return this.processAIClassificationResult(response, ruleResult);
    } catch (error) {
      logger.warn('AI classification failed, falling back to rule result', { 
        error: error instanceof Error ? error.message : String(error)
      });
      
      // AI 分類失敗時回退到規則結果
      return ruleResult;
    }
  }

  /**
   * 建構分類提示詞
   */
  private buildClassificationPrompt(message: string): string {
    return `請分析以下訊息的內容性質，並回傳 JSON 格式的分類結果：

訊息內容：
"${message}"

請判斷：
1. sexualIntent: 是否具有明確的性意圖或性內容（boolean）
2. educational: 是否屬於教育、醫療、法律等正當諮詢（boolean）
3. hardBlock: 是否包含應被禁止的內容（未成年、非自願、暴力等）（boolean）

回傳格式：
{
  "sexualIntent": false,
  "educational": false,
  "hardBlock": false
}

只回傳 JSON，不要其他說明。`;
  }

  /**
   * 處理 AI 分類結果
   */
  private processAIClassificationResult(
    aiResult: GeminiClassificationResult,
    ruleResult: ContentClassificationResult
  ): ContentClassificationResult {
    // 如果 AI 判定為應禁止內容，直接拒絕
    if (aiResult.hardBlock) {
      return {
        action: 'deny',
        confidence: 0.8,
        reason: 'AI classified as hard block content',
        category: 'ai_hard_block'
      };
    }

    // 如果 AI 判定為性意圖但非教育性質，走外部代理
    if (aiResult.sexualIntent && !aiResult.educational) {
      return {
        action: 'charProxy',
        confidence: 0.7,
        reason: 'AI classified as sexual intent',
        category: 'ai_sexual'
      };
    }

    // 如果 AI 判定為教育性質，走 Gemini
    if (aiResult.educational) {
      return {
        action: 'gemini',
        confidence: 0.8,
        reason: 'AI classified as educational content',
        category: 'ai_educational'
      };
    }

    // 其他情況走 Gemini
    return {
      action: 'gemini',
      confidence: 0.6,
      reason: 'AI classification: general content',
      category: 'ai_general'
    };
  }

  /**
   * 獲取安全拒絕訊息
   */
  getSafetyDenialMessage(category?: string): string {
    const messages = {
      minors: '抱歉，我無法回應涉及未成年人的不當內容。讓我們聊聊其他的話題吧。',
      non_consensual: '我不能協助處理涉及非自願行為的內容。如果您需要相關協助，建議聯繫專業機構。',
      incest: '我無法回應涉及亂倫的內容。讓我們討論其他有趣的話題。',
      bestiality: '我不能處理涉及動物的不當內容。讓我們聊聊別的吧。',
      sexual_violence: '我無法協助處理涉及暴力的內容。如果您需要幫助，請聯繫相關專業機構。',
      commercial_exploitation: '我不能回應涉及性交易的內容。如果需要相關資訊或協助，建議尋求專業幫助。',
      default: '抱歉，這個話題我無法回應。讓我們聊聊其他有趣的內容吧！'
    };

    return messages[category as keyof typeof messages] || messages.default;
  }
}

export default ContentClassifier;
