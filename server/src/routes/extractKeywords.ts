import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = express.Router();

// 初始化 Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

router.post('/', async (req, res) => {
  try {
    const { text, model = 'gemini-2.0-flash' } = req.body;

    if (!text) {
      return res.status(400).json({ error: '缺少文本內容' });
    }

    // 使用 Gemini 提取關鍵詞
    const geminiModel = genAI.getGenerativeModel({ model });

    const prompt = `
請從以下文本中提取 3-5 個最重要的關鍵詞，用於搜索相關的聊天記錄。

要求：
1. 只提取實質內容的關鍵詞，不要包含疑問詞、語氣詞等無意義詞彙
2. 如果是引號內的內容，優先提取
3. 返回的關鍵詞應該是可以用來搜索相關內容的
4. 用空格分隔多個關鍵詞

文本：${text}

請直接返回關鍵詞，不要其他解釋：
`;

    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    const keywords = response.text().trim().split(/\s+/).filter(k => k.length > 0);

    console.log('🤖 Gemini 提取的關鍵詞:', keywords);

    res.json({ keywords });
  } catch (error) {
    console.error('關鍵詞提取失敗:', error);
    res.status(500).json({ error: '關鍵詞提取失敗' });
  }
});

export default router;
