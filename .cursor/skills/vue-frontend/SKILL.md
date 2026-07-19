---
name: vue-frontend
description: >-
  aigc-ui 项目前端规范：Electron + Vue 3 桌面客户端，紧凑工具型 UI，
  Slate + Blue，纯 CSS 变量，无第三方 UI 库。含一体化标题栏、窄侧栏、
  panel-header 操作、mono 表单、Toast、图片元数据解析、提示词格式化、
  提示词池与开发者工具约定。
  Use when creating or editing Vue 3 + Pinia + Vite + TypeScript frontend
  in this repo (web/), Electron UI, styling, pages/components, CSS, or when
  the user mentions UI 风格、界面优化、侧边栏、按钮、前端规范、PNG 元数据、
  提示词格式化、Toast。
---

# Vue Frontend — aigc-ui

本 skill 是 **aigc-ui 本项目** 规范（由通用 Agent-style UI 经验演化而来）。
桌面工具型界面：紧凑、少概念、操作进 panel-header、图标优先。

色板接近 Tailwind Slate + Blue（项目未用 Tailwind）。
**不是** Material / Ant Design / Element Plus；禁止引入这些库。

Token 细节见 [tokens.md](tokens.md)。

---

## 1. 技术栈

| 项 | 选择 |
|----|------|
| 壳 | Electron（`electron/` 主进程 + preload） |
| 前端 | Vue 3 Composition API + Pinia + Vue Router + Vite + TypeScript（`web/`） |
| 样式 | 纯 CSS 变量：`web/src/styles/index.css` + `app.css` |
| 正文案字体 | `@fontsource/inter` → `--font: Inter` |
| 表单字体 | **全局** `.input` / `.textarea` / `AppSelect` → `--mono` **12.5px** |
| 下拉 | 自制 `AppSelect.vue`，**禁止**原生 `<select>` |
| 图标 | 共用组件放 `web/src/components/icons/`（`Icon*.vue` + `index.ts`）；内联 SVG + `currentColor`；无 icon 库；**不要 emoji** |
| UI 库 | **禁止** Element Plus / Ant Design / 任何第三方 Design System |

改完 `web/` → **必须** 在仓库根执行 `npm run build`（electron-vite）直到通过。

### 源码地图（简）

| 路径 | 用途 |
|------|------|
| `shared/` | 跨进程纯 TS（`@shared/*`）：IPC、theme chrome、family、limits、txt2img-form、lora-tag、pool… |
| `web/src/views/` | 页面 |
| `web/src/components/` | UI（`common/` / `layout/` / `txt2img/` / `prompt-pool/`） |
| `web/src/stores/` | Pinia（kebab-case：`prompt-pool`、`comfy-process`） |
| `web/src/prompt/` | 提示词方言 / 补全 / 引擎 / `prompt-format`（渲染侧） |
| `web/src/utils/` | 通用工具 + `image-meta/` |
| `electron/main/` | 窗口、`ipc.ts`、`txt2img-generate.ts`、Comfy、工作流；**禁止**再 `import …/web/src/…` |

约定：Vue = PascalCase；TS 模块 = kebab-case；共享契约只改 `shared/`；渲染侧直连 `@shared/*`。

---

## 2. 设计 Token（摘要）

完整 `:root` 见 [tokens.md](tokens.md)。

- 背景：`--bg` / `--bg-soft #f8fafc` / `--bg-sidebar #f4f7fc`
- 选中：`--bg-sidebar-item-hover` / `--bg-sidebar-item-active`（灰高亮，非 primary-soft）
- 主色：`--primary` / `--accent` `#2563eb`（禁止橙 / indigo）
- 形状：`--radius 12` / `--radius-sm 8` / `--radius-lg 16`
- 布局：`--page-gutter: clamp(8px, 1.2vw, 12px)`（紧凑）

---

## 3. 布局骨架（本项目）

```
app-frame (column, 100%)
├── TitleBar（一体化标题栏，可拖拽；品牌在此）
└── app-shell (grid: 64px sidebar | main)
    ├── Sidebar
    │   ├── nav-list（上：主功能方形按钮）
    │   └── footer（下：设置方形按钮）
    └── main → page-view → page-shell
        └── panel(s) / split-pane   ← 无 page-header
```

