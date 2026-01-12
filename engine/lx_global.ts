import { ScriptInfo, MusicUrlRequest, MusicUrlResponse } from "./script_engine.ts";
import { RequestManager } from "./request_manager.ts";

interface SourceInfo {
  type: string;
  actions: string[];
  qualitys: string[];
}

interface InitData {
  sources: Record<string, SourceInfo>;
  openDevTools?: boolean;
  message?: string;
}

interface UpdateAlertData {
  log: string;
  updateUrl?: string;
}

export class LXGlobal {
  private scriptInfo: ScriptInfo;
  private requestManager: RequestManager;
  private isInited: boolean = false;
  private isShowedUpdateAlert: boolean = false;
  private events: Record<string, Function> = {};
  private supportActions: Record<string, string[]> = {
    kw: ['musicUrl'],
    kg: ['musicUrl'],
    tx: ['musicUrl'],
    wy: ['musicUrl'],
    mg: ['musicUrl'],
    local: ['musicUrl'],
  };
  private supportedSources: Set<string> = new Set(['kw', 'kg', 'tx', 'wy', 'mg', 'local', 'xm']);

  private allSources: string[] = ['kw', 'kg', 'tx', 'wy', 'mg', 'local'];
  private supportQualitys: Record<string, string[]> = {
    kw: ['128k', '320k', 'flac', 'flac24bit'],
    kg: ['128k', '320k', 'flac', 'flac24bit'],
    tx: ['128k', '320k', 'flac', 'flac24bit'],
    wy: ['128k', '320k', 'flac', 'flac24bit'],
    mg: ['128k', '320k', 'flac', 'flac24bit'],
    local: ['128k', '320k', 'flac', 'flac24bit'],
  };
  private context: any = null;

  constructor(
    scriptInfo: ScriptInfo,
    requestManager: RequestManager
  ) {
    this.scriptInfo = scriptInfo;
    this.requestManager = requestManager;
  }

  createGlobalObject(): any {
    const self = this;
    const globalObject = {
      EVENT_NAMES: {
        request: 'request',
        inited: 'inited',
        updateAlert: 'updateAlert',
      },
      request: this.createRequestMethod(),
      send: this.createSendMethod(),
      on: (eventName: string, handler: Function) => {
        console.log(`🔍 lx.on 被调用: eventName=${eventName}, handler=${handler ? '已提供' : '未提供'}`);
        
        switch (eventName) {
          case 'request':
            console.log(`🔍 设置 events.request: handler=${handler ? '已设置' : '未设置'}`);
            self.events.request = handler;
            console.log(`🔍 events.request 设置后: ${self.events.request ? '已设置' : '未设置'}`);
            break;
          case 'inited':
            console.log(`🔍 设置 events.inited: handler=${handler ? '已设置' : '未设置'}`);
            self.events.inited = handler;
            break;
          case 'updateAlert':
            console.log(`🔍 设置 events.updateAlert: handler=${handler ? '已设置' : '未设置'}`);
            self.events.updateAlert = handler;
            break;
          default:
            console.log(`🔍 未支持的事件: ${eventName}`);
        }
        
        return Promise.resolve();
      },
      registerRequestHandler: (handler: Function) => {
        console.log(`🔍 lx.registerRequestHandler 被调用: handler=${handler ? '已设置' : '未设置'}`);
        self.events.request = handler;
        console.log(`🔍 events.request 设置后: ${self.events.request ? '已设置' : '未设置'}`);
      },
      utils: {
        crypto: this.createCryptoUtils(),
        buffer: this.createBufferUtils(),
        zlib: this.createZlibUtils(),
      },
      currentScriptInfo: {
        name: this.scriptInfo.name,
        description: this.scriptInfo.description,
        version: this.scriptInfo.version,
        author: this.scriptInfo.author,
        homepage: this.scriptInfo.homepage,
        rawScript: this.scriptInfo.rawScript,
      },
      version: '2.0.0',
      env: 'deno-deploy',
      removeEvent: () => {},
      removeAllEvents: () => {},
    };
    
    this.context = globalObject;
    return globalObject;
  }

