# -*- coding: utf-8 -*-
from flask import Flask, redirect, url_for, render_template, session, request, send_from_directory, send_file, jsonify
from werkzeug.utils import secure_filename
from io import BytesIO
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.middleware.proxy_fix import ProxyFix
from Module import MPhotoInfo, MnoteInfo, MTravelInfo
from Sqls import storage
import markdown
import html as html_module
import requests
import hmac
import threading
import os
import time
import random
import re

UPLOAD_FOLDER = os.path.join(os.getcwd(), 'photo')
NOTE_PATH     = os.path.join(os.getcwd(), 'note')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
MAX_CONTENT_LENGTH = 20 * 1024 * 1024   # 上传体积上限 20MB，防止超大文件 DoS

app = Flask(__name__)
# 部署在 nginx/IIS 反向代理之后：只信任 1 层代理传来的 X-Forwarded-*，
# 使 request.remote_addr 变为真实客户端 IP（限流依赖它，且不可被随意伪造）。
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

# SECRET_KEY 必须来自环境变量。缺失时用随机密钥兜底（重启后登录失效），
# 绝不回退到硬编码默认值——公开仓库里的固定密钥会被用来伪造管理员 session。
_secret = os.environ.get("SECRET_KEY")
if not _secret:
    _secret = os.urandom(32).hex()
    print("[安全警告] 未设置 SECRET_KEY 环境变量，已生成临时随机密钥；"
          "重启后登录状态会失效。生产环境请配置固定且保密的 SECRET_KEY。")
app.secret_key = _secret
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['NOTE_PATH']     = NOTE_PATH
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH
app.jinja_env.globals['NOTE_MAX_CHILD_DEPTH'] = MnoteInfo.MAX_CHILD_DEPTH

