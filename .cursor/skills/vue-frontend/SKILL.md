---
name: vue-frontend
description: >-
  Vue 3 + Electron 桌面前端规范：紧凑工具型 UI，Slate + Blue，纯 CSS 变量，
  无第三方 UI 库。涵盖布局骨架、panel-header、表单/下拉、图标按钮、Toast、
  命名与工程约定。
  Use when creating or editing Vue 3 + Pinia + Vite + TypeScript frontend
  in this repo (web/), Electron UI, styling, pages/components, CSS, or when
  the user mentions UI 风格、界面优化、侧边栏、按钮、前端规范、Toast。
---

# Vue Frontend

桌面工具型界面规范：紧凑、少概念、主操作进 panel-header、图标优先。

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
| 图标 | `web/src/components/icons/`（`Icon*.vue` + `index.ts`）；内联 SVG + `currentColor`；无 icon 库；**不要 emoji** |
| UI 库 | **禁止**第三方 Design System |

改完 `web/` → 仓库根执行 `npm run build`（electron-vite）直到通过。  
改共享逻辑 / 纯函数测试 → 另跑 `npm test`（以仓库 `vitest` include 为准）。

### 源码结构

| 路径 | 用途 |
|------|------|
| `shared/` | 跨进程纯 TS（`@shared/*`）：IPC 契约、常量、无 Electron/DOM 依赖的领域类型 |
| `web/src/views/` | 页面 |
| `web/src/components/` | UI（`common/` / `layout/` / 按功能分子目录） |
| `web/src/stores/` | Pinia（文件 kebab-case） |
| `web/src/composables/` | 可复用组合逻辑 |
| `web/src/utils/` | 通用工具 |
| `electron/main/` | 窗口、IPC、系统能力；**禁止** `import …/web/src/…` |

约定：Vue 组件 PascalCase；TS 模块 kebab-case；跨进程契约只改 `shared/`；渲染侧直连 `@shared/*`。

---

## 2. 设计 Token（摘要）

完整 `:root` 见 [tokens.md](tokens.md)。

- 背景：`--bg` / `--bg-soft` / `--bg-sidebar`
- 选中：`--bg-sidebar-item-hover` / `--bg-sidebar-item-active`（灰高亮，非 primary-soft）
- 主色：`--primary` / `--accent` `#2563eb`（勿默认橙 / indigo）
- 形状：`--radius` / `--radius-sm` / `--radius-lg`
- 布局：`--page-gutter`（紧凑）

---

## 3. 布局骨架

```
app-frame (column, 100%)
├── TitleBar（一体化标题栏，可拖拽；品牌在此）
└── app-shell (grid: 窄侧栏 | main)
    ├── Sidebar
    │   ├── nav-list（上：主功能）
    │   └── footer（下：设置 / 主题等）
    └── main → page-view → page-shell
        └── panel(s) / split-pane   ← 无 page-header
```

### 窗口铬（Electron）

- `titleBarStyle: 'hidden'`；Windows 用 `titleBarOverlay`
- 自定义 `.titlebar`：`-webkit-app-region: drag`；交互控件 `no-drag`
- **F12** 切换 DevTools；右键「检查」→ `webContents.inspectElement`

### 侧栏

- **固定窄轨 ~64px**，不折叠
- nav：**方形按钮**（icon 上、文字下）
- 主功能在上，设置类入口固定底部
- 选中 = 灰底高亮（禁止左侧色条）
- 侧栏不放服务探测 / 常驻状态点（状态进对应页面或 header pill）

### 页面

- **禁止 page-header**（标题+meta 堆砌）
- 导航靠侧栏；页内用 `.panel-header` 承载标题与操作
- `page-shell` 用 `--page-gutter`，gap 宜小
- 分栏：`flex` / `grid` + `min-height: 0`；**禁止** `height: calc(100vh - …)`

### panel-header（核心操作带）

- 紧凑：`padding: 6px 12px`，`min-height: ~40px`，title ~0.8125rem
- 左：标题（可带 status pill）或纯文字下拉（`AppSelect` `variant="plain"`）；右：**icon 按钮组**
- 主操作（运行 / 停止 / 清空 / 保存）优先进 header，少占 body
- 简单配置优先单行：`标题 | 控件… | icon按钮`

---

## 4. 按钮

| 变体 | 用途 |
|------|------|
| `.btn` 胶囊 | 少量文字操作 |
| `.btn-primary` / `.btn-ghost` / `.btn-danger` | 语义色 |
| `.btn-sm` | 紧凑文字按钮 |
| `.btn-icon` | **首选工具操作**（30×30） |

约定 icon 语义（`import { IconX } from '@/components/icons'`）：