  private createOnMethod(): any {
    const self = this;
    
    return {
      inited: (handler: Function) => {
        if (self.isInited) {
          throw new Error('Script is inited');
        }
        self.isInited = true;
        return self.handleInit(handler);
      },
      updateAlert: (handler: Function) => {
        if (self.isShowedUpdateAlert) {
          throw new Error('The update alert can only be called once.');
        }
        self.isShowedUpdateAlert = true;
        return self.handleUpdateAlert(handler);
      },
      request: (handler: Function) => {
        self.events.request = handler;
        return Promise.resolve();
      },
      on: (eventName: string, handler: Function) => {
        const eventNames = ['request', 'inited', 'updateAlert'];
        if (!eventNames.includes(eventName)) {
          return Promise.reject(new Error('The event is not supported: ' + eventName));
        }
        
        switch (eventName) {
          case 'request':
            self.events.request = handler;
            break;
          case 'inited':
            self.events.inited = handler;
            break;
          case 'updateAlert':
            self.events.updateAlert = handler;
            break;
          default:
            return Promise.reject(new Error('The event is not supported: ' + eventName));
        }
        
        return Promise.resolve();
      },
    };
  }

  private createRequestMethod(): any {
    return (url: string, options: any = {}, callback?: Function) => {
      const {
        method = 'get',
        timeout,
        headers,
        body,
        form,
        formData,
      } = options;

      const requestOptions = {
        url,
        method,
        headers: headers || {},
        timeout: Math.min(timeout || 60000, 60000),
        body,
        form,
        formData,
      };

      this.requestManager.addRequest(requestOptions, (error: Error | null, response: any | null, body: any) => {
        if (callback) {
          callback(error, response, body);
        }
      });

      return () => {
        this.requestManager.cancelRequest(url);
      };
    };
  }

  private createSendMethod(): any {
    return (eventName: string, data?: any): Promise<any> => {
      return new Promise(async (resolve, reject) => {
        switch (eventName) {
          case 'inited':
            if (this.isInited) {
              reject(new Error('Script is inited'));
              return;
            }
            this.isInited = true;
            
            const result = await this.handleInit(data);
            
            if (result.status) {
              resolve(result);
            } else {
              reject(new Error(result.message || 'Init failed'));
            }
            break;
          case 'updateAlert':
            if (this.isShowedUpdateAlert) {
              reject(new Error('The update alert can only be called once.'));
              return;
            }
            this.isShowedUpdateAlert = true;
            const alertResult = {
              status: true,
              message: 'Update alert shown',
            };
            
            resolve(alertResult);
            break;
          default:
            reject(new Error(`Unknown event name: ${eventName}`));
        }
      });
    };
  }

