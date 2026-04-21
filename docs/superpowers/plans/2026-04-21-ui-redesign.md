# UI 重设计 & 功能完善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将整站重设计为深色沉浸风，完善照片相册分组、笔记在线编辑、登录 UX 等功能。

**Architecture:** Bootstrap 5（CDN）替换本地 BS3，自定义 `dark.css` 提供配色变量和组件样式，模板层完整重写，后端新增 logout / note CRUD 路由。

**Tech Stack:** Flask + Jinja2, Bootstrap 5.3 CDN, EasyMDE CDN, Python `markdown` 包, JSON 文件存储（已有）

---

## 文件变更清单

| 操作 | 文件 | 职责 |
|---|---|---|
| 新建 | `static/css/dark.css` | 全局深色主题变量 + 所有自定义组件样式 |
| 重写 | `templates/base.html` | 导航栏 shell，所有页面继承 |
| 重写 | `templates/login_2.html` | 登录页，独立（不继承 base） |
| 重写 | `main.py` | 新增 logout、note CRUD；photo 路由补 ProductTypeRemark；upload 改返回 JSON |
| 重写 | `templates/photo.html` | 照片相册分组卡片页 |
| 重写 | `static/js/photo.js` | 上传/大图/删除的 AJAX 交互 |
| 重写 | `templates/note.html` | 笔记卡片列表页 |
| 新建 | `templates/note_editor.html` | EasyMDE 在线编辑器页 |

---

## Task 1: Foundation — 安装 markdown 包 + 创建 dark.css

**Files:**
- Run: `uv add markdown`
- Create: `static/css/dark.css`

- [ ] **Step 1: 安装 markdown 包**

```bash
cd C:/code/github_my_code/record_bolg && uv add markdown
```

预期输出包含 `+ markdown` 并更新 `uv.lock`。

- [ ] **Step 2: 创建 `static/css/dark.css`**

新建目录 `static/css/` 并写入以下内容：