ADMIN_ACCOUNT  = os.environ.get("ADMIN_ACCOUNT", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
if not ADMIN_PASSWORD:
    ADMIN_PASSWORD = "admin@717613"
    print("[安全警告] 未设置 ADMIN_PASSWORD 环境变量，正在使用源码内置默认密码。"
          "该密码已随公开仓库泄露，请立即改用环境变量设置新密码。")

# 高德地图 JS API 配置（本地 config.py 已被 gitignore，环境变量优先）
try:
    import config
    AMAP_KEY      = getattr(config, "AMAP_KEY", "")
    AMAP_SECURITY = getattr(config, "AMAP_SECURITY", "")
except ImportError:
    AMAP_KEY      = os.environ.get("AMAP_KEY", "")
    AMAP_SECURITY = os.environ.get("AMAP_SECURITY", "")

# ── 登录限流 / 失败锁定（进程内内存实现，适用于单 worker） ─────────────────
_login_lock      = threading.Lock()
_login_attempts  = {}          # ip -> {"fails": int, "ts": epoch, "until": epoch}
LOGIN_MAX_FAILS  = 5           # 窗口内允许的最大失败次数
LOGIN_WINDOW     = 300         # 失败计数滑动窗口（秒）
LOGIN_LOCK_SECS  = 900         # 触发上限后的锁定时长（秒）


def _client_ip():
    return request.remote_addr or "unknown"


def _login_allowed(ip):
    """返回 (是否允许尝试, 剩余锁定秒数)。"""
    now = time.time()
    with _login_lock:
        rec = _login_attempts.get(ip)
        if rec and rec["until"] > now:
            return False, int(rec["until"] - now)
        return True, 0


def _login_fail(ip):
    now = time.time()
    with _login_lock:
        rec = _login_attempts.get(ip)
        if not rec or now - rec.get("ts", 0) > LOGIN_WINDOW:
            rec = {"fails": 0, "ts": now, "until": 0}
        rec["fails"] += 1
        rec["ts"] = now
        if rec["fails"] >= LOGIN_MAX_FAILS:
            rec["until"] = now + LOGIN_LOCK_SECS   # 达到上限：锁定并清零计数
            rec["fails"] = 0
        _login_attempts[ip] = rec


def _login_reset(ip):
    with _login_lock:
        _login_attempts.pop(ip, None)


def mark_keyid():
    a = time.strftime("%Y%m%d%H%M%S", time.localtime())
    b = str(random.randint(1000, 9999))
    return a + b


def login_cat():
    return session.get("useraccount") == ADMIN_ACCOUNT


# ── Index ──────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return redirect(url_for('photo'))


# ── Auth ───────────────────────────────────────────────────────────────────

@app.route('/login', methods=['GET', 'POST'])
def login():
    return render_template('login.html')


@app.route('/login_confirm', methods=['POST'])
def login_confirm():
    ip = _client_ip()
    allowed, wait = _login_allowed(ip)
    if not allowed:
        return jsonify({"code": 0, "msgs": f"尝试过于频繁，请 {wait} 秒后再试"})
    useraccount = request.form.get('useraccount', '')
    password    = request.form.get('password', '')
    # 恒定时间比较，避免通过响应耗时侧信道推断账号/密码
    ok = (hmac.compare_digest(useraccount, ADMIN_ACCOUNT)
          and hmac.compare_digest(password, ADMIN_PASSWORD))
    if ok:
        _login_reset(ip)
        session["useraccount"] = useraccount
        session["username"]    = useraccount
        return jsonify({"code": 1, "msgs": "登陆成功"})
    _login_fail(ip)
    return jsonify({"code": 0, "msgs": "用户名或密码错误"})


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
        p.AddTime           = item.get('AddTime', '')
        value_list.append(p)
    return render_template('photo.html', value=value_list, photo_data=records)


@app.route('/delete_photo', methods=['POST'])
def delete_photo():
    if not login_cat():
        return '{"code":0,"msgs":"未登录"}'
    key_id = request.form.get("KeyID")
    if not key_id:
        return '{"code":0,"msgs":"缺少KeyID"}'
    records = storage.load('photoinfo')
    for r in records:
        if r['KeyID'] == key_id:
            r['IsDelete'] = 1
    storage.save('photoinfo', records)
    return '{"code":1,"msgs":"删除成功！"}'


@app.route('/change_save_remark', methods=['POST'])
def change_save_remark():
    if not login_cat():
        return '{"code":0,"msgs":"未登录"}'
    key_id = request.form.get("KeyID")
    remark = str(request.form.get("Remark", "")).strip()
    records = storage.load('photoinfo')
    for r in records:
        if r['KeyID'] == key_id:
            r['Remark'] = remark
    storage.save('photoinfo', records)
    return '{"code":1,"msgs":"更新成功！"}'


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
    safe_name = secure_filename(file.filename)
    if not safe_name:
        return '{"code":0,"msgs":"文件名无效"}'
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    file.save(os.path.join(app.config['UPLOAD_FOLDER'], safe_name))
    now = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())
    record = {
        "KeyID":             mark_keyid(),
        "Name":              safe_name,
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

def _note_state():
    """一次性读取并整理笔记数据，供各个笔记页面复用。"""
    raw = storage.load('noteinfo')
    active, by_id = MnoteInfo.load_active(raw)
    unlocked = session.get('unlocked_notes', [])
    tree = MnoteInfo.build_tree(active, by_id, unlocked)
    return raw, active, by_id, tree, unlocked


def _note_stats(active, tree):
    return {
        "total": len(active),
        "roots": len(tree),
        "encrypted": sum(1 for r in active if r.get("IsEncrypted")),
    }


def _public_note(record, by_id, unlocked):
    """模板可见的笔记字段，绝不包含 PasswordHash。"""
    key_id = record.get("KeyID", "")
    locked = bool(record.get("IsEncrypted")) and key_id not in set(unlocked)
    return {
        "KeyID": key_id,
        "Name": record.get("Name") or "",
        "ParentID": record.get("ParentID") or "",
        "Path": record.get("Path") or "",
        "Content": "" if locked else (record.get("Content") or ""),
        "IsEncrypted": int(bool(record.get("IsEncrypted"))),
        "Locked": locked,
        "HasPassword": bool(record.get("PasswordHash")),
        "AddTime": record.get("AddTime") or "",
        "ModifyTime": record.get("ModifyTime") or "",
        "AddPerson": record.get("AddPerson") or "",
        "Depth": MnoteInfo.note_depth(record, by_id),
    }


def _legacy_note_html(record):
    """老笔记没有 Content 时，回退读取 note/ 目录里的静态 HTML。"""
    safe_fn = secure_filename(record.get("Path") or "")
    if not safe_fn:
        return '<p class="note-missing-file">笔记文件不存在</p>'
    filepath = os.path.join(app.config['NOTE_PATH'], safe_fn + '.html')
    if not os.path.exists(filepath):
        return '<p class="note-missing-file">笔记文件不存在</p>'
    with open(filepath, encoding='utf-8') as f:
        raw = f.read()
    match = re.search(r'<body[^>]*>(.*?)</body>', raw, re.DOTALL)
    return match.group(1).strip() if match else raw


def _next_sort_order(active, parent_id):
    orders = []
    for record in active:
        if (record.get("ParentID") or "") == (parent_id or ""):
            try:
                orders.append(int(record.get("SortOrder") or 0))
            except (TypeError, ValueError):
                pass
    return (max(orders) if orders else 0) + 1


def _siblings(record, active):
    parent_id = record.get("ParentID") or ""
    same = [r for r in active if (r.get("ParentID") or "") == parent_id]
    same.sort(key=lambda r: (
        int(r.get("SortOrder") or 0) if str(r.get("SortOrder") or "0").lstrip("-").isdigit() else 0,
        r.get("AddTime") or "",
        (r.get("Name") or "").lower(),
    ))
    ids = [r.get("KeyID") for r in same]
    try:
        index = ids.index(record.get("KeyID"))
    except ValueError:
        return None, None
    prev = same[index - 1] if index > 0 else None
    nxt = same[index + 1] if index + 1 < len(same) else None
    return prev, nxt


def _link_notes(tree):
    return [
        {"id": node["id"], "name": node["name"], "path": node["path"], "depth": node["depth"]}
        for node in MnoteInfo.flatten_tree(tree)
    ]


@app.route('/note')
def note():
    if not login_cat():
        return redirect(url_for('login'))
    raw, active, by_id, tree, unlocked = _note_state()
    flat = MnoteInfo.flatten_tree(tree)
    recent = sorted(flat, key=lambda n: n.get("updated") or "", reverse=True)[:6]
    return render_template(
        'note.html',
        tree=tree,
        roots=tree,
        recent=recent,
        stats=_note_stats(active, tree),
        current_id="",
        q="",
    )


@app.route('/note/view/<keyid>')
def note_view(keyid):
    if not login_cat():
        return redirect(url_for('login'))
    raw, active, by_id, tree, unlocked = _note_state()
    record = by_id.get(keyid)
    if not record:
        return '笔记不存在', 404

    node = MnoteInfo.find_node(tree, keyid)
    item = _public_note(record, by_id, unlocked)
    locked = item["Locked"]
    if locked:
        html_body, words, read_minutes = "", 0, 0
    else:
        content = record.get("Content") or ""
        html_body = MnoteInfo.render_body(content, active) if content else _legacy_note_html(record)
        words = MnoteInfo.word_count(content)
        read_minutes = MnoteInfo.reading_minutes(words)

    prev_record, next_record = _siblings(record, active)
    lineage = [
        {"id": r.get("KeyID"), "name": r.get("Name") or "未命名"}
        for r in MnoteInfo.lineage(record, by_id)
    ]
    children = node["children"] if node else []
    refs = [] if locked else MnoteInfo.backlinks(keyid, active, unlocked)
    backlink_items = [
        {"id": r.get("KeyID"), "name": r.get("Name") or "未命名",
         "encrypted": bool(r.get("IsEncrypted"))}
        for r in refs
    ]
    return render_template(
        'note_detail.html',
        item=item,
        tree=tree,
        lineage=lineage,
        html_body=html_body,
        locked=locked,
        words=words,
        read_minutes=read_minutes,
        children=children,
        backlinks=backlink_items,
        descendant_count=node["descendant_count"] if node else 0,
        parent_options=MnoteInfo.parent_options(active, by_id, exclude_id=keyid),
        prev_note=prev_record,
        next_note=next_record,
        stats=_note_stats(active, tree),
        current_id=keyid,
        q="",
    )


@app.route('/note/new')
def note_new():
    if not login_cat():
        return redirect(url_for('login'))
    raw, active, by_id, tree, unlocked = _note_state()
    parent_id = (request.args.get('parent') or '').strip()
    parent = by_id.get(parent_id)
    if parent_id and (not parent or MnoteInfo.note_depth(parent, by_id) >= MnoteInfo.MAX_CHILD_DEPTH):
        parent_id = ""
    return render_template(
        'note_editor.html',
        mode='new',
        note={
            "KeyID": "",
            "Name": "",
            "Content": "",
            "ParentID": parent_id,
            "IsEncrypted": 0,
            "HasPassword": False,
        },
        parent_options=MnoteInfo.parent_options(active, by_id),
        link_notes=_link_notes(tree),
        cancel_url=url_for('note_view', keyid=parent_id) if parent_id else url_for('note'),
        stats=_note_stats(active, tree),
    )


@app.route('/note/<keyid>/edit')
def note_edit(keyid):
    if not login_cat():
        return redirect(url_for('login'))
    raw, active, by_id, tree, unlocked = _note_state()
    record = by_id.get(keyid)
    if not record:
        return '笔记不存在', 404
    item = _public_note(record, by_id, unlocked)
    if item["Locked"]:
        return redirect(url_for('note_view', keyid=keyid))
    return render_template(
        'note_editor.html',
        mode='edit',
        note=item,
        parent_options=MnoteInfo.parent_options(active, by_id, exclude_id=keyid),
        link_notes=[
            n for n in _link_notes(tree) if n["id"] != keyid
        ],
        cancel_url=url_for('note_view', keyid=keyid),
        stats=_note_stats(active, tree),
    )


@app.route('/note/save', methods=['POST'])
def note_save():
    if not login_cat():
        return jsonify({"code": 0, "msgs": "未登录"})
    raw, active, by_id, tree, unlocked = _note_state()
    title, content, error = MnoteInfo.normalize_content_limits(
        request.form.get('title', ''), request.form.get('content', '')
    )
    if error:
        return jsonify({"code": 0, "msgs": error})

    parent_id = (request.form.get('parent_id') or '').strip()
    parent, depth, error = MnoteInfo.validate_parent(parent_id, active, by_id)
    if error:
        return jsonify({"code": 0, "msgs": error})

    is_encrypted = request.form.get('is_encrypted') == '1'
    password = request.form.get('password', '')
    if is_encrypted and not password:
        return jsonify({"code": 0, "msgs": "加密笔记必须设置密码"})

    key_id = mark_keyid()
    while any(r.get('KeyID') == key_id for r in raw):
        key_id = mark_keyid()

    now = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())
    record = {
        "KeyID": key_id,
        "Name": title,
        "ParentID": parent_id,
        "SortOrder": _next_sort_order(active, parent_id),
        "ProductType": 1,
        "ProductTypeRemark": "公开区",
        "Path": key_id,
        "Remark": "",
        "Content": content,
        "IsEncrypted": 1 if is_encrypted else 0,
        "PasswordHash": generate_password_hash(password) if is_encrypted else "",
        "IsDelete": 0,
        "AddTime": now,
        "AddPerson": session.get("username", "admin"),
        "ModifyTime": now,
    }
    raw.append(record)
    storage.save('noteinfo', raw)
    return jsonify({"code": 1, "msgs": "保存成功", "keyid": key_id})


