# 设计规格：笔记详情页优化 + 时间轴视图

**日期：** 2026-04-29  
**状态：** 已确认  

---

## 1. 背景与目标

当前问题：
- 笔记详情页（`/notes/<filename>`）是纯白背景静态 HTML，与全站 dark 主题脱节，无导航栏、无编辑入口
- 照片页和笔记页均无时间轴视图，只能按分组/列表浏览，无法按时间维度回顾内容

目标：
1. 笔记详情页：改为 dark 主题、继承全站导航、支持内联编辑
2. 照片页 + 笔记页：各自增加时间轴视图切换按钮

设计风格：极简清新，深色主题，柔和阴影，留白，呼吸感。

---

## 2. 笔记详情页

### 2.1 路由变更

| 变更项 | 原来 | 新的 |
|--------|------|------|
| `GET /notes/<filename>` | `send_from_directory` 返回静态 HTML | Flask 路由，读 JSON 数据，渲染 `note_detail.html` |
| `POST /note/update` | 不存在 | 新增，保存修改（更新 JSON + 重新生成 .html 文件） |

### 2.2 数据变更

`noteinfo.json` 每条记录新增 `Content` 字段，存储原始 Markdown 文本：

```json
{
  "KeyID": "...",
  "Name": "关于 Vue3 的思考",
  "Path": "Vue3",
  "Content": "## 核心优势\n\n- 逻辑复用...",
  "AddTime": "2026-04-21 12:00:00",
  ...
}
```

旧记录无 `Content` 字段时，编辑区显示提示"历史笔记暂不支持编辑"，只读展示。

`note_save()` 改动：保存时把 Markdown 内容写入 `Content` 字段。

### 2.3 模板：`note_detail.html`

继承 `base.html`，布局：

```
┌─────────────────────────────────┐
│  导航栏（base.html 已有）        │
├─────────────────────────────────┤
│  ← 返回笔记列表          ✏️ 编辑 │
├─────────────────────────────────┤
│  标题（大字）                    │
│  作者 · 日期 · 分组标签          │
│  ─────────────────────────────  │
│  正文（Markdown 渲染 HTML）      │
└─────────────────────────────────┘
```

**读模式（默认）：**
- 顶部：左侧"← 返回笔记列表"链接，右侧"✏️ 编辑"按钮（`btn-ghost` 样式，蓝色文字）
- 标题区：`h1` + 作者/日期/分组标签（胶囊样式）+ 横线分隔
- 正文区：`id="note-body"`，渲染 `item.html_body`（服务端渲染的 Markdown HTML）
- Markdown 正文样式覆盖：`h1~h6` 调整字号，`blockquote` 左边蓝线 + `bg-surface` 背景，`code` 蓝色，`pre` 深色背景

**编辑模式（JS 切换）：**
- 点击"✏️ 编辑"触发 `enterEditMode()`：
  - 隐藏 `#note-body`，显示 `#edit-section`
  - `#edit-section` 包含：标题输入框（`form-control-dark`）+ EasyMDE 编辑器
  - 顶部按钮换为"取消" + "保存"
- EasyMDE 按需初始化（首次进入编辑模式时初始化，之后复用）
- "取消"调用 `exitEditMode()`，恢复读模式，不提交
- "保存"POST 到 `/note/update`，成功后刷新页面

### 2.4 `/note/update` 路由

```
POST /note/update
参数: KeyID, title, content (Markdown)
逻辑:
  1. 验证登录
  2. 验证 KeyID 存在且未删除，取出原始 Path 字段
  3. 用 markdown.markdown() 渲染新 HTML body
  4. 覆写 note/<原始Path>.html 文件（始终用原始 Path，不随标题变化重命名，避免旧链接失效）
  5. 更新 noteinfo.json 中 Content、Name、ModifyTime（Path 不变）
  6. 返回 {"code":1}
```

---

## 3. 时间轴视图

### 3.1 适用页面

- 照片页（`/photo`，模板 `photo.html`）
- 笔记页（`/note`，模板 `note.html`）

### 3.2 切换按钮

位置：`page-header` 右侧，紧靠现有按钮左侧。

```html
<div class="view-toggle">
  <button class="view-btn active" data-view="grid" onclick="switchView('grid')">⊞ 网格</button>
  <button class="view-btn" data-view="timeline" onclick="switchView('timeline')">≡ 时间轴</button>
</div>
```

CSS：分段按钮组，激活态 `background: var(--accent)` 白字，非激活态透明灰字。

用 `localStorage` 记住用户偏好（key：`photo_view` / `note_view`），页面加载时自动恢复。

### 3.3 照片页时间轴

数据来源：Jinja2 已将 `value`（全部照片记录）传入模板。

JS 端按 `AddTime` 倒序排列，按日期（`YYYY-MM-DD`）分组，同日多张合并为一个节点。

节点结构：
```
○  4月 29日
│  ┌─────────────────────────────────┐
│  │ 🖼️ [缩略图×N]  分组名          │
│  │ N 张 · 备注                     │
│  └─────────────────────────────────┘
│
○  4月 21日
   ┌────...
```

- 节点圆点：`var(--accent)` 蓝，双环描边效果
- 竖线：从圆点颜色渐变到 `var(--border)`
- 卡片：`bg-surface` + `border`，hover 时 `border-color: var(--accent)`
- 缩略图行：最多显示 4 张 `40×40` 方形缩略图，超出显示 `+N`
- 点击缩略图：触发原有 lightbox

### 3.4 笔记页时间轴

数据来源：同上，`value` 已传入。

JS 端按 `AddTime` 倒序排列，每条笔记一个节点（不合并）。

节点结构：
```
○  4月 21日
│  ┌─────────────────────────────────┐
│  │ 关于 Vue3 的思考                │
│  │ admin · 公开区          → 查看  │
│  └─────────────────────────────────┘
```

- 节点圆点：`var(--success)` 绿
- 每个节点可独立删除（复用原有 `confirmNoteDelete`）

### 3.5 年份分组标签

当数据跨年时，在年份切换处插入年份胶囊标签：
```html
<div class="timeline-year-label">
  <span class="dot"></span> 2026
</div>
```

---

## 4. CSS 新增类

统一写入 `static/CSS/dark.css`：

```css
/* 视图切换按钮组 */
.view-toggle { ... }
.view-btn { ... }
.view-btn.active { ... }

/* 时间轴 */
.timeline { ... }
.timeline-year-label { ... }
.timeline-item { ... }
.timeline-dot { ... }
.timeline-line { ... }
.timeline-card { ... }
.timeline-thumb-strip { ... }
.timeline-thumb { ... }

/* 笔记详情页正文样式覆盖 */
.note-body h1, .note-body h2, ... { ... }
.note-body blockquote { ... }
.note-body code { ... }
.note-body pre { ... }
```

---

## 5. 文件改动清单

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `main.py` | 修改 | `cat_notes_file` 改为 Flask 渲染；`note_save` 存 Content；新增 `note_update` |
| `templates/note_detail.html` | 新建 | 笔记详情页模板 |
| `templates/note.html` | 修改 | 增加视图切换按钮 + 时间轴 HTML 结构 + JS |
| `templates/photo.html` | 修改 | 增加视图切换按钮 + 时间轴 HTML 结构 + JS |
| `static/CSS/dark.css` | 修改 | 新增视图切换、时间轴、笔记正文样式类 |

---

## 6. 不在范围内

- 照片/笔记合并到同一时间轴（各自独立）
- 时间轴分页/懒加载（当前数据量小，全量渲染）
- 笔记详情页公开访问（需要登录，与现有逻辑一致）