```css
/* ── CSS Variables ── */
:root {
  --bg-base:      #0f1117;
  --bg-surface:   #1a1d27;
  --bg-hover:     #222638;
  --border:       #2d3148;
  --accent:       #6c8ef5;
  --accent-hover: #5a7ce8;
  --text-primary: #e8eaf0;
  --text-muted:   #8b92a5;
  --success:      #4ade80;
  --danger:       #f87171;
}

*, *::before, *::after { box-sizing: border-box; }

body {
  background-color: var(--bg-base);
  color: var(--text-primary);
  font-family: 'Inter', 'Noto Sans SC', sans-serif;
  margin: 0;
  min-height: 100vh;
}

/* ── Bootstrap modal dark overrides ── */
.modal-content {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  color: var(--text-primary);
}
.modal-header { border-bottom: 1px solid var(--border); }
.modal-footer { border-top: 1px solid var(--border); }
.btn-close { filter: invert(1) grayscale(1); }

/* ── Navbar ── */
.app-nav {
  background: #13151f;
  border-bottom: 1px solid var(--border);
  padding: 0 1.5rem;
  display: flex;
  align-items: center;
  height: 56px;
  position: sticky;
  top: 0;
  z-index: 100;
  gap: 0.5rem;
}
.app-nav .brand {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-primary);
  text-decoration: none;
  margin-right: 1.5rem;
  white-space: nowrap;
}
.nav-links {
  display: flex;
  gap: 0.25rem;
  flex: 1;
}
.nav-links .nav-link {
  color: var(--text-muted);
  text-decoration: none;
  padding: 0.4rem 0.75rem;
  border-radius: 6px;
  font-size: 0.9rem;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}
.nav-links .nav-link:hover,
.nav-links .nav-link.active {
  color: var(--text-primary);
  border-bottom-color: var(--accent);
}
.nav-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-left: auto;
}
.nav-username {
  color: var(--text-muted);
  font-size: 0.85rem;
}
.nav-toggle {
  display: none;
  background: none;
  border: 1px solid var(--border);
  color: var(--text-muted);
  padding: 0.3rem 0.6rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
}
@media (max-width: 640px) {
  .nav-toggle { display: flex; }
  .nav-links {
    display: none;
    flex-direction: column;
    position: absolute;
    top: 56px;
    left: 0;
    right: 0;
    background: #13151f;
    border-bottom: 1px solid var(--border);
    padding: 0.5rem 1rem;
    z-index: 99;
  }
  .app-nav.open .nav-links { display: flex; }
}

/* ── Buttons ── */
.btn-accent {
  background: var(--accent);
  color: #fff;
  border: none;
  padding: 0.5rem 1.25rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  transition: background 0.15s;
}
.btn-accent:hover { background: var(--accent-hover); color: #fff; }

.btn-ghost {
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--border);
  padding: 0.4rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  transition: color 0.15s, border-color 0.15s;
}
.btn-ghost:hover { color: var(--text-primary); border-color: var(--accent); }

.btn-danger {
  background: var(--danger);
  color: #fff;
  border: none;
  padding: 0.4rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: background 0.15s;
}
.btn-danger:hover { background: #ef4444; }

/* ── Card ── */
.card-dark {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}

/* ── Form controls ── */
.form-control-dark {
  background: #12141e;
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: 6px;
  padding: 0.6rem 0.9rem;
  width: 100%;
  font-size: 0.95rem;
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s;
  resize: vertical;
}
.form-control-dark:focus { border-color: var(--accent); }
.form-control-dark::placeholder { color: var(--text-muted); }

/* ── FAB ── */
.fab {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(108,142,245,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, transform 0.1s;
  z-index: 50;
  line-height: 1;
}
.fab:hover { background: var(--accent-hover); transform: scale(1.06); }

/* ── Photo grid ── */
.photo-group { margin-bottom: 2.5rem; }
.photo-group-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding-bottom: 0.6rem;
  border-bottom: 1px solid var(--border);
}
.photo-group-header h2 { font-size: 1.05rem; margin: 0; font-weight: 600; }
.group-count {
  font-size: 0.78rem;
  color: var(--text-muted);
  background: var(--bg-base);
  padding: 0.15rem 0.55rem;
  border-radius: 20px;
  border: 1px solid var(--border);
}
.photo-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}
@media (max-width: 1199px) { .photo-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 767px)  { .photo-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 479px)  { .photo-grid { grid-template-columns: 1fr; } }

.photo-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  cursor: pointer;
  transition: border-color 0.15s;
}
.photo-card:hover { border-color: var(--accent); }
.thumb-wrap {
  width: 100%;
  padding-top: 100%;
  position: relative;
  overflow: hidden;
}
.thumb-wrap img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.25s;
}
.photo-card:hover .thumb-wrap img { transform: scale(1.05); }
.card-remark {
  padding: 0.5rem 0.65rem;
  font-size: 0.78rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-actions {
  position: absolute;
  inset: 0;
  background: rgba(15,17,23,0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  opacity: 0;
  transition: opacity 0.2s;
  padding-bottom: 2rem;
}
.photo-card:hover .card-actions { opacity: 1; }
.icon-btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,0.35);
  background: rgba(255,255,255,0.12);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 0.95rem;
  transition: background 0.15s, border-color 0.15s;
}
.icon-btn:hover { background: rgba(255,255,255,0.28); }
.icon-btn.danger:hover { background: var(--danger); border-color: var(--danger); }

/* ── Note list ── */
.note-list { display: flex; flex-direction: column; gap: 0.75rem; }
.note-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1rem 1.25rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  transition: border-color 0.15s;
}
.note-card:hover { border-color: var(--accent); }
.note-title { font-size: 0.975rem; font-weight: 500; flex: 1; color: var(--text-primary); }
.note-meta { font-size: 0.8rem; color: var(--text-muted); white-space: nowrap; }
.note-delete {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  font-size: 1.1rem;
  line-height: 1;
  transition: color 0.15s;
}
.note-delete:hover { color: var(--danger); }

/* ── Page layout ── */
.page-body { max-width: 1200px; margin: 0 auto; padding: 1.5rem 1rem; }
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}
.page-header h1 { font-size: 1.25rem; margin: 0; font-weight: 600; }

/* ── Empty state ── */
.empty-state {
  text-align: center;
  padding: 5rem 1rem;
  color: var(--text-muted);
}
.empty-state .empty-icon { font-size: 3rem; margin-bottom: 0.75rem; }

/* ── EasyMDE dark overrides ── */
.EasyMDEContainer .CodeMirror {
  background: #12141e;
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 0 0 6px 6px;
  font-size: 0.95rem;
}
.EasyMDEContainer .editor-toolbar {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 6px 6px 0 0;
}
.EasyMDEContainer .editor-toolbar button { color: var(--text-muted) !important; }
.EasyMDEContainer .editor-toolbar button:hover,
.EasyMDEContainer .editor-toolbar button.active {
  background: var(--bg-hover) !important;
  color: var(--text-primary) !important;
  border-color: var(--border) !important;
}
.EasyMDEContainer .editor-toolbar i.separator { border-color: var(--border) !important; }
.editor-preview { background: var(--bg-surface); color: var(--text-primary); padding: 1rem; }
.editor-preview-side {
  background: var(--bg-surface);
  color: var(--text-primary);
  border-left: 1px solid var(--border) !important;
  padding: 1rem;
}
.CodeMirror-cursor { border-left-color: var(--text-primary) !important; }
.CodeMirror-selected { background: rgba(108,142,245,0.25) !important; }
```

- [ ] **Step 3: 验证文件存在**

```bash
ls C:/code/github_my_code/record_bolg/static/css/dark.css
```

- [ ] **Step 4: Commit**

```bash
cd C:/code/github_my_code/record_bolg && git add static/css/dark.css uv.lock pyproject.toml && git commit -m "feat: add dark theme CSS + markdown dependency"
```