### 窗口铬（Electron）

- `titleBarStyle: 'hidden'`；Windows 用 `titleBarOverlay`
- 自定义 `.titlebar`：`-webkit-app-region: drag`；交互控件 `no-drag`
- **F12** 切换 DevTools；右键菜单 **「检查」** → `webContents.inspectElement(x, y)`

### 侧栏

- **固定窄轨 ~64px**，**不折叠**
- nav 为 **方形按钮**：大 icon 在上、文字在下（~52×52，icon ~22px）
- 主功能在上，**设置固定底部**
- 选中 = session-item 灰底（禁止左侧蓝条）
- **不要**在侧栏放服务可达探测 / 状态点（服务状态放控制台）

### 页面

- **禁止 page-header**（标题+meta 占空间且信息量低）
- 导航语义靠侧栏；页面内用 `.panel-header` 承载标题与操作
- `page-shell` padding 用 `--page-gutter`，gap 宜小（~8px）
- 分栏：`flex` / `grid` + `min-height: 0`，**禁止** `height: calc(100vh - …)`

### panel-header（核心操作带）

- 紧凑：`padding: 6px 12px`，`min-height: ~40px`，title ~0.8125rem
- **充分利用 header**：左侧标题（可带 status pill），右侧 **icon 按钮组**
- 主操作（生成 / 启动 / 停止 / 清空 / 保存）优先放 header，少占 body 纵向空间
- 简单配置优先 **单行**：`标题 | input… | icon按钮`（见设置页输出目录）

---

## 4. 按钮

| 变体 | 用途 |
|------|------|
| `.btn` 胶囊 | 少量文字操作 |
| `.btn-primary` / `.btn-ghost` / `.btn-danger` | 语义色 |
| `.btn-sm` | 紧凑文字按钮 |
| `.btn-icon` | **首选工具操作**（30×30）：运行/停止/保存/清空/打开目录 |

约定 icon 语义（共用组件：`import { IconX } from '@/components/icons'`）：

| 操作 | 图形 |
|------|------|
| 运行 / 生成 / 启动 | 播放三角 |
| 停止 / 取消 | 实心方块 |
| 保存 | 磁盘（`IconSave`） |
| 删除 | 垃圾桶（`IconTrash`） |
| 清空预览 / 清空日志 | 粉碎机（`IconShredder`） |
| 打开资源管理器 | 文件夹 |
| 选择文件夹 | 文件夹 + 指针（`IconFolderPick`） |
| 格式化提示词 | 文字 `{}`（`.btn-icon-braces`，mono） |
| 关闭 Toast | 细线叉 SVG |

新图标 → 加到 `web/src/components/icons/`，并在 `index.ts` 导出；勿散落在 View 里复制 path。

交互：hover 色变 + active `scale(0.98)`；`.btn-primary .spinner` 用白环。

---

## 5. 表单

### `.input` / `.textarea` / `AppSelect`

- **统一** `font-family: var(--mono); font-size: 12.5px; line-height: 1.45`
- `--radius-sm`，8×12 padding
- Focus：primary 边框 + `0 0 0 3px rgba(37,99,235,.12)`
- textarea：`min-height: 120px`；长命令也可用单行 `.input`

### AppSelect

- Teleport to body，z-index 1000
- 选项常量 → `web/src/utils/select-options.ts`
- 禁止原生 `<select>`

### 路径行

```html
<div class="path-row">
  <input class="input" readonly />
  <button class="btn btn-ghost btn-icon" title="…">…</button>
</div>
```

---

## 6. 面板与分栏

### panel

- `.list-panel` / `.detail-panel`：白底 + border + radius + shadow
- header：`background: var(--bg-soft)` + 底边线
- 设置类单行配置：可用仅有 header、无 body 的 panel

### split-pane

```css
.split-pane {
  display: grid;
  grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
  gap: 8px–14px;
  flex: 1;
  min-height: 0;
}
```

### 控制台 / 日志

- 日志区深色 `#0f172a` + mono 12px（`.console-log`）
- 服务地址、输出目录放设置页；控制台只管启动命令、启停与日志

