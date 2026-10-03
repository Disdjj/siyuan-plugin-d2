/*
 * 开发用：把 dist/ 软链接到思源工作空间的 data/plugins/siyuan-plugin-d2
 *
 * 工作空间默认 ~/SiYuan，可用 SIYUAN_WORKSPACE 覆盖。
 */

import { existsSync, lstatSync, mkdirSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const workspace = process.env.SIYUAN_WORKSPACE || join(homedir(), 'SiYuan');
const pluginsDir = join(workspace, 'data', 'plugins');
const target = join(pluginsDir, 'siyuan-plugin-d2');

if (!existsSync(pluginsDir)) {
  console.error(`找不到 ${pluginsDir}，请用 SIYUAN_WORKSPACE 指定工作空间`);
  process.exit(1);
}
mkdirSync(join(ROOT, 'dist'), { recursive: true });

if (existsSync(target) || lstatSync(target, { throwIfNoEntry: false })) {
  console.log(`${target} 已存在，跳过`);
} else {
  symlinkSync(join(ROOT, 'dist'), target, 'dir');
  console.log(`已链接 ${target} → dist/`);
}