---

## Task 2: 重写 base.html — 导航 shell

**Files:**
- Modify: `templates/base.html`

- [ ] **Step 1: 完整重写 `templates/base.html`**

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{% block title %}羚羊之家{% endblock %}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Noto+Sans+SC:wght@400;500&display=swap" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="{{ url_for('static', filename='css/dark.css') }}">
  {% block head %}{% endblock %}
</head>
<body>

<nav class="app-nav" id="appNav">
  <a class="brand" href="{{ url_for('photo') }}">🦌 羚羊之家</a>
  <div class="nav-links" id="navLinks">
    <a class="nav-link {% if request.endpoint == 'photo' %}active{% endif %}"
       href="{{ url_for('photo') }}">Photo</a>
    <a class="nav-link {% if request.endpoint in ('note', 'note_new') %}active{% endif %}"
       href="{{ url_for('note') }}">Note</a>
  </div>
  <div class="nav-right">
    <span class="nav-username d-none d-sm-inline">{{ session.get('username', '') }}</span>
    <a href="{{ url_for('logout') }}" class="btn-ghost">退出</a>
  </div>
  <button class="nav-toggle" onclick="document.getElementById('appNav').classList.toggle('open')" aria-label="菜单">☰</button>
</nav>

<div class="page-body">
  {% block content %}{% endblock %}
</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
{% block scripts %}{% endblock %}
</body>
</html>
```

- [ ] **Step 2: 启动服务器验证模板无语法错误**

```bash
cd C:/code/github_my_code/record_bolg && python -c "from main import app; ctx = app.test_request_context(); ctx.push(); from flask import render_template, session; print('base.html OK')"
```

- [ ] **Step 3: Commit**

```bash
cd C:/code/github_my_code/record_bolg && git add templates/base.html && git commit -m "feat: rewrite base.html with BS5 dark nav"
```

---

## Task 3: 重写 login_2.html — 登录页

**Files:**
- Modify: `templates/login_2.html`

- [ ] **Step 1: 完整重写 `templates/login_2.html`**

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>羚羊之家 — 登录</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Noto+Sans+SC:wght@400;500&display=swap" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="{{ url_for('static', filename='css/dark.css') }}">
  <style>
    body { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .login-card { width: 100%; max-width: 400px; padding: 2rem; }
    .login-brand { font-size: 1.4rem; font-weight: 600; margin-bottom: 0.25rem; }
    .login-sub  { color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1.75rem; }
    .field-label { color: var(--text-muted); font-size: 0.82rem; display: block; margin-bottom: 0.35rem; }
    .error-msg { color: var(--danger); font-size: 0.82rem; min-height: 1.2rem; margin-top: 0.5rem; }
    .btn-accent { width: 100%; justify-content: center; padding: 0.65rem; margin-top: 0.5rem; font-size: 0.95rem; }
  </style>
</head>
<body>
  <div class="card-dark login-card">
    <div class="login-brand">🦌 羚羊之家</div>
    <div class="login-sub">请登录以继续</div>
    <form id="loginForm" novalidate>
      <div style="margin-bottom:1rem">
        <label class="field-label" for="useraccount">用户名</label>
        <input type="text" id="useraccount" class="form-control-dark" placeholder="Username" autocomplete="username">
      </div>
      <div style="margin-bottom:0.5rem">
        <label class="field-label" for="password">密码</label>
        <input type="password" id="password" class="form-control-dark" placeholder="Password" autocomplete="current-password">
      </div>
      <div class="error-msg" id="errorMsg"></div>
      <button type="submit" class="btn-accent" id="loginBtn">登录</button>
    </form>
  </div>

  <script>
    document.getElementById('loginForm').addEventListener('submit', function(e) {
      e.preventDefault();
      const btn = document.getElementById('loginBtn');
      const errEl = document.getElementById('errorMsg');
      btn.disabled = true;
      btn.textContent = '登录中…';
      errEl.textContent = '';

      fetch('/login_confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          useraccount: document.getElementById('useraccount').value,
          password:    document.getElementById('password').value
        })
      })
      .then(r => r.json())
      .then(data => {
        if (data.code === 1) {
          window.location.href = '/photo';
        } else {
          errEl.textContent = '用户名或密码错误';
          btn.disabled = false;
          btn.textContent = '登录';
        }
      })
      .catch(() => {
        errEl.textContent = '网络错误，请重试';
        btn.disabled = false;
        btn.textContent = '登录';
      });
    });
  </script>
</body>
</html>
```

- [ ] **Step 2: 启动服务器，访问 `http://localhost:1111/login` 验证**

```bash
cd C:/code/github_my_code/record_bolg && python main.py
```

检查项：
- 页面深色背景，居中卡片
- 输入错误账号密码后，卡片内出现红色「用户名或密码错误」提示
- 输入 admin / admin@123 后跳转到 /photo

- [ ] **Step 3: Commit**