@app.route('/note/update', methods=['POST'])
def note_update():
    if not login_cat():
        return jsonify({"code": 0, "msgs": "未登录"})
    key_id = (request.form.get('KeyID') or '').strip()
    if not key_id:
        return jsonify({"code": 0, "msgs": "缺少 KeyID"})

    raw, active, by_id, tree, unlocked = _note_state()
    record = by_id.get(key_id)
    if not record:
        return jsonify({"code": 0, "msgs": "笔记不存在"})
    if record.get("IsEncrypted") and key_id not in set(unlocked):
        return jsonify({"code": 0, "msgs": "请先解锁笔记再编辑"})

    title, content, error = MnoteInfo.normalize_content_limits(
        request.form.get('title', ''), request.form.get('content', '')
    )
    if error:
        return jsonify({"code": 0, "msgs": error})

    old_parent = record.get("ParentID") or ""
    parent_id = (request.form.get('parent_id') or '').strip()
    parent, depth, error = MnoteInfo.validate_parent(parent_id, active, by_id, moving_id=key_id)
    if error:
        return jsonify({"code": 0, "msgs": error})

    raw_enc = request.form.get('is_encrypted')
    if raw_enc is None:
        is_encrypted = bool(record.get("IsEncrypted"))
    else:
        is_encrypted = raw_enc == '1'
    password = request.form.get('password', '')

    if is_encrypted:
        if password:
            record["PasswordHash"] = generate_password_hash(password)
        elif not record.get("PasswordHash"):
            return jsonify({"code": 0, "msgs": "加密笔记必须设置密码"})
    else:
        record["PasswordHash"] = ""

    record["Name"] = title
    record["Content"] = content
    record["IsEncrypted"] = 1 if is_encrypted else 0
    record["ParentID"] = parent_id
    if parent_id != old_parent:
        record["SortOrder"] = _next_sort_order(active, parent_id)
    record["ModifyTime"] = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())

    if not is_encrypted:
        session['unlocked_notes'] = [x for x in unlocked if x != key_id]

    storage.save('noteinfo', raw)
    return jsonify({"code": 1, "msgs": "保存成功", "keyid": key_id})


@app.route('/note/move', methods=['POST'])
def note_move():
    if not login_cat():
        return jsonify({"code": 0, "msgs": "未登录"})
    key_id = (request.form.get('KeyID') or '').strip()
    parent_id = (request.form.get('parent_id') or '').strip()
    if not key_id:
        return jsonify({"code": 0, "msgs": "缺少 KeyID"})

    raw, active, by_id, tree, unlocked = _note_state()
    record = by_id.get(key_id)
    if not record:
        return jsonify({"code": 0, "msgs": "笔记不存在"})
    if record.get("IsEncrypted") and key_id not in set(unlocked):
        return jsonify({"code": 0, "msgs": "请先解锁笔记再移动"})
    parent, depth, error = MnoteInfo.validate_parent(parent_id, active, by_id, moving_id=key_id)
    if error:
        return jsonify({"code": 0, "msgs": error})

    old_parent = record.get("ParentID") or ""
    if parent_id != old_parent:
        record["ParentID"] = parent_id
        record["SortOrder"] = _next_sort_order(active, parent_id)
        record["ModifyTime"] = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())
        storage.save('noteinfo', raw)
    return jsonify({
        "code": 1,
        "msgs": "已移动",
        "redirect": url_for('note_view', keyid=key_id),
    })


@app.route('/note/delete', methods=['POST'])
def note_delete():
    if not login_cat():
        return jsonify({"code": 0, "msgs": "未登录"})
    key_id = (request.form.get('KeyID') or '').strip()
    if not key_id:
        return jsonify({"code": 0, "msgs": "缺少 KeyID"})

    raw = storage.load('noteinfo')
    active, by_id = MnoteInfo.load_active(raw)
    record = by_id.get(key_id)
    if not record:
        return jsonify({"code": 0, "msgs": "笔记不存在"})
    unlocked = session.get('unlocked_notes', [])
    if record.get("IsEncrypted") and key_id not in set(unlocked):
        return jsonify({"code": 0, "msgs": "请先解锁笔记再删除"})

    mode = request.form.get('mode', 'detach')
    direct_children = [r for r in active if (r.get("ParentID") or "") == key_id]
    all_descendants = MnoteInfo.descendants(key_id, active)
    now = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())
    parent_id = record.get("ParentID") or ""

    if mode == 'subtree':
        for item in [record] + all_descendants:
            item["IsDelete"] = 1
            item["ModifyTime"] = now
    else:
        # 只把直接子笔记上移，更深层的结构保持不动。
        for child in direct_children:
            child["ParentID"] = parent_id
            child["ModifyTime"] = now
        record["IsDelete"] = 1
        record["ModifyTime"] = now

    storage.save('noteinfo', raw)
    redirect_to = url_for('note_view', keyid=parent_id) if parent_id else url_for('note')
    return jsonify({
        "code": 1,
        "msgs": "删除成功",
        "count": len(all_descendants) if mode == 'subtree' else len(direct_children),
        "redirect": redirect_to,
    })


