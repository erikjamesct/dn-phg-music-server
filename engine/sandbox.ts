import { ScriptInfo, MusicUrlRequest, MusicUrlResponse } from "./script_engine.ts";
import { RequestManager } from "./request_manager.ts";
import { LXGlobal } from "./lx_global.ts";

export class Sandbox {
  private scriptInfo: ScriptInfo;
  private requestManager: RequestManager;
  private lxGlobal: LXGlobal;
  private sourceHandlers: Map<string, any> = new Map();
  private isInitialized: boolean = false;

  constructor(scriptInfo: ScriptInfo, requestManager: RequestManager) {
    this.scriptInfo = scriptInfo;
    this.requestManager = requestManager;
    this.lxGlobal = new LXGlobal(scriptInfo, requestManager);
  }

  async initialize(): Promise<void> {
    try {
      const lxObject = this.lxGlobal.createGlobalObject();
      await this.executeScript(this.scriptInfo.rawScript, lxObject);
      
      console.log(`🔍 脚本执行完成`);
      
      // 注册音源类型到 sourceHandlers 中
      if (this.scriptInfo.supportedSources && Array.isArray(this.scriptInfo.supportedSources)) {
        this.scriptInfo.supportedSources.forEach((source: string) => {
          this.setSourceHandler(source, this.handleRequest.bind(this));
        });
        console.log(`📋 已注册音源: ${this.scriptInfo.supportedSources.join(', ')}`);
      } else {
        console.warn(`⚠️ 脚本未声明支持的音源: ${this.scriptInfo.name}`);
      }
      
      this.isInitialized = true;
      console.log(`🔒 Sandbox 初始化完成: ${this.scriptInfo.name}`);
    } catch (error) {
      console.error(`❌ Sandbox 初始化失败: ${this.scriptInfo.name}`, error);
      throw error;
    }
  }

  private async executeScript(script: string, lxObject: any): Promise<void> {
    try {
      console.log(`🔍 开始执行脚本，脚本长度: ${script.length}`);
      console.log(`🔍 脚本前500字符: ${script.substring(0, 500)}`);
      console.log(`🔍 脚本包含 lx.on: ${script.includes('lx.on')}`);
      console.log(`🔍 脚本包含 lx.on('request': ${script.includes("lx.on('request'")}`);
      console.log(`🔍 lxObject.on 函数: ${typeof lxObject.on}`);
      console.log(`🔍 lxObject.send 函数: ${typeof lxObject.send}`);
      
      const originalConsole = globalThis.console;
      
      const scriptConsole = {
        log: (...args: any[]) => originalConsole.log('[Script]', ...args),
        error: (...args: any[]) => originalConsole.error('[Script]', ...args),
        warn: (...args: any[]) => originalConsole.warn('[Script]', ...args),
        info: (...args: any[]) => originalConsole.info('[Script]', ...args),
      };
      
      globalThis.console = scriptConsole as any;
      
      try {
        console.log(`🔍 设置全局 lx 对象`);
        
        (globalThis as any).lx = lxObject;
        
        console.log(`🔍 开始执行脚本（直接执行，不包装）`);
        
        try {
          const result = eval(script);
          console.log(`🔍 脚本执行完成，返回值: ${typeof result}`);
          
          if (result instanceof Promise) {
            console.log(`🔍 脚本返回 Promise，等待完成`);
            await result;
            console.log(`🔍 脚本 Promise 完成`);
          }
        } catch (error) {
          console.error(`🔍 脚本执行错误:`, error);
          throw error;
        }
        
        console.log(`🔍 检查 lx 对象上的属性:`);
        console.log(`🔍 lx.requestHandler: ${typeof lxObject.requestHandler}`);
        console.log(`🔍 lx.on: ${typeof lxObject.on}`);
        
        if (typeof lxObject.requestHandler === 'function') {
          console.log(`🔍 找到 lx.requestHandler，设置为 events.request`);
          this.lxGlobal.registerRequestHandler(lxObject.requestHandler);
        }
        
        console.log(`🔍 检查 lx 对象上的所有属性:`);
        for (const key in lxObject) {
          if (typeof lxObject[key] === 'function' && key !== 'on' && key !== 'send' && key !== 'request') {
            console.log(`🔍 lx.${key}: ${typeof lxObject[key]}`);
          }
        }
      } finally {
        globalThis.console = originalConsole;
      }
    } catch (error) {
      console.error("脚本执行错误:", error);
      throw error;
    }
  }

