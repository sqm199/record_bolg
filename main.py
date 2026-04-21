# -*- coding: utf-8 -*-
from flask import Flask
from flask import abort, redirect, url_for, render_template, session, request
from Sqls import pymysql
from Module import MMovieInfo, MPhotoInfo, MnoteInfo
from flask import send_from_directory
import os
import time
import random
from service import run_road
from service.kline import GateKine
from service.req_create import ReqCreate
import json


UPLOAD_FOLDER = os.getcwd() + '\photo'
NOTE_PATH = os.getcwd() + '\\note'
ALLOWED_EXTENSIONS = set(['txt', 'pdf', 'png', 'jpg', 'jpeg', 'gif'])

app = Flask(__name__)
app.secret_key = "shiyangS"
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['NOTE_PATH'] = NOTE_PATH


# 生成keyID
def mark_keyid():
    a = time.strftime("%Y%m%d%H%M%S", time.localtime())
    b = str(random.randint(1000, 9999))
    return a + b


# 登陆校验
def login_cat():
    useraccount = session.get("useraccount")
    password = session.get("password")
    sql_str = "SELECT * FROM `userinfo` WHERE UserAccount='{0}' AND LoginPWD ='{1}' AND IsDelete=0;".format(useraccount, password)
    sql = pymysql.Sql(sql_str, "userdata")
    data = sql.execute()
    if len(data) == 1:
        return True
    else:
        return False


@app.route('/')
def index():
    return redirect(url_for('tools'))


# 登陆页面
@app.route('/login', methods=['GET', 'POST'])
def login():
    return render_template('login_2.html')


# 照片模块
@app.route('/photo', methods=['GET', 'POST'])
def photo():
    if login_cat():
        sql_str = "SELECT KeyID,Name,ProductType,Remark FROM `photoinfo` WHERE IsDelete=0;"
        sql = pymysql.Sql(sql_str, "movie")
        result = sql.execute()
        value_list = []
        i = 1
        for item in result:
            mPhoto = MPhotoInfo.Photo()
            mPhoto.KeyID = item[0]
            mPhoto.Name = item[1]
            mPhoto.ProductType = item[2]
            mPhoto.Remark = item[3]
            value_list.append(mPhoto)
            i += 1
        return render_template('photo.html', value=value_list)
    else:
        return redirect(url_for('login'))


# 删除照片
@app.route('/delete_photo', methods=['GET', 'POST'])
def delete_photo():
    if request.method == "POST":
        KeyID = request.form["KeyID"]
        sql_str = "UPDATE `photoinfo` SET IsDelete=1 WHERE KeyID='{0}' LIMIT 1;".format(KeyID)
        sql = pymysql.Sql(sql_str, "movie")
        sql.execute()
        return '''{"Code":1,"Message":"删除成功！"}'''
    else:
        return '''{"Code":999,"Message":"999"}'''


@app.route('/change_save_remark', methods=['GET', 'POST'])
def change_save_remark():
    if request.method == "POST":
        KeyID = request.form["KeyID"]
        Remark = str(request.form["Remark"]).replace("\t", "").replace("\n", "")
        sql_str = "UPDATE `photoinfo` SET Remark='{0}' WHERE KeyID='{1}' LIMIT 1;".format(Remark, KeyID)
        sql = pymysql.Sql(sql_str, "movie")
        sql.execute()
        return '''{"Code":1,"Message":"更新成功！"}'''
    else:
        return '''{"Code":999,"Message":"999"}'''


# 校验上传图片文件后缀
def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1] in ALLOWED_EXTENSIONS


# 查看上传文件
@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'],
                               filename)


# 上传图片弹出层
@app.route('/upload_file', methods=['GET', 'POST'])
def upload_file():
    if request.method == 'POST':
        file = request.files['file']
        remark = request.form["remark"]
        if file and allowed_file(file.filename):
            file.save(os.path.join(app.config['UPLOAD_FOLDER'], file.filename))
            photo_info = MPhotoInfo.Photo()
            photo_info.KeyID = mark_keyid()
            photo_info.AddPerson = session["username"]
            photo_info.ProductType = 1
            photo_info.ProductTypeRemark = "图片区一"
            photo_info.Name = file.filename
            photo_info.Remark = remark
            sql_str = "INSERT INTO `photoinfo` VALUES ('{0}','{1}','{2}','{3}','{4}','{5}','{6}','{7}','{8}');".format(photo_info.KeyID,
                                                                                                                photo_info.Name,
                                                                                                                photo_info.ProductType,
                                                                                                                photo_info.ProductTypeRemark,
                                                                                                                photo_info.Remark,
                                                                                                                photo_info.IsDelete,
                                                                                                                photo_info.AddTime,
                                                                                                                photo_info.AddPerson,
                                                                                                                photo_info.ModifyTime)
            sql = pymysql.Sql(sql_str, "movie")
            sql.execute()
            return redirect(url_for('photo'))
    return '''
    <!doctype html>
    <title>上传您的新图片</title>
    <h1 style="text-align: center">Upload new File</h1>
    <form style="padding-left: 24%" action="upload_file" method=post enctype=multipart/form-data>
      <p><input type=file name=file></p>
      <textarea name="remark" rows="4" cols="32"></textarea>
      <p><input type=submit value=Upload></p>
    </form>
    '''


# 登陆验证
@app.route('/login_confirm', methods=['GET', 'POST'])
def login_confirm():
    try:
        if request.method == "POST":
            useraccount = request.form['useraccount']
            password = request.form['password']
            session["useraccount"] = useraccount
            session["password"] = password
            return '''{"code": 1, "msgs": "登陆成功"}'''
        else:
            return
    except Exception as e:
        return e


# 排行榜模块
@app.route('/home', methods=['GET', 'POST'])
def home():
    if login_cat():
        movie_name = ""
        if request.args.get("movie_name") is not None:
            movie_name = request.args.get("movie_name")
        if movie_name == "":
            sql_str = "SELECT Name,Money,MoneyType FROM `movieinfo` WHERE remark='11月10日-11月12日/美元' AND IsDelete = 0 GROUP BY Money DESC;"
        else:
            sql_str = "SELECT Name,Money,MoneyType FROM `movieinfo` WHERE Name LIKE '%{0}%' AND remark='11月10日-11月12日/美元' AND IsDelete = 0 GROUP BY Money DESC;".format(movie_name)
        sql = pymysql.Sql(sql_str, "movie")
        result = sql.execute()
        value_list = []
        i = 1
        for item in result:
            mMovie = MMovieInfo.Movie()
            mMovie.index = i
            mMovie.Name = item[0]
            mMovie.Money = item[1]
            mMovie.MoneyType = item[2]
            value_list.append(mMovie)
            i += 1
        return render_template('home.html', value=value_list)
    else:
        return redirect(url_for('login'))


# 日志模块
@app.route('/note', methods=['GET', 'POST'])
def note():
    if login_cat():
        sql_str = "SELECT KeyID,Name,ProductType,AddPerson,AddTime,Path FROM `noteinfo` WHERE IsDelete=0;"
        sql = pymysql.Sql(sql_str, "movie")
        result = sql.execute()
        value_list = []
        i = 1
        for item in result:
            mNote = MnoteInfo.Note()
            mNote.KeyID = item[0]
            mNote.Name = item[1]
            mNote.ProductType = item[2]
            mNote.AddPerson = item[3]
            mNote.AddTime = item[4]
            mNote.Path = item[5]
            value_list.append(mNote)
            i += 1
        return render_template('note.html', value=value_list)
    else:
        return redirect(url_for('login'))


# 查看日志
@app.route('/notes/<filename>')
def cat_notes_file(filename):
    return send_from_directory(app.config['NOTE_PATH'],
                               filename + ".html")


if __name__ == '__main__':
    print(os.getcwd())
    app.run(host='0.0.0.0', port=1111, debug=True)
