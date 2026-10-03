/*
 * d2 渲染
 *
 * 渲染参数与方向规则必须和博客的 scripts/render-d2.mjs 保持一致，
 * 否则思源里看到的图和发布后的不一样：
 *   - 布局 TALA、手绘、pad 16、主题 0
 *   - 没有顶层 direction 时优先横向；横向放进正文后缩放低于 0.75 才改纵向
 *
 * 桌面端（Electron）优先调用本机 d2 CLI；拿不到 CLI 或在手机 / 网页端时，
 * 用 @d2lang/d2 的 WASM 版。两者在相同参数下输出逐字节相同。
 */

const CLI_ARGS = ['--layout=tala', '--sketch', '--pad=16', '--theme=0', '-', '-'];
const COMPILE_OPTIONS = { layout: 'tala', sketch: true, pad: 16, themeID: 0 };

// 与博客正文列一致：约 46rem = 736px 宽，高度超过约 900px 就要缩小
const COLUMN_WIDTH = 736;
const MAX_HEIGHT = 900;
const MIN_HORIZONTAL_SCALE = 0.75;

// macOS 从 Finder 启动的应用只继承 launchd 的精简 PATH，不含 Homebrew 等目录
const CLI_CANDIDATES = ['/opt/homebrew/bin/d2', '/usr/local/bin/d2', '~/go/bin/d2', '~/.local/bin/d2'];

type NodeRequire = (id: string) => any;

export type Engine = 'cli' | 'wasm';

export class D2Renderer {
  private cliPath: string | null | undefined;
  private wasm: Promise<any> | null = null;
  private cache = new Map<string, Promise<string>>();

  constructor(
    private readonly wasmURL: string,
    private readonly nodeRequire: NodeRequire | null,
    private readonly configuredCLI: () => string,
  ) {}

  /** 当前会使用的引擎，用于在界面上提示 */
  get engine(): Engine {
    return this.findCLI() ? 'cli' : 'wasm';
  }

  /** 改了 CLI 路径设置后调用 */
  resetCLI() {
    this.cliPath = undefined;
    this.cache.clear();
  }

  render(source: string): Promise<string> {
    const key = source.trim();
    let pending = this.cache.get(key);
    if (!pending) {
      pending = this.pickBest(key);
      // 失败的结果不缓存，修好源码或环境后可以重试
      pending.catch(() => this.cache.delete(key));
      this.cache.set(key, pending);
    }
    return pending;
  }

  dispose() {
    this.cache.clear();
    this.wasm?.then((d2) => d2.dispose()).catch(() => {});
    this.wasm = null;
  }

  private async pickBest(source: string): Promise<string> {
    if (/^direction\s*:/m.test(source)) return this.renderOnce(source);

    let horizontal: string;
    try {
      horizontal = await this.renderOnce(`direction: right\n${source}`);
    } catch {
      // 加了 direction 前缀后报错的行号会多 1，用原始源码再渲染一次拿准确的报错
      return this.renderOnce(source);
    }
    const horizontalScale = displayScale(horizontal);
    if (horizontalScale >= MIN_HORIZONTAL_SCALE) return horizontal;

    const vertical = await this.renderOnce(`direction: down\n${source}`);
    return displayScale(vertical) > horizontalScale ? vertical : horizontal;
  }

  private renderOnce(source: string): Promise<string> {
    const cli = this.findCLI();
    return cli ? this.renderWithCLI(cli, source) : this.renderWithWasm(source);
  }

  private findCLI(): string | null {
    if (this.cliPath !== undefined) return this.cliPath;
    this.cliPath = null;
    if (!this.nodeRequire) return null;

    const fs = this.nodeRequire('fs');
    const os = this.nodeRequire('os');
    const configured = this.configuredCLI().trim();
    const candidates = configured ? [configured, ...CLI_CANDIDATES] : CLI_CANDIDATES;
    for (const candidate of candidates) {
      const path = candidate.replace(/^~(?=\/)/, os.homedir());
      try {
        fs.accessSync(path, fs.constants.X_OK);
        this.cliPath = path;
        break;
      } catch {
        // 试下一个
      }
    }
    return this.cliPath;
  }

  private renderWithCLI(cli: string, source: string): Promise<string> {
    const { execFile } = this.nodeRequire!('child_process');
    return new Promise((resolve, reject) => {
      const child = execFile(
        cli,
        CLI_ARGS,
        { maxBuffer: 64 * 1024 * 1024, timeout: 30_000 },
        (error: Error | null, stdout: string, stderr: string) => {
          if (error) reject(new Error(cleanCLIError(stderr) || error.message));
          else resolve(stdout);
        },
      );
      child.stdin.end(source + '\n');
    });
  }

  private async renderWithWasm(source: string): Promise<string> {
    if (!this.wasm) {
      this.wasm = import(/* @vite-ignore */ this.wasmURL).then(({ D2 }) => new D2());
      this.wasm.catch(() => {
        this.wasm = null;
      });
    }
    const d2 = await this.wasm;
    try {
      const result = await d2.compile(source + '\n', COMPILE_OPTIONS);
      return await d2.render(result.diagram, result.renderOptions);
    } catch (error) {
      throw new Error(cleanWasmError(error));
    }
  }
}

// 放进正文后的缩放比例，越大字越清楚；小图不放大，按 1 计
function displayScale(svg: string): number {
  const match = svg.match(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/);
  if (!match) return 0;
  return Math.min(1, COLUMN_WIDTH / Number(match[1]), MAX_HEIGHT / Number(match[2]));
}

// WASM 报错是 JSON 数组：[{"range":"…","errmsg":"index:2:9: maps must be terminated with }"}]
function cleanWasmError(error: unknown): string {
  const text = String((error as Error)?.message ?? error);
  try {
    const items = JSON.parse(text) as { errmsg?: string }[];
    return items.map((item) => (item.errmsg || '').replace(/^index:/, '')).filter(Boolean).join('\n') || text;
  } catch {
    return text;
  }
}

// CLI 报错形如 "err: failed to compile -: -:3:5: ..."，去掉前缀只留位置和原因
function cleanCLIError(stderr: string): string {
  return stderr
    .split('\n')
    .map((line) => line.replace(/^err:\s*/, '').replace(/failed to compile -:\s*/, '').replace(/^-:/, ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}
