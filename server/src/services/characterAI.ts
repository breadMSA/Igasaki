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
  
  private headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
    'Accept': 'application/json',
    'Origin': 'https://character.ai',
    'Referer': 'https://character.ai/'
  };

  constructor() {
    // 從環境變數獲取代理配置
    if (config.chatProxyApiKey) {
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

    // 檢查是否已有活動連接
    if (this.activeWebSockets.has(this.token)) {
      const ws = this.activeWebSockets.get(this.token)!;
      if (ws.readyState === WebSocket.OPEN) {
        logger.debug('Using existing WebSocket connection');
        return ws;
      }
    }

    // 創建新的 WebSocket 連接
    return new Promise((resolve, reject) => {
      logger.info('Creating new WebSocket connection to Character.AI...');
      
      // 關閉任何現有的連接
      if (this.activeWebSockets.has(this.token)) {
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
      
      // 嘗試多種認證方式
      const tryConnection = (options: any, attempt: number = 1, url: string = this.wsUrl) => {
        logger.debug(`WebSocket connection attempt ${attempt}`, { url: url.substring(0, 40) + '...' });
        
        const ws = new WebSocket(url, options);
        
        const connectionTimeout = setTimeout(() => {
          logger.warn(`WebSocket connection attempt ${attempt} timed out`);
          ws.terminate();
          
          if (attempt === 1) {
            // 第二次嘗試：使用 Authorization cookie
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

        ws.on('open', () => {
          clearTimeout(connectionTimeout);
          logger.info(`WebSocket connection established on attempt ${attempt}`);
          this.activeWebSockets.set(this.token!, ws);
          
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
                'Cookie': `Authorization=Token ${this.token}`,
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
      
      // 開始第一次嘗試：HTTP_AUTHORIZATION cookie
      tryConnection({
        headers: {
          'Cookie': `HTTP_AUTHORIZATION=Token ${this.token}`,
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
   * 創建新的聊天
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
                  resolve({ chat: newChat, greeting: undefined });
                  return;
                }
                return;
              }
              
              if (response.command === 'add_turn') {
                greetingTurn = response.turn;
                logger.debug('Received greeting turn');
                
                if (newChat) {
                  cleanup();
                  resolve({ chat: newChat, greeting: greetingTurn });
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
   * 發送訊息
   */
  async sendMessage(characterId: string, chatId: string, message: string): Promise<any> {
    try {
      if (!this.token) {
        throw new ExternalServiceError('CharacterAI', 'Token not set');
      }

      if (!this.accountId) {
        await this.fetchMe();
      }

      const candidateId = uuidv4();
      const turnId = uuidv4();
      const requestId = uuidv4();
      
      logger.info(`Sending message to character ${characterId} in chat ${chatId}...`);
      
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
                return;
              }
              
              const isFinal = response.turn && 
                             response.turn.candidates && 
                             response.turn.candidates[0] && 
                             response.turn.candidates[0].is_final;
              
              finalResponse = {
                turn_id: response.turn.turn_id,
                author_name: response.turn.author ? (response.turn.author.name || "Character") : "Character",
                text: response.turn.candidates[0].raw_content || response.turn.candidates[0].text,
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
    } catch (error) {
      logger.error('Error sending message:', error);
      throw new ExternalServiceError('CharacterAI', `Failed to send message: ${error}`);
    }
  }

  /**
   * 生成語音（基於提供的 API 參考）
   */
  async generateSpeech(chatId: string, turnId: string, candidateId: string, voiceId?: string): Promise<Buffer> {
    try {
      if (!this.token) {
        throw new ExternalServiceError('CharacterAI', 'Token not set');
      }

      const endpoint = 'https://neo.character.ai/multimodal/api/v1/memo';
      const payload = {
        turn_key: {
          chat_id: chatId,
          turn_id: turnId
        },
        candidate_id: candidateId,
        voice_id: voiceId || config.chatProxyVoiceId || 'default'
      };

      logger.info(`Generating speech for turn ${turnId}...`);

      const response = await axios({
        method: 'POST',
        url: endpoint,
        headers: {
          ...this.getHeaders(),
          'Accept': 'audio/mpeg, audio/wav, audio/ogg, */*'
        },
        data: payload,
        responseType: 'arraybuffer',
        timeout: 30000
      });

      if (response.status === 200 && response.data) {
        logger.info('Speech generation completed successfully');
        return Buffer.from(response.data);
      }

      throw new ExternalServiceError('CharacterAI', 'Invalid response from speech API');
    } catch (error) {
      logger.error('Error generating speech:', error);
      throw new ExternalServiceError('CharacterAI', `Failed to generate speech: ${error}`);
    }
  }

  /**
   * 搜尋聲線
   */
  async searchVoices(query: string): Promise<any[]> {
    try {
      if (!this.token) {
        throw new ExternalServiceError('CharacterAI', 'Token not set');
      }

      const response = await axios({
        method: 'GET',
        url: 'https://neo.character.ai/multimodal/api/v1/voices/search',
        headers: this.getHeaders(),
        params: { query },
        timeout: 10000
      });

      return response.data?.voices || [];
    } catch (error) {
      logger.warn('Error searching voices:', error);
      return [];
    }
  }

  /**
   * 獲取活動聊天
   */
  get getActiveChats(): Map<string, any> {
    return this.activeChats;
  }
}

export default CharacterAI;