---

## 7. Toast / 确认

- Toast：**右下**；info / ok / error；info/ok ~3500ms，error ~4500ms
- 实现：`useToast` + `ToastHost`（`TransitionGroup`）
- **必须**有登场/退场渐入渐出；列表位移用 `.toast-move`
- **必须**右侧叉号可手动关闭；关闭时清掉该条定时器
- **业务错误 → toast**，禁止弹窗报错
- 破坏操作 → `confirmDialog`（不用 `window.confirm`）

---

## 8. 信息架构（aigc-ui）

| 侧栏 | 职责 |
|------|------|
| 文生图 | 参数 + 预览；生成 / 格式化等在参数 panel-header |
| 提示词池 | 池管理、条目占比、预览；路由 `/pools` |
| 控制台 | ComfyUI 进程：启动命令、启停、日志 |
| 外观 | 侧栏底部「白天/暗黑」切换（设置上方）；`data-theme` + CSS 变量 |
| 设置 | 服务地址、输出目录、提示词预览目录等（单行 header） |

- 启动命令一行可编辑；退出应用须杀掉由客户端拉起的进程树
- Batch 等文案可保持英文短标签（如 `Batch`），与脚本参数对齐

---

## 9. 图片元数据（image-meta）

PNG 文本块（`tEXt` / `zTXt` / `iTXt`）由主进程 `extractPngInfo` 抽出；**语义层是各家方言**，无统一 API。调用方只能解析或自己写出，不能改对方 schema。

| 来源 | 典型键 | 解析器 |
|------|--------|--------|
| ComfyUI | `prompt` / `workflow` 图 JSON | `comfyui.ts`（完整表单映射） |
| NovelAI | `Software=NovelAI` + `Comment` JSON | `novelai.ts` |
| A1111 | `parameters` 文本，或离散 `prompt`/`steps`/`cfg_scale`… | `a1111.ts` |

- 模块：`web/src/utils/image-meta/`（`parse` → Comfy → NovelAI → A1111 字段 → parameters）
- 入口：`parseImageMeta`（摘要）/ `parseWorkflowParams`（→ 表单）
- **应用图片/剪贴板到参数**（非 Comfy）：`preferFamily` + `base` 合并，**保留当前 family 与模型槽**；Comfy 图仍整表替换
- 预览「图片信息」：摘要 chips（含来源）+ 始终展示原始 JSON
- 新格式 → 在 `image-meta` 加解析器，不要散落在 View 里
- 预览图：`draggable="false"` + `-webkit-user-drag: none`

---

## 10. 提示词池

| 类型 | 来源 | 可编辑 |
|------|------|--------|
| 用户池 | `userData/prompt-pools/*.json` | 是 |
| 内置 JSON | `web/src/prompt/prompt-pools/*.json`（Vite embed） | 条目可覆写到 userData；不可删/改名 |
| **程序池** | `web/src/prompt/program-pools.ts` | **否**；列表可见（标「程序」），详情黑盒；仅 `<pool:name>` → 字符串 |

当前：`act_common` / `act_common2` / `act_jk`；以及按 family/模型名适配的 `quality` / `neg`。

---

## 11. 提示词格式化 / 家族

- `formatPromptByFamily`（`web/src/prompt/prompt-format.ts`）按当前 family
- **Anima**：先走 `prompt-canon`（NAI `[]`/`{}` → 权重，`artist:` → `@`），再 polish（`_`→空格、A1111 `\(` `\)`→普通括号、小写）；`<pool:>` / `<random:>` 原样保留
- **SDXL**：同样走 NAI 语义，但 artist **不带** `@`
- 参数区 header 提供 `{}` 格式化按钮；作用于**当前聚焦**的 Prompt / Negative（与右键「格式化」一致）
- 右键菜单用 `elementFromPoint` 命中 `[data-prompt-field]`，勿只靠 `activeElement`
- 池子/随机输出走 `adaptRandomPrompt`（与格式化语义对齐）
- **改 Prompt/Negative 文本必须进原生撤销栈**：`replaceEditableValue`（`select` + `execCommand('insertText')`），禁止直接 `store.form.prompt =`（格式化 / 应用图片 / 剪贴板 / 追加池子均如此）

