/*
 * 打包 dist/ 为 package.zip，供 GitHub Release 上传
 *
 * 集市要求：清单与 index.js 等必要文件直接位于 zip 根目录，路径分隔符为 /。
 * macOS 自带的 zip 满足要求；-X 去掉扩展属性，避免把 ._ 文件打进去。
 */

import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const zip = join(ROOT, 'package.zip');

execFileSync('node', [join(ROOT, 'scripts/build.mjs')], { stdio: 'inherit' });
rmSync(zip, { force: true });
execFileSync('zip', ['-r', '-X', '-q', zip, '.', '-x', '.*'], { cwd: join(ROOT, 'dist'), stdio: 'inherit' });
console.log(`已生成 ${zip}`);
