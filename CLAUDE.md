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

应用运行后访问 `http://localhost:1111`，根路由会重定向到 `/photo`，未登录则跳转 `/login`。

默认账号：`admin`，密码：`admin@717613`（`ADMIN_PASSWORD` 常量兜底，优先读环境变量）。

## 数据存储

不依赖任何外部数据库。数据以 JSON 文件形式存储在 `data/` 目录下，首次写入时自动创建：

- `data/photoinfo.json` — 照片记录
- `data/noteinfo.json` — 笔记记录（平铺存储，`ParentID` 组织层级，`SortOrder` 控制同级顺序）
- `data/movieinfo.json` — 排行榜记录
- `data/travelinfo.json` — 旅行计划（顶层为计划对象数组，每个计划内嵌 `Spots` 途经点与 `Legs` 分段行程缓存）

存储层入口为 `Sqls/storage.py`，提供 `load(name)` / `save(name, data)` 两个函数，写操作有线程锁保护。

`service/` 中的模块（`kline.py`、`run_road.py`、`req_create.py`）是独立脚本，依赖外部 MongoDB/Redis，不参与主应用运行。

### 高德地图配置（旅行页）

`config.py`（已 gitignore，参考 `config.py.example`）提供 `AMAP_KEY` / `AMAP_SECURITY` 两个常量，环境变量同名变量优先。`main.py` 启动时读取并注入 `travel.html`，前端在加载高德 JS API 前先设置 `window._AMapSecurityConfig.securityJsCode`。若未配置 Key，旅行页降级为无地图的纯列表提示。

## 架构概览

### 整体结构

这是一个个人记录博客，单文件 Flask 应用，所有路由集中在 `main.py`。

```
main.py          # Flask 应用入口，全部路由定义在此
Sqls/pymysql.py  # 数据库访问层（封装 PyMySQL）
Module/          # 数据模型类（纯 Python 数据类）
service/         # 外部服务集成（加密货币行情、Redis/Mongo 工具）
templates/       # Jinja2 模板（base.html 为基模板）
static/          # 前端静态资源（dark.css 设计 token + components.css 组件 + 页面 js）
note/            # 旧版静态 HTML 笔记；仅在没有 Content 字段时作为回退读取
photo/           # 用户上传图片目录
```

### 认证机制

所有受保护页面在路由处理函数内直接调用 `login_cat()`。该函数检查 Flask `session` 中的 `useraccount` 是否等于 `ADMIN_ACCOUNT`，未通过认证则重定向到 `/login`。

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

`templates/base.html` 是所有页面的基模板（登录/解锁页用 `base_auth.html`，不含导航栏），引入自研设计系统：`static/CSS/dark.css`（token + 双主题）与 `static/CSS/components.css`（按钮/卡片/modal/toast 等组件），弹窗与轻提示由 `static/js/ui.js` 提供（`UI.modal` / `UI.toast`，无 Bootstrap/jQuery 依赖）。各页面模板通过 `{% block content %}` 扩展基模板，通过 `value` 变量接收数据列表。

### 笔记模块

笔记是三级子笔记的树形知识库（根笔记 + 最多 3 层子笔记，总层级 4 层）。存储仍是一份平铺的 `data/noteinfo.json`，通过 `ParentID` 关联、`SortOrder` 排序；`Module/MnoteInfo.py` 负责归一化父级、计算层级/祖先/后代、构建树、校验移动、Markdown 渲染与全文搜索。超过层级限制或成环的旧数据会在读取时安全降级为顶层节点。

路由（`main.py` 中 `/note` 一节）：

- `GET /note` — 笔记库总览（目录树 + 最近更新 + 顶层主题）
- `GET /note/view/<keyid>` — 阅读页；加密笔记未解锁时显示解锁面板
- `GET /note/new`、`GET /note/<keyid>/edit` — 新建/编辑；编辑器支持 Markdown、草稿自动保存、位置选择、加密与站内链接
- `POST /note/save`、`POST /note/update`、`POST /note/move`、`POST /note/delete`、`POST /note/unlock`
- `GET /note/search?q=` — 标题与正文全文搜索（加密且未解锁的正文不参与搜索）
- `GET /notes/<filename>` — 兼容旧链接，按 `Path` 重定向到新阅读地址

正文支持 `[[笔记标题]]` 或 `[[上级 / 子笔记]]` 站内引用（渲染时转换为 `/note/view/<keyid>`），阅读页右侧会列出引用本篇的其他笔记（`MnoteInfo.backlinks`，锁定笔记在解锁前不参与反链扫描）。删除父笔记时可选择“直接子笔记上移一层”或“连同全部后代一起软删除”。前端样式在 `static/CSS/notes.css`，交互在 `static/js/notes.js` 与 `static/js/note-editor.js`；`templates/_note_rail.html` / `_note_tree_macros.html` 为各笔记页共用的目录树。

### 旅行计划模块

路由组（`main.py` 中 `/travel` 一节）：`GET /travel` 列表/编辑页、`GET /travel/detail/<key_id>` 返回单个计划 JSON、`POST /travel/save` 整计划覆盖写（创建或更新，`_validate_plan` 校验名称、2–18 个地点、类型枚举、`"lng,lat"` 坐标与分段索引）、`POST /travel/delete` 软删。模型在 `Module/MTravelInfo.py`（`Spot`/`TravelPlan`，类型枚举 `SPOT_TYPES = start/food/hotel/sight/way/end`）。前端 `static/js/travel.js` 用高德 PlaceSearch/AutoComplete/Geocoder 选点、Driving 插件按相邻段串行算路（约 400ms 间隔规避 QPS 限制），结果写入 `Legs` 随保存落库；地点变更即整体失效重算。

Word 导出：`GET /travel/export/<key_id>` 导出已保存计划，`POST /travel/export` 导出编辑器中的当前计划（不落库）。`Module/travel_export.py` 用 `python-docx` 生成 A4 文档，包含计划信息、备注、行程地点表和分段行程表；文件名形如 `计划名_出发日期.docx`。

### service 模块

`service/` 中的模块独立于 Web 应用：

- `kline.py` — 从 Gate.io 拉取 ETH/USDT K 线数据并存入 MongoDB
- `run_road.py` — Redis/MongoDB 连接工具及数据清理脚本（`if __name__ == '__main__'` 直接运行）
- `req_create.py` — 多线程 HTTP 压测工具，向内部交易服务发压测请求

### IIS 部署

`Web.config` 是 Windows IIS + FastCGI 部署配置（使用 wfastcgi），用于生产环境部署，本地开发时忽略即可。