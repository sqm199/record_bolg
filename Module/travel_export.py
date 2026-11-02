# -*- coding: utf-8 -*-
"""把旅行计划渲染成 Word（.docx）。

页面用的 token 是宣纸白 / 松绿 / 蜜金；Word 里用同一套颜色，
字体统一取 Windows 上常见的「微软雅黑」，避免打开后缺字。
"""
from __future__ import annotations

import time
from io import BytesIO

from docx import Document
from docx.enum.table import WD_ALIGN_VERTICAL
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

FONT = "微软雅黑"
INK = RGBColor(0x2F, 0x36, 0x30)
MUTED = RGBColor(0x63, 0x70, 0x67)
ACCENT = RGBColor(0x4C, 0x6B, 0x58)
HONEY = RGBColor(0xA8, 0x7B, 0x35)
BORDER = "DFE2D6"
HEAD_FILL = "E9F0E9"
NOTE_FILL = "F3F6F0"

SPOT_LABELS = {
    "start": "起点",
    "food": "餐饮",
    "hotel": "住宿",
    "sight": "游玩",
    "way": "途经",
    "end": "终点",
}


def _text(value, default=""):
    if value is None:
        return default
    return str(value).strip()


def _number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def fmt_distance(meters):
    if meters is None:
        return "—"
    if meters >= 1000:
        return "%.1f km" % (meters / 1000.0)
    return "%d m" % round(meters)


def fmt_duration(seconds):
    if seconds is None:
        return "—"
    seconds = max(0, int(round(seconds)))
    if seconds < 60:
        return "约 1 分钟"
    if seconds < 3600:
        return "约 %d 分钟" % round(seconds / 60.0)
    hours = seconds // 3600
    minutes = round((seconds % 3600) / 60.0)
    return "约 %d 小时 %d 分" % (hours, minutes)


def _set_run(run, size=10.5, bold=False, color=INK, italic=False):
    run.font.name = FONT
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = color
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    rfonts.set(qn("w:eastAsia"), FONT)
    rfonts.set(qn("w:ascii"), FONT)
    rfonts.set(qn("w:hAnsi"), FONT)


def _para(container, text="", size=10.5, bold=False, color=INK, italic=False,
          align=None, before=0, after=4, line=1.35):
    p = container.add_paragraph()
    if align is not None:
        p.alignment = align
    pf = p.paragraph_format
    pf.space_before = Pt(before)
    pf.space_after = Pt(after)
    pf.line_spacing = line
    if text:
        run = p.add_run(_text(text))
        _set_run(run, size=size, bold=bold, color=color, italic=italic)
    return p


def _bottom_rule(paragraph, color=BORDER, size=8):
    p_pr = paragraph._p.get_or_add_pPr()
    borders = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), str(size))
    bottom.set(qn("w:space"), "4")
    bottom.set(qn("w:color"), color)
    borders.append(bottom)
    p_pr.append(borders)


def _section_heading(doc, title, note=""):
    p = _para(doc, title, size=14, bold=True, color=INK, before=16, after=3)
    if note:
        _para(doc, note, size=9, color=MUTED, after=6)
    _bottom_rule(p)
    return p


def _shade(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


def _borders(table, color=BORDER, size=4):
    tbl_pr = table._tbl.tblPr
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = OxmlElement("w:%s" % edge)
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), str(size))
        el.set(qn("w:space"), "0")
        el.set(qn("w:color"), color)
        borders.append(el)
    tbl_pr.append(borders)


def _cell_margins(table, top=60, start=90, bottom=60, end=90):
    tbl_pr = table._tbl.tblPr
    mar = OxmlElement("w:tblCellMar")
    for side, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        el = OxmlElement("w:%s" % side)
        el.set(qn("w:w"), str(value))
        el.set(qn("w:type"), "dxa")
        mar.append(el)
    tbl_pr.append(mar)


def _repeat_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    header = OxmlElement("w:tblHeader")
    header.set(qn("w:val"), "true")
    tr_pr.append(header)


def _no_split(row):
    tr_pr = row._tr.get_or_add_trPr()
    tr_pr.append(OxmlElement("w:cantSplit"))


