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
    useraccount = request.form.get('useraccount', '')
    password    = request.form.get('password', '')
    if useraccount == ADMIN_ACCOUNT and password == ADMIN_PASSWORD:
        session["useraccount"] = useraccount
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