  private async handleRequest(data: MusicUrlRequest): Promise<any | null> {
    console.log(`🔍 Sandbox.handleRequest 被调用: source=${data.source}, action=${data.action}`);
    
    try {
      const result = await this.lxGlobal.handleRequest(data);
      return this.validateResponse(result, data.action);
    } catch (error) {
      console.error(`❌ 请求处理错误: ${this.scriptInfo.name}`, error);
      
      // 根据不同的操作类型返回错误响应
      switch (data.action) {
        case 'musicUrl':
          return {
            source: this.getCurrentSource(),
            action: data.action,
            data: {
              type: 'musicUrl',
              url: null,
            },
          };
        case 'lyric':
          return {
            source: this.getCurrentSource(),
            action: data.action,
            data: {
              type: 'lyric',
              lyric: null,
              tlyric: null,
              rlyric: null,
              lxlyric: null,
            },
          };
        case 'pic':
          return {
            source: this.getCurrentSource(),
            action: data.action,
            data: {
              type: 'pic',
              url: null,
            },
          };
        default:
          return null;
      }
    }
  }

  private validateResponse(result: any, action: string): MusicUrlResponse | null {
    if (!result) return null;

    switch (action) {
      case 'musicUrl':
        if (typeof result !== 'string' || result.length > 2048 || !/^https?:/.test(result)) {
          console.warn('⚠️ 无效的音乐URL响应');
          return null;
        }
        return {
          source: this.getCurrentSource(),
          action,
          data: {
            type: 'musicUrl',
            url: result,
          },
        };

      case 'lyric':
        if (typeof result !== 'object' || typeof result.lyric !== 'string') {
          console.warn('⚠️ 无效的歌词响应');
          return null;
        }
        return {
          source: this.getCurrentSource(),
          action,
          data: {
            type: 'lyric',
            lyric: result.lyric,
            tlyric: result.tlyric || null,
            rlyric: result.rlyric || null,
            lxlyric: result.lxlyric || null,
          },
        };

      case 'pic':
        if (typeof result !== 'string' || result.length > 2048 || !/^https?:/.test(result)) {
          console.warn('⚠️ 无效的图片URL响应');
          return null;
        }
        return {
          source: this.getCurrentSource(),
          action,
          data: {
            type: 'pic',
            url: result,
          },
        };

      default:
        return null;
    }
  }

  private getCurrentSource(): string {
    return this.scriptInfo.id;
  }

  async request(request: MusicUrlRequest): Promise<MusicUrlResponse | null> {
    console.log(`🔍 sandbox.request 被调用: ${this.scriptInfo.name}, action=${request.action}`);
    
    if (!this.isInitialized) {
      throw new Error('Sandbox not initialized');
    }

    return this.handleRequest(request);
  }

  supportsSource(source: string): boolean {
    return this.sourceHandlers.has(source);
  }

  setSourceHandler(source: string, handler: any): void {
    this.sourceHandlers.set(source, handler);
  }

  async terminate(): Promise<void> {
    try {
      this.sourceHandlers.clear();
      await this.lxGlobal.cleanup();
      this.isInitialized = false;
      console.log(`🔒 Sandbox 已终止: ${this.scriptInfo.name}`);
    } catch (error) {
      console.error(`终止 Sandbox 时出错: ${this.scriptInfo.name}`, error);
    }
  }

  getScriptInfo(): ScriptInfo {
    return this.scriptInfo;
  }
}