```bash
cd C:/code/github_my_code/record_bolg && git add templates/login_2.html && git commit -m "feat: rewrite login page with dark theme and AJAX submit"
```

---

## Task 4: 更新 main.py — 新增后端路由

**Files:**
- Modify: `main.py`

新增：`/logout`、`/note/new`、`/note/save`、`/note/delete`  
修改：`/photo` 补 `ProductTypeRemark`、`/upload_file` 改为返回 JSON + 接受 `group_name`

- [ ] **Step 1: 完整重写 `main.py`**

```python
# -*- coding: utf-8 -*-
from flask import Flask, redirect, url_for, render_template, session, request, send_from_directory
from Module import MPhotoInfo, MnoteInfo
from Sqls import storage
import markdown
import os
import time
import random

UPLOAD_FOLDER = os.path.join(os.getcwd(), 'photo')
NOTE_PATH     = os.path.join(os.getcwd(), 'note')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

app = Flask(__name__)
app.secret_key = "shiyangS"
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['NOTE_PATH']     = NOTE_PATH

ADMIN_ACCOUNT = "admin"
ADMIN_PASSWORD = "admin@123"


def mark_keyid():
    a = time.strftime("%Y%m%d%H%M%S", time.localtime())
    b = str(random.randint(1000, 9999))
    return a + b


def login_cat():
    return (session.get("useraccount") == ADMIN_ACCOUNT and
            session.get("password") == ADMIN_PASSWORD)


# ── Index ──────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return redirect(url_for('photo'))


# ── Auth ───────────────────────────────────────────────────────────────────

@app.route('/login', methods=['GET', 'POST'])
def login():
    return render_template('login_2.html')


@app.route('/login_confirm', methods=['POST'])
def login_confirm():
    useraccount = request.form.get('useraccount', '')
    password    = request.form.get('password', '')
    if useraccount == ADMIN_ACCOUNT and password == ADMIN_PASSWORD:
        session["useraccount"] = useraccount
        session["password"]    = password
        session["username"]    = useraccount
        return '{"code": 1, "msgs": "登陆成功"}'
    return '{"code": 0, "msgs": "用户名或密码错误"}'


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


# ── Photo ──────────────────────────────────────────────────────────────────

@app.route('/photo')
def photo():
    if not login_cat():
        return redirect(url_for('login'))
    records = [r for r in storage.load('photoinfo') if not r.get('IsDelete')]
    value_list = []
    for item in records:
        p = MPhotoInfo.Photo()
        p.KeyID             = item['KeyID']
        p.Name              = item['Name']
        p.ProductType       = item['ProductType']
        p.ProductTypeRemark = item.get('ProductTypeRemark', '图片区一') or '图片区一'
        p.Remark            = item.get('Remark', '')
        value_list.append(p)
    return render_template('photo.html', value=value_list)


@app.route('/delete_photo', methods=['POST'])
def delete_photo():
    if not login_cat():
        return '{"Code":0,"Message":"未登录"}'
    key_id = request.form.get("KeyID")
    records = storage.load('photoinfo')
    for r in records:
        if r['KeyID'] == key_id:
            r['IsDelete'] = 1
    storage.save('photoinfo', records)
    return '{"Code":1,"Message":"删除成功！"}'


@app.route('/change_save_remark', methods=['POST'])
def change_save_remark():
    if not login_cat():
        return '{"Code":0,"Message":"未登录"}'
    key_id = request.form.get("KeyID")
    remark = str(request.form.get("Remark", "")).strip()
    records = storage.load('photoinfo')
    for r in records:
        if r['KeyID'] == key_id:
            r['Remark'] = remark
    storage.save('photoinfo', records)
    return '{"Code":1,"Message":"更新成功！"}'


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


@app.route('/upload_file', methods=['POST'])
def upload_file():
    if not login_cat():
        return '{"code":0,"msgs":"未登录"}'
    file       = request.files.get('file')
    remark     = request.form.get('remark', '')
    group_name = (request.form.get('group_name', '') or '').strip() or '图片区一'
    if not file or not allowed_file(file.filename):
        return '{"code":0,"msgs":"请选择有效的图片文件（png/jpg/jpeg/gif/webp）"}'
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    file.save(os.path.join(app.config['UPLOAD_FOLDER'], file.filename))
    now = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())
    record = {
        "KeyID":             mark_keyid(),
        "Name":              file.filename,
        "ProductType":       1,
        "ProductTypeRemark": group_name,
        "Remark":            remark,
        "IsDelete":          0,
        "AddTime":           now,
        "AddPerson":         session.get("username", "admin"),
        "ModifyTime":        now
    }
    records = storage.load('photoinfo')
    records.append(record)
    storage.save('photoinfo', records)
    return '{"code":1,"msgs":"上传成功"}'


# ── Note ───────────────────────────────────────────────────────────────────

@app.route('/note')
def note():
    if not login_cat():
        return redirect(url_for('login'))
    records = [r for r in storage.load('noteinfo') if not r.get('IsDelete')]
    value_list = []
    for item in records:
        n = MnoteInfo.Note()
        n.KeyID     = item['KeyID']
        n.Name      = item['Name']
        n.ProductType = item.get('ProductType', 1)
        n.AddPerson = item.get('AddPerson', '')
        n.AddTime   = item.get('AddTime', '')
        n.Path      = item.get('Path', item['Name'])
        value_list.append(n)
    return render_template('note.html', value=value_list)


@app.route('/note/new')
def note_new():
    if not login_cat():
        return redirect(url_for('login'))
    return render_template('note_editor.html')


@app.route('/note/save', methods=['POST'])
def note_save():
    if not login_cat():
        return '{"code":0,"msgs":"未登录"}'
    title   = request.form.get('title', '').strip()
    content = request.form.get('content', '')
    if not title:
        return '{"code":0,"msgs":"标题不能为空"}'

    html_body = markdown.markdown(content, extensions=['extra'])
    full_html = f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>{title}</title>
  <style>
    body{{font-family:'Noto Sans SC',sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;color:#222;line-height:1.8}}
    img{{max-width:100%}}
    pre{{background:#f5f5f5;padding:1rem;border-radius:4px;overflow-x:auto}}
    code{{background:#f5f5f5;padding:.1rem .3rem;border-radius:3px;font-size:.9em}}
    blockquote{{border-left:4px solid #ddd;margin:0;padding-left:1rem;color:#555}}
  </style>
</head>
<body>
  <h1>{title}</h1>
  {html_body}
</body>
</html>"""

    os.makedirs(app.config['NOTE_PATH'], exist_ok=True)
    with open(os.path.join(app.config['NOTE_PATH'], f'{title}.html'), 'w', encoding='utf-8') as f:
        f.write(full_html)

    now = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())
    record = {
        "KeyID":             mark_keyid(),
        "Name":              title,
        "ProductType":       1,
        "ProductTypeRemark": "公开区",
        "Path":              title,
        "Remark":            "",
        "IsDelete":          0,
        "AddTime":           now,
        "AddPerson":         session.get("username", "admin"),
        "ModifyTime":        now
    }
    records = storage.load('noteinfo')
    records.append(record)
    storage.save('noteinfo', records)
    return '{"code":1,"msgs":"保存成功"}'


@app.route('/note/delete', methods=['POST'])
def note_delete():
    if not login_cat():
        return '{"code":0,"msgs":"未登录"}'
    key_id = request.form.get('KeyID')
    records = storage.load('noteinfo')
    for r in records:
        if r['KeyID'] == key_id:
            r['IsDelete'] = 1
    storage.save('noteinfo', records)
    return '{"code":1,"msgs":"删除成功"}'


@app.route('/notes/<filename>')
def cat_notes_file(filename):
    return send_from_directory(app.config['NOTE_PATH'], filename + ".html")


if __name__ == '__main__':
    print(os.getcwd())
    app.run(host='0.0.0.0', port=1111, debug=True)
```

