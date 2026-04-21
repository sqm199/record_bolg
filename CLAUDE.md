# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 运行与开发

```bash
# 使用 uv 安装依赖（包管理器为 uv，Python 3.11）
uv sync

# 启动开发服务器（端口 1111，debug 模式）
python main.py

# 安装新依赖
uv add <package-name>
```

应用运行后访问 `http://localhost:1111`，根路由会重定向到 `/home`，未登录则跳转 `/login`。

默认账号：`admin`，密码：`admin@123`（定义在 `main.py` 的 `ADMIN_ACCOUNT`/`ADMIN_PASSWORD` 常量）。

## 数据存储

不依赖任何外部数据库。数据以 JSON 文件形式存储在 `data/` 目录下，首次写入时自动创建：

- `data/photoinfo.json` — 照片记录
- `data/noteinfo.json` — 日志记录
- `data/movieinfo.json` — 排行榜记录

存储层入口为 `Sqls/storage.py`，提供 `load(name)` / `save(name, data)` 两个函数，写操作有线程锁保护。

`service/` 中的模块（`kline.py`、`run_road.py`、`req_create.py`）是独立脚本，依赖外部 MongoDB/Redis，不参与主应用运行。

## 架构概览

### 整体结构

这是一个个人记录博客，单文件 Flask 应用，所有路由集中在 `main.py`。

```
main.py          # Flask 应用入口，全部路由定义在此
Sqls/pymysql.py  # 数据库访问层（封装 PyMySQL）
Module/          # 数据模型类（纯 Python 数据类）
service/         # 外部服务集成（加密货币行情、Redis/Mongo 工具）
templates/       # Jinja2 模板（base.html 为基模板）
static/          # 前端静态资源（jQuery、Bootstrap、Layer.js）
note/            # 静态 HTML 日志文件，通过路由 /notes/<filename> 访问
photo/           # 用户上传图片目录
```

### 认证机制

所有受保护页面在路由处理函数内直接调用 `login_cat()`（`main.py:34`）。该函数从 Flask `session` 中读取 `useraccount` 和 `password`，每次请求都执行一次 MySQL 查询验证。未通过认证则重定向到 `/login`。

### 存储访问层

`Sqls/storage.py` 是唯一的数据访问入口，提供 `load(name)` / `save(name, data)` 两个函数，分别读写 `data/<name>.json` 文件。写操作有全局线程锁。

各路由直接对返回的 list 进行增删改，再调用 `save()` 写回：

```python
records = storage.load('photoinfo')
records.append(record)
storage.save('photoinfo', records)
```

### 数据模型规范

`Module/` 下的所有模型类（`MPhotoInfo.Photo`、`MnoteInfo.Note` 等）均为普通 Python 类，字段与 JSON 记录的 key 对应，`AddTime`/`ModifyTime` 默认为当前时间，`IsDelete=0` 为软删除标记。所有主键通过 `main.py:mark_keyid()` 生成（时间戳 + 4位随机数）。

### 模板体系

`templates/base.html` 是所有页面的基模板，引入了 jQuery、Bootstrap 和 Layer.js（弹出层）。各页面模板通过 `{% block content %}` 扩展 `base.html`，通过 `value` 变量接收数据列表。

### service 模块

`service/` 中的模块独立于 Web 应用：

- `kline.py` — 从 Gate.io 拉取 ETH/USDT K 线数据并存入 MongoDB
- `run_road.py` — Redis/MongoDB 连接工具及数据清理脚本（`if __name__ == '__main__'` 直接运行）
- `req_create.py` — 多线程 HTTP 压测工具，向内部交易服务发压测请求

### IIS 部署

`Web.config` 是 Windows IIS + FastCGI 部署配置（使用 wfastcgi），用于生产环境部署，本地开发时忽略即可。