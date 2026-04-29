# 笔记详情页优化 + 时间轴视图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为笔记详情页添加 dark 主题与内联编辑功能，并在照片/笔记页各自加入时间轴视图切换。

**Architecture:** 方案 A — Flask 模板渲染。`cat_notes_file` 改为 Jinja2 渲染（继承 base.html），新增 `note_update` 路由；时间轴视图为纯客户端 JS，从模板已有的 `value` 数据构建，通过 `localStorage` 记住视图偏好。

**Tech Stack:** Flask, Jinja2, Bootstrap 5, EasyMDE, Python-Markdown, vanilla JS

---

## 文件改动清单

| 文件 | 类型 | 职责 |
|------|------|------|
| `static/CSS/dark.css` | 修改 | 新增 `.view-toggle`、`.timeline-*`、`.note-body` 样式类 |
| `templates/note_detail.html` | 新建 | 笔记详情页（读模式 + 内联编辑模式） |
| `main.py` | 修改 | `note_save` 存 Content；`cat_notes_file` 改为渲染；新增 `note_update` |
| `templates/note.html` | 修改 | 增加视图切换按钮 + 时间轴容器 + 时间轴 JS |
| `templates/photo.html` | 修改 | 增加视图切换按钮 + 时间轴容器 + 时间轴 JS |

---

## Task 1: CSS — 新增样式类

**Files:**
- Modify: `static/CSS/dark.css`（在文件末尾追加）

- [ ] **Step 1: 追加样式到 dark.css**

在 `static/CSS/dark.css` 文件末尾追加以下内容：

```css
/* ── View Toggle ── */
.view-toggle {
  display: flex;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}
.view-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  padding: 0.35rem 0.75rem;
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
}
.view-btn.active {
  background: var(--accent);
  color: #fff;
}
.view-btn:not(.active):hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

/* ── Timeline ── */
.timeline {
  display: none;
  flex-direction: column;
  gap: 0;
}
.timeline.visible { display: flex; }

.timeline-year-label {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  padding: 0.2rem 0.75rem;
  border-radius: 20px;
  margin-bottom: 1.25rem;
  align-self: flex-start;
}
.timeline-year-label .tl-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  display: inline-block;
}
.timeline-year-label .tl-year {
  color: var(--accent);
  font-size: 0.78rem;
  font-weight: 600;
}

.timeline-item {
  display: flex;
  gap: 0.9rem;
  align-items: flex-start;
  margin-bottom: 1.1rem;
}
.timeline-spine {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 18px;
  flex-shrink: 0;
  padding-top: 0.2rem;
}
.timeline-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--bg-base);
  box-shadow: 0 0 0 2px var(--accent);
  flex-shrink: 0;
}
.timeline-dot.green {
  background: var(--success);
  box-shadow: 0 0 0 2px var(--success);
}
.timeline-line {
  width: 2px;
  flex: 1;
  min-height: 40px;
  background: linear-gradient(var(--accent), var(--border));
  margin-top: 0.3rem;
}
.timeline-line.green {
  background: linear-gradient(var(--success), var(--border));
}
.timeline-body { flex: 1; min-width: 0; }
.timeline-date {
  color: var(--text-muted);
  font-size: 0.72rem;
  margin-bottom: 0.3rem;
}
.timeline-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.7rem 0.9rem;
  transition: border-color 0.15s;
}
.timeline-card:hover { border-color: var(--accent); }
.timeline-card-title {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}
.timeline-card-meta {
  font-size: 0.72rem;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.timeline-thumb-strip {
  display: flex;
  gap: 0.35rem;
  margin-top: 0.5rem;
  flex-wrap: wrap;
}
.timeline-thumb {
  width: 42px;
  height: 42px;
  border-radius: 4px;
  object-fit: cover;
  cursor: pointer;
  border: 1px solid var(--border);
  transition: border-color 0.15s;
}
.timeline-thumb:hover { border-color: var(--accent); }
.timeline-thumb-more {
  width: 42px;
  height: 42px;
  border-radius: 4px;
  background: var(--bg-hover);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  color: var(--text-muted);
}

/* ── Note detail body ── */
.note-body { line-height: 1.9; color: var(--text-primary); }
.note-body h1 { font-size: 1.45rem; margin: 1.5rem 0 0.7rem; color: var(--text-primary); font-weight: 700; }
.note-body h2 { font-size: 1.2rem; margin: 1.3rem 0 0.6rem; color: var(--text-primary); font-weight: 600; }
.note-body h3 { font-size: 1.05rem; margin: 1.1rem 0 0.5rem; color: var(--text-primary); font-weight: 600; }
.note-body h4,
.note-body h5,
.note-body h6 { font-size: 0.95rem; margin: 1rem 0 0.4rem; color: var(--text-primary); font-weight: 600; }
.note-body p { margin: 0 0 0.9rem; }
.note-body ul,
.note-body ol { margin: 0 0 0.9rem; padding-left: 1.4rem; }
.note-body li { margin-bottom: 0.3rem; }
.note-body blockquote {
  border-left: 3px solid var(--accent);
  margin: 1rem 0;
  padding: 0.6rem 1rem;
  background: var(--bg-surface);
  border-radius: 0 6px 6px 0;
  color: var(--text-muted);
  font-style: italic;
}
.note-body code {
  background: var(--bg-surface);
  color: var(--accent);
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  font-size: 0.88em;
  font-family: 'Courier New', monospace;
}
.note-body pre {
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1rem;
  overflow-x: auto;
  margin: 0 0 1rem;
}
.note-body pre code {
  background: none;
  color: var(--text-primary);
  padding: 0;
  font-size: 0.9em;
}
.note-body a { color: var(--accent); text-decoration: none; }
.note-body a:hover { color: var(--accent-hover); text-decoration: underline; }
.note-body hr { border: none; border-top: 1px solid var(--border); margin: 1.5rem 0; }
.note-body img { max-width: 100%; border-radius: 6px; }
.note-body table { border-collapse: collapse; width: 100%; margin: 0 0 1rem; font-size: 0.88rem; }
.note-body th,
.note-body td { border: 1px solid var(--border); padding: 0.5rem 0.75rem; }
.note-body th { background: var(--bg-surface); font-weight: 600; }
```

