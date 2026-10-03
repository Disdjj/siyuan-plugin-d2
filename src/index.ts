/*
 * SiYuan 插件入口
 *
 * 事件组合：
 *   onLayoutReady              扫描已经打开的编辑器
 *   loaded-protyle-static /    文档首次加载、滚动加载更多块
 *   loaded-protyle-dynamic
 *   switch-protyle             切换页签
 *   destroy-protyle            关闭编辑器，断开监听
 *   code-language-update       把 d2 加进代码块语言列表
 *   <html data-theme-mode>     明暗切换（CSS 负责反相，这里不用重绘）
 */

import { Plugin, getFrontend, Setting, type IProtyle } from 'siyuan';
import { BlockController } from './blocks';
import { D2Renderer } from './renderer';
import './index.css';

const STORAGE = 'settings';

interface Settings {
  cliPath: string;
}

export default class D2Plugin extends Plugin {
  private renderer!: D2Renderer;
  private blocks!: BlockController;
  private settings: Settings = { cliPath: '' };
  private text!: Record<string, string>;

  async onload() {
    this.text = this.i18n as unknown as Record<string, string>;
    this.settings = { ...this.settings, ...(((await this.loadData(STORAGE)) as Partial<Settings>) || {}) };

    // 只有 Electron 桌面端能调用本机命令；思源插件里的 require 已由加载器注入
    const frontend = getFrontend();
    const desktop = frontend === 'desktop' || frontend === 'desktop-window';
    const nodeRequire = desktop && typeof window.require === 'function' ? window.require : null;

    this.renderer = new D2Renderer(`/plugins/${this.name}/d2.js`, nodeRequire, () => this.settings.cliPath);
    this.blocks = new BlockController(this.renderer, this.text);

    this.eventBus.on('loaded-protyle-static', this.onProtyle);
    this.eventBus.on('loaded-protyle-dynamic', this.onProtyle);
    this.eventBus.on('switch-protyle', this.onProtyle);
    this.eventBus.on('destroy-protyle', this.onDestroyProtyle);
    this.eventBus.on('code-language-update', this.onLanguageUpdate);

    this.setupSettings(desktop);
  }

  onLayoutReady() {
    document.querySelectorAll<HTMLElement>('.protyle-wysiwyg').forEach((root) => this.blocks.attach(root));
  }

  onunload() {
    this.eventBus.off('loaded-protyle-static', this.onProtyle);
    this.eventBus.off('loaded-protyle-dynamic', this.onProtyle);
    this.eventBus.off('switch-protyle', this.onProtyle);
    this.eventBus.off('destroy-protyle', this.onDestroyProtyle);
    this.eventBus.off('code-language-update', this.onLanguageUpdate);
    this.blocks?.destroy();
    this.renderer?.dispose();
  }

  private onProtyle = ({ detail }: CustomEvent<{ protyle: IProtyle }>) => {
    const { protyle } = detail;
    const root = protyle?.wysiwyg?.element;
    if (root) this.blocks.attach(root, Boolean(protyle.disabled));
  };

  private onDestroyProtyle = ({ detail }: CustomEvent<{ protyle: IProtyle }>) => {
    const root = detail.protyle?.wysiwyg?.element;
    if (root) this.blocks.detach(root);
  };

  private onLanguageUpdate = ({ detail }: CustomEvent<{ languages: string[] }>) => {
    if (!detail.languages.includes('d2')) detail.languages.unshift('d2');
  };

  private setupSettings(desktop: boolean) {
    const input = document.createElement('input');
    input.className = 'b3-text-field fn__block';
    input.placeholder = '/opt/homebrew/bin/d2';
    input.value = this.settings.cliPath;

    const engine = document.createElement('div');
    engine.className = 'b3-label__text';
    const updateEngine = () => {
      engine.textContent = this.renderer.engine === 'cli' ? this.text.engineCLI : this.text.engineWasm;
    };

    this.setting = new Setting({
      confirmCallback: async () => {
        this.settings.cliPath = input.value.trim();
        await this.saveData(STORAGE, this.settings);
        this.renderer.resetCLI();
        this.blocks.refreshAll();
      },
    });
    this.setting.addItem({
      title: this.text.engine,
      createActionElement: () => {
        updateEngine();
        return engine;
      },
    });
    if (desktop) {
      this.setting.addItem({
        title: this.text.cliPath,
        description: this.text.cliPathDesc,
        createActionElement: () => input,
      });
    }
  }
}
