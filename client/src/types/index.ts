// API 相關類型
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  route?: 'gemini' | 'charProxy' | 'deny';
  utterances?: string[];
  citations?: Citation[];
  attachments?: string[];
  processing?: boolean;
}

export interface Citation {
  title?: string;
  url: string;
  snippet?: string;
}

export interface ChatRequest {
  message: string;
  images?: string[];
  personaId?: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

export interface TTSRequest {
  text: string;
  voiceId?: string;
  rate?: number;
  pitch?: number;
}

export interface Voice {
  id: string;
  name: string;
  language?: string;
  gender?: 'male' | 'female' | 'neutral';
}

// SSE 事件類型
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

export interface MetaEvent {
  route: 'deny' | 'charProxy' | 'gemini';
  processingTime?: number;
  model?: string;
  requestId?: string;
  status?: string;
  confidence?: number;
  category?: string;
}

export interface ErrorEvent {
  message: string;
  code?: string;
}

// Live2D 相關類型
export interface Live2DModel {
  id: string;
  name: string;
  path: string;
  loaded: boolean;
  expressions?: string[];
  motions?: string[];
}

export interface Live2DExpression {
  name: string;
  file: string;
}

export interface Live2DMotion {
  group: string;
  name: string;
  file: string;
  duration?: number;
}

// 音頻相關類型
export interface AudioState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  audioUrl?: string;
}

export interface AudioAnalysis {
  volume: number;
  frequency: number;
  waveform: number[];
}

// 記憶相關類型
export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}

export interface MemoryCard {
  id: string;
  type: 'fact' | 'preference' | 'context' | 'skill';
  content: string;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
  source?: string;
}

export interface UserPreferences {
  id: string;
  voiceId?: string;
  personaId?: string;
  ttsMode: 'chat-say' | 'direct';
  autoplay: boolean;
  volume: number;
  live2dEnabled: boolean;
  live2dModelId?: string;
  theme: 'light' | 'dark' | 'auto';
  language: 'zh-TW' | 'en-US';
  createdAt: Date;
  updatedAt: Date;
}

// UI 相關類型
export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface ModalState {
  isOpen: boolean;
  type?: 'settings' | 'about' | 'memory' | 'voices' | 'models';
  data?: any;
}

export interface LoadingState {
  isLoading: boolean;
  message?: string;
  progress?: number;
}

// 應用狀態類型
export interface AppState {
  isInitialized: boolean;
  isOnline: boolean;
  currentConversationId?: string;
  live2dModel?: Live2DModel;
  preferences: UserPreferences;
  modal: ModalState;
  loading: LoadingState;
  toasts: ToastMessage[];
}

// 服務狀態類型
export interface ServiceStatus {
  chat: boolean;
  tts: boolean;
  live2d: boolean;
  memory: boolean;
  lastChecked: Date;
}

// 錯誤類型
export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NetworkError extends AppError {
  constructor(message: string = '網路連線錯誤') {
    super(message, 'NETWORK_ERROR', 0);
  }
}

export class APIError extends AppError {
  constructor(message: string, statusCode: number) {
    super(message, 'API_ERROR', statusCode);
  }
}

export class Live2DError extends AppError {
  constructor(message: string) {
    super(message, 'LIVE2D_ERROR');
  }
}

export class AudioError extends AppError {
  constructor(message: string) {
    super(message, 'AUDIO_ERROR');
  }
}

export class DatabaseError extends AppError {
  constructor(message: string) {
    super(message, 'DATABASE_ERROR');
  }
}

// Utility 類型
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// 事件類型
export interface AppEvent {
  type: string;
  payload?: any;
  timestamp: Date;
}

export interface ChatEvent extends AppEvent {
  type: 'message_sent' | 'message_received' | 'typing_start' | 'typing_stop';
  payload: {
    messageId?: string;
    conversationId: string;
    content?: string;
  };
}

export interface AudioEvent extends AppEvent {
  type: 'play_start' | 'play_end' | 'volume_change';
  payload: {
    audioUrl?: string;
    volume?: number;
    duration?: number;
  };
}

export interface Live2DEvent extends AppEvent {
  type: 'model_loaded' | 'expression_changed' | 'motion_played';
  payload: {
    modelId?: string;
    expression?: string;
    motion?: string;
  };
}

// 檔案處理類型
export interface FileInfo {
  name: string;
  size: number;
  type: string;
  url: string;
  lastModified: Date;
}

export interface ImageFile extends FileInfo {
  width: number;
  height: number;
  thumbnail?: string;
}

export interface AudioFile extends FileInfo {
  duration: number;
  format: string;
  sampleRate?: number;
}

// API 回應包裝類型
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
    processingTime?: number;
  };
}

// 分頁類型
export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// 搜尋類型
export interface SearchParams {
  query: string;
  filters?: Record<string, any>;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface SearchResult<T> {
  items: T[];
  total: number;
  query: string;
  suggestions?: string[];
  facets?: Record<string, { value: string; count: number }[]>;
}
