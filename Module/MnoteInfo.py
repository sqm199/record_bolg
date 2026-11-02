# -*- coding: utf-8 -*-
"""笔记模型与层级工具。

笔记存储为扁平 JSON 记录，通过 ParentID 组织成树：
- 顶层笔记 ParentID 为空串；
- 最多允许 3 层子笔记（总层级为 4 层）；
- 所有函数只处理内存中的记录，不负责落盘。

这里的函数同时被路由和模板使用，保持无副作用（除了对传入记录做
父级合法性归一化，这只会修正损坏的 ParentID，不写回文件）。
"""
from __future__ import annotations

import html
import re
import time

import markdown

# 根节点之上最多还能挂 3 层子笔记，总深度 = 4 层。
MAX_CHILD_DEPTH = 3

_TITLE_MAX = 120
_CONTENT_MAX = 500_000
_WIKI_RE = re.compile(r"\[\[([^\[\]\n]{1,120})\]\]")
_MD_LINK_RE = re.compile(r"\]\(/note/view/([A-Za-z0-9_\-]+)\)")
_CODE_SPLIT_RE = re.compile(r"(```.*?```|`[^`\n]*`)", re.S)


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


class Note(object):
    def __init__(self, KeyID="", Name="", ParentID="", SortOrder=0, ProductType=1,
                 ProductTypeRemark="", Path="", Remark="", IsDelete=0,
                 IsEncrypted=0, Content="", PasswordHash="",
                 AddTime=None, AddPerson="sys", ModifyTime=None):
        now = _now()
        self.KeyID = KeyID
        self.Name = Name
        self.ParentID = ParentID
        self.SortOrder = SortOrder
        self.ProductType = ProductType
        self.ProductTypeRemark = ProductTypeRemark
        self.Path = Path
        self.Remark = Remark
        self.IsDelete = IsDelete
        self.IsEncrypted = IsEncrypted
        self.Content = Content
        self.PasswordHash = PasswordHash
        self.AddTime = AddTime or now
        self.AddPerson = AddPerson
        self.ModifyTime = ModifyTime or now


# ── 层级 ───────────────────────────────────────────────────────────────────

def load_active(raw_records):
    """返回 (active, by_id)。会归一化缺失/成环/超深的 ParentID。"""
    active = [r for r in raw_records if not r.get("IsDelete")]
    by_id = {r.get("KeyID"): r for r in active if r.get("KeyID")}

    # 第一遍：断掉自引用、指向不存在节点的父级，以及真正的环。
    for record in active:
        seen = set()
        cur = record
        while cur is not None and cur.get("ParentID"):
            parent_id = cur.get("ParentID")
            if parent_id == cur.get("KeyID") or parent_id in seen or parent_id not in by_id:
                record["ParentID"] = ""
                break
            seen.add(parent_id)
            cur = by_id.get(parent_id)

    # 第二遍：历史脏数据若把树压得过深，直接提升为顶层，保证界面可读。
    for record in active:
        record["ParentID"] = record.get("ParentID") or ""
        if record["ParentID"] and note_depth(record, by_id) > MAX_CHILD_DEPTH:
            record["ParentID"] = ""

    return active, by_id


def note_depth(record, by_id) -> int:
    """返回 0 开始的层级；顶层为 0。"""
    seen = set()
    depth = 0
    parent_id = record.get("ParentID") or ""
    while parent_id:
        if parent_id in seen or parent_id not in by_id:
            break
        seen.add(parent_id)
        parent = by_id[parent_id]
        depth += 1
        parent_id = parent.get("ParentID") or ""
        if depth > 20:
            break
    return depth


def path_names(record, by_id):
    """祖先名称（由根到父），不含自身。"""
    names = []
    seen = set()
    parent_id = record.get("ParentID") or ""
    while parent_id and parent_id not in seen and parent_id in by_id:
        seen.add(parent_id)
        parent = by_id[parent_id]
        names.append(parent.get("Name") or "未命名")
        parent_id = parent.get("ParentID") or ""
    names.reverse()
    return names


def lineage(record, by_id):
    """由根到自身的完整记录链。"""
    chain = []
    seen = set()
    cur = record
    while cur is not None:
        chain.append(cur)
        if cur.get("KeyID") in seen:
            break
        seen.add(cur.get("KeyID"))
        parent_id = cur.get("ParentID") or ""
        cur = by_id.get(parent_id) if parent_id else None
    chain.reverse()
    return chain


def descendants(key_id, active):
    """返回所有后代记录（不含自身）。"""
    children = {}
    for record in active:
        children.setdefault(record.get("ParentID") or "", []).append(record)
    result = []
    stack = list(children.get(key_id, []))
    seen = set()
    while stack:
        record = stack.pop()
        rid = record.get("KeyID")
        if not rid or rid in seen:
            continue
        seen.add(rid)
        result.append(record)
        stack.extend(children.get(rid, []))
    return result