def _cell(cell, text, size=9.5, bold=False, color=INK, align=None, italic=False):
    cell.text = ""
    p = cell.paragraphs[0]
    if align is not None:
        p.alignment = align
    pf = p.paragraph_format
    pf.space_before = Pt(0)
    pf.space_after = Pt(1)
    pf.line_spacing = 1.22
    if text:
        run = p.add_run(_text(text))
        _set_run(run, size=size, bold=bold, color=color, italic=italic)
    cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER


def _cell_lines(cell, lines):
    cell.text = ""
    first = True
    for text, size, bold, color, italic in lines:
        p = cell.paragraphs[0] if first else cell.add_paragraph()
        first = False
        pf = p.paragraph_format
        pf.space_before = Pt(0)
        pf.space_after = Pt(1)
        pf.line_spacing = 1.22
        run = p.add_run(_text(text))
        _set_run(run, size=size, bold=bold, color=color, italic=italic)
    cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER


def _total_stats(spots, legs):
    total_distance = 0.0
    total_duration = 0.0
    has_distance = False
    has_duration = False
    for leg in legs:
        distance = _number(leg.get("Distance"))
        duration = _number(leg.get("Duration"))
        if distance is not None:
            total_distance += distance
            has_distance = True
        if duration is not None:
            total_duration += duration
            has_duration = True
    parts = []
    if has_distance:
        parts.append("全程约 %s" % fmt_distance(total_distance))
    if has_duration:
        duration_text = fmt_duration(total_duration)
        if duration_text.startswith("约 "):
            duration_text = duration_text[2:]
        parts.append("预计 %s" % duration_text)
    return "   ·   ".join(parts)