  private createCryptoUtils(): any {
    return {
      aesEncrypt: async (buffer: Uint8Array, mode: string, key: Uint8Array, iv: Uint8Array): Promise<Uint8Array> => {
        try {
          const cryptoKey = await crypto.subtle.importKey(
            'raw',
            key.buffer as ArrayBuffer,
            { name: 'AES-CBC', length: 256 },
            false,
            ['encrypt', 'decrypt']
          );

          const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-CBC', iv: iv.buffer as ArrayBuffer },
            cryptoKey,
            buffer.buffer as ArrayBuffer
          );

          return new Uint8Array(encrypted);
        } catch (error) {
          console.error('AES加密错误:', error);
          throw error;
        }
      },

      rsaEncrypt: async (buffer: Uint8Array, key: string): Promise<Uint8Array> => {
        try {
          const pemKey = `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
          const keyData = await crypto.subtle.importKey(
            'spki',
            this.strToArrayBuffer(pemKey) as any,
            { name: 'RSA-OAEP', hash: 'SHA-256' },
            false,
            ['encrypt']
          );

          const encrypted = await crypto.subtle.encrypt(
            { name: 'RSA-OAEP' },
            keyData as any,
            buffer as any
          );

          return new Uint8Array(encrypted);
        } catch (error) {
          console.error('RSA加密错误:', error);
          throw error;
        }
      },

      randomBytes: async (size: number): Promise<Uint8Array> => {
        try {
          return crypto.getRandomValues(new Uint8Array(size));
        } catch (error) {
          console.error('随机字节错误:', error);
          throw error;
        }
      },

      md5: async (str: string): Promise<string> => {
        try {
          const encoder = new TextEncoder();
          const data = encoder.encode(str);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          return hashHex;
        } catch (error) {
          console.error('MD5哈希错误:', error);
          throw error;
        }
      },
    };
  }

  private strToArrayBuffer(str: string): Uint8Array {
    const lines = str.split('\n');
    const keyData = lines
      .filter(line => line.trim() && !line.startsWith('-----'))
      .join('');
    const encoder = new TextEncoder();
    const buffer = encoder.encode(keyData);
    return new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  }

  private createBufferUtils(): any {
    return {
      from: (data: any): Uint8Array => {
        if (typeof data === 'string') {
          const encoder = new TextEncoder();
          return encoder.encode(data);
        } else if (data instanceof Uint8Array) {
          return data;
        } else if (data instanceof ArrayBuffer) {
          return new Uint8Array(data);
        } else if (typeof data === 'number') {
          const buffer = new Uint8Array(1);
          new DataView(buffer.buffer).setUint8(0, data);
          return buffer;
        } else {
          throw new Error(`Unsupported buffer data type: ${typeof data}`);
        }
      },

      concat: (...arrays: Uint8Array[]): Uint8Array => {
        const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const arr of arrays) {
          result.set(arr, offset);
          offset += arr.length;
        }
        return result;
      },

      toString: (buf: Uint8Array, format: string = 'utf8'): string => {
        const decoder = new TextDecoder(format);
        return decoder.decode(buf);
      },
    };
  }

  private createZlibUtils(): any {
    return {
      inflate: async (buf: Uint8Array): Promise<Uint8Array> => {
        try {
          return buf;
        } catch (error) {
          console.error('zlib inflate 错误:', error);
          throw error;
        }
      },

      deflate: async (data: string): Promise<Uint8Array> => {
        try {
          const encoder = new TextEncoder();
          return encoder.encode(data);
        } catch (error) {
          console.error('zlib deflate 错误:', error);
          throw error;
        }
      },
    };
  }

  private async handleInit(info?: any): Promise<any> {
    if (!info) {
      return { status: false, message: 'Missing required parameter init info' };
    }

    const sourceInfo: Record<string, SourceInfo> = {};

    try {
      for (const source in info.sources) {
        const userSource = info.sources[source];
        if (!userSource || userSource.type !== 'music') continue;
        
        const qualitys = this.supportQualitys[source] || userSource.qualitys || [];
        const actions = this.supportActions[source] || userSource.actions || [];
        
        sourceInfo[source] = {
          type: 'music',
          actions: actions.filter((a: string) => userSource.actions?.includes(a)),
          qualitys: qualitys.filter((q: string) => userSource.qualitys?.includes(q)),
        };
      }

      const result = {
        status: true,
        openDevTools: info.openDevTools || false,
        message: info.message || '',
        sources: sourceInfo,
      };
      
      return result;
    } catch (error: any) {
      const result = {
        status: false,
        message: error?.message || String(error),
      };
      
      return result;
    }
  }

  async handleRequest(data: any): Promise<any> {
    console.log(`🔍 LXGlobal.handleRequest 被调用: events.request=${this.events.request ? '已设置' : '未设置'}`);
    
    if (!this.events.request) {
      throw new Error('Request event is not defined');
    }

    try {
      const response = await this.events.request.call(this.context, {
        source: data.source,
        action: data.action,
        info: data.info,
      });
      
      return response;
    } catch (error) {
      console.error(`❌ LXGlobal.handleRequest 错误:`, error);
      throw error;
    }
  }

  registerRequestHandler(handler: Function): void {
    console.log(`🔍 registerRequestHandler 被调用: handler=${handler ? '已设置' : '未设置'}`);
    this.events.request = handler;
    console.log(`🔍 events.request 设置后: ${this.events.request ? '已设置' : '未设置'}`);
  }

  private async handleUpdateAlert(handler?: Function): Promise<any> {
    if (!handler || typeof handler !== 'function') {
      return { status: false, message: 'Missing required parameter update alert info' };
    }

    try {
      return handler({
        status: true,
      });
    } catch (error: any) {
      return handler({
        status: false,
        message: error?.message || String(error),
      });
    }
  }

  cleanup(): void {
    this.isInited = false;
    this.isShowedUpdateAlert = false;
  }
}