@app.route('/note/search')
def note_search():
    if not login_cat():
        return redirect(url_for('login'))
    query = (request.args.get('q') or '').strip()[:80]
    raw, active, by_id, tree, unlocked = _note_state()
    results = MnoteInfo.search(active, by_id, query, unlocked)
    return render_template(
        'note_search.html',
        q=query,
        results=results,
        tree=tree,
        roots=tree,
        stats=_note_stats(active, tree),
        current_id="",
    )


@app.route('/notes/<filename>')
def cat_notes_file(filename):
    """兼容旧链接：按 Path 找到笔记后跳到新的 KeyID 阅读地址。"""
    if not login_cat():
        return redirect(url_for('login'))
    raw, active, by_id, tree, unlocked = _note_state()
    item = next((r for r in active if r.get('Path') == filename), None)
    if not item:
        return '笔记不存在', 404
    return redirect(url_for('note_view', keyid=item.get('KeyID')))


@app.route('/note/unlock', methods=['POST'])
def note_unlock():
    if not login_cat():
        return jsonify({"code": 0, "msgs": "未登录"})
    key_id = (request.form.get('KeyID') or '').strip()
    password = request.form.get('password', '')
    if not key_id:
        return jsonify({"code": 0, "msgs": "缺少 KeyID"})
    raw, active, by_id, tree, unlocked = _note_state()
    record = by_id.get(key_id)
    if not record or not record.get('IsEncrypted'):
        return jsonify({"code": 0, "msgs": "笔记不存在"})
    if not check_password_hash(record.get('PasswordHash', ''), password):
        return jsonify({"code": 0, "msgs": "密码错误"})
    if key_id not in unlocked:
        session['unlocked_notes'] = unlocked + [key_id]
    return jsonify({"code": 1, "msgs": "解锁成功"})


# ── Movie ──────────────────────────────────────────────────────────────────

DOUBAN_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/122.0 Safari/537.36",
    "Referer": "https://movie.douban.com/",
}
MOVIE_KINDS = {"movie": "电影", "tv": "电视剧"}
# 地区细分：国内取「华语」，国外聚合美/日/韩/英后合并去重
MOVIE_REGIONS = {
    "domestic": ["华语"],
    "foreign":  ["美国", "日本", "韩国", "英国"],
}
MOVIE_CACHE_TTL = 6 * 3600  # 缓存有效期（秒）


def _douban_query(tags, year):
    """按 类型+地区 标签查询豆瓣某年条目，返回规范化后的带评分列表。"""
    resp = requests.get(
        "https://movie.douban.com/j/new_search_subjects",
        params={
            "sort": "S",                 # 按评分排序
            "range": "0,10",
            "tags": tags,
            "start": 0,
            "year_range": f"{year},{year}",
        },
        headers=DOUBAN_HEADERS,
        timeout=12,
    )
    resp.raise_for_status()
    items = []
    for d in resp.json().get("data", []):
        rate = d.get("rate", "")
        if not rate:                     # 未出分的条目跳过，保证按评分展示
            continue
        items.append({
            "id":        d.get("id", ""),
            "title":     d.get("title", ""),
            "rate":      rate,
            "url":       d.get("url", ""),
            "casts":     d.get("casts", []),
            "directors": d.get("directors", []),
        })
    return items


def _fetch_douban_top(kind, region, year, limit=15):
    """拉取指定类型、地区、年份评分最高的若干条目（合并去重后按评分降序）。"""
    tag = MOVIE_KINDS.get(kind, "电影")
    regions = MOVIE_REGIONS.get(region, MOVIE_REGIONS["domestic"])
    merged = {}
    for rg in regions:
        for it in _douban_query(f"{tag},{rg}", year):
            merged.setdefault(it["id"] or it["title"], it)
    items = list(merged.values())
    items.sort(key=lambda x: float(x["rate"] or 0), reverse=True)
    return items[:limit]


def _get_movie_top(kind, region, year):
    """带缓存与容错地返回榜单：优先用新鲜缓存，拉取失败则回退旧缓存。"""
    cache = storage.load("movieinfo")
    if not isinstance(cache, dict):
        cache = {}
    key = f"{kind}_{region}_{year}"
    entry = cache.get(key)
    now = int(time.time())
    if entry and now - entry.get("ts", 0) < MOVIE_CACHE_TTL and entry.get("items"):
        return entry["items"]
    try:
        items = _fetch_douban_top(kind, region, year)
        cache[key] = {"ts": now, "items": items}
        storage.save("movieinfo", cache)
        return items
    except Exception:
        # 网络异常时回退到旧缓存，实在没有则返回空
        return entry.get("items", []) if entry else []


@app.route('/movie')
def movie():
    if not login_cat():
        return redirect(url_for('login'))
    year = int(time.strftime("%Y", time.localtime()))
    return render_template('movie.html', year=year)


@app.route('/movie/top')
def movie_top():
    if not login_cat():
        return '{"code":0,"msgs":"未登录"}'
    kind = request.args.get("kind", "movie")
    if kind not in MOVIE_KINDS:
        kind = "movie"
    region = request.args.get("region", "domestic")
    if region not in MOVIE_REGIONS:
        region = "domestic"
    cur_year = int(time.strftime("%Y", time.localtime()))
    year = request.args.get("year", type=int) or cur_year
    if year < 1900 or year > cur_year:      # 越界年份回退到当年
        year = cur_year
    return jsonify({
        "code": 1, "kind": kind, "region": region, "year": year,
        "items": _get_movie_top(kind, region, year),
    })


@app.route('/movie/search')
def movie_search():
    if not login_cat():
        return '{"code":0,"msgs":"未登录"}'
    q = (request.args.get("q", "") or "").strip()
    if not q:
        return jsonify({"code": 1, "items": []})
    try:
        resp = requests.get(
            "https://movie.douban.com/j/subject_suggest",
            params={"q": q},
            headers=DOUBAN_HEADERS,
            timeout=12,
        )
        resp.raise_for_status()
        items = []
        for d in resp.json():
            items.append({
                "title":     d.get("title", ""),
                "sub_title": d.get("sub_title", ""),
                "year":      d.get("year", ""),
                "type":      d.get("type", ""),
                "episode":   d.get("episode", ""),
                "cover":     d.get("img", ""),
                "url":       d.get("url", ""),
            })
        return jsonify({"code": 1, "items": items})
    except Exception:
        return jsonify({"code": 0, "msgs": "搜索失败，请稍后再试", "items": []})


# ── Travel ──────────────────────────────────────────────────────────────────

_LNLAT_RE = re.compile(r'^\s*-?\d{1,3}(\.\d{1,6})?\s*,\s*-?\d{1,3}(\.\d{1,6})?\s*$')


def _validate_plan(data):
    """校验旅行计划，返回错误信息字符串；通过则返回 None。"""
    name = (data.get("Name") or "").strip()
    if not name:
        return "计划名称不能为空"
    if len(name) > 60:
        return "计划名称过长（≤60 字）"
    spots = data.get("Spots")
    if not isinstance(spots, list) or len(spots) < 2:
        return "至少需要起点和终点两个地点"
    if len(spots) > 18:
        return "地点数量最多 18 个"
    for s in spots:
        if not isinstance(s, dict):
            return "地点数据格式错误"
        if s.get("Type") not in MTravelInfo.SPOT_TYPES:
            return "地点类型不合法"
        if not (s.get("Name") or "").strip():
            return "地点名称不能为空"
        if not _LNLAT_RE.match(str(s.get("LngLat") or "")):
            return "地点「%s」坐标格式错误" % s.get("Name")
    legs = data.get("Legs")
    if legs is not None:
        if not isinstance(legs, list):
            return "行程数据格式错误"
        n = len(spots)
        for l in legs:
            if not isinstance(l, dict):
                return "行程数据格式错误"
            fi, ti = l.get("FromIndex"), l.get("ToIndex")
            if not isinstance(fi, int) or not isinstance(ti, int) \
                    or fi < 0 or ti >= n or ti != fi + 1:
                return "行程索引不合法"
    return None


@app.route('/travel')
def travel():
    if not login_cat():
        return redirect(url_for('login'))
    records = [r for r in storage.load('travelinfo') if not r.get('IsDelete')]
    records.sort(key=lambda r: r.get('AddTime') or '', reverse=True)
    return render_template('travel.html', plans=records,
                           amap_key=AMAP_KEY, amap_security=AMAP_SECURITY)


def _travel_download_name(plan):
    raw_name = " ".join((plan.get("Name") or "旅行计划").split()) or "旅行计划"
    for ch in ("/", ":", "*", "?", '"', "<", ">", "|", chr(92)):
        raw_name = raw_name.replace(ch, "_")
    name = raw_name.strip(" ._") or "旅行计划"
    date = str(plan.get("Date") or "").strip()
    if not re.match("^[0-9]{4}-[0-9]{2}-[0-9]{2}$", date):
        date = time.strftime('%Y-%m-%d', time.localtime())
    return f"{name}_{date}.docx"


def _travel_word_response(plan):
    try:
        from Module.travel_export import build_travel_docx
    except ImportError:
        return jsonify({"code": 0, "msgs": "Word 导出组件未安装，请先执行 uv sync"}), 500
    data = build_travel_docx(plan)
    return send_file(
        BytesIO(data),
        as_attachment=True,
        download_name=_travel_download_name(plan),
        mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )


@app.route('/travel/export/<key_id>')
def travel_export(key_id):
    if not login_cat():
        return redirect(url_for('login'))
    for record in storage.load('travelinfo'):
        if record.get('KeyID') == key_id and not record.get('IsDelete'):
            return _travel_word_response(record)
    return '计划不存在', 404


@app.route('/travel/export', methods=['POST'])
def travel_export_current():
    if not login_cat():
        return jsonify({"code": 0, "msgs": "未登录"}), 401
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"code": 0, "msgs": "请求格式错误"}), 400
    err = _validate_plan(data)
    if err:
        return jsonify({"code": 0, "msgs": err}), 400
    return _travel_word_response(data)


@app.route('/travel/detail/<key_id>')
def travel_detail(key_id):
    if not login_cat():
        return jsonify({"code": 0, "msgs": "未登录"})
    for r in storage.load('travelinfo'):
        if r.get('KeyID') == key_id and not r.get('IsDelete'):
            return jsonify({"code": 1, "plan": r})
    return jsonify({"code": 0, "msgs": "计划不存在"})


@app.route('/travel/save', methods=['POST'])
def travel_save():
    if not login_cat():
        return jsonify({"code": 0, "msgs": "未登录"})
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"code": 0, "msgs": "请求格式错误"})
    err = _validate_plan(data)
    if err:
        return jsonify({"code": 0, "msgs": err})

    now = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
    spots = []
    for s in data["Spots"]:
        m = MTravelInfo.Spot()
        m.SpotID   = s.get("SpotID") or mark_keyid()
        m.Type     = s["Type"]
        m.Name     = s["Name"].strip()
        m.Address  = (s.get("Address") or "").strip()
        m.LngLat   = s["LngLat"].strip()
        m.Remark   = (s.get("Remark") or "").strip()
        m.AddTime  = s.get("AddTime") or now
        spots.append(m.__dict__)

    records = storage.load('travelinfo')
    key_id = data.get("KeyID")
    clean_legs = []
    for l in (data.get("Legs") or []):
        clean_legs.append({
            "FromIndex": l["FromIndex"],
            "ToIndex":   l["ToIndex"],
            "Distance":  l.get("Distance"),
            "Duration":  l.get("Duration"),
            "CachedAt":  str(l.get("CachedAt") or "")[:20],
        })
    plan = {
        "Name":     data["Name"].strip(),
        "Date":     (data.get("Date") or "").strip(),
        "Note":     (data.get("Note") or "").strip(),
        "Spots":    spots,
        "Legs":     clean_legs,
        "ModifyTime": now,
    }
    if key_id:
        found = False
        for r in records:
            if r.get("KeyID") == key_id and not r.get("IsDelete"):
                r.update(plan)
                plan = r
                found = True
                break
        if not found:
            return jsonify({"code": 0, "msgs": "计划不存在"})
    else:
        plan.update({
            "KeyID":    mark_keyid(),
            "IsDelete": 0,
            "AddTime":  now,
            "AddPerson": session.get("username", "sys"),
        })
        records.append(plan)
    storage.save('travelinfo', records)
    return jsonify({"code": 1, "KeyID": plan["KeyID"]})


@app.route('/travel/delete', methods=['POST'])
def travel_delete():
    if not login_cat():
        return jsonify({"code": 0, "msgs": "未登录"})
    key_id = request.form.get('KeyID') or (request.get_json(silent=True) or {}).get('KeyID')
    if not key_id:
        return jsonify({"code": 0, "msgs": "缺少参数"})
    records = storage.load('travelinfo')
    for r in records:
        if r.get("KeyID") == key_id:
            r["IsDelete"] = 1
            r["ModifyTime"] = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
            storage.save('travelinfo', records)
            return jsonify({"code": 1})
    return jsonify({"code": 0, "msgs": "计划不存在"})


if __name__ == '__main__':
    print(os.getcwd())
    # debug 默认关闭；仅本地调试时设 FLASK_DEBUG=1。生产开 debug 会暴露调试器可致 RCE。
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host='0.0.0.0', port=1111, debug=debug)