- [ ] **Step 2: 验证语法**

```bash
cd C:/code/github_my_code/record_bolg && python -c "import ast; ast.parse(open('main.py', encoding='utf-8').read()); print('OK')"
```

- [ ] **Step 3: Commit**

```bash
cd C:/code/github_my_code/record_bolg && git add main.py && git commit -m "feat: add logout, note CRUD routes; update photo upload to return JSON"
```

---

## Task 5: 重写 photo.html + photo.js

**Files:**
- Modify: `templates/photo.html`
- Modify: `static/js/photo.js`

- [ ] **Step 1: 完整重写 `templates/photo.html`**

```html
{% extends "base.html" %}
{% block title %}Photo — 羚羊之家{% endblock %}

{% block content %}
<div class="page-header">
  <h1>照片</h1>
</div>

{% for group in value | groupby('ProductTypeRemark') %}
<section class="photo-group">
  <div class="photo-group-header">
    <h2>{{ group.grouper }}</h2>
    <span class="group-count">{{ group.list | length }} 张</span>
  </div>
  <div class="photo-grid">
    {% for item in group.list %}
    <div class="photo-card"
         data-keyid="{{ item.KeyID }}"
         data-name="{{ item.Name }}"
         data-remark="{{ item.Remark | e }}">
      <div class="thumb-wrap"
           onclick="openLightbox('{{ item.KeyID }}', '{{ item.Name }}', this.closest('.photo-card').dataset.remark)">
        <img src="/uploads/{{ item.Name }}" alt="{{ item.Remark | e }}" loading="lazy">
      </div>
      <div class="card-remark">{{ item.Remark or '暂无备注' }}</div>
      <div class="card-actions">
        <button class="icon-btn" title="编辑备注"
          onclick="event.stopPropagation(); openLightbox('{{ item.KeyID }}', '{{ item.Name }}', this.closest('.photo-card').dataset.remark)">✏️</button>
        <button class="icon-btn danger" title="删除"
          onclick="event.stopPropagation(); confirmDelete('{{ item.KeyID }}')">🗑️</button>
      </div>
    </div>
    {% endfor %}
  </div>
</section>
{% else %}
<div class="empty-state">
  <div class="empty-icon">📷</div>
  <div>还没有照片，点击右下角 ＋ 上传</div>
</div>
{% endfor %}

<!-- FAB -->
<button class="fab" data-bs-toggle="modal" data-bs-target="#uploadModal" title="上传照片">＋</button>

<!-- 上传 Modal -->
<div class="modal fade" id="uploadModal" tabindex="-1">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">上传照片</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <form id="uploadForm" enctype="multipart/form-data">
        <div class="modal-body" style="display:flex;flex-direction:column;gap:1rem">
          <div>
            <label style="color:var(--text-muted);font-size:0.82rem;display:block;margin-bottom:.35rem">选择图片 *</label>
            <input type="file" name="file" id="fileInput" accept="image/*" class="form-control-dark" required>
          </div>
          <div>
            <label style="color:var(--text-muted);font-size:0.82rem;display:block;margin-bottom:.35rem">相册分组</label>
            <input type="text" name="group_name" class="form-control-dark" value="图片区一" placeholder="相册分组名称">
          </div>
          <div>
            <label style="color:var(--text-muted);font-size:0.82rem;display:block;margin-bottom:.35rem">备注</label>
            <textarea name="remark" class="form-control-dark" rows="2" placeholder="选填备注"></textarea>
          </div>
          <div id="uploadError" style="color:var(--danger);font-size:0.82rem;display:none"></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-ghost" data-bs-dismiss="modal">取消</button>
          <button type="submit" class="btn-accent" id="uploadBtn">上传</button>
        </div>
      </form>
    </div>
  </div>
</div>

<!-- 大图 Modal -->
<div class="modal fade" id="lightboxModal" tabindex="-1">
  <div class="modal-dialog modal-xl modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="lightboxTitle"></h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body" style="display:flex;gap:1.5rem;align-items:flex-start;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <img id="lightboxImg" src="" alt=""
               style="width:100%;max-height:80vh;object-fit:contain;border-radius:6px;background:#12141e">
        </div>
        <div style="width:240px;flex-shrink:0;display:flex;flex-direction:column;gap:.75rem">
          <label style="color:var(--text-muted);font-size:0.82rem">备注</label>
          <textarea id="lightboxRemark" class="form-control-dark" rows="5"></textarea>
          <button class="btn-accent" onclick="saveRemark()">保存备注</button>
          <div id="remarkMsg" style="font-size:0.82rem;min-height:1rem"></div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- 删除确认 Modal -->
<div class="modal fade" id="deleteModal" tabindex="-1">
  <div class="modal-dialog modal-dialog-centered" style="max-width:360px">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">确认删除</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body" style="color:var(--text-muted)">删除后无法恢复，确认继续？</div>
      <div class="modal-footer">
        <button type="button" class="btn-ghost" data-bs-dismiss="modal">取消</button>
        <button type="button" class="btn-danger" id="confirmDeleteBtn">删除</button>
      </div>
    </div>
  </div>
</div>
{% endblock %}

{% block scripts %}
<script src="{{ url_for('static', filename='js/photo.js') }}"></script>
{% endblock %}
```

- [ ] **Step 2: 完整重写 `static/js/photo.js`**

```javascript
(function () {
  'use strict';

  let currentKeyID = null;
  let lightboxModal = null;
  let deleteModal = null;

  // ── Upload ────────────────────────────────────────────────────────────────
  document.getElementById('uploadForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const btn     = document.getElementById('uploadBtn');
    const errorEl = document.getElementById('uploadError');

    btn.disabled     = true;
    btn.textContent  = '上传中…';
    errorEl.style.display = 'none';

    fetch('/upload_file', { method: 'POST', body: new FormData(this) })
      .then(r => r.json())
      .then(data => {
        if (data.code === 1) {
          window.location.href = '/photo';
        } else {
          errorEl.textContent    = data.msgs || '上传失败';
          errorEl.style.display  = 'block';
          btn.disabled           = false;
          btn.textContent        = '上传';
        }
      })
      .catch(() => {
        errorEl.textContent   = '网络错误，请重试';
        errorEl.style.display = 'block';
        btn.disabled          = false;
        btn.textContent       = '上传';
      });
  });

  // ── Lightbox ──────────────────────────────────────────────────────────────
  window.openLightbox = function (keyid, name, remark) {
    currentKeyID = keyid;
    document.getElementById('lightboxTitle').textContent  = name;
    document.getElementById('lightboxImg').src            = '/uploads/' + name;
    document.getElementById('lightboxRemark').value       = remark || '';
    document.getElementById('remarkMsg').textContent      = '';

    if (!lightboxModal) lightboxModal = new bootstrap.Modal(document.getElementById('lightboxModal'));
    lightboxModal.show();
  };

  window.saveRemark = function () {
    const remark  = document.getElementById('lightboxRemark').value;
    const msgEl   = document.getElementById('remarkMsg');

    fetch('/change_save_remark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ KeyID: currentKeyID, Remark: remark })
    })
      .then(r => r.json())
      .then(data => {
        if (data.Code === 1) {
          msgEl.style.color = 'var(--success)';
          msgEl.textContent = '已保存';
          // 同步卡片显示
          const card = document.querySelector(`.photo-card[data-keyid="${currentKeyID}"]`);
          if (card) {
            card.dataset.remark = remark;
            card.querySelector('.card-remark').textContent = remark || '暂无备注';
          }
        } else {
          msgEl.style.color = 'var(--danger)';
          msgEl.textContent = '保存失败';
        }
      })
      .catch(() => {
        msgEl.style.color = 'var(--danger)';
        msgEl.textContent = '网络错误';
      });
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  window.confirmDelete = function (keyid) {
    currentKeyID = keyid;
    if (!deleteModal) deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
    deleteModal.show();
  };

  document.getElementById('confirmDeleteBtn').addEventListener('click', function () {
    fetch('/delete_photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ KeyID: currentKeyID })
    })
      .then(r => r.json())
      .then(data => {
        if (data.Code === 1) {
          deleteModal.hide();
          const card = document.querySelector(`.photo-card[data-keyid="${currentKeyID}"]`);
          if (card) card.remove();
        }
      });
  });
})();
```

- [ ] **Step 3: 启动服务器访问 `/photo` 验证**

```bash
cd C:/code/github_my_code/record_bolg && python main.py
```

检查项：
- 页面显示深色网格布局
- 悬浮「＋」按钮存在，点击弹出上传 Modal（深色）
- 上传一张图片后页面刷新，图片显示在对应分组下
- 点击缩略图打开大图 Modal，可编辑备注并保存（无刷新，备注更新）
- hover 卡片显示操作遮罩，点击删除按钮弹出确认 Modal，确认后卡片消失

- [ ] **Step 4: Commit**

```bash
cd C:/code/github_my_code/record_bolg && git add templates/photo.html static/js/photo.js && git commit -m "feat: rewrite photo module with grouped cards and BS5 modals"
```

---

## Task 6: 重写 note.html — 笔记列表页

**Files:**
- Modify: `templates/note.html`

- [ ] **Step 1: 完整重写 `templates/note.html`**

```html
{% extends "base.html" %}
{% block title %}Note — 羚羊之家{% endblock %}

{% block content %}
<div class="page-header">
  <h1>笔记</h1>
  <a href="{{ url_for('note_new') }}" class="btn-accent">＋ 新建笔记</a>
</div>

{% if value %}
<div class="note-list">
  {% for item in value %}
  <div class="note-card" id="note-{{ item.KeyID }}">
    <div class="note-title">{{ item.Name }}</div>
    <span class="note-meta">{{ item.AddPerson }} · {{ item.AddTime[:10] if item.AddTime else '' }}</span>
    <a href="{{ url_for('cat_notes_file', filename=item.Name) }}"
       class="btn-ghost" style="font-size:0.82rem" target="_blank">查看</a>
    <button class="note-delete" title="删除"
            onclick="confirmNoteDelete('{{ item.KeyID }}')">×</button>
  </div>
  {% endfor %}
</div>
{% else %}
<div class="empty-state">
  <div class="empty-icon">📝</div>
  <div>还没有笔记，点击右上角新建</div>
</div>
{% endif %}

<!-- 删除确认 Modal -->
<div class="modal fade" id="noteDeleteModal" tabindex="-1">
  <div class="modal-dialog modal-dialog-centered" style="max-width:360px">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">确认删除</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body" style="color:var(--text-muted)">删除后无法恢复，确认继续？</div>
      <div class="modal-footer">
        <button type="button" class="btn-ghost" data-bs-dismiss="modal">取消</button>
        <button type="button" class="btn-danger" id="confirmNoteDeleteBtn">删除</button>
      </div>
    </div>
  </div>
</div>
{% endblock %}

{% block scripts %}
<script>
  let noteDeleteModal = null;
  let deleteNoteKeyID = null;

  function confirmNoteDelete(keyid) {
    deleteNoteKeyID = keyid;
    if (!noteDeleteModal) noteDeleteModal = new bootstrap.Modal(document.getElementById('noteDeleteModal'));
    noteDeleteModal.show();
  }

  document.getElementById('confirmNoteDeleteBtn').addEventListener('click', function () {
    fetch('/note/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ KeyID: deleteNoteKeyID })
    })
    .then(r => r.json())
    .then(data => {
      if (data.code === 1) {
        noteDeleteModal.hide();
        const el = document.getElementById('note-' + deleteNoteKeyID);
        if (el) el.remove();
      }
    });
  });
</script>
{% endblock %}
```

- [ ] **Step 2: 启动服务器访问 `/note` 验证**

```bash
cd C:/code/github_my_code/record_bolg && python main.py
```

检查项：
- 深色卡片列表，「＋ 新建笔记」按钮在右上角
- 无数据时显示 empty state 占位
- 点击 × 弹出确认 Modal，确认后卡片移除

- [ ] **Step 3: Commit**

```bash
cd C:/code/github_my_code/record_bolg && git add templates/note.html && git commit -m "feat: rewrite note list with dark card layout"
```

---

## Task 7: 新建 note_editor.html — 在线编辑器

**Files:**
- Create: `templates/note_editor.html`

- [ ] **Step 1: 创建 `templates/note_editor.html`**

```html
{% extends "base.html" %}
{% block title %}新建笔记 — 羚羊之家{% endblock %}

{% block head %}
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/easymde/dist/easymde.min.css">
{% endblock %}

{% block content %}
<div class="page-header">
  <h1>新建笔记</h1>
  <a href="{{ url_for('note') }}" class="btn-ghost">取消</a>
</div>

<div class="card-dark" style="padding:1.5rem">
  <div style="margin-bottom:1rem">
    <label style="color:var(--text-muted);font-size:0.82rem;display:block;margin-bottom:.35rem">标题 *</label>
    <input type="text" id="noteTitle" class="form-control-dark" placeholder="请输入笔记标题">
    <div id="titleError" style="color:var(--danger);font-size:0.8rem;min-height:1.1rem;margin-top:.25rem"></div>
  </div>
  <div style="margin-bottom:1.25rem">
    <label style="color:var(--text-muted);font-size:0.82rem;display:block;margin-bottom:.35rem">内容</label>
    <textarea id="noteContent"></textarea>
  </div>
  <div style="display:flex;align-items:center;gap:1rem">
    <button class="btn-accent" id="saveBtn" onclick="saveNote()">保存笔记</button>
    <div id="saveMsg" style="font-size:0.82rem;min-height:1rem"></div>
  </div>
</div>
{% endblock %}

{% block scripts %}
<script src="https://cdn.jsdelivr.net/npm/easymde/dist/easymde.min.js"></script>
<script>
  const easyMDE = new EasyMDE({
    element: document.getElementById('noteContent'),
    placeholder: '用 Markdown 写点什么…',
    spellChecker: false,
    autosave: { enabled: false },
    toolbar: [
      'bold', 'italic', 'heading', '|',
      'quote', 'unordered-list', 'ordered-list', '|',
      'link', 'image', '|',
      'preview', 'side-by-side', 'fullscreen'
    ]
  });

  function saveNote() {
    const title      = document.getElementById('noteTitle').value.trim();
    const titleError = document.getElementById('titleError');
    const saveMsg    = document.getElementById('saveMsg');
    const saveBtn    = document.getElementById('saveBtn');

    if (!title) {
      titleError.textContent = '请输入标题';
      return;
    }
    titleError.textContent = '';
    saveBtn.disabled       = true;
    saveBtn.textContent    = '保存中…';
    saveMsg.textContent    = '';

    fetch('/note/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ title: title, content: easyMDE.value() })
    })
    .then(r => r.json())
    .then(data => {
      if (data.code === 1) {
        window.location.href = '/note';
      } else {
        saveMsg.style.color = 'var(--danger)';
        saveMsg.textContent = data.msgs || '保存失败';
        saveBtn.disabled    = false;
        saveBtn.textContent = '保存笔记';
      }
    })
    .catch(() => {
      saveMsg.style.color = 'var(--danger)';
      saveMsg.textContent = '网络错误，请重试';
      saveBtn.disabled    = false;
      saveBtn.textContent = '保存笔记';
    });
  }
</script>
{% endblock %}
```

- [ ] **Step 2: 启动服务器完整验证所有功能**

```bash
cd C:/code/github_my_code/record_bolg && python main.py
```

验证清单：
1. 访问 `http://localhost:1111/login`：深色卡片，错误密码显示红色提示，正确后跳 /photo
2. 访问 `/photo`：深色网格，按分组显示，FAB 可上传，点击卡片弹大图 Modal，可保存备注，hover 显示删除按钮，确认后卡片消失
3. 访问 `/note`：深色卡片列表，「＋ 新建笔记」跳转编辑器
4. 访问 `/note/new`：EasyMDE 编辑器深色主题，写内容后保存，跳回 /note 并出现新卡片，「查看」链接打开 HTML 文件
5. 导航栏：当前页链接有蓝紫下划线高亮，「退出」清空 session 跳登录页
6. 手机尺寸（<640px）：导航折叠为汉堡菜单，照片变 2 列

- [ ] **Step 3: Commit**

```bash
cd C:/code/github_my_code/record_bolg && git add templates/note_editor.html && git commit -m "feat: add note editor with EasyMDE and dark theme"
```
