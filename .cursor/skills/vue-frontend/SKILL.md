---
name: vue-frontend
description: >-
  aigc-ui 项目前端规范：Electron + Vue 3 桌面客户端，紧凑工具型 UI，
  Slate + Blue，纯 CSS 变量，无第三方 UI 库。含一体化标题栏、窄侧栏、
  panel-header 操作、mono 表单、图标按钮与开发者工具约定。
  Use when creating or editing Vue 3 + Pinia + Vite + TypeScript frontend
  in this repo (web/), Electron UI, styling, pages/components, CSS, or when
  the user mentions UI 风格、界面优化、侧边栏、按钮、前端规范。
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
| 图标 | 内联 SVG + `currentColor`；无 icon 库；**不要 emoji** |
| UI 库 | **禁止** Element Plus / Ant Design / 任何第三方 Design System |

改完 `web/` → **必须** 在仓库根执行 `npm run build`（electron-vite）直到通过。

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

约定 icon 语义：

| 操作 | 图形 |
|------|------|
| 运行 / 生成 / 启动 | 播放三角 |
| 停止 / 取消 | 实心方块 |
| 保存 | 磁盘轮廓 |
| 清空日志 / 删除 | 垃圾桶 |
| 打开资源管理器 | 外链箭头 |
| 选择文件夹 | 文件夹 |

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
- 服务管理（URL、启动命令、启停）在控制台闭环；设置页只放客户端本地偏好（如输出目录）

---

## 7. Toast / 确认

- Toast：**右下**；info / ok / error；~3500ms
- **业务错误 → toast**，禁止弹窗报错
- 破坏操作 → `confirmDialog`（不用 `window.confirm`）

---

## 8. 信息架构（aigc-ui）

| 侧栏 | 职责 |
|------|------|
| 文生图 | 参数 + 预览；生成在参数 panel-header |
| 控制台 | ComfyUI 进程：服务地址、启动命令、启停、日志 |
| 设置 | 本地输出目录等客户端配置（单行 header） |

- 启动命令一行可编辑；退出应用须杀掉由客户端拉起的进程树
- Batch 等文案可保持英文短标签（如 `Batch`），与脚本参数对齐

---

## 9. UI/UX 偏好（必须）

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

### 反面案例

- 第三方 UI 库 / 原生 select / TopBar（内容顶栏）
- 大块 page-header、松散 gutter、宽空 panel-header
- 表单混用 Inter 与 mono
- 文字按钮堆叠（优先 icon）
- DevTools 深色三栏皮肤伪装产品 UI

---

## 10. 禁止项

- ❌ 第三方 UI 库 / 原生 `<select>`
- ❌ 内容区 TopBar / page-header 堆标题文案
- ❌ 弹窗报业务错
- ❌ 偏离 token 的 accent（除非用户明确要求）
- ❌ 侧栏折叠轨（本项目固定窄侧栏）

---

## 11. 关键文件

| 文件 | 职责 |
|------|------|
| `web/src/styles/index.css` | token |
| `web/src/styles/app.css` | 布局 + 组件 |
| `web/src/App.vue` | app-frame + TitleBar + shell |
| `web/src/components/layout/TitleBar.vue` | 一体化标题栏 |
| `web/src/components/layout/Sidebar.vue` | 窄侧栏 |
| `web/src/components/common/AppSelect.vue` | 下拉 |
| `electron/main/index.ts` | 窗口、IPC、F12、右键检查、退出杀进程 |

---

## 12. 检查清单

```
- [ ] 无 page-header；操作在 panel-header
- [ ] 侧栏方形 icon+文字；设置在底部；不折叠
- [ ] input / textarea / AppSelect = mono 12.5px
- [ ] 工具操作用 btn-icon + SVG（播放/停止/保存…）
- [ ] 简单配置优先单行 path-row
- [ ] 错误 toast；header 用 --bg-soft
- [ ] flex/grid + min-height:0，无 calc(100vh)
- [ ] 不要 emoji
- [ ] npm run build 通过
```
