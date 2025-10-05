// API Request/Response Types
export interface ChatRequest {
  message: string;
  images?: string[];
  personaId?: string;
  personality?: string;
  history?: ChatMessage[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export interface TTSRequest {
  text: string;
  voiceId?: string;
  rate?: number;
  pitch?: number;
}

export interface VoiceInfo {
  id: string;
  name: string;
  language?: string;
  gender?: 'male' | 'female' | 'neutral';
}

export interface VoicesResponse {
  voices: VoiceInfo[];
}

// Content Classification Types
export interface ContentClassificationResult {
  action: 'deny' | 'charProxy' | 'gemini';
  confidence: number;
  reason?: string;
  category?: string;
}

export interface GeminiClassificationResult {
  sexualIntent: boolean;
  educational: boolean;
  hardBlock: boolean;
  confidence?: number;
}

// SSE Event Types
export interface SSEEvent {
  event: 'utterance' | 'citation' | 'memory' | 'meta' | 'error' | 'done';
  data: any;
}

export interface UtteranceEvent {
  text: string;
  index?: number;
}

export interface CitationEvent {
  title?: string;
  url: string;
  snippet?: string;
}

export interface MemoryEvent {
  write?: MemoryOperation[];
  forget?: string[];
}

export interface MemoryOperation {
  type: string;
  content: string;
  confidence: number;
}

export interface MemoryOperations {
  write?: MemoryOperation[];
  forget?: string[];
}

export interface MetaEvent {
  route: 'deny' | 'charProxy' | 'gemini';
  processingTime?: number;
  model?: string;
}

export interface ErrorEvent {
  message: string;
  code?: string;
}

// Character.AI Types (based on the provided sample)
export interface CharacterAIMessage {
  command: string;
  request_id?: string;
  origin_id?: string;
  payload?: any;
}

export interface CharacterAIChat {
  chat_id: string;
  creator_id: string;
  character_id: string;
  visibility: string;
  type: string;
}

export interface CharacterAITurn {
  turn_id: string;
  author: {
    author_id: string;
    is_human: boolean;
    name: string;
  };
  candidates: CharacterAICandidate[];
  primary_candidate_id: string;
  turn_key: {
    chat_id: string;
    turn_id: string;
  };
}

export interface CharacterAICandidate {
  candidate_id: string;
  raw_content?: string;
  text?: string;
  is_final?: boolean;
}

// Gemini Types
export interface GeminiResponse {
  utterances: string[];
  citations?: CitationEvent[];
  memoryOps?: MemoryOperations;
}

// Chat Proxy Types
export interface ChatProxyRequest {
  message: string;
  characterId?: string;
  chatId?: string;
  history?: ChatMessage[];
  voiceId?: string;
  returnAudio?: boolean;
}

export interface ChatProxyResponse {
  text?: string;
  audio?: Buffer;
  audioUrl?: string;
  utterances?: string[];
}

// Environment Configuration
export interface Config {
  // General
  port: number;
  nodeEnv: string;
  debug: boolean;
  logLevel: string;
  corsOrigin: string;

  // Gemini
  geminiApiKey: string;

  // Chat Proxy
  chatProxyUrl?: string;
  chatProxyApiKey?: string;
  chatProxyChatPath?: string;
  chatProxyVoiceId?: string;
  
  // Character.AI Direct Integration
  characterAIToken?: string;
  characterAICharacterId?: string;
  characterAIChatId?: string;
  characterAIVoiceId?: string;

  // TTS
  ttsMode: string;
  ttsFormat: string;
  ttsSystemPrompt: string;
  ttsUserTemplate: string;

  // Safety
  safetyEnableHardblock: boolean;
  safetyClassifyWithGemini: boolean;
  logSensitiveTexts: boolean;
}

// Safety Classification Patterns
export interface SafetyPattern {
  pattern: RegExp;
  category: string;
  action: 'deny' | 'charProxy' | 'gemini';
  confidence: number;
}

// Error Types
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string) {
    super(`${service} error: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR');
  }
}
