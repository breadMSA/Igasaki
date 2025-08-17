import { config as dotenvConfig } from 'dotenv';
import { Config } from '@/types/index.js';

// Load environment variables
dotenvConfig();

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  return value;
}

function getEnvVarOptional(key: string, defaultValue?: string): string | undefined {
  return process.env[key] || defaultValue;
}

function getBooleanEnvVar(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true' || value === '1';
}

function getNumberEnvVar(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a valid number`);
  }
  return parsed;
}

// Default TTS prompts
const DEFAULT_TTS_SYSTEM_PROMPT = '你是一個純語音輸出器。請用自然、清晰、溫柔的女性聲線，逐字朗讀我提供的內容。不要添加任何額外字詞、解釋或助詞；不要輸出文字，僅輸出語音。內容若含引號，忽略引號本身，只朗讀其內文。';
const DEFAULT_TTS_USER_TEMPLATE = '請朗讀以下內容，不要多說任何一句話：{{TEXT}}';

export const config: Config = {
  // General
  port: getNumberEnvVar('PORT', 3001),
  nodeEnv: getEnvVar('NODE_ENV', 'development'),
  debug: getBooleanEnvVar('DEBUG', false),
  logLevel: getEnvVar('LOG_LEVEL', 'info'),
  corsOrigin: getEnvVar('CORS_ORIGIN', 'http://localhost:5173'),

  // Gemini
  geminiApiKey: getEnvVar('GEMINI_API_KEY'),

  // Chat Proxy
  chatProxyUrl: getEnvVar('CHAT_PROXY_URL'),
  chatProxyApiKey: getEnvVarOptional('CHAT_PROXY_API_KEY'),
  chatProxyChatPath: getEnvVar('CHAT_PROXY_CHAT_PATH', '/v1/chat'),
  chatProxyVoiceId: getEnvVarOptional('CHAT_PROXY_VOICE_ID'),

  // TTS
  ttsMode: getEnvVar('TTS_MODE', 'chat-say'),
  ttsFormat: getEnvVar('TTS_FORMAT', 'mp3'),
  ttsSystemPrompt: getEnvVar('TTS_SYSTEM_PROMPT', DEFAULT_TTS_SYSTEM_PROMPT),
  ttsUserTemplate: getEnvVar('TTS_USER_TEMPLATE', DEFAULT_TTS_USER_TEMPLATE),

  // Safety
  safetyEnableHardblock: getBooleanEnvVar('SAFETY_ENABLE_HARDBLOCK', true),
  safetyClassifyWithGemini: getBooleanEnvVar('SAFETY_CLASSIFY_WITH_GEMINI', true),
  logSensitiveTexts: getBooleanEnvVar('LOG_SENSITIVE_TEXTS', false),
};

// Validate required configuration
export function validateConfig(): void {
  const requiredFields: (keyof Config)[] = [
    'geminiApiKey',
    'chatProxyUrl'
  ];

  for (const field of requiredFields) {
    if (!config[field]) {
      throw new Error(`Configuration field '${field}' is required but not set`);
    }
  }

  // Validate URLs
  try {
    new URL(config.chatProxyUrl);
  } catch (error) {
    throw new Error(`Invalid CHAT_PROXY_URL: ${config.chatProxyUrl}`);
  }

  try {
    new URL(config.corsOrigin);
  } catch (error) {
    throw new Error(`Invalid CORS_ORIGIN: ${config.corsOrigin}`);
  }

  // Validate TTS format
  const validTtsFormats = ['mp3', 'ogg', 'wav'];
  if (!validTtsFormats.includes(config.ttsFormat)) {
    throw new Error(`Invalid TTS_FORMAT: ${config.ttsFormat}. Must be one of: ${validTtsFormats.join(', ')}`);
  }

  console.log('✅ Configuration validated successfully');
}

export default config;