| 操作 | 图形 |
|------|------|
| 运行 / 启动 | 播放三角 |
| 停止 / 取消 | 实心方块（运行中可用 `.btn-icon--running`） |
| 保存 | 磁盘（`IconSave`） |
| 删除 | 垃圾桶（`IconTrash`） |
| 清空 | 粉碎机（`IconShredder`） |
| 打开目录 | 文件夹 |
| 选择目录 | `IconFolderPick` |
| 预览 / 查看 | 眼睛（`IconEye`） |
| 关闭 Toast | 细线叉 SVG |

新图标 → `web/src/components/icons/` + `index.ts` 导出；勿在 View 内复制 path。

交互：hover 色变 + active `scale(0.98)`。

---

## 5. 表单

### `.input` / `.textarea` / `AppSelect`

- **统一** `font-family: var(--mono); font-size: 12.5px; line-height: 1.45`
- `--radius-sm`，紧凑 padding
- Focus：primary 边框 + `--focus-ring`

### AppSelect

| variant | 用途 |
|---------|------|
| `default` / `compact` | 表单字段（有边框底色） |
| `plain` | 标题位纯文字 + 小三角，无边框 |

- Teleport to body；选项常量集中管理（如 `select-options.ts`）
- 禁止原生 `<select>`

### 路径行

```html
<div class="path-row">
  <input class="input" />
  <button class="btn btn-ghost btn-icon" title="…">…</button>
</div>
```

可编辑路径 + 保存/浏览 icon；只读时再加 `readonly`。

---

## 6. 面板与分栏

### panel

- `.list-panel` / `.detail-panel`：白底 + border + radius + shadow
- header：`background: var(--bg-soft)` + 底边线
- 极简配置页：可仅有 header、无 body

### split-pane

- 左右分栏 + 可拖拽分隔；`flex: 1; min-height: 0`
- 左栏设合理 `min-width` / `max-ratio`；比例可持久化（storage key）

### 日志类视图

- 深色底 + mono 小字（如 `.console-log`）
- 进程/服务启停与日志同页；地址类配置放设置页

---

## 7. Toast / 确认

- Toast：**右下**；info / ok / error；短时自动消失
- `useToast` + `ToastHost`（`TransitionGroup`）
- **必须**登场/退场动画；列表位移用 `.toast-move`
- **必须**可手动关闭；关闭时清定时器
- **业务错误 → toast**，禁止弹窗报错
- 破坏操作 → `confirmDialog`（不用 `window.confirm`）

---

## 8. UI/UX 原则

### 密度

- 紧凑优先；去掉无表达的说明行与 page-header
- 辅助说明进 `title` 悬停
- panel 能一行就不要拆多行

### 信息

- 概念要少；能去掉就去掉
- 状态 pill 仅在有用时出现，放进 panel-header

### 视觉

- 蓝主色；亮色默认 + 可选暗色（`data-theme`）
- 无 emoji；扁平 SVG
- 预览图默认不可拖出：`draggable="false"`

### 工程

- **绿地优先**：不做无必要的兼容 / 迁移 shim
- 规范变更同步本 skill，勿另起散落文档
- **换行一律 LF**（源码）：`.gitattributes` + `.editorconfig` + `files.eol: \n`；Agent 写源码不得产出 CRLF。数据文件（如 `.csv`）不强制

### 文本编辑

- 需要进原生撤销栈时：用选区 + `execCommand('insertText')`（或项目内封装），禁止直接改 `v-model` 绕过撤销

---

## 9. 禁止项

- ❌ 第三方 UI 库 / 原生 `<select>`
- ❌ 内容区 TopBar / page-header 堆标题
- ❌ 弹窗报业务错
- ❌ 偏离 token 的 accent（除非用户明确要求）
- ❌ 可折叠宽侧栏（本规范固定窄轨）
- ❌ 为旧协议堆兼容层（无明确需求时）

---

## 10. 关键文件

| 文件 | 职责 |
|------|------|
| `web/src/styles/index.css` | token |
| `web/src/styles/app.css` | 布局 + 组件 + Toast |
| `web/src/App.vue` | app-frame + TitleBar + shell |
| `web/src/components/layout/` | TitleBar / Sidebar |
| `web/src/components/common/AppSelect.vue` | 下拉 |
| `web/src/components/common/ToastHost.vue` | Toast 宿主 |
| `web/src/components/icons/` | 共用 SVG |
| `web/src/composables/useToast.ts` | Toast 状态 |
| `electron/main/index.ts` | 窗口、IPC、退出清理 |

---

## 11. 检查清单

```
- [ ] 无 page-header；操作在 panel-header
- [ ] 侧栏方形 icon+文字；设置在底部；不折叠
- [ ] input / textarea / AppSelect = mono 12.5px（标题位可用 plain）
- [ ] 工具操作用 btn-icon + SVG
- [ ] 简单配置优先单行
- [ ] Toast：动画 + 可关闭；错误走 toast
- [ ] flex/grid + min-height:0，无 calc(100vh)
- [ ] 不要 emoji；无多余兼容 shim
- [ ] npm run build 通过
```