---

## 12. UI/UX 偏好（必须）

### 密度

- 紧凑优先；去掉无表达的 page-header / 多余说明行
- 辅助说明进 `title` 悬停，不占版面
- panel 能一行展示就不要拆多行

### 信息

- 能去掉就去掉；概念要少
- 服务探测等非必要状态不要常驻侧栏
- 状态 pill 仅在有用时出现（如运行中），放进 panel-header

### 视觉

- 蓝主色 `#2563eb`；亮色主题；轻阴影细边框
- 无 emoji；扁平 SVG
- sparkle 用四角星

### 工程偏好

- **绿地项目**：不做兼容/迁移 shim（无旧字段 fallback、无 redirect 凑合）
- 偏好稳定后同步本 skill，勿另起散落文档
- **换行一律 LF**（源码：`.ts` / `.vue` / `.css` / `.json` / `.md` 等）：仓库 `.gitattributes`（`eol=lf`）+ `.editorconfig` + `.vscode/settings.json`（`files.eol: \n`）；Git 全局/本地 `core.autocrlf=false`、`core.eol=lf`。Agent 写源码不得产出 CRLF。`.csv` 等数据文件不强制，CRLF 可接受。

### 反面案例

- 第三方 UI 库 / 原生 select / TopBar（内容顶栏）
- 大块 page-header、松散 gutter、宽空 panel-header
- 表单混用 Inter 与 mono
- 文字按钮堆叠（优先 icon）
- 在 View 内手写多格式 PNG 解析（应进 `image-meta`）
- 应用外来图元数据时强行改掉用户当前 family（非 Comfy）
- DevTools 深色三栏皮肤伪装产品 UI

---

## 13. 禁止项

- ❌ 第三方 UI 库 / 原生 `<select>`
- ❌ 内容区 TopBar / page-header 堆标题文案
- ❌ 弹窗报业务错
- ❌ 偏离 token 的 accent（除非用户明确要求）
- ❌ 侧栏折叠轨（本项目固定窄侧栏）
- ❌ 为旧协议堆兼容层（本项目不维护迁移路径）

---

## 14. 关键文件

| 文件 | 职责 |
|------|------|
| `web/src/styles/index.css` | token |
| `web/src/styles/app.css` | 布局 + 组件 + Toast |
| `web/src/App.vue` | app-frame + TitleBar + shell |
| `web/src/components/layout/TitleBar.vue` | 一体化标题栏 |
| `web/src/components/layout/Sidebar.vue` | 窄侧栏 |
| `web/src/components/common/AppSelect.vue` | 下拉 |
| `web/src/components/common/ToastHost.vue` | Toast 宿主（动画 + 关闭） |
| `web/src/components/icons/` | 共用 SVG 图标组件 |
| `web/src/composables/useToast.ts` | Toast 状态 |
| `web/src/utils/image-meta/` | PNG 元数据多格式解析 |
| `web/src/prompt/prompt-format.ts` | 按家族格式化提示词 |
| `web/src/prompt/prompt-canon.ts` | NAI → canon 段 |
| `web/src/prompt/program-pools.ts` | 不透明 `<pool:act_*>` 抽样（内部闭环） |
| `electron/main/png-info.ts` | PNG 文本块抽取 |
| `electron/main/index.ts` | 窗口、IPC、F12、右键检查、退出杀进程 |

---

## 15. 检查清单

```
- [ ] 无 page-header；操作在 panel-header
- [ ] 侧栏方形 icon+文字；设置在底部；不折叠
- [ ] input / textarea / AppSelect = mono 12.5px
- [ ] 工具操作用 btn-icon + SVG（播放/停止/保存/{}…）
- [ ] 简单配置优先单行 path-row
- [ ] Toast：渐入渐出 + 可关闭；错误走 toast；header 用 --bg-soft
- [ ] 新 PNG 格式进 image-meta；应用非 Comfy 图保留 family
- [ ] Anima/SDXL 格式化走 prompt-canon 语义
- [ ] flex/grid + min-height:0，无 calc(100vh)
- [ ] 不要 emoji；无兼容 shim
- [ ] npm run build 通过
```
