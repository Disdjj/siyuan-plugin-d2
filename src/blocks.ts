/*
 * 在思源编辑器里把 d2 代码块显示成图
 *
 * 思源的“渲染块”（mermaid 等）是内核写死的，插件加不进去，所以 d2 始终是普通代码块：
 *   div[data-type=NodeCodeBlock].code-block
 *     div.protyle-action          第一个子元素是语言名
 *     div.hljs > div[contenteditable=true]   源码
 *     div.protyle-attr
 *
 * 插件在 .hljs 后面插入一个 .protyle-custom 预览节点。保存时 lute 会整个跳过
 * class 含 protyle-custom 的元素，笔记里存的仍然只有 d2 源码。
 * 注意不能动 .protyle-action 的第一个子元素，也不能在 .protyle-action 和 .hljs
 * 之间或 .hljs 内部插入任何东西，否则 lute 读语言名 / 源码会读错。
 *
 * “只显示图 / 编辑源码”的切换只改预览节点自己的 data-mode，块元素属性一概不碰
 * （块上的 style、custom-* 会被当成块属性持久化）。
 */

import type { D2Renderer } from './renderer';

const BLOCK_SELECTOR = '[data-type="NodeCodeBlock"].code-block';
const RENDER_DELAY = 500;

type Mode = 'preview' | 'source';

interface BlockState {
  preview: HTMLElement;
  editButton: HTMLElement;
  source: string;
  timer: number | undefined;
  /** 用于丢弃过期的渲染结果 */
  version: number;
}

export class BlockController {
  private states = new WeakMap<HTMLElement, BlockState>();
  private observers = new Map<HTMLElement, MutationObserver>();
  private scanTimer: number | undefined;
  /** 正在编辑源码的块；光标离开它就切回图 */
  private editing = new Set<HTMLElement>();

  constructor(
    private readonly renderer: D2Renderer,
    private readonly i18n: Record<string, string>,
  ) {
    // 思源的焦点落在整个 .protyle-wysiwyg 上，源码区收不到 focusout，只能看光标位置
    document.addEventListener('selectionchange', this.onSelectionChange);
    // 捕获阶段拿 Esc：思源自己也处理 Esc（选中当前块），这里只切回图，不拦截
    window.addEventListener('keydown', this.onKeydown, true);
  }

  /** 开始接管一个编辑器区域（.protyle-wysiwyg） */
  attach(root: HTMLElement, readonly = false) {
    root.toggleAttribute('data-d2-readonly', readonly);
    this.scan(root);
    if (this.observers.has(root)) return;

    // 内核下发事务时会整块替换 DOM，预览节点随之消失；源码改动也要触发重渲染
    const observer = new MutationObserver((mutations) => this.onMutations(root, mutations));
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    this.observers.set(root, observer);
  }

  detach(root: HTMLElement) {
    this.observers.get(root)?.disconnect();
    this.observers.delete(root);
  }

  /** 卸载插件：断开所有监听并移除注入的节点 */
  destroy() {
    document.removeEventListener('selectionchange', this.onSelectionChange);
    window.removeEventListener('keydown', this.onKeydown, true);
    this.editing.clear();
    this.observers.forEach((observer) => observer.disconnect());
    this.observers.clear();
    window.clearTimeout(this.scanTimer);
    document.querySelectorAll('.d2-preview, .d2-edit').forEach((element) => element.remove());
  }

  /** 主题明暗变化等需要整体重绘时调用 */
  refreshAll() {
    document.querySelectorAll<HTMLElement>(BLOCK_SELECTOR).forEach((block) => {
      const state = this.states.get(block);
      if (state) this.render(block, state);
    });
  }

  private onSelectionChange = () => {
    if (!this.editing.size) return;
    const anchor = window.getSelection()?.anchorNode ?? null;
    this.editing.forEach((block) => {
      const hljs = block.querySelector(':scope > .hljs');
      if (!block.isConnected || !anchor || !hljs?.contains(anchor)) this.setMode(block, 'preview');
    });
  };

