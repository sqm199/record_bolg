# UI 重设计 & 功能完善设计文档

**日期**：2026-04-21  
**项目**：羚羊之家（record_bolg）  
**范围**：全站深色主题重设计 + Photo/Note 模块功能完善

---

## 1. 目标

- 将整体视觉风格升级为深色沉浸风，适配移动端
- Photo 模块：按 ProductType 分组展示，支持查看大图、上传、编辑备注、删除
- Note 模块：支持在线 Markdown 编辑器新建笔记，支持删除
- 补全登录失败提示、退出登录等基础 UX 缺失项

---

## 2. 技术栈变更

| 项目 | 现状 | 变更后 |
|---|---|---|
| CSS 框架 | Bootstrap 3（本地文件） | Bootstrap 5（CDN） |
| 编辑器 | 无 | EasyMDE（CDN） |
| Markdown → HTML | 无 | Python `markdown` 包（`uv add markdown`） |
| 弹窗 | Layer.js | Bootstrap 5 Modal（移除 Layer.js 依赖） |

移除 `base.html` 中对 `static/CSS/` 下失效旧文件的引用。

---

## 3. 视觉系统

### 配色（CSS 变量，定义在 `static/css/dark.css`）

```css
--bg-base:      #0f1117;   /* 页面背景 */
--bg-surface:   #1a1d27;   /* 卡片/面板 */
--border:       #2d3148;   /* 边框/分割线 */
--accent:       #6c8ef5;   /* 主色调：链接、高亮、按钮 */
--text-primary: #e8eaf0;   /* 主文字 */
--text-muted:   #8b92a5;   /* 次要文字 */
--success:      #4ade80;   /* 成功/确认 */
--danger:       #f87171;   /* 危险/删除 */
```

### 字体

通过 Google Fonts CDN 引入：
- `Inter`（正文、UI 标签）
- `Noto Sans SC`（中文字符）

---

## 4. 导航栏（base.html）

- 背景 `#13151f`，底部 1px `var(--border)`
- 左：品牌「羚羊之家」
- 中：Photo、Note 导航项；当前页用主色调下划线高亮
- 右：用户名 + 退出按钮
- 移动端：折叠为 BS5 汉堡菜单

---

## 5. 登录页（login_2.html）

**现有问题修复：**
- 移除对不存在文件的引用（supersized、reset.css 等）
- 移除 iframe 表单提交方式
- 无登录失败提示

**重写后：**
- 全页背景 `#0f1117`，居中单卡片（max-width: 400px），圆角，`var(--bg-surface)`
- BS5 floating label 输入框（用户名、密码）
- 「登录」按钮：全宽，主色调背景
- AJAX 提交，失败时卡片内红色提示文字，无页面跳转
- 成功后跳转 `/photo`

---

## 6. 照片模块

### 列表页（photo.html）

- 按 `ProductType` 分组，每组一个 `<section>`，含分组名 + 照片计数
- 卡片网格：4 列（≥1200px）/ 3 列（≥768px）/ 2 列（≥480px）/ 1 列（<480px）
- 每张卡片：
  - 正方形缩略图，`object-fit: cover`
  - 底部备注文字，1 行截断（ellipsis）
  - hover 遮罩：显示「编辑备注」「删除」图标按钮
- 右下角固定悬浮「＋」按钮，打开上传 Modal

### 上传 Modal

字段：文件选择（accept image/*）、分组名称（文本输入，默认「图片区一」，用于 ProductTypeRemark）、备注

### 大图 Modal

- 点击缩略图触发
- 左：图片（max-height: 80vh，contain 缩放）
- 右：备注 textarea + 「保存备注」按钮

### 删除

BS5 confirm modal，确认后 AJAX DELETE，成功后移除对应卡片（无整页刷新）

### Bug 修复

`photo.js` `change_remark(keyid)`：将 `$("#save").show()` 改为 `$("#save-" + keyid).show()`，避免同时显示所有保存按钮。

---

## 7. 笔记模块

### 列表页（note.html）

- 卡片列表（非表格）
- 每张卡片：标题、作者、创建时间、「查看」链接按钮、右上角「×」删除图标（点击弹出 BS5 confirm modal）
- 右上角「＋ 新建笔记」按钮，跳转 `/note/new`

### 编辑器页（note_editor.html）

- 标题输入框（必填）
- EasyMDE Markdown 编辑器（通过 `static/css/dark.css` 覆盖编辑器默认亮色样式）
- 「保存」「取消」按钮
- 保存：POST `/note/save`，后端将 Markdown 转为 HTML

### 删除

POST `/note/delete`，仅软删除（`IsDelete=1`），保留 HTML 文件

---

## 8. 新增后端路由

| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST | `/logout` | 清空 session，重定向 `/login` |
| GET | `/note/new` | 返回编辑器页面 |
| POST | `/note/save` | 接收 `title` + `content`（Markdown），转 HTML，写文件，更新 noteinfo.json |
| POST | `/note/delete` | 软删除笔记（IsDelete=1） |

`/note/save` 后端逻辑：
1. 用 `markdown` 包将内容转为 HTML 片段
2. 包裹基础 HTML 结构后写入 `note/<title>.html`
3. 在 `noteinfo.json` 追加记录（KeyID、Name=title、Path=title、AddPerson=session username、AddTime=now）

---

## 9. 文件变更清单

**修改：**
- `main.py` — 新增 logout、note CRUD 路由
- `templates/base.html` — 完整重写
- `templates/login_2.html` — 完整重写
- `templates/photo.html` — 完整重写
- `templates/note.html` — 完整重写
- `static/js/photo.js` — 修复 bug + 适配新 UI

**新增：**
- `templates/note_editor.html`
- `static/css/dark.css`