def build_travel_docx(plan):
    plan = plan or {}
    name = _text(plan.get("Name")) or "未命名旅行计划"
    date = _text(plan.get("Date"))
    note = _text(plan.get("Note"))
    spots = plan.get("Spots") if isinstance(plan.get("Spots"), list) else []
    legs = plan.get("Legs") if isinstance(plan.get("Legs"), list) else []
    legs = sorted(
        [leg for leg in legs if isinstance(leg, dict)],
        key=lambda leg: _number(leg.get("FromIndex")) or 0,
    )

    doc = Document()
    section = doc.sections[0]
    section.page_width = Cm(21.0)
    section.page_height = Cm(29.7)
    section.left_margin = Cm(1.8)
    section.right_margin = Cm(1.8)
    section.top_margin = Cm(1.7)
    section.bottom_margin = Cm(1.5)

    normal = doc.styles["Normal"]
    normal.font.name = FONT
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = INK
    rpr = normal.element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    rfonts.set(qn("w:eastAsia"), FONT)
    rfonts.set(qn("w:ascii"), FONT)
    rfonts.set(qn("w:hAnsi"), FONT)

    doc.core_properties.title = name
    doc.core_properties.subject = "旅行计划"
    doc.core_properties.author = _text(plan.get("AddPerson")) or "羚羊之家"

    header = section.header.paragraphs[0]
    header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = header.add_run("羚羊之家 · 旅行计划")
    _set_run(run, size=9, color=MUTED)

    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = footer.add_run("由羚羊之家生成 · " + time.strftime("%Y-%m-%d %H:%M", time.localtime()))
    _set_run(run, size=8.5, color=MUTED)

    # 标题与元信息
    _para(doc, name, size=24, bold=True, color=INK, after=4, line=1.2)
    meta_parts = []
    meta_parts.append("出发日期：" + (date or "未定"))
    meta_parts.append("%d 个地点" % len(spots))
    meta_parts.append(_total_stats(spots, legs))
    meta_line = "   ·   ".join(p for p in meta_parts if p)
    meta = _para(doc, meta_line, size=9.5, color=MUTED, after=10, line=1.3)
    _bottom_rule(meta, color="C9D3CA", size=10)

    if note:
        _para(doc, "备注", size=10, bold=True, color=ACCENT, before=10, after=4)
        box = doc.add_table(rows=1, cols=1)
        box.autofit = False
        _borders(box, color="DCE8DE", size=4)
        _cell_margins(box, top=90, start=120, bottom=90, end=120)
        cell = box.cell(0, 0)
        _shade(cell, NOTE_FILL)
        _cell(cell, note, size=10, color=INK)

    # 行程地点
    _section_heading(doc, "行程安排", "按计划中的顺序排列；坐标为高德地图使用的 GCJ-02 坐标。")
    table = doc.add_table(rows=1, cols=5)
    table.autofit = False
    table.allow_autofit = False
    _borders(table)
    _cell_margins(table)
    widths = (1.0, 1.9, 3.9, 7.2, 3.2)
    headers = ("序号", "类型", "地点", "地址与备注", "坐标")
    head_row = table.rows[0]
    _repeat_header(head_row)
    _no_split(head_row)
    for index, (cell, title) in enumerate(zip(head_row.cells, headers)):
        cell.width = Cm(widths[index])
        _shade(cell, HEAD_FILL)
        _cell(cell, title, size=9.5, bold=True, color=INK,
              align=WD_ALIGN_PARAGRAPH.CENTER)

    for index, spot in enumerate(spots):
        if not isinstance(spot, dict):
            continue
        row = table.add_row()
        _no_split(row)
        for cell, width in zip(row.cells, widths):
            cell.width = Cm(width)
        label = SPOT_LABELS.get(spot.get("Type"), "地点")
        address = _text(spot.get("Address"))
        remark = _text(spot.get("Remark"))
        _cell(row.cells[0], str(index + 1), size=9.5, color=MUTED,
              align=WD_ALIGN_PARAGRAPH.CENTER)
        _cell(row.cells[1], label, size=9.5,
              color=ACCENT if spot.get("Type") in ("start", "end") else INK,
              bold=spot.get("Type") in ("start", "end"),
              align=WD_ALIGN_PARAGRAPH.CENTER)
        _cell(row.cells[2], _text(spot.get("Name")) or "未命名", size=9.8, bold=True)
        detail_lines = []
        if address:
            detail_lines.append((address, 9.2, False, MUTED, False))
        if remark:
            detail_lines.append((remark, 9.2, False, INK, True))
        if not detail_lines:
            detail_lines.append(("—", 9.2, False, MUTED, False))
        _cell_lines(row.cells[3], detail_lines)
        _cell(row.cells[4], _text(spot.get("LngLat")) or "—", size=8.5, color=MUTED)

    # 分段行程
    _section_heading(doc, "分段行程", "距离与时间来自高德驾车路径规划；未计算时显示为 —。")
    if legs:
        leg_table = doc.add_table(rows=1, cols=4)
        leg_table.autofit = False
        leg_table.allow_autofit = False
        _borders(leg_table)
        _cell_margins(leg_table)
        leg_widths = (6.1, 3.1, 3.4, 4.6)
        leg_headers = ("路段", "距离", "预计用时", "备注")
        head = leg_table.rows[0]
        _repeat_header(head)
        _no_split(head)
        for idx, (cell, title) in enumerate(zip(head.cells, leg_headers)):
            cell.width = Cm(leg_widths[idx])
            _shade(cell, HEAD_FILL)
            _cell(cell, title, size=9.5, bold=True,
                  align=WD_ALIGN_PARAGRAPH.CENTER)
        for leg in legs:
            from_index = _number(leg.get("FromIndex"))
            to_index = _number(leg.get("ToIndex"))
            if from_index is None or to_index is None:
                continue
            from_index = int(from_index)
            to_index = int(to_index)
            if from_index < 0 or to_index >= len(spots):
                continue
            from_name = _text(spots[from_index].get("Name")) or "未命名"
            to_name = _text(spots[to_index].get("Name")) or "未命名"
            row = leg_table.add_row()
            _no_split(row)
            for cell, width in zip(row.cells, leg_widths):
                cell.width = Cm(width)
            _cell(row.cells[0], "%s → %s" % (from_name, to_name), size=9.5)
            _cell(row.cells[1], fmt_distance(_number(leg.get("Distance"))),
                  size=9.5, align=WD_ALIGN_PARAGRAPH.CENTER)
            _cell(row.cells[2], fmt_duration(_number(leg.get("Duration"))),
                  size=9.5, align=WD_ALIGN_PARAGRAPH.CENTER)
            _cell(row.cells[3], "已计算" if leg.get("CachedAt") else "—",
                  size=9, color=MUTED)
        summary = _total_stats(spots, legs)
        if summary:
            _para(doc, summary, size=9.5, color=ACCENT, before=8, after=0)
    else:
        _para(doc, "还没有分段路线。可在网页版点击「重新计算路线」后再导出。",
              size=9.8, color=MUTED, italic=True, before=2, after=2)

    buffer = BytesIO()
    doc.save(buffer)
    return buffer.getvalue()