import { ScriptRunner } from "./script_runner.ts";

export interface ScriptInfo {
  id: string;
  name: string;
  description: string;
  author: string;
  homepage: string;
  version: string;
  rawScript: string;
  supportedSources: string[];
}

export interface MusicUrlRequest {
  source: string;
  action: string;
  info: {
    type: string;
    musicInfo: {
      id: string;
      name: string;
      singer: string;
      source: string;
      interval: string | null;
      meta: {
        songId: string | number;
        albumName: string;
        picUrl?: string | null;
        hash?: string;
        strMediaMid?: string;
        copyrightId?: string;
      };
    };
  };
}

export interface MusicUrlData {
  type: string;
  url: string;
}

export interface LyricData {
  type: string;
  lyric: string;
  tlyric: string | null;
  rlyric: string | null;
  lxlyric: string | null;
}

export interface PicData {
  type: string;
  url: string;
}

export interface MusicUrlResponse {
  source: string;
  action: string;
  data: MusicUrlData | LyricData | PicData;
}

export class ScriptEngine {
  private runners: Map<string, ScriptRunner> = new Map();
  private activeScripts: Map<string, ScriptInfo> = new Map();
  private storage: any;

  constructor(storage?: any) {
    this.storage = storage;
  }

  getRunner(scriptId: string): ScriptRunner | undefined {
    return this.runners.get(scriptId);
  }

  getActiveScriptIds(): string[] {
    return Array.from(this.activeScripts.keys());
  }

  async loadScript(scriptInfo: ScriptInfo): Promise<boolean> {
    try {
      const runner = new ScriptRunner(scriptInfo);

      await runner.initialize();
      
      const registeredSources = runner.getRegisteredSourceList();
      
      let finalSources: string[];
      
      if (registeredSources.length > 0) {
        finalSources = registeredSources;
      } else {
        finalSources = [];
      }
      
      if (finalSources.length > 0) {
        scriptInfo.supportedSources = finalSources;
        
        if (this.storage) {
          await this.storage.updateScriptSupportedSources(scriptInfo.id, finalSources);
        }
      }

      this.runners.set(scriptInfo.id, runner);
      this.activeScripts.set(scriptInfo.id, scriptInfo);

      return true;
    } catch (error: any) {
      console.error(`[ScriptEngine] 加载脚本失败: ${scriptInfo.name}`, error?.message || error);
      throw error;
    }
  }

  async unloadScript(scriptId: string): Promise<void> {
    const runner = this.runners.get(scriptId);
    if (runner) {
      await runner.terminate();
      this.runners.delete(scriptId);
      this.activeScripts.delete(scriptId);
    }
  }

  async getMusicUrl(request: MusicUrlRequest): Promise<MusicUrlResponse> {
    console.error('\n========== [ScriptEngine] getMusicUrl 开始 ==========');
    console.error('[ScriptEngine] source:', request.source);
    console.error('[ScriptEngine] action:', request.action);
    console.error('[ScriptEngine] 可用的 runners:', Array.from(this.runners.keys()));
    console.error('[ScriptEngine] 可用的 activeScripts:', Array.from(this.activeScripts.keys()));

    const { source } = request;
    const triedScripts: string[] = [];

    const defaultScriptId = this.storage.getDefaultSource();
    console.error('[ScriptEngine] 默认脚本:', defaultScriptId);

    const runnerEntries = Array.from(this.runners.entries());
    
    if (defaultScriptId && this.runners.has(defaultScriptId)) {
      const defaultRunner = this.runners.get(defaultScriptId);
      if (defaultRunner && defaultRunner.supportsSource(source)) {
        console.error('[ScriptEngine] 优先使用默认脚本:', defaultScriptId);
        triedScripts.push(defaultScriptId);
        
        try {
          console.error('[ScriptEngine] 即将调用默认脚本 runner.request...');
          const response = await defaultRunner.request(request);
          console.error('[ScriptEngine] 默认脚本 runner.request 执行完成');
          
          if (response && response.data && request.action === 'musicUrl' && (response.data as MusicUrlData).url) {
            console.error('[ScriptEngine] 默认脚本获取成功，返回 response');
            console.error('========== [ScriptEngine] getMusicUrl 结束 ==========\n');
            return response;
          }
        } catch (error: any) {
          console.error('[ScriptEngine] 默认脚本请求异常:', error.message);
          if (error.message.includes('404') || error.message.includes('Not Found') || error.message.includes('API') || error.message.includes('服务器')) {
            console.error('[ScriptEngine] 默认脚本失败，继续尝试其他脚本');
          } else {
            console.error('[ScriptEngine] 默认脚本抛出异常');
            console.error('========== [ScriptEngine] getMusicUrl 结束 ==========\n');
            throw error;
          }
        }
      } else {
        console.error('[ScriptEngine] 默认脚本不支持此音源:', source);
      }
    } else {
      console.error('[ScriptEngine] 未找到默认脚本');
    }

    console.error('[ScriptEngine] 尝试其他脚本...');
    
    for (const [scriptId, runner] of runnerEntries) {
      if (scriptId === defaultScriptId) continue;

      try {
        if (runner.supportsSource(source)) {
          triedScripts.push(scriptId);
          console.error('[ScriptEngine] 即将调用 runner.request...');
          console.error('[ScriptEngine] runner 对象:', runner ? '存在' : '不存在');
          console.error('[ScriptEngine] runner.supportsSource 结果: true');
          
          console.error('[ScriptEngine] 即将执行 runner.request(request)...');
          const response = await runner.request(request);
          console.error('[ScriptEngine] runner.request 执行完成');
          
          if (response && response.data && request.action === 'musicUrl' && (response.data as MusicUrlData).url) {
            console.error('[ScriptEngine] 获取成功，返回 response');
            console.error('========== [ScriptEngine] getMusicUrl 结束 ==========\n');
            return response;
          }
        } else {
          console.error('[ScriptEngine] runner.supportsSource 不可用');
        }
      } catch (error: any) {
        console.error('[ScriptEngine] runner.request 异常:', error.message);
        
        if (error.message.includes('404') || error.message.includes('Not Found') || error.message.includes('API') || error.message.includes('服务器')) {
          console.error('[ScriptEngine] 跳过此脚本，继续尝试下一个');
          continue;
        }
        console.error('[ScriptEngine] 抛出异常');
        console.error('========== [ScriptEngine] getMusicUrl 结束 ==========\n');
        throw error;
      }
    }

    console.error('[ScriptEngine] 没有找到支持 source:', source, '的脚本');
    console.error('[ScriptEngine] 已尝试的脚本:', triedScripts);
    
    if (triedScripts.length > 0) {
      console.error('[ScriptEngine] 抛出异常: 所有可用脚本都执行失败');
      console.error('========== [ScriptEngine] getMusicUrl 结束 ==========\n');
      throw new Error(`所有可用脚本都执行失败: ${triedScripts.join(', ')}。请检查API服务器状态。`);
    }

    console.error('[ScriptEngine] 抛出异常: No available script for source');
    console.error('========== [ScriptEngine] getMusicUrl 结束 ==========\n');
    throw new Error(`No available script for source: ${source}`);
  }

  async getLyric(request: any): Promise<any> {
    const { source } = request;

    for (const [_scriptId, runner] of this.runners) {
      try {
        if (runner.supportsSource(source)) {
          const response = await runner.request(request);
          if (response) {
            return response;
          }
        }
      } catch (error) {
      }
    }

    throw new Error(`No available script for source: ${source}`);
  }

  async getPic(request: any): Promise<MusicUrlResponse> {
    const { source } = request;

    for (const [_scriptId, runner] of this.runners) {
      try {
        if (runner.supportsSource(source)) {
          const response = await runner.request(request);
          if (response) {
            return response;
          }
        }
      } catch (error) {
      }
    }

    throw new Error(`No available script for source: ${source}`);
  }

  getActiveScripts(): ScriptInfo[] {
    return Array.from(this.activeScripts.values());
  }

  getScript(scriptId: string): ScriptRunner | undefined {
    return this.runners.get(scriptId);
  }

  async terminate(): Promise<void> {
    for (const runner of this.runners.values()) {
      await runner.terminate();
    }
    this.runners.clear();
    this.activeScripts.clear();
  }
}