def subtree_height(key_id, active) -> int:
    """自身到最深后代的相对层数；没有子笔记为 0。"""
    children = {}
    for record in active:
        children.setdefault(record.get("ParentID") or "", []).append(record)

    def walk(rid):
        kids = children.get(rid, [])
        return 1 + max((walk(k.get("KeyID")) for k in kids), default=0) if kids else 0

    return walk(key_id)


def validate_parent(parent_id, active, by_id, moving_id=None):
    """校验新父级。返回 (parent, new_depth, error)。"""
    parent_id = (parent_id or "").strip()
    if parent_id == moving_id and moving_id:
        return None, 0, "不能把笔记移动到自己下面"
    if not parent_id:
        new_depth = 0
    else:
        parent = by_id.get(parent_id)
        if not parent:
            return None, 0, "上级笔记不存在"
        new_depth = note_depth(parent, by_id) + 1

    if moving_id and parent_id and parent_id in {d.get("KeyID") for d in descendants(moving_id, active)}:
        return None, 0, "不能把笔记移动到自己的子笔记下面"

    height = subtree_height(moving_id, active) if moving_id else 0
    if new_depth + height > MAX_CHILD_DEPTH:
        return None, 0, "最多支持三级子笔记，移动后会超过层级限制"

    return (by_id.get(parent_id) if parent_id else None), new_depth, None


def parent_options(active, by_id, exclude_id=None, max_parent_depth=MAX_CHILD_DEPTH - 1):
    """可作为上级的笔记列表，带层级缩进。"""
    excluded = {exclude_id} if exclude_id else set()
    if exclude_id:
        excluded |= {d.get("KeyID") for d in descendants(exclude_id, active)}

    options = []
    for record in active:
        rid = record.get("KeyID")
        if not rid or rid in excluded:
            continue
        depth = note_depth(record, by_id)
        if depth > max_parent_depth:
            continue
        name = record.get("Name") or "未命名"
        path = " / ".join(path_names(record, by_id) + [name])
        options.append({
            "id": rid,
            "name": name,
            "depth": depth,
            "path": path,
            "label": ("　" * depth) + name,
        })
    options.sort(key=lambda o: (o["depth"], o["path"].lower()))
    return options


# ── 树 ─────────────────────────────────────────────────────────────────────

def _sort_key(record):
    try:
        order = int(record.get("SortOrder") or 0)
    except (TypeError, ValueError):
        order = 0
    return order, record.get("AddTime") or "", (record.get("Name") or "").lower()


def build_tree(active, by_id, unlocked_ids=()):
    """构建嵌套树节点，节点包含渲染所需的全部元数据（不含正文）。"""
    unlocked = set(unlocked_ids or [])
    children = {}
    for record in active:
        children.setdefault(record.get("ParentID") or "", []).append(record)
    for bucket in children.values():
        bucket.sort(key=_sort_key)

    def make_node(record, depth):
        rid = record.get("KeyID")
        kids = [make_node(child, depth + 1) for child in children.get(rid, [])]
        count = 0
        for kid in kids:
            count += 1 + kid["descendant_count"]
        return {
            "id": rid,
            "name": record.get("Name") or "未命名",
            "parent_id": record.get("ParentID") or "",
            "depth": depth,
            "path": path_names(record, by_id),
            "updated": record.get("ModifyTime") or record.get("AddTime") or "",
            "created": record.get("AddTime") or "",
            "encrypted": bool(record.get("IsEncrypted")),
            "locked": bool(record.get("IsEncrypted")) and rid not in unlocked,
            "children": kids,
            "descendant_count": count,
        }

    return [make_node(record, 0) for record in children.get("", [])]


def flatten_tree(tree):
    result = []

    def walk(nodes):
        for node in nodes:
            result.append(node)
            walk(node["children"])

    walk(tree)
    return result


def find_node(tree, key_id):
    for node in flatten_tree(tree):
        if node["id"] == key_id:
            return node
    return None


def node_map(tree):
    return {node["id"]: node for node in flatten_tree(tree)}


# ── 正文与搜索 ─────────────────────────────────────────────────────────────

def _link_maps(active):
    by_id = {r.get("KeyID"): r for r in active if r.get("KeyID")}
    by_title = {}
    by_path = {}
    for record in active:
        name = (record.get("Name") or "").strip()
        if not name:
            continue
        by_title.setdefault(name.lower(), record)
        full_path = " / ".join(path_names(record, by_id) + [name]).lower()
        by_path.setdefault(full_path, record)
    return by_title, by_path


def _parse_wiki_link(raw):
    title, alias = (raw.split("|", 1) + [None])[:2] if "|" in raw else (raw, None)
    title = title.strip()
    label = (alias or title).strip()
    lookup = re.sub(r"\s*/\s*", " / ", title).lower()
    return title, label, lookup


def _resolve_wiki_link(raw, by_title, by_path):
    title, label, lookup = _parse_wiki_link(raw)
    return (by_path.get(lookup) or by_title.get(title.lower())), label


