# -*- coding: utf-8 -*-
from flask import Flask, redirect, url_for, render_template, session, request, send_from_directory, jsonify
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.middleware.proxy_fix import ProxyFix
from Module import MPhotoInfo, MnoteInfo
from Module.MTexasPoker import get_game
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

ADMIN_ACCOUNT  = os.environ.get("ADMIN_ACCOUNT", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
if not ADMIN_PASSWORD:
    ADMIN_PASSWORD = "admin@717613"
    print("[安全警告] 未设置 ADMIN_PASSWORD 环境变量，正在使用源码内置默认密码。"
          "该密码已随公开仓库泄露，请立即改用环境变量设置新密码。")

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
    return render_template('login_2.html')


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
        n.AddTime            = item.get('AddTime', '')
        n.Path               = item.get('Path', item['Name'])
        n.ProductTypeRemark  = item.get('ProductTypeRemark', '')
        n.IsEncrypted        = item.get('IsEncrypted', 0)
        value_list.append(n)
    # 剔除 PasswordHash 后再输出到前端，避免哈希泄露
    note_data = [{k: v for k, v in r.items() if k != 'PasswordHash'} for r in records]
    return render_template('note.html', value=value_list, note_data=note_data)


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
    is_encrypted = request.form.get('is_encrypted') == '1'
    password     = request.form.get('password', '')
    if not title:
        return '{"code":0,"msgs":"标题不能为空"}'
    if is_encrypted and not password:
        return '{"code":0,"msgs":"加密笔记必须设置密码"}'
    # 中文等非 ASCII 标题经 secure_filename 后会变为空串，此时用 KeyID 作为文件名兜底
    key_id = mark_keyid()
    safe_title = secure_filename(title) or key_id
    escaped_title = html_module.escape(title)

    filepath = os.path.join(app.config['NOTE_PATH'], f'{safe_title}.html')
    if os.path.exists(filepath):
        return '{"code":0,"msgs":"同名笔记已存在，请使用不同标题"}'

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

    os.makedirs(app.config['NOTE_PATH'], exist_ok=True)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(full_html)

    now = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())
    record = {
        "KeyID":             key_id,
        "Name":              title,
        "ProductType":       1,
        "ProductTypeRemark": "公开区",
        "Path":              safe_title,
        "Content":           content,
        "Remark":            "",
        "IsEncrypted":       1 if is_encrypted else 0,
        "PasswordHash":      generate_password_hash(password) if is_encrypted else "",
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
    if not key_id:
        return '{"code":0,"msgs":"缺少KeyID"}'
    records = storage.load('noteinfo')
    for r in records:
        if r['KeyID'] == key_id:
            r['IsDelete'] = 1
    storage.save('noteinfo', records)
    return '{"code":1,"msgs":"删除成功"}'


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
    # 加密笔记：未在本次 session 内解锁则显示锁屏页
    if item.get('IsEncrypted') and item['KeyID'] not in session.get('unlocked_notes', []):
        return render_template('note_locked.html', item=item)
    content = item.get('Content', '')
    if content:
        html_body = markdown.markdown(content, extensions=['extra'])
    else:
        safe_fn   = secure_filename(filename)
        filepath  = os.path.join(app.config['NOTE_PATH'], safe_fn + '.html')
        if os.path.exists(filepath):
            with open(filepath, encoding='utf-8') as f:
                raw = f.read()
            m = re.search(r'<body[^>]*>(.*?)</body>', raw, re.DOTALL)
            html_body = m.group(1).strip() if m else raw
        else:
            html_body = '<p style="color:var(--text-muted)">笔记文件不存在</p>'
    return render_template('note_detail.html', item=item, html_body=html_body)


@app.route('/note/unlock', methods=['POST'])
def note_unlock():
    if not login_cat():
        return '{"code":0,"msgs":"未登录"}'
    key_id   = request.form.get('KeyID', '').strip()
    password = request.form.get('password', '')
    if not key_id:
        return '{"code":0,"msgs":"缺少KeyID"}'
    records = storage.load('noteinfo')
    record = next(
        (r for r in records if r['KeyID'] == key_id and r.get('IsDelete', 0) == 0),
        None
    )
    if not record or not record.get('IsEncrypted'):
        return '{"code":0,"msgs":"笔记不存在"}'
    if not check_password_hash(record.get('PasswordHash', ''), password):
        return '{"code":0,"msgs":"密码错误"}'
    unlocked = session.get('unlocked_notes', [])
    if key_id not in unlocked:
        unlocked = unlocked + [key_id]
        session['unlocked_notes'] = unlocked
    return '{"code":1,"msgs":"解锁成功"}'


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
    path = record.get('Path')
    if not path:
        return '{"code":0,"msgs":"笔记路径缺失，无法保存"}'
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


# ── Game ────────────────────────────────────────────────────────────────────

@app.route('/game')
def game_index():
    if not login_cat():
        return redirect(url_for('login'))
    return render_template('game.html')


@app.route('/game/texas')
def game_texas():
    if not login_cat():
        return redirect(url_for('login'))
    return render_template('texas.html')


@app.route('/api/texas/new', methods=['POST'])
def api_texas_new():
    if not login_cat():
        return jsonify({"code": 0, "msgs": "未登录"})
    game = get_game()
    game.start_new_round()
    return jsonify({"code": 1, "state": game.get_state()})


@app.route('/api/texas/action', methods=['POST'])
def api_texas_action():
    if not login_cat():
        return jsonify({"code": 0, "msgs": "未登录"})
    game = get_game()
    action = request.form.get('action', '')
    amount = request.form.get('amount', type=int) or 0
    result = game.player_action(action, amount)
    if 'error' in result:
        return jsonify({"code": 0, "msgs": result['error']})
    return jsonify({"code": 1, "state": game.get_state()})


@app.route('/api/texas/state', methods=['GET'])
def api_texas_state():
    if not login_cat():
        return jsonify({"code": 0, "msgs": "未登录"})
    game = get_game()
    return jsonify({"code": 1, "state": game.get_state()})


if __name__ == '__main__':
    print(os.getcwd())
    # debug 默认关闭；仅本地调试时设 FLASK_DEBUG=1。生产开 debug 会暴露调试器可致 RCE。
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host='0.0.0.0', port=1111, debug=debug)
