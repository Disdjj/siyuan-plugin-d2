# siyuan-plugin-d2

在思源笔记里把 ` ```d2 ` 代码块显示成图，渲染结果与博客（blog.pdjjq.org）构建出来的一模一样。

- 平时只显示图；点击图或右上角 ✎ 编辑源码，改完约 0.5 秒自动重渲染，光标移出或按 Esc 回到图
- 布局固定 TALA、手绘风格；没写顶层 `direction` 时优先横向，横向放进正文字太小才改纵向
- 语法错误时在图的位置显示 d2 报错
- 暗色主题下整体反相
- 代码块语言列表里加入 `d2`

笔记里保存的仍然只是 d2 源码（预览节点带 `protyle-custom`，思源保存时会跳过），
导出 / 发布出去的还是普通 ` ```d2 ` 代码块。

## 渲染方式

| 端 | 方式 |
|---|---|
| 桌面端 | 本机 `d2` CLI（stdin/stdout，不落盘）。自动查找 `/opt/homebrew/bin`、`/usr/local/bin`、`~/go/bin`、`~/.local/bin`，也可在插件设置里指定路径 |
| 桌面端找不到 CLI、手机、网页版 | 内置 `@d2lang/d2` WASM（含 TALA），首次渲染需加载约 11MB |

两种方式在相同参数下输出逐字节相同。

**渲染参数与方向规则必须与博客仓库的 `scripts/render-d2.mjs` 保持一致**，改一边就要改另一边。

## 开发

```bash
npm install
npm run build      # 构建到 dist/
npm run package    # 构建并打包 package.zip，用于 GitHub Release
npm run link       # 把 dist/ 软链接到 ~/SiYuan/data/plugins/siyuan-plugin-d2（SIYUAN_WORKSPACE 可覆盖）
npm run dev        # 监听源码变化重新构建，之后在思源里重新加载插件
```

## 已知限制

- 依赖思源代码块的内部 DOM 结构（`.protyle-action` 首个子元素是语言名、其后紧跟 `.hljs`），思源大版本升级后需要回归验证
- 思源自带的导出 PDF / HTML 只会显示源码

## 致谢

图标取自 [D2](https://github.com/terrastruct/d2) 的 Logo（© Terrastruct，MPL-2.0）。渲染使用 D2 CLI 与 `@d2lang/d2`。