- [ ] **Step 2: 启动服务器验证样式加载无误**

```bash
python main.py
```

在浏览器打开 `http://localhost:1111`，打开 DevTools → Console，确认无 CSS 错误。

- [ ] **Step 3: 提交**

```bash
git add static/CSS/dark.css
git commit -m "style: add view-toggle, timeline, and note-body CSS classes"
```

---

## Task 2: 创建 note_detail.html 模板

**Files:**
- Create: `templates/note_detail.html`

- [ ] **Step 1: 新建模板文件**

创建 `templates/note_detail.html`，完整内容如下：

```html
{% extends "base.html" %}
{% block title %}{{ item.Name }} — 羚羊之家{% endblock %}

{% block head %}
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/easymde/dist/easymde.min.css">
{% endblock %}

{% block content %}
<div class="page-header">
  <a href="{{ url_for('note') }}" class="btn-ghost" style="font-size:0.82rem">← 返回笔记列表</a>
  <div id="header-btns">
    {% if item.get('Content') %}
    <button class="btn-ghost" id="edit-btn" onclick="enterEditMode()" style="color:var(--accent)">✏️ 编辑</button>
    {% endif %}
  </div>
</div>

<!-- 读模式 -->
<div id="read-mode">
  <div style="margin-bottom:1.5rem;padding-bottom:1.25rem;border-bottom:1px solid var(--border)">
    <h1 style="font-size:1.6rem;font-weight:700;color:var(--text-primary);margin:0 0 0.6rem;line-height:1.35">
      {{ item.Name }}
    </h1>
    <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
      <span style="font-size:0.78rem;color:var(--text-muted)">{{ item.AddPerson }}</span>
      <span style="color:var(--border)">·</span>
      <span style="font-size:0.78rem;color:var(--text-muted)">{{ item.AddTime[:10] if item.AddTime else '' }}</span>
      <span style="color:var(--border)">·</span>
      <span style="background:var(--bg-surface);border:1px solid var(--border);padding:0.1rem 0.5rem;border-radius:10px;font-size:0.72rem;color:var(--text-muted)">
        {{ item.ProductTypeRemark }}
      </span>
    </div>
  </div>
  <div class="note-body" id="note-body">{{ html_body | safe }}</div>
</div>

<!-- 编辑模式（默认隐藏） -->
<div id="edit-mode" style="display:none">
  <div style="margin-bottom:0.85rem">
    <label style="color:var(--text-muted);font-size:0.8rem;display:block;margin-bottom:.3rem">标题</label>
    <input type="text" id="edit-title" class="form-control-dark"
           style="font-size:1rem;font-weight:600" value="{{ item.Name }}">
  </div>
  <div style="margin-bottom:0.5rem">
    <label style="color:var(--text-muted);font-size:0.8rem;display:block;margin-bottom:.3rem">内容</label>
    <textarea id="edit-content">{{ item.get('Content', '') }}</textarea>
  </div>
  <div id="edit-msg" style="font-size:0.8rem;min-height:1.1rem;color:var(--danger)"></div>
</div>
{% endblock %}

{% block scripts %}
<script src="https://cdn.jsdelivr.net/npm/easymde/dist/easymde.min.js"></script>
<script>
  const NOTE_KEYID = '{{ item.KeyID }}';
  let easyMDE = null;

  function enterEditMode() {
    document.getElementById('read-mode').style.display = 'none';
    document.getElementById('edit-mode').style.display = 'block';
    document.getElementById('header-btns').innerHTML =
      '<button class="btn-ghost" onclick="exitEditMode()">取消</button>' +
      '<button class="btn-accent" onclick="saveEdit()" style="margin-left:.5rem">保存</button>';
    if (!easyMDE) {
      easyMDE = new EasyMDE({
        element: document.getElementById('edit-content'),
        spellChecker: false,
        autosave: { enabled: false },
        toolbar: [
          'bold', 'italic', 'heading', '|',
          'quote', 'unordered-list', 'ordered-list', '|',
          'link', 'image', '|',
          'preview', 'side-by-side', 'fullscreen'
        ]
      });
    }
  }

  function exitEditMode() {
    document.getElementById('edit-mode').style.display = 'none';
    document.getElementById('read-mode').style.display = 'block';
    document.getElementById('header-btns').innerHTML =
      '<button class="btn-ghost" id="edit-btn" onclick="enterEditMode()" style="color:var(--accent)">✏️ 编辑</button>';
  }

  function saveEdit() {
    const title = document.getElementById('edit-title').value.trim();
    const msgEl = document.getElementById('edit-msg');
    if (!title) {
      msgEl.textContent = '标题不能为空';
      return;
    }
    msgEl.textContent = '';

    fetch('/note/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        KeyID:   NOTE_KEYID,
        title:   title,
        content: easyMDE.value()
      })
    })
    .then(r => r.json())
    .then(data => {
      if (data.code === 1) {
        window.location.reload();
      } else {
        msgEl.textContent = data.msgs || '保存失败';
      }
    })
    .catch(() => {
      msgEl.textContent = '网络错误，请重试';
    });
  }
</script>
{% endblock %}
```