  private onKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !this.editing.size) return;
    const anchor = window.getSelection()?.anchorNode ?? null;
    this.editing.forEach((block) => {
      if (anchor && block.contains(anchor)) this.setMode(block, 'preview');
    });
  };

  private onMutations(root: HTMLElement, mutations: MutationRecord[]) {
    let needScan = false;
    for (const mutation of mutations) {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      // 自己注入的节点变化不用理会
      if (target?.closest('.d2-preview')) continue;

      const block = target?.closest<HTMLElement>(BLOCK_SELECTOR);
      if (block && this.states.has(block) && target?.closest('.hljs')) {
        this.scheduleRender(block);
      } else {
        needScan = true;
      }
    }
    if (needScan) {
      window.clearTimeout(this.scanTimer);
      this.scanTimer = window.setTimeout(() => this.scan(root), 50);
    }
  }

  private scan(root: ParentNode) {
    root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR).forEach((block) => {
      const isD2 = languageOf(block) === 'd2';
      const state = this.states.get(block);
      if (isD2 && (!state || !block.contains(state.preview))) {
        this.setup(block);
      } else if (!isD2 && state) {
        this.teardown(block, state);
      }
    });
  }

  private setup(block: HTMLElement) {
    const hljs = block.querySelector<HTMLElement>(':scope > .hljs');
    const action = block.querySelector<HTMLElement>(':scope > .protyle-action');
    if (!hljs || !action) return;

    // 块被内核重绘后旧节点可能残留，先清掉
    block.querySelectorAll(':scope > .d2-preview, :scope > .protyle-action > .d2-edit').forEach((el) => el.remove());

    const preview = document.createElement('div');
    preview.className = 'protyle-custom d2-preview';
    preview.contentEditable = 'false';
    preview.dataset.mode = 'preview';
    preview.title = this.i18n.clickToEdit;
    preview.addEventListener('click', (event) => {
      // 图里的链接正常打开
      if ((event.target as Element).closest('a')) return;
      this.setMode(block, 'source');
    });
    hljs.after(preview);

    // 按钮放在语言名之后：.protyle-action 的第一个子元素必须保持是语言名
    const editButton = document.createElement('span');
    editButton.className = 'protyle-custom d2-edit ariaLabel protyle-icon';
    editButton.setAttribute('aria-label', this.i18n.toggle);
    editButton.dataset.position = '4north';
    editButton.innerHTML = '<svg><use xlink:href="#iconEdit"></use></svg>';
    editButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.setMode(block, preview.dataset.mode === 'preview' ? 'source' : 'preview');
    });
    const copyButton = action.querySelector(':scope > .protyle-action__copy');
    if (copyButton) copyButton.before(editButton);
    else action.append(editButton);

    const state: BlockState = { preview, editButton, source: '', timer: undefined, version: 0 };
    this.states.set(block, state);
    this.render(block, state);
  }

  private teardown(block: HTMLElement, state: BlockState) {
    this.editing.delete(block);
    window.clearTimeout(state.timer);
    state.preview.remove();
    state.editButton.remove();
    this.states.delete(block);
  }

  private setMode(block: HTMLElement, mode: Mode) {
    const state = this.states.get(block);
    if (!state || state.preview.dataset.mode === mode) return;
    // 只读文档不允许进入源码编辑
    if (mode === 'source' && block.closest('[data-d2-readonly]')) return;

    state.preview.dataset.mode = mode;
    if (mode === 'source') this.editing.add(block);
    else this.editing.delete(block);
    if (mode === 'source') {
      const editable = block.querySelector<HTMLElement>(':scope > .hljs > [contenteditable="true"]');
      // 思源自己的点击处理会抢走焦点，等它处理完再聚焦，并把光标放到源码末尾
      requestAnimationFrame(() => {
        if (!editable) return;
        editable.focus();
        const range = document.createRange();
        range.selectNodeContents(editable);
        range.collapse(false);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      });
    } else {
      this.render(block, state);
    }
  }

  private scheduleRender(block: HTMLElement) {
    const state = this.states.get(block);
    if (!state) return;
    window.clearTimeout(state.timer);
    state.timer = window.setTimeout(() => this.render(block, state), RENDER_DELAY);
  }

  private async render(block: HTMLElement, state: BlockState) {
    const source = sourceOf(block);
    if (source === state.source && state.preview.childElementCount) return;
    state.source = source;
    const version = ++state.version;

    if (!source.trim()) {
      state.preview.replaceChildren(message(this.i18n.empty, 'empty'));
      return;
    }
    if (!state.preview.childElementCount) {
      state.preview.replaceChildren(message(this.i18n.loading, 'loading'));
    }

    try {
      const svg = await this.renderer.render(source);
      if (version !== state.version) return;
      const figure = document.createElement('div');
      figure.className = 'd2-preview__svg';
      figure.innerHTML = svg;
      // 与博客一致：按 viewBox 的原始宽度显示，放不下时再等比缩小，小图不放大
      const svgElement = figure.querySelector('svg');
      const width = svgElement?.viewBox.baseVal?.width;
      if (svgElement && width) svgElement.style.width = `${width}px`;
      state.preview.replaceChildren(figure);
    } catch (error) {
      if (version !== state.version) return;
      state.preview.replaceChildren(message(String((error as Error).message || error), 'error'));
    }
  }
}

function languageOf(block: HTMLElement): string {
  return block.querySelector(':scope > .protyle-action > .protyle-action__language')?.textContent?.trim().toLowerCase() || '';
}

function sourceOf(block: HTMLElement): string {
  return block.querySelector(':scope > .hljs > [contenteditable="true"]')?.textContent || '';
}

function message(text: string, kind: 'empty' | 'loading' | 'error'): HTMLElement {
  const element = document.createElement('pre');
  element.className = `d2-preview__message d2-preview__message--${kind}`;
  element.textContent = text;
  return element;
}
