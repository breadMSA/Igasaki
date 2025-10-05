import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';
import { config } from '@/lib/config.js';
import { logger } from '@/lib/logger.js';
import { 
  CharacterAIMessage, 
  CharacterAIChat, 
  CharacterAITurn, 
  CharacterAICandidate,
  ExternalServiceError 
} from '@/types/index.js';

/**
 * Character.AI 反向工程 API 客戶端
 * 基於提供的 only_sample_characterai.js 實作
 */
export class CharacterAI {
  private token: string | null = null;
  private accountId: string | null = null;
  private baseUrl: string = 'https://plus.character.ai';
  private wsUrl: string = 'wss://neo.character.ai/ws/';
  private activeChats: Map<string, any> = new Map();
  private activeWebSockets: Map<string, WebSocket> = new Map();
  
  private headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
    'Accept': 'application/json',
    'Origin': 'https://character.ai',
    'Referer': 'https://character.ai/'
  };

  constructor() {
    // 從環境變數獲取 Character.AI Token
    if (config.characterAIToken) {
      this.setToken(config.characterAIToken);
    } else if (config.chatProxyApiKey) {
      // 後備：使用代理配置
      this.setToken(config.chatProxyApiKey);
    }
  }

  /**
   * 設定認證 Token
   */
  setToken(token: string): void {
    this.token = token;
    this.headers['Authorization'] = `Token ${token}`;
  }

  /**
   * 獲取認證標頭
   */
  getHeaders(): Record<string, string> {
    if (!this.token) {
      throw new ExternalServiceError('CharacterAI', 'Token not set');
    }
    
    return {
      'Content-Type': 'application/json',
      'Authorization': `Token ${this.token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
      'Accept': 'application/json',
      'Origin': 'https://character.ai',
      'Referer': 'https://character.ai/',
      'Cookie': `HTTP_AUTHORIZATION=Token ${this.token}`
    };
  }

  /**
   * 創建或獲取 WebSocket 連接
   */
  async getWebSocket(): Promise<WebSocket> {
    if (!this.token) {
      throw new ExternalServiceError('CharacterAI', 'Token not set');
    }

    // 總是創建新的連接，避免 403 錯誤
    if (this.activeWebSockets.has(this.token)) {
      try {
        const oldWs = this.activeWebSockets.get(this.token)!;
        if (oldWs.readyState !== WebSocket.CLOSED) {
          oldWs.terminate();
        }
      } catch (error) {
        logger.debug('Error closing old WebSocket:', error);
      }
      this.activeWebSockets.delete(this.token);
    }

    // 創建新的 WebSocket 連接
    return new Promise((resolve, reject) => {
      logger.info('Creating new WebSocket connection to Character.AI...');
      
      // 關閉任何現有的連接
      if (this.token && this.activeWebSockets.has(this.token)) {
        try {
          const oldWs = this.activeWebSockets.get(this.token)!;
          if (oldWs.readyState !== WebSocket.CLOSED) {
            logger.debug('Closing existing WebSocket connection');
            oldWs.terminate();
          }
        } catch (error) {
          logger.error('Error closing existing WebSocket:', error);
        }
      }
      
      // 嘗試多種認證方式（按照 PyCharacterAI 實現）
      const tryConnection = (options: any, attempt: number = 1, url: string = this.wsUrl) => {
        logger.debug(`WebSocket connection attempt ${attempt}`, { url: url.substring(0, 40) + '...' });
        
        // 按照 PyCharacterAI 的實現，使用 Cookie header 進行認證
        // Node.js WebSocket 不支持 cookies 選項，需要使用 headers
        const wsOptions = {
          ...options,
          headers: {
            ...options.headers,
            'Cookie': `HTTP_AUTHORIZATION=Token ${this.token}`
          }
        };
        
        const ws = new WebSocket(url, wsOptions);
        
        const connectionTimeout = setTimeout(() => {
          logger.warn(`WebSocket connection attempt ${attempt} timed out`);
          ws.terminate();
          
          if (attempt === 1) {
            // 第二次嘗試：使用 Authorization cookie（按照 only_sample_characterai.js）
            tryConnection({
              headers: {
                'Cookie': `Authorization=Token ${this.token}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
                'Origin': 'https://character.ai',
                'Referer': 'https://character.ai/'
              }
            }, 2);
          } else if (attempt === 2) {
            // 第三次嘗試：URL 中包含 token
            const wsUrlWithToken = `${this.wsUrl}?token=${this.token}`;
            tryConnection({
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
                'Origin': 'https://character.ai',
                'Referer': 'https://character.ai/'
              }
            }, 3, wsUrlWithToken);
          } else {
            reject(new ExternalServiceError('CharacterAI', 'All WebSocket connection attempts failed'));
          }
        }, 10000);

        ws.on('error', (error) => {
          logger.error(`WebSocket connection error on attempt ${attempt}:`, error);
          clearTimeout(connectionTimeout);
          
          if (attempt === 1) {
            // 第二次嘗試：使用 headers 中的 Cookie
            tryConnection({
              headers: {
                'Cookie': `HTTP_AUTHORIZATION=Token ${this.token}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
                'Origin': 'https://character.ai',
                'Referer': 'https://character.ai/'
              }
            }, 2);
          } else if (attempt === 2) {
            // 第三次嘗試：URL 中包含 token
            const wsUrlWithToken = `${this.wsUrl}?token=${this.token}`;
            tryConnection({
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
                'Origin': 'https://character.ai',
                'Referer': 'https://character.ai/'
              }
            }, 3, wsUrlWithToken);
          } else {
            reject(new ExternalServiceError('CharacterAI', 'All WebSocket connection attempts failed'));
          }
        });

        ws.on('open', () => {
          clearTimeout(connectionTimeout);
          logger.info(`WebSocket connection established on attempt ${attempt}`);
          if (this.token) {
            this.activeWebSockets.set(this.token, ws);
          }
          
          // 發送 ping 驗證連接
          try {
            ws.send(JSON.stringify({ command: "ping" }));
            logger.debug('Sent ping to WebSocket');
          } catch (error) {
            logger.error('Error sending ping:', error);
          }
          
          resolve(ws);
        });

        ws.on('error', (error) => {
          clearTimeout(connectionTimeout);
          logger.error(`WebSocket connection error on attempt ${attempt}:`, error);
          
          if (attempt === 1) {
            tryConnection({
              headers: {
                'Cookie': `HTTP_AUTHORIZATION=Token ${this.token}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
                'Origin': 'https://character.ai',
                'Referer': 'https://character.ai/'
              }
            }, 2);
          } else if (attempt === 2) {
            const wsUrlWithToken = `${this.wsUrl}?token=${this.token}`;
            tryConnection({
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
                'Origin': 'https://character.ai',
                'Referer': 'https://character.ai/'
              }
            }, 3, wsUrlWithToken);
          } else {
            reject(error);
          }
        });

        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            if (message.command === 'pong') {
              logger.debug('Received pong from WebSocket');
            }
          } catch (error) {
            logger.error('Error parsing WebSocket message:', error);
          }
        });
      };
      
                    // 開始第一次嘗試：使用 cookies 認證（按照 PyCharacterAI）
      tryConnection({
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
          'Origin': 'https://character.ai',
          'Referer': 'https://character.ai/'
        }
      }, 1, this.wsUrl);
    });
  }

  /**
   * 獲取帳戶資訊
   */
  async fetchMe(): Promise<any> {
    try {
      if (!this.token) {
        throw new ExternalServiceError('CharacterAI', 'Token not set');
      }

      logger.info('Fetching account info from Character.AI...');
      
      // 嘗試主要 API 端點
      try {
        const response = await axios({
          method: 'GET',
          url: `${this.baseUrl}/chat/user/`,
          headers: this.getHeaders(),
          timeout: 10000
        });

        logger.debug('Character.AI user API response status:', response.status);
        
        if (response.data && response.data.user) {
          // 嘗試不同路徑找到帳戶 ID
          if (response.data.user.id) {
            this.accountId = String(response.data.user.id);
            logger.info('Successfully retrieved account ID:', this.accountId);
            return response.data.user;
          } else if (response.data.user.user && response.data.user.user.id) {
            this.accountId = String(response.data.user.user.id);
            logger.info('Successfully retrieved account ID (nested):', this.accountId);
            return response.data.user.user;
          } else if (response.data.user.user_id) {
            this.accountId = String(response.data.user.user_id);
            logger.info('Successfully retrieved account ID (user_id):', this.accountId);
            return response.data.user;
          }
        }
        
        if (response.data && response.data.status === "OK" && response.data.user_id) {
          this.accountId = String(response.data.user_id);
          logger.info('Successfully retrieved account ID (alternative format):', this.accountId);
          return response.data;
        }
      } catch (primaryError) {
        logger.warn(`Primary user API failed, trying neo API...`, { error: primaryError });
      }
      
      // 嘗試 neo API 端點
      try {
        const neoResponse = await axios({
          method: 'GET',
          url: 'https://neo.character.ai/user/',
          headers: this.getHeaders(),
          timeout: 10000
        });
        
        logger.debug('Character.AI neo user API response status:', neoResponse.status);
        
        if (neoResponse.data && neoResponse.data.user && neoResponse.data.user.user_id) {
          this.accountId = String(neoResponse.data.user.user_id);
          logger.info('Successfully retrieved account ID from neo API:', this.accountId);
          return neoResponse.data.user;
        }
        
        if (neoResponse.data && neoResponse.data.user && neoResponse.data.user.id) {
          this.accountId = String(neoResponse.data.user.id);
          logger.info('Successfully retrieved account ID from neo API (id):', this.accountId);
          return neoResponse.data.user;
        }
      } catch (neoError) {
        logger.warn(`Neo user API failed`, { error: neoError });
      }
      
      // 如果都失敗，生成一個 UUID 作為後備
      if (!this.accountId) {
        this.accountId = String(uuidv4());
        logger.warn('Generated fallback account ID:', this.accountId);
        return { user_id: this.accountId };
      }

      throw new ExternalServiceError('CharacterAI', 'Failed to fetch account information');
    } catch (error) {
      logger.error('Error fetching account info:', error);
      
      // 生成後備 UUID
      this.accountId = String(uuidv4());
      logger.warn('Generated fallback account ID after error:', this.accountId);
      return { user_id: this.accountId };
    }
  }

  /**
   * 創建新的聊天或獲取現有聊天
   */
  async createChat(characterId: string): Promise<{ chat: CharacterAIChat; greeting?: CharacterAITurn }> {
    try {
      if (!this.token) {
        throw new ExternalServiceError('CharacterAI', 'Token not set');
      }

      // 確保有帳戶 ID
      if (!this.accountId) {
        await this.fetchMe();
      }

      // 檢查是否有現有的聊天會話
      const existingChatId = config.characterAIChatId;
      if (existingChatId) {
        try {
          // 嘗試獲取現有聊天
          const existingChat = await this.getChatById(existingChatId);
          if (existingChat) {
            logger.info(`Using existing chat session: ${existingChatId}`);
            return { chat: existingChat, greeting: undefined };
          }
        } catch (error) {
          logger.warn(`Failed to get existing chat ${existingChatId}, creating new one`, { error });
        }
      }

      logger.info(`Creating new chat with character ${characterId}...`);
      
      try {
        // 創建 WebSocket 連接
        const ws = await this.getWebSocket();
        const requestId = uuidv4();
        const chatId = uuidv4();
        
        // 構造 WebSocket 訊息
        const createChatMessage: CharacterAIMessage = {
          command: "create_chat",
          request_id: requestId,
          payload: {
            chat: {
              chat_id: chatId,
              creator_id: this.accountId,
              visibility: "VISIBILITY_PRIVATE",
              character_id: characterId,
              type: "TYPE_ONE_ON_ONE"
            },
            with_greeting: true
          }
        };
        
        logger.debug('Sending create_chat message');
        
        // 發送訊息並等待回應
        return await new Promise((resolve, reject) => {
          let newChat: CharacterAIChat | null = null;
          let greetingTurn: CharacterAITurn | null = null;
          
          const messageHandler = (data: Buffer) => {
            try {
              const response = JSON.parse(data.toString());
              logger.debug('Received WebSocket response:', response.command);
              
              if (response.command === 'neo_error') {
                const errorComment = response.comment || '';
                cleanup();
                reject(new ExternalServiceError('CharacterAI', `API error: ${errorComment}`));
                return;
              }
              
              if (response.command === 'create_chat_response') {
                newChat = response.chat;
                logger.debug('Received create_chat_response');
                
                if (!createChatMessage.payload?.with_greeting) {
                  cleanup();
                  resolve({ chat: newChat!, greeting: undefined });
                  return;
                }
                return;
              }
              
              if (response.command === 'add_turn') {
                greetingTurn = response.turn;
                logger.debug('Received greeting turn');
                
                if (newChat) {
                  cleanup();
                  resolve({ chat: newChat, greeting: greetingTurn! });
                  return;
                }
                return;
              }
            } catch (error) {
              logger.error('Error processing WebSocket message:', error);
              cleanup();
              reject(error);
            }
          };
          
          const errorHandler = (error: Error) => {
            logger.error('WebSocket error during chat creation:', error);
            cleanup();
            reject(error);
          };
          
          const closeHandler = (code: number, reason: Buffer) => {
            logger.warn(`WebSocket closed during chat creation: ${code} - ${reason}`);
            cleanup();
            reject(new ExternalServiceError('CharacterAI', `WebSocket closed unexpectedly: ${reason}`));
          };
          
          const cleanup = () => {
            ws.removeListener('message', messageHandler);
            ws.removeListener('error', errorHandler);
            ws.removeListener('close', closeHandler);
            clearTimeout(timeout);
          };
          
          ws.on('message', messageHandler);
          ws.on('error', errorHandler);
          ws.on('close', closeHandler);
          
          const timeout = setTimeout(() => {
            cleanup();
            reject(new ExternalServiceError('CharacterAI', 'Timeout waiting for response'));
          }, 30000);
          
          ws.send(JSON.stringify(createChatMessage), (error) => {
            if (error) {
              cleanup();
              reject(error);
            }
          });
        });
      } catch (wsError) {
        logger.warn(`WebSocket chat creation failed, trying HTTP API...`, { error: wsError });
        return await this.createChatWithHTTP(characterId);
      }
    } catch (error) {
      logger.error('Error creating chat:', error);
      throw new ExternalServiceError('CharacterAI', `Failed to create chat: ${error}`);
    }
  }

  /**
   * 獲取現有聊天
   */
  async getChatById(chatId: string): Promise<CharacterAIChat | null> {
    try {
      const response = await axios({
        method: 'GET',
        url: `https://neo.character.ai/chat/${chatId}/`,
        headers: this.getHeaders(),
        timeout: 10000
      });

      if (response.status === 200 && response.data?.chat) {
        return response.data.chat;
      }

      return null;
    } catch (error) {
      logger.warn(`Failed to get chat ${chatId}`, { error });
      return null;
    }
  }

  /**
   * 使用 HTTP API 創建聊天（後備方案）
   */
  private async createChatWithHTTP(characterId: string): Promise<{ chat: CharacterAIChat; greeting?: undefined }> {
    logger.info('Attempting to create chat using direct HTTP API calls...');
    
    const endpoints = [
      {
        url: 'https://beta.character.ai/chat/history/create/',
        method: 'POST',
        data: { character_external_id: characterId, history_external_id: null },
        name: 'Beta API'
      },
      {
        url: 'https://neo.character.ai/chat/',
        method: 'POST',
        data: { character_id: characterId },
        name: 'Neo API'
      },
      {
        url: `${this.baseUrl}/chat/history/create/`,
        method: 'POST',
        data: { character_external_id: characterId, history_external_id: null },
        name: 'Legacy API'
      }
    ];
    
    for (const endpoint of endpoints) {
      try {
        logger.debug(`Trying ${endpoint.name}...`);
        const response = await axios({
          method: endpoint.method as any,
          url: endpoint.url,
          headers: this.getHeaders(),
          timeout: 15000,
          data: endpoint.data
        });
        
        logger.debug(`${endpoint.name} response status:`, response.status);
        
        let chatId = null;
        let chat = null;
        
        if (response.data) {
          if (response.data.chat && response.data.chat.chat_id) {
            chatId = response.data.chat.chat_id;
            chat = response.data.chat;
          } else if (response.data.external_id) {
            chatId = response.data.external_id;
            chat = {
              ...response.data,
              chat_id: response.data.external_id
            };
          } else if (response.data.chat_id) {
            chatId = response.data.chat_id;
            chat = response.data;
          } else if (response.data.id) {
            chatId = response.data.id;
            chat = response.data;
          }
          
          if (chatId) {
            logger.info(`Successfully created chat with ID: ${chatId} using ${endpoint.name}`);
            return { chat, greeting: undefined };
          }
        }
        
        logger.debug(`${endpoint.name} response did not contain a valid chat ID`);
      } catch (error) {
        logger.debug(`${endpoint.name} failed:`, error);
      }
    }
    
    throw new ExternalServiceError('CharacterAI', 'All HTTP API endpoints failed to create a chat');
  }

  /**
   * 發送訊息（按照 PyCharacterAI 實現）
   */
  async sendMessage(characterId: string, chatId: string, message: string, streaming: boolean = false): Promise<any> {
    try {
      if (!this.token) {
        throw new ExternalServiceError('CharacterAI', 'Token not set');
      }

      if (!this.accountId) {
        await this.fetchMe();
      }

      // 首先嘗試 WebSocket 方法
      try {
        if (streaming) {
          return this.sendMessageViaWebSocketStreaming(characterId, chatId, message);
        } else {
          return await this.sendMessageViaWebSocket(characterId, chatId, message);
        }
      } catch (wsError) {
        logger.warn('WebSocket method failed, trying HTTP API fallback', { error: wsError });
        // 如果 WebSocket 失敗，使用 HTTP API 備用方案
        return await this.sendMessageViaHTTP(characterId, chatId, message);
      }
    } catch (error) {
      logger.error('Error sending message:', error);
      throw new ExternalServiceError('CharacterAI', `Failed to send message: ${error}`);
    }
  }

  /**
   * 通過 WebSocket 發送訊息（按照 PyCharacterAI 實現）
   */
  private async sendMessageViaWebSocket(characterId: string, chatId: string, message: string): Promise<any> {
      const candidateId = uuidv4();
      const turnId = uuidv4();
      const requestId = uuidv4();
      
    logger.info(`Sending message via WebSocket to character ${characterId} in chat ${chatId}...`);
      
      const wsMessage: CharacterAIMessage = {
        command: "create_and_generate_turn",
        origin_id: "web-next",
        payload: {
          character_id: characterId,
          num_candidates: 1,
          previous_annotations: {
            bad_memory: 0, boring: 0, ends_chat_early: 0, funny: 0, helpful: 0,
            inaccurate: 0, interesting: 0, long: 0, not_bad_memory: 0, not_boring: 0,
            not_ends_chat_early: 0, not_funny: 0, not_helpful: 0, not_inaccurate: 0,
            not_interesting: 0, not_long: 0, not_out_of_character: 0, not_repetitive: 0,
            not_short: 0, out_of_character: 0, repetitive: 0, short: 0,
          },
          selected_language: "",
          tts_enabled: false,
          turn: {
            author: {
              author_id: this.accountId!,
              is_human: true,
              name: "",
            },
            candidates: [{ candidate_id: candidateId, raw_content: message }],
            primary_candidate_id: candidateId,
            turn_key: { chat_id: chatId, turn_id: turnId },
          },
          user_name: "",
        },
        request_id: requestId,
      };

      const ws = await this.getWebSocket();
      
      return new Promise((resolve, reject) => {
        let finalResponse: any = null;
        
        const messageHandler = (data: Buffer) => {
          try {
            const response = JSON.parse(data.toString());
            
            if (response.request_id !== requestId && 
                !(response.command === 'add_turn' || response.command === 'update_turn')) {
              return;
            }
            
            const command = response.command;
            
            if (!command) {
              reject(new ExternalServiceError('CharacterAI', 'Invalid response - missing command'));
              return;
            }
            
            if (command === 'neo_error') {
              const errorComment = response.comment || '';
              reject(new ExternalServiceError('CharacterAI', `API error: ${errorComment}`));
              return;
            }
            
            if (command === 'filter_user_input_self_harm') {
              reject(new ExternalServiceError('CharacterAI', 'Message was flagged for self harm content'));
              return;
            }
            
            if (command === 'add_turn' || command === 'update_turn') {
              // 跳過用戶訊息的回聲
              if (response.turn && response.turn.author && response.turn.author.is_human) {
              logger.debug('Skipping user echo message');
                return;
              }
              
            // 確保有 turn 和 candidates
            if (!response.turn || !response.turn.candidates || response.turn.candidates.length === 0) {
              logger.debug('Skipping response without valid turn/candidates');
              return;
            }
            
            const isFinal = response.turn.candidates[0] && response.turn.candidates[0].is_final;
            
            // 檢查是否有實際內容
            const candidate = response.turn.candidates[0];
            const text = candidate.raw_content || candidate.text || '';
            
            // 如果內容為空，跳過
            if (!text.trim()) {
              logger.debug('Skipping empty response');
              return;
            }
              
              finalResponse = {
                turn_id: response.turn.turn_id,
                author_name: response.turn.author ? (response.turn.author.name || "Character") : "Character",
              text: text,
                candidates: response.turn.candidates.map((candidate: CharacterAICandidate) => ({
                  candidate_id: candidate.candidate_id,
                  text: candidate.raw_content || candidate.text
                })),
                get_primary_candidate: function() {
                  return this.candidates[0];
                }
              };
              
              if (isFinal) {
                cleanup();
                resolve(finalResponse);
              }
            }
          } catch (error) {
            logger.error('Error processing WebSocket message:', error);
            reject(error);
          }
        };
        
        const errorHandler = (error: Error) => {
          logger.error('WebSocket error during message send:', error);
          cleanup();
          reject(error);
        };
        
        const closeHandler = (code: number, reason: Buffer) => {
          logger.warn(`WebSocket closed during message send: ${code} - ${reason}`);
          cleanup();
          
          if (!finalResponse) {
            reject(new ExternalServiceError('CharacterAI', `WebSocket closed unexpectedly: ${reason}`));
          }
        };
        
        const cleanup = () => {
          ws.removeListener('message', messageHandler);
          ws.removeListener('error', errorHandler);
          ws.removeListener('close', closeHandler);
        };
        
        ws.on('message', messageHandler);
        ws.on('error', errorHandler);
        ws.on('close', closeHandler);
        
        const timeout = setTimeout(() => {
          cleanup();
          reject(new ExternalServiceError('CharacterAI', 'Timeout waiting for response'));
        }, 60000);
        
        ws.send(JSON.stringify(wsMessage), (error) => {
          if (error) {
            clearTimeout(timeout);
            cleanup();
            reject(error);
          }
        });
      });
  }

  /**
   * 通過 WebSocket 發送訊息（Streaming 版本）
   */
  private async *sendMessageViaWebSocketStreaming(characterId: string, chatId: string, message: string): AsyncGenerator<any> {
    const candidateId = uuidv4();
    const turnId = uuidv4();
    const requestId = uuidv4();
    
    logger.info(`Sending streaming message via WebSocket to character ${characterId} in chat ${chatId}...`);
    
    const wsMessage: CharacterAIMessage = {
      command: "create_and_generate_turn",
      origin_id: "web-next",
      payload: {
        character_id: characterId,
        num_candidates: 1,
        previous_annotations: {
          bad_memory: 0, boring: 0, ends_chat_early: 0, funny: 0, helpful: 0,
          inaccurate: 0, interesting: 0, long: 0, not_bad_memory: 0, not_boring: 0,
          not_ends_chat_early: 0, not_funny: 0, not_helpful: 0, not_inaccurate: 0,
          not_interesting: 0, not_long: 0, not_out_of_character: 0, not_repetitive: 0,
          not_short: 0, out_of_character: 0, repetitive: 0, short: 0,
        },
        selected_language: "",
        tts_enabled: false,
        turn: {
          author: {
            author_id: this.accountId!,
            is_human: true,
            name: "",
          },
          candidates: [{ candidate_id: candidateId, raw_content: message }],
          primary_candidate_id: candidateId,
          turn_key: { chat_id: chatId, turn_id: turnId },
        },
        user_name: "",
      },
      request_id: requestId,
    };

    const ws = await this.getWebSocket();
    
    return new Promise((resolve, reject) => {
      let finalResponse: any = null;
      
      const messageHandler = (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          
          if (response.request_id !== requestId && 
              !(response.command === 'add_turn' || response.command === 'update_turn')) {
            return;
          }
          
          const command = response.command;
          
          if (!command) {
            reject(new ExternalServiceError('CharacterAI', 'Invalid response - missing command'));
            return;
          }
          
          if (command === 'neo_error') {
            const errorComment = response.comment || '';
            reject(new ExternalServiceError('CharacterAI', `API error: ${errorComment}`));
            return;
          }
          
          if (command === 'filter_user_input_self_harm') {
            reject(new ExternalServiceError('CharacterAI', 'Message was flagged for self harm content'));
            return;
          }
          
          if (command === 'add_turn' || command === 'update_turn') {
            // 跳過用戶訊息的回聲
            if (response.turn && response.turn.author && response.turn.author.is_human) {
              logger.debug('Skipping user echo message');
              return;
            }
            
            // 確保有 turn 和 candidates
            if (!response.turn || !response.turn.candidates || response.turn.candidates.length === 0) {
              logger.debug('Skipping response without valid turn/candidates');
              return;
            }
            
            const isFinal = response.turn.candidates[0] && response.turn.candidates[0].is_final;
            
            // 檢查是否有實際內容
            const candidate = response.turn.candidates[0];
            const text = candidate.raw_content || candidate.text || '';
            
            // 如果內容為空，跳過
            if (!text.trim()) {
              logger.debug('Skipping empty response');
              return;
            }
            
            finalResponse = {
              turn_id: response.turn.turn_id,
              author_name: response.turn.author ? (response.turn.author.name || "Character") : "Character",
              text: text,
              candidates: response.turn.candidates.map((candidate: CharacterAICandidate) => ({
                candidate_id: candidate.candidate_id,
                text: candidate.raw_content || candidate.text
              })),
              get_primary_candidate: function() {
                return this.candidates[0];
              }
            };
            
            if (isFinal) {
              cleanup();
              resolve(finalResponse);
            }
          }
    } catch (error) {
          logger.error('Error processing WebSocket message:', error);
          reject(error);
        }
      };
      
      const errorHandler = (error: Error) => {
        logger.error('WebSocket error during message send:', error);
        cleanup();
        reject(error);
      };
      
      const closeHandler = (code: number, reason: Buffer) => {
        logger.warn(`WebSocket closed during message send: ${code} - ${reason}`);
        cleanup();
        
        if (!finalResponse) {
          reject(new ExternalServiceError('CharacterAI', `WebSocket closed unexpectedly: ${reason}`));
        }
      };
      
      const cleanup = () => {
        ws.removeListener('message', messageHandler);
        ws.removeListener('error', errorHandler);
        ws.removeListener('close', closeHandler);
      };
      
      ws.on('message', messageHandler);
      ws.on('error', errorHandler);
      ws.on('close', closeHandler);
      
      const timeout = setTimeout(() => {
        cleanup();
        reject(new ExternalServiceError('CharacterAI', 'Timeout waiting for response'));
      }, 60000);
      
      ws.send(JSON.stringify(wsMessage), (error) => {
        if (error) {
          clearTimeout(timeout);
          cleanup();
          reject(error);
        }
      });
    });
  }

  /**
   * 通過 HTTP API 發送訊息（備用方案）
   */
  private async sendMessageViaHTTP(characterId: string, chatId: string, message: string): Promise<any> {
    logger.info('Using HTTP API as fallback for message sending...');
    
    try {
      // 使用 Character.AI 的 HTTP API 發送訊息
      const response = await axios({
        method: 'POST',
        url: 'https://neo.character.ai/chat/streaming/',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${this.token}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
          'Accept': 'application/json',
          'Origin': 'https://character.ai',
          'Referer': 'https://character.ai/'
        },
        data: {
          character_id: characterId,
          chat_id: chatId,
          message: message,
          tts_enabled: false
        },
        timeout: 30000
      });

      if (response.status !== 200) {
        throw new Error(`HTTP API returned status ${response.status}`);
      }

      const responseData = response.data;
      
      // 模擬 WebSocket 回應格式
      return {
        turn_id: responseData.turn_id || uuidv4(),
        author_name: "Character",
        text: responseData.text || responseData.response || message,
        candidates: [{
          candidate_id: responseData.candidate_id || uuidv4(),
          text: responseData.text || responseData.response || message
        }],
        get_primary_candidate: function() {
          return this.candidates[0];
        }
      };

    } catch (error) {
      logger.error('HTTP API fallback failed:', error);
      throw new Error(`HTTP API fallback failed: ${error}`);
    }
  }

  /**
   * 獲取聊天消息歷史
   */
  async fetchMessages(chatId: string): Promise<any[]> {
    try {
      const response = await axios({
        method: 'GET',
        url: `https://neo.character.ai/turns/${chatId}/`,
        headers: this.getHeaders(),
        timeout: 30000
      });

      if (response.status !== 200) {
        throw new Error(`Failed to fetch messages: ${response.status}`);
      }

      const responseData = response.data;
      
      // 檢查是否有錯誤響應
      if (responseData?.command === 'neo_error') {
        const errorComment = responseData.comment || '';
        throw new ExternalServiceError('CharacterAI', `Cannot fetch messages. ${errorComment}`);
      }

      // 返回 turns 數組
      return responseData.turns || [];
    } catch (error) {
      logger.error('Failed to fetch messages:', error);
      throw new Error(`Failed to fetch messages: ${error}`);
    }
  }

  /**
   * 編輯消息（按照 PyCharacterAI 實現）
   */
  async editMessage(chatId: string, turnId: string, candidateId: string, newText: string): Promise<any> {
    logger.info(`Editing message in chat ${chatId}, turn ${turnId}, candidate ${candidateId}...`);
    
    // 只使用 WebSocket 方法，因為 Character.AI 不支持 HTTP 編輯 API
    return await this.editMessageViaWebSocket(chatId, turnId, candidateId, newText);
  }

  /**
   * 通過 WebSocket 編輯消息
   */
  private async editMessageViaWebSocket(chatId: string, turnId: string, candidateId: string, newText: string): Promise<any> {
    const requestId = uuidv4();
    
    const wsMessage = {
      command: "edit_turn_candidate",
      request_id: requestId,
      payload: {
        turn_key: { chat_id: chatId, turn_id: turnId },
        current_candidate_id: candidateId,
        new_candidate_raw_content: newText,
      },
      origin_id: "web-next",
    };

    const ws = await this.getWebSocket();
    
    return new Promise((resolve, reject) => {
      const messageHandler = (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          
          if (response.request_id !== requestId && response.command !== 'update_turn') {
            return;
          }
          
          const command = response.command;
          
          if (command === 'neo_error') {
            const errorComment = response.comment || '';
            reject(new ExternalServiceError('CharacterAI', `Edit failed: ${errorComment}`));
            return;
          }
          
          if (command === 'update_turn') {
            cleanup();
            resolve(response.turn);
          }
    } catch (error) {
          logger.error('Error processing edit response:', error);
          reject(error);
        }
      };
      
      const errorHandler = (error: Error) => {
        logger.error('WebSocket error during edit:', error);
        cleanup();
        reject(error);
      };
      
      const closeHandler = (code: number, reason: Buffer) => {
        logger.warn(`WebSocket closed during edit: ${code} - ${reason}`);
        cleanup();
        reject(new ExternalServiceError('CharacterAI', `WebSocket closed during edit: ${reason}`));
      };
      
      const cleanup = () => {
        ws.removeListener('message', messageHandler);
        ws.removeListener('error', errorHandler);
        ws.removeListener('close', closeHandler);
      };
      
      ws.on('message', messageHandler);
      ws.on('error', errorHandler);
      ws.on('close', closeHandler);
      
      const timeout = setTimeout(() => {
        cleanup();
        reject(new ExternalServiceError('CharacterAI', 'Timeout waiting for edit response'));
      }, 30000);
      
      ws.send(JSON.stringify(wsMessage), (error) => {
        if (error) {
          clearTimeout(timeout);
          cleanup();
          reject(error);
        }
      });
    });
  }



  
 

  /**
   * 搜尋聲線（基於 PyCharacterAI 實作）
   */
  async searchVoices(query: string = ''): Promise<any[]> {
    try {
      if (!this.token) {
        throw new ExternalServiceError('CharacterAI', 'Token not set');
      }

      // 使用 PyCharacterAI 的搜尋端點和 URL 編碼
      const encodedQuery = encodeURIComponent(query);
      const response = await axios({
        method: 'GET',
        url: `https://neo.character.ai/multimodal/api/v1/voices/search?query=${encodedQuery}`,
        headers: this.getHeaders(),
        timeout: 10000
      });

      if (response.status === 200) {
        const voices = response.data?.voices || [];
        logger.info(`Found ${voices.length} voices for query: "${query}"`);
        return voices;
      }

      logger.warn('Voice search failed with status:', response.status);
      return [];
    } catch (error) {
      logger.warn('Error searching voices:', error instanceof Error ? error.message : String(error));
      return [];
    }
  }

  /**
   * 上傳聲線（基於 PyCharacterAI 實作）
   */
  async uploadVoice(
    voiceData: Buffer | string, 
    name: string, 
    description: string = '', 
    visibility: 'private' | 'public' = 'private'
  ): Promise<any> {
    try {
      if (!this.token) {
        throw new ExternalServiceError('CharacterAI', 'Token not set');
      }

      // 驗證參數
      if (name.length < 3 || name.length > 20) {
        throw new ExternalServiceError('CharacterAI', 'Name must be at least 3 characters and no more than 20');
      }

      if (description.length > 120) {
        throw new ExternalServiceError('CharacterAI', 'Description must be no more than 120 characters');
      }

      // 準備多部分表單數據
      const boundary = `---------------------------${Array.from({length: 30}, () => Math.floor(Math.random() * 10)).join('')}`;
      
      let audioData: Buffer;
      let mimeType = 'audio/mpeg';

      if (Buffer.isBuffer(voiceData)) {
        audioData = voiceData;
      } else if (typeof voiceData === 'string') {
        // 假設是檔案路徑或 URL
        const fs = await import('fs');
        if (fs.existsSync(voiceData)) {
          audioData = fs.readFileSync(voiceData);
        } else {
          // 嘗試作為 URL 下載
          const response = await axios({
            method: 'GET',
            url: voiceData,
            responseType: 'arraybuffer'
          });
          audioData = Buffer.from(response.data);
        }
      } else {
        throw new ExternalServiceError('CharacterAI', 'Invalid voice data format');
      }

      // 構建多部分表單
      const formData = [
        `--${boundary}\r\n`,
        `Content-Disposition: form-data; name="file"; filename="input.mp3"\r\n`,
        `Content-Type: ${mimeType}\r\n\r\n`
      ].join('');

      const jsonPart = [
        `\r\n--${boundary}\r\n`,
        `Content-Disposition: form-data; name="json"\r\n\r\n`,
        JSON.stringify({
          voice: {
            name: 'temp',
            description: '',
            gender: 'neutral',
            visibility: 'private',
            previewText: 'Good day! Here to make life a little less complicated.',
            audioSourceType: 'file'
          }
        }),
        `\r\n--${boundary}--\r\n`
      ].join('');

      const body = Buffer.concat([
        Buffer.from(formData),
        audioData,
        Buffer.from(jsonPart)
      ]);

      const response = await axios({
        method: 'POST',
        url: 'https://neo.character.ai/multimodal/api/v1/voices/',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Authorization': `Token ${this.token}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0'
        },
        data: body,
        timeout: 30000
      });

      if (response.status === 200 || response.status === 201) {
        const voiceInfo = response.data?.voice;
        if (voiceInfo) {
          // 更新聲線資訊
          const updatedVoice = await this.editVoice(voiceInfo.externalId, name, description, visibility);
          logger.info('Voice uploaded and updated successfully', { voiceId: voiceInfo.externalId });
          return updatedVoice;
        }
      }

      const errorData = response.data;
      if (errorData?.command === 'neo_error') {
        throw new ExternalServiceError('CharacterAI', `Cannot upload voice. ${errorData.comment || ''}`);
      }

      throw new ExternalServiceError('CharacterAI', 'Voice upload failed');
    } catch (error) {
      logger.error('Error uploading voice:', error);
      if (error instanceof ExternalServiceError) {
        throw error;
      }
      throw new ExternalServiceError('CharacterAI', `Failed to upload voice: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 編輯聲線（基於 PyCharacterAI 實作）
   */
  async editVoice(
    voiceId: string,
    name?: string,
    description?: string,
    visibility: 'private' | 'public' = 'private'
  ): Promise<any> {
    try {
      if (!this.token) {
        throw new ExternalServiceError('CharacterAI', 'Token not set');
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (visibility) updateData.visibility = visibility.toUpperCase();

      const response = await axios({
        method: 'PUT',
        url: `https://neo.character.ai/multimodal/api/v1/voices/${voiceId}/`,
        headers: this.getHeaders(),
        data: updateData,
        timeout: 15000
      });

      if (response.status === 200) {
        logger.info('Voice updated successfully', { voiceId });
        return response.data?.voice || response.data;
      }

      throw new ExternalServiceError('CharacterAI', 'Voice update failed');
    } catch (error) {
      logger.error('Error editing voice:', error);
      if (error instanceof ExternalServiceError) {
        throw error;
      }
      throw new ExternalServiceError('CharacterAI', `Failed to edit voice: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 確保有聊天會話
   */
  async ensureChatSession(): Promise<string> {
    // 如果有現有的聊天會話，返回它
    if (this.activeChats.size > 0) {
      const firstChat = this.activeChats.values().next().value;
      return firstChat.chat_id;
    }

    // 否則創建新的聊天會話
    const characterId = config.characterAICharacterId || 'default-character-id';
    const chatResult = await this.createChat(characterId);
    return chatResult.chat.chat_id;
  }

  /**
   * 獲取活動聊天
   */
  get getActiveChats(): Map<string, any> {
    return this.activeChats;
  }

  /**
   * 生成語音（參考 PyCharacterAI 的 memo/replay API）
   */
  async generateSpeech(chatId: string, turnId: string, candidateId: string, voiceId: string): Promise<Buffer> {
    try {
      if (!this.token) {
        throw new ExternalServiceError('CharacterAI', 'Token not set');
      }

      const endpoint = 'https://neo.character.ai/multimodal/api/v1/memo/replay';
      
      const payload = {
        candidateId,
        roomId: chatId,
        turnId,
        voiceId
      };

      logger.info('Requesting speech generation from Character.AI...');
      
      // 第一步：請求語音 URL
      const urlResponse = await axios({
        method: 'POST',
        url: endpoint,
        headers: this.getHeaders(),
        data: payload,
        timeout: 15000
      });

      if (urlResponse.status !== 200 || !urlResponse.data?.replayUrl) {
        logger.error('Failed to get audio URL:', urlResponse.data);
        throw new ExternalServiceError('CharacterAI', 'Failed to get audio URL from Character.AI');
      }

      const audioUrl = urlResponse.data.replayUrl;
      logger.info('Got audio URL, downloading audio...');

      // 第二步：下載音頻
        const audioResponse = await axios({
          method: 'GET',
          url: audioUrl,
          responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0'
        }
        });

      if (audioResponse.status === 200 && audioResponse.data) {
        logger.info('Speech generation completed successfully');
          return Buffer.from(audioResponse.data);
        }

      throw new ExternalServiceError('CharacterAI', 'Failed to download audio from Character.AI');
    } catch (error) {
      logger.error('Error generating speech:', error);
      if (error instanceof ExternalServiceError) {
        throw error;
      }
      throw new ExternalServiceError('CharacterAI', `Speech generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export default CharacterAI;