def _link_wiki(text, active):
    by_title, by_path = _link_maps(active)

    def replace(match):
        target, label = _resolve_wiki_link(match.group(1), by_title, by_path)
        if not target:
            return '<span class="wiki-missing" title="笔记不存在">%s</span>' % html.escape(label)
        safe_label = html.escape(label).replace("[", "\\[").replace("]", "\\]")
        return "[%s](/note/view/%s)" % (safe_label, target.get("KeyID"))

    # 代码块和行内代码里的 [[...]] 不转换。
    parts = _CODE_SPLIT_RE.split(text or "")
    for index in range(0, len(parts), 2):
        parts[index] = _WIKI_RE.sub(replace, parts[index])
    return "".join(parts)


def backlinks(target_id, active, unlocked_ids=()):
    """找出正文里引用了目标笔记的其他笔记（跳过锁定笔记和代码块）。"""
    if not target_id:
        return []
    unlocked = set(unlocked_ids or [])
    by_title, by_path = _link_maps(active)
    found = []
    for source in active:
        source_id = source.get("KeyID")
        if not source_id or source_id == target_id:
            continue
        if source.get("IsEncrypted") and source_id not in unlocked:
            continue
        content = source.get("Content") or ""
        hit = False
        parts = _CODE_SPLIT_RE.split(content)
        for index in range(0, len(parts), 2):
            for match in _WIKI_RE.finditer(parts[index]):
                target, _ = _resolve_wiki_link(match.group(1), by_title, by_path)
                if target and target.get("KeyID") == target_id:
                    hit = True
                    break
            if not hit and target_id in _MD_LINK_RE.findall(parts[index]):
                hit = True
            if hit:
                break
        if hit:
            found.append(source)
    found.sort(key=lambda r: r.get("ModifyTime") or r.get("AddTime") or "", reverse=True)
    return found


def render_body(content, active):
    linked = _link_wiki(content or "", active)
    return markdown.markdown(linked, extensions=["extra", "sane_lists"])


def plain_text(content):
    rendered = markdown.markdown(content or "", extensions=["extra", "sane_lists"])
    text = re.sub(r"<[^>]+>", " ", rendered)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def word_count(content):
    text = content or ""
    chinese = len(re.findall(r"[㐀-鿿]", text))
    words = len(re.findall(r"[A-Za-z0-9_]+", text))
    return chinese + words


def reading_minutes(count):
    return max(1, (count + 299) // 300)


def _highlight(text, query):
    escaped = html.escape(text)
    if not query:
        return escaped
    try:
        return re.sub(re.escape(html.escape(query)), lambda m: "<mark>%s</mark>" % m.group(0),
                      escaped, flags=re.I)
    except re.error:
        return escaped


def _snippet(text, query, radius=48):
    if not text:
        return ""
    if not query:
        return text[:radius * 2] + ("…" if len(text) > radius * 2 else "")
    idx = text.lower().find(query.lower())
    if idx < 0:
        return text[:radius * 2] + ("…" if len(text) > radius * 2 else "")
    start = max(0, idx - radius)
    end = min(len(text), idx + len(query) + radius)
    piece = text[start:end]
    return ("…" if start else "") + piece + ("…" if end < len(text) else "")


def search(active, by_id, query, unlocked_ids=()):
    query = (query or "").strip()
    if not query:
        return []
    unlocked = set(unlocked_ids or [])
    needle = query.lower()
    results = []
    for record in active:
        rid = record.get("KeyID")
        name = record.get("Name") or ""
        locked = bool(record.get("IsEncrypted")) and rid not in unlocked
        title_hit = needle in name.lower()
        body = "" if locked else plain_text(record.get("Content") or "")
        content_hit = bool(body) and needle in body.lower()
        if not (title_hit or content_hit):
            continue
        snippet = "" if locked else _snippet(body, query)
        results.append({
            "id": rid,
            "name": name,
            "path": path_names(record, by_id),
            "depth": note_depth(record, by_id),
            "updated": record.get("ModifyTime") or record.get("AddTime") or "",
            "encrypted": bool(record.get("IsEncrypted")),
            "locked": locked,
            "title_html": _highlight(name, query),
            "snippet_html": _highlight(snippet, query) if snippet else "",
            "match": "title" if title_hit else "content",
        })

    # 标题命中优先；同组内按更新时间倒序。
    title_hits = [r for r in results if r["match"] == "title"]
    content_hits = [r for r in results if r["match"] == "content"]
    title_hits.sort(key=lambda r: r["updated"] or "", reverse=True)
    content_hits.sort(key=lambda r: r["updated"] or "", reverse=True)
    return title_hits + content_hits


def normalize_content_limits(title, content):
    """返回 (title, content, error)。"""
    title = (title or "").strip()
    content = content or ""
    if not title:
        return title, content, "标题不能为空"
    if len(title) > _TITLE_MAX:
        return title, content, "标题不能超过 %d 个字符" % _TITLE_MAX
    if len(content) > _CONTENT_MAX:
        return title, content, "正文过长，请拆分为子笔记"
    return title, content, None