# CSS Token 速查（aigc-ui）

## 完整 `:root`

```css
:root {
  --bg: #ffffff;
  --bg-elevated: #ffffff;
  --bg-soft: #f8fafc;
  --bg-sidebar: #f4f7fc;
  --bg-sidebar-item-hover: #e2e8f0;
  --bg-sidebar-item-active: #d8dee8;
  --border-sidebar-item-active: #cbd5e1;
  --border: #e2e8f0;
  --border-strong: #cbd5e1;
  --text: #1e293b;
  --text-soft: #475569;
  --text-secondary: #475569;
  --text-muted: #94a3b8;
  --placeholder: #cbd5e1;
  --primary: #2563eb;
  --primary-soft: #eff6ff;
  --primary-hover: #1d4ed8;
  --accent: #2563eb;
  --accent-hover: #1d4ed8;
  --accent-soft: #eff6ff;
  --success: #16a34a;
  --warning: #d97706;
  --danger: #dc2626;
  --info: #2563eb;
  --radius: 12px;
  --radius-sm: 8px;
  --radius-lg: 16px;
  --shadow: 0 1px 3px rgba(15, 23, 42, 0.06), 0 8px 24px rgba(37, 99, 235, 0.08);
  --shadow-lg: 0 4px 16px rgba(15, 23, 42, 0.1);
  --content-max: 1200px;
  --page-gutter: clamp(8px, 1.2vw, 12px);
  --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Monaco, Consolas, monospace;
  --font: "Inter", system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei UI", sans-serif;
}
```

## 字号惯例

| 用途 | 大小 |
|------|------|
| body | 14px / 0.875rem |
| panel-title | 0.8125rem / 600 |
| 侧栏 nav 文字 | 0.625rem |
| meta / 辅助 | 0.75–0.8125rem |
| **表单 input / select / textarea** | **12.5px mono** |
| 代码 / 控制台日志 | 12–12.5px mono |
| 微标签 / status pill | 0.6875rem |

> 本项目**不使用**占空间的 page-header h1。

## 紧凑布局参考

| 区域 | 建议 |
|------|------|
| `.page-shell` | `padding: var(--page-gutter); gap: 8px` |
| `.panel-header` | `padding: 6px 12px; min-height: 40px` |
| 侧栏宽度 | `64px` 固定 |
| nav 方形按钮 | `52×52`，icon `22px` |
| `.btn-icon` | `30×30` |

## HTTP Method 色（若用到）

| Method | 背景 | 文字 |
|--------|------|------|
| GET | #e7f3ff | #1d63d8 |
| POST | #e9f7ec | #157a3e |
| PUT | #fff4e0 | #c47b09 |
| PATCH | #fcefe9 | #c04b22 |
| DELETE | #fce4e6 | #c01d2b |

## 响应 / 日志块

`.console-log` / `.response-body`：背景 `#0f172a`，文字 `#e2e8f0`，mono，可滚动。

## AppSelect 结构

```html
<div class="app-select app-select--default|bare|compact">
  <button class="app-select-trigger">
    <span class="app-select-value">…</span>
    <span class="app-select-chevron">▾</span>
  </button>
  <!-- Teleport → body -->
  <div class="app-select-menu">…</div>
</div>
```

trigger / value / option 字体与 input 一致：`mono` 12.5px。
