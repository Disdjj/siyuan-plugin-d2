/*
 * 构建插件到 dist/
 *
 * 思源按 CommonJS 方式执行插件的 index.js，并注入自己的 require：
 * require("siyuan") 拿到插件 API，桌面端其余模块交给 Electron 的 window.require。
 * 因此 siyuan 与 Node 内置模块都标记为 external。
 *
 * @d2lang/d2 的浏览器版有 11MB，不打进 index.js，而是原样拷到 dist/d2.js，
 * 需要 WASM 兜底时再用 import() 按需加载。
 */

import { build, context } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const watch = process.argv.includes('--watch');

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const copyStatic = () => {
  for (const file of ['plugin.json', 'README.md', 'icon.png', 'preview.png']) {
    try {
      cpSync(join(ROOT, file), join(DIST, file));
    } catch {
      // icon / preview 发布到集市前再补
    }
  }
  cpSync(join(ROOT, 'i18n'), join(DIST, 'i18n'), { recursive: true });
  cpSync(join(ROOT, 'node_modules/@d2lang/d2/dist/browser/index.js'), join(DIST, 'd2.js'));
};

const options = {
  entryPoints: { index: join(ROOT, 'src/index.ts') },
  outdir: DIST,
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  external: ['siyuan', 'child_process', 'fs', 'path', 'os'],
  loader: { '.css': 'css' },
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'info',
};

copyStatic();
if (watch) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