- [ ] **Step 2: 提交**

```bash
git add templates/note_detail.html
git commit -m "feat: add note_detail.html template with read/edit modes"
```

---

## Task 3: 更新 main.py — 路由与数据层

**Files:**
- Modify: `main.py`

需要做三处改动：
1. 顶部添加 `import re`
2. `note_save()` 的 record 字典加 `"Content"` 字段
3. `cat_notes_file()` 改为 Flask 渲染
4. 新增 `note_update()` 路由

- [ ] **Step 1: 在 main.py 顶部添加 `import re`**

在第 10 行（`import random` 之后）插入：

```python
import re
```

- [ ] **Step 2: 在 `note_save()` 的 record 字典中加 Content 字段**

找到 `main.py` 中 `note_save` 函数内的 record 字典（约第 225 行），当前内容：

```python
    record = {
        "KeyID":             mark_keyid(),
        "Name":              title,
        "ProductType":       1,
        "ProductTypeRemark": "公开区",
        "Path":              safe_title,
        "Remark":            "",
        "IsDelete":          0,
        "AddTime":           now,
        "AddPerson":         session.get("username", "admin"),
        "ModifyTime":        now
    }
```

改为：

```python
    record = {
        "KeyID":             mark_keyid(),
        "Name":              title,
        "ProductType":       1,
        "ProductTypeRemark": "公开区",
        "Path":              safe_title,
        "Content":           content,
        "Remark":            "",
        "IsDelete":          0,
        "AddTime":           now,
        "AddPerson":         session.get("username", "admin"),
        "ModifyTime":        now
    }
```

- [ ] **Step 3: 替换 `cat_notes_file` 路由**

找到约第 258 行的旧路由：

```python
@app.route('/notes/<filename>')
def cat_notes_file(filename):
    return send_from_directory(app.config['NOTE_PATH'], filename + ".html")
```

替换为：

```python
@app.route('/notes/<filename>')
def cat_notes_file(filename):
    if not login_cat():
        return redirect(url_for('login'))
    records = storage.load('noteinfo')
    item = next(
        (r for r in records if r.get('Path') == filename and r.get('IsDelete', 0) == 0),
        None
    )
    if not item:
        return '笔记不存在', 404
    content = item.get('Content', '')
    if content:
        html_body = markdown.markdown(content, extensions=['extra'])
    else:
        filepath = os.path.join(app.config['NOTE_PATH'], filename + '.html')
        if os.path.exists(filepath):
            raw = open(filepath, encoding='utf-8').read()
            m = re.search(r'<body[^>]*>(.*?)</body>', raw, re.DOTALL)
            html_body = m.group(1).strip() if m else raw
        else:
            html_body = '<p style="color:var(--text-muted)">笔记文件不存在</p>'
    return render_template('note_detail.html', item=item, html_body=html_body)
```

- [ ] **Step 4: 在 `cat_notes_file` 路由之后新增 `note_update` 路由**

在 `cat_notes_file` 函数结束后、`if __name__ == '__main__':` 之前插入：

```python
@app.route('/note/update', methods=['POST'])
def note_update():
    if not login_cat():
        return '{"code":0,"msgs":"未登录"}'
    key_id  = request.form.get('KeyID', '').strip()
    title   = request.form.get('title', '').strip()
    content = request.form.get('content', '')
    if not key_id or not title:
        return '{"code":0,"msgs":"参数缺失"}'
    escaped_title = html_module.escape(title)
    records = storage.load('noteinfo')
    record = next(
        (r for r in records if r['KeyID'] == key_id and r.get('IsDelete', 0) == 0),
        None
    )
    if not record:
        return '{"code":0,"msgs":"笔记不存在"}'
    path      = record['Path']
    html_body = markdown.markdown(content, extensions=['extra'])
    full_html = f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>{escaped_title}</title>
  <style>
    body{{font-family:'Noto Sans SC',sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;color:#222;line-height:1.8}}
    img{{max-width:100%}}
    pre{{background:#f5f5f5;padding:1rem;border-radius:4px;overflow-x:auto}}
    code{{background:#f5f5f5;padding:.1rem .3rem;border-radius:3px;font-size:.9em}}
    blockquote{{border-left:4px solid #ddd;margin:0;padding-left:1rem;color:#555}}
  </style>
</head>
<body>
  <h1>{escaped_title}</h1>
  {html_body}
</body>
</html>"""
    filepath = os.path.join(app.config['NOTE_PATH'], path + '.html')
    os.makedirs(app.config['NOTE_PATH'], exist_ok=True)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(full_html)
    now = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())
    record['Name']       = title
    record['Content']    = content
    record['ModifyTime'] = now
    storage.save('noteinfo', records)
    return '{"code":1,"msgs":"保存成功"}'
```

- [ ] **Step 5: 启动服务器验证笔记详情页**

```bash
python main.py
```

1. 访问 `http://localhost:1111/note`，点击任意笔记的"查看"链接
2. 确认页面有导航栏、标题、正文，样式与全站一致
3. 若该笔记有 `Content` 字段（新建笔记），确认右上角显示"✏️ 编辑"按钮
4. 点击"✏️ 编辑"，确认切换为 EasyMDE 编辑模式
5. 修改内容后点击"保存"，确认刷新后内容已更新
6. 点击"取消"，确认恢复读模式、内容未变

- [ ] **Step 6: 提交**

```bash
git add main.py
git commit -m "feat: add note_update route; note_save stores Content; render note detail via Flask"
```

---

## Task 4: 笔记页时间轴视图

**Files:**
- Modify: `templates/note.html`

- [ ] **Step 1: 替换 note.html 全部内容**

完整替换 `templates/note.html` 为以下内容：

```html
{% extends "base.html" %}
{% block title %}Note — 羚羊之家{% endblock %}

{% block content %}
<div class="page-header">
  <h1>笔记</h1>
  <div style="display:flex;align-items:center;gap:0.5rem">
    <div class="view-toggle">
      <button class="view-btn active" data-view="list" onclick="switchNoteView('list')">≡ 列表</button>
      <button class="view-btn" data-view="timeline" onclick="switchNoteView('timeline')">○ 时间轴</button>
    </div>
    <a href="{{ url_for('note_new') }}" class="btn-accent">＋ 新建笔记</a>
  </div>
</div>

<!-- 列表视图 -->
<div id="note-list-view">
{% if value %}
<div class="note-list">
  {% for item in value %}
  <div class="note-card" id="note-{{ item.KeyID }}">
    <div class="note-title">{{ item.Name }}</div>
    <span class="note-meta">{{ item.AddPerson }} · {{ item.AddTime[:10] if item.AddTime else '' }}</span>
    <a href="{{ url_for('cat_notes_file', filename=item.Path) }}"
       class="btn-ghost" style="font-size:0.82rem">查看</a>
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
</div>

<!-- 时间轴视图 -->
<div id="note-timeline" class="timeline"></div>

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
  // ── Delete ────────────────────────────────────────────────────────────────
  let noteDeleteModal = null;
  let deleteNoteKeyID = null;

  function confirmNoteDelete(keyid) {
    deleteNoteKeyID = keyid;
    if (!noteDeleteModal)
      noteDeleteModal = new bootstrap.Modal(document.getElementById('noteDeleteModal'));
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
        // 同时从列表视图和时间轴视图移除
        const listEl = document.getElementById('note-' + deleteNoteKeyID);
        if (listEl) listEl.remove();
        const tlEl = document.getElementById('tl-note-' + deleteNoteKeyID);
        if (tlEl) tlEl.remove();
      }
    });
  });

  // ── Timeline ──────────────────────────────────────────────────────────────
  const NOTE_DATA = {{ value | tojson }};

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildNoteTimeline() {
    const container = document.getElementById('note-timeline');
    container.innerHTML = '';

    const sorted = NOTE_DATA.slice().sort(function (a, b) {
      return (b.AddTime || '').localeCompare(a.AddTime || '');
    });

    if (sorted.length === 0) {
      container.innerHTML =
        '<div class="empty-state"><div class="empty-icon">📝</div><div>还没有笔记</div></div>';
      return;
    }

    var currentYear = null;

    sorted.forEach(function (item, index) {
      var date  = item.AddTime ? item.AddTime.slice(0, 10) : '';
      var year  = date.slice(0, 4);
      var month = parseInt(date.slice(5, 7), 10);
      var day   = parseInt(date.slice(8, 10), 10);
      var isLast = index === sorted.length - 1;

      if (year && year !== currentYear) {
        currentYear = year;
        var yearEl = document.createElement('div');
        yearEl.className = 'timeline-year-label';
        yearEl.innerHTML =
          '<span class="tl-dot"></span><span class="tl-year">' + escHtml(year) + '</span>';
        container.appendChild(yearEl);
      }

      var itemEl = document.createElement('div');
      itemEl.className = 'timeline-item';
      itemEl.id = 'tl-note-' + item.KeyID;
      itemEl.innerHTML =
        '<div class="timeline-spine">' +
          '<div class="timeline-dot green"></div>' +
          (isLast ? '' : '<div class="timeline-line green"></div>') +
        '</div>' +
        '<div class="timeline-body">' +
          '<div class="timeline-date">' + month + '月 ' + day + '日</div>' +
          '<div class="timeline-card">' +
            '<div class="timeline-card-title">' + escHtml(item.Name) + '</div>' +
            '<div class="timeline-card-meta">' +
              '<span>' + escHtml(item.AddPerson || '') + '</span>' +
              '<span>·</span>' +
              '<span>' + escHtml(item.ProductTypeRemark || '') + '</span>' +
              '<a href="/notes/' + encodeURIComponent(item.Path) + '" ' +
                 'style="margin-left:auto;color:var(--accent);font-size:0.72rem;text-decoration:none">' +
                 '查看 →</a>' +
              '<button style="background:none;border:none;color:var(--text-muted);cursor:pointer;' +
                       'font-size:1rem;padding:0;line-height:1" ' +
                       'onclick="confirmNoteDelete(\'' + item.KeyID + '\')" title="删除">×</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      container.appendChild(itemEl);
    });
  }

  function switchNoteView(view) {
    var listEl     = document.getElementById('note-list-view');
    var timelineEl = document.getElementById('note-timeline');
    document.querySelectorAll('.view-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === view);
    });
    if (view === 'timeline') {
      listEl.style.display = 'none';
      timelineEl.classList.add('visible');
      if (!timelineEl.dataset.built) {
        buildNoteTimeline();
        timelineEl.dataset.built = '1';
      }
    } else {
      listEl.style.display = '';
      timelineEl.classList.remove('visible');
    }
    localStorage.setItem('note_view', view);
  }

  // 恢复上次视图偏好
  (function () {
    var saved = localStorage.getItem('note_view');
    if (saved === 'timeline') switchNoteView('timeline');
  })();
</script>
{% endblock %}
```

- [ ] **Step 2: 验证笔记页时间轴**

```bash
python main.py
```

1. 访问 `http://localhost:1111/note`
2. 点击"○ 时间轴"按钮 → 确认切换为时间轴视图，笔记按日期倒序排列
3. 点击"≡ 列表"按钮 → 确认切回列表视图
4. 刷新页面 → 确认视图偏好已通过 localStorage 恢复
5. 在时间轴视图中点击"查看 →"链接 → 确认跳转到笔记详情页
6. 在时间轴视图中点击"×"删除按钮 → 确认删除后时间轴节点消失

- [ ] **Step 3: 提交**

```bash
git add templates/note.html
git commit -m "feat: add timeline view toggle to note list page"
```

---

## Task 5: 照片页时间轴视图

**Files:**
- Modify: `templates/photo.html`

- [ ] **Step 1: 替换 photo.html 全部内容**

完整替换 `templates/photo.html` 为以下内容：

```html
{% extends "base.html" %}
{% block title %}Photo — 羚羊之家{% endblock %}

{% block content %}
<div class="page-header">
  <h1>照片</h1>
  <div class="view-toggle">
    <button class="view-btn active" data-view="grid" onclick="switchPhotoView('grid')">⊞ 网格</button>
    <button class="view-btn" data-view="timeline" onclick="switchPhotoView('timeline')">≡ 时间轴</button>
  </div>
</div>

<!-- 网格视图 -->
<div id="photo-grid-view">
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
           onclick="openLightbox('{{ item.KeyID }}', '{{ item.Name | e }}', this.closest('.photo-card').dataset.remark)">
        <img src="/uploads/{{ item.Name }}" alt="{{ item.Remark | e }}" loading="lazy">
      </div>
      <div class="card-remark">{{ item.Remark or '暂无备注' }}</div>
      <div class="card-actions">
        <button class="icon-btn" title="编辑备注"
          onclick="event.stopPropagation(); openLightbox('{{ item.KeyID }}', '{{ item.Name | e }}', this.closest('.photo-card').dataset.remark)">✏️</button>
        <button class="icon-btn danger" title="删除"
          onclick="event.stopPropagation(); confirmDelete('{{ item.KeyID }}')">🗑️</button>
      </div>
    </div>
    {% endfor %}
  </div>
</section>
{% else %}
<div class="empty-state" id="photo-empty">
  <div class="empty-icon">📷</div>
  <div>还没有照片，点击右下角 ＋ 上传</div>
</div>
{% endfor %}
</div>

<!-- 时间轴视图 -->
<div id="photo-timeline" class="timeline"></div>

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
<script>
  // ── Timeline ──────────────────────────────────────────────────────────────
  const PHOTO_DATA = {{ value | tojson }};

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildPhotoTimeline() {
    var container = document.getElementById('photo-timeline');
    container.innerHTML = '';

    var sorted = PHOTO_DATA.slice().sort(function (a, b) {
      return (b.AddTime || '').localeCompare(a.AddTime || '');
    });

    if (sorted.length === 0) {
      container.innerHTML =
        '<div class="empty-state"><div class="empty-icon">📷</div><div>还没有照片</div></div>';
      return;
    }

    // 按日期分组
    var groups = {};
    sorted.forEach(function (item) {
      var date = item.AddTime ? item.AddTime.slice(0, 10) : '未知日期';
      if (!groups[date]) groups[date] = [];
      groups[date].push(item);
    });

    var dates = Object.keys(groups).sort(function (a, b) { return b.localeCompare(a); });
    var currentYear = null;

    dates.forEach(function (date, index) {
      var items  = groups[date];
      var year   = date.slice(0, 4);
      var month  = parseInt(date.slice(5, 7), 10);
      var day    = parseInt(date.slice(8, 10), 10);
      var isLast = index === dates.length - 1;

      if (year !== currentYear) {
        currentYear = year;
        var yearEl = document.createElement('div');
        yearEl.className = 'timeline-year-label';
        yearEl.innerHTML =
          '<span class="tl-dot"></span><span class="tl-year">' + escHtml(year) + '</span>';
        container.appendChild(yearEl);
      }

      // 分组名（去重）
      var groupNames = items
        .map(function (i) { return i.ProductTypeRemark || ''; })
        .filter(function (v, i, a) { return v && a.indexOf(v) === i; })
        .join(' · ');

      // 缩略图（最多 4 张）
      var thumbStrip = document.createElement('div');
      thumbStrip.className = 'timeline-thumb-strip';
      items.slice(0, 4).forEach(function (item) {
        var img = document.createElement('img');
        img.className = 'timeline-thumb';
        img.src = '/uploads/' + item.Name;
        img.alt = item.Remark || '';
        img.onclick = function () {
          openLightbox(item.KeyID, item.Name, item.Remark || '');
        };
        thumbStrip.appendChild(img);
      });
      if (items.length > 4) {
        var more = document.createElement('div');
        more.className = 'timeline-thumb-more';
        more.textContent = '+' + (items.length - 4);
        thumbStrip.appendChild(more);
      }

      var metaText = items.length + ' 张';
      if (items[0].Remark) metaText += ' · ' + escHtml(items[0].Remark);

      var itemEl = document.createElement('div');
      itemEl.className = 'timeline-item';
      itemEl.innerHTML =
        '<div class="timeline-spine">' +
          '<div class="timeline-dot"></div>' +
          (isLast ? '' : '<div class="timeline-line"></div>') +
        '</div>' +
        '<div class="timeline-body">' +
          '<div class="timeline-date">' + month + '月 ' + day + '日</div>' +
          '<div class="timeline-card" id="tlcard-' + date + '">' +
            '<div class="timeline-card-title">' + escHtml(groupNames) + '</div>' +
            '<div class="timeline-card-meta">' + metaText + '</div>' +
          '</div>' +
        '</div>';

      // 将缩略图插入卡片
      var card = itemEl.querySelector('.timeline-card');
      card.appendChild(thumbStrip);
      container.appendChild(itemEl);
    });
  }

  function switchPhotoView(view) {
    var gridEl     = document.getElementById('photo-grid-view');
    var timelineEl = document.getElementById('photo-timeline');
    document.querySelectorAll('.view-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === view);
    });
    if (view === 'timeline') {
      gridEl.style.display = 'none';
      timelineEl.classList.add('visible');
      if (!timelineEl.dataset.built) {
        buildPhotoTimeline();
        timelineEl.dataset.built = '1';
      }
    } else {
      gridEl.style.display = '';
      timelineEl.classList.remove('visible');
    }
    localStorage.setItem('photo_view', view);
  }

  // 恢复上次视图偏好
  (function () {
    var saved = localStorage.getItem('photo_view');
    if (saved === 'timeline') switchPhotoView('timeline');
  })();
</script>
{% endblock %}
```

- [ ] **Step 2: 验证照片页时间轴**

```bash
python main.py
```

1. 访问 `http://localhost:1111/photo`
2. 点击"≡ 时间轴"按钮 → 确认网格视图隐藏，时间轴出现，照片按日期倒序分组
3. 确认每个节点显示日期、分组名、照片数量、缩略图行
4. 点击缩略图 → 确认触发原有 lightbox 弹窗
5. 点击"⊞ 网格"按钮 → 确认切回网格视图
6. 刷新页面 → 确认 localStorage 恢复时间轴视图（若上次选的是时间轴）
7. 测试上传新照片后刷新，确认新照片出现在时间轴最顶部

- [ ] **Step 3: 提交**

```bash
git add templates/photo.html
git commit -m "feat: add timeline view toggle to photo page"
```

---

## 整体验证清单

完成所有任务后的最终检查：

- [ ] 笔记详情页有导航栏，样式与全站一致
- [ ] 新建笔记后，详情页显示"✏️ 编辑"按钮；旧笔记无编辑按钮
- [ ] 编辑保存后内容更新，标题修改时原文件不被重命名
- [ ] 照片页：网格/时间轴切换正常，缩略图点击触发 lightbox
- [ ] 笔记页：列表/时间轴切换正常，删除操作在两个视图都生效
- [ ] localStorage 正确记住并恢复视图偏好
- [ ] 手机窄屏（375px）下时间轴布局不溢出
