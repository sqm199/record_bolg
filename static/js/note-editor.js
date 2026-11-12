/* ── 笔记编辑器：段落工具栏 / 选中浮条 / 快速插入 / 草稿 / 预览 / 专注 ── */
(function () {
  'use strict';

  var configEl = document.getElementById('editorConfig');
  if (!configEl) return;
  var cfg;
  try { cfg = JSON.parse(configEl.textContent); } catch (e) { return; }

  var linkEl = document.getElementById('noteLinkData');
  var linkNotes = [];
  try { linkNotes = JSON.parse(linkEl ? linkEl.textContent : '[]'); } catch (e) { linkNotes = []; }

  /* ── DOM ── */
  var titleEl = document.getElementById('noteTitle');
  var contentEl = document.getElementById('noteContent');
  var shellEl = document.getElementById('editorShell');
  var toolbarEl = document.getElementById('editorToolbar');
  var statusEl = document.getElementById('editorStatus');
  var statusTextEl = document.getElementById('editorStatusText');
  var messageEl = document.getElementById('editorMsg');
  var saveBtn = document.getElementById('editorSaveBtn');
  var cancelBtn = document.getElementById('editorCancelBtn');
  var encryptEl = document.getElementById('noteEncrypt');
  var passwordEl = document.getElementById('notePassword');
  var passwordWrap = document.getElementById('passwordWrap');
  var parentEl = document.getElementById('noteParent');
  var parentHint = document.getElementById('parentDepthHint');
  var wordEl = document.getElementById('editorWordCount');
  var readEl = document.getElementById('editorReadTime');
  var styleBtn = document.getElementById('styleBtn');
  var styleLabel = document.getElementById('styleLabel');
  var styleMenu = document.getElementById('styleMenu');
  var slashMenu = document.getElementById('slashMenu');
  var noteAuto = document.getElementById('noteAuto');
  var bubbleEl = document.getElementById('editorBubble');
  var previewBtn = document.getElementById('previewBtn');
  var previewLabel = document.getElementById('previewLabel');
  var focusBtn = document.getElementById('focusBtn');
  var focusLabel = document.getElementById('focusLabel');
  var previewEl = document.getElementById('editorPreview');
  var previewBody = document.getElementById('editorPreviewBody');
  var draftBanner = document.getElementById('draftBanner');
  var draftRestore = document.getElementById('draftRestoreBtn');
  var draftDiscard = document.getElementById('draftDiscardBtn');
  var discardModalEl = document.getElementById('editorDiscardModal');
  var discardConfirm = document.getElementById('editorDiscardConfirmBtn');
  var linkModalEl = document.getElementById('noteLinkModal');
  var linkSearchEl = document.getElementById('noteLinkSearch');
  var linkListEl = document.getElementById('noteLinkList');
  var insertLinkBtn = document.getElementById('insertNoteLinkBtn');
  var insertLinkBtnAside = document.getElementById('insertNoteLinkBtnAside');

  var FENCE = '```';
  var BLOCK_RE = /^(\s*)(#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/;
  var UL_RE = /^\s{0,3}[-*+]\s+/;
  var OL_RE = /^\s{0,3}\d+[.)]\s+/;
  var QUOTE_RE = /^\s{0,3}>\s?/;
  var HEAD_RE = /^\s{0,3}(#{1,6})\s+/;

  var state = {
    saving: false,
    saved: false,
    dirty: false,
    composing: false,
    preview: false,
    focus: false,
    previewToken: 0
  };
  var initial = {
    title: titleEl ? titleEl.value : '',
    content: contentEl ? contentEl.value : '',
    parent: parentEl ? parentEl.value : '',
    encrypted: !!(encryptEl && encryptEl.checked)
  };
  var draftTimer = null;
  var pendingDraft = null;
  var menu = null;           // { kind:'slash'|'note', items, index, start }
  var styleOpen = false;
  var bubbleTimer = null;
  var linkInsert = null;     // 打开弹窗前记住的光标位置

  /* ── 小工具 ── */
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function encryptionOn() { return !!(encryptEl && encryptEl.checked); }
  function value() { return contentEl ? contentEl.value : ''; }
  function selStart() { return contentEl ? contentEl.selectionStart : 0; }
  function selEnd() { return contentEl ? contentEl.selectionEnd : 0; }
  function lineStartAt(pos) { return value().lastIndexOf('\n', pos - 1) + 1; }
  function lineEndAt(pos) {
    var end = value().indexOf('\n', pos);
    return end === -1 ? value().length : end;
  }
  function wordCount(text) {
    var chinese = (text.match(/[㐀-鿿]/g) || []).length;
    var words = (text.match(/[A-Za-z0-9_]+/g) || []).length;
    return chinese + words;
  }
  function readingMinutes(count) { return Math.max(1, Math.ceil(count / 300)); }

  /* ── 状态 / 脏检查 / 草稿 ── */
  function setStatus(text, status) {
    if (!statusEl) return;
    if (statusTextEl) statusTextEl.textContent = text;
    statusEl.dataset.state = status || 'clean';
  }
  function isDirtyNow() {
    return (titleEl && titleEl.value !== initial.title) ||
      (contentEl && contentEl.value !== initial.content) ||
      (parentEl && parentEl.value !== initial.parent) ||
      encryptionOn() !== initial.encrypted ||
      !!(passwordEl && passwordEl.value);
  }
  function checkDirty() {
    state.dirty = isDirtyNow();
    if (state.dirty) {
      setStatus('未保存', 'dirty');
      scheduleDraft();
    } else {
      setStatus('未修改', 'clean');
    }
  }
  function draftKey() {
    return 'note-draft-v1:' + (cfg.mode === 'edit' ? cfg.keyid : 'new');
  }
  function scheduleDraft() {
    if (draftTimer) clearTimeout(draftTimer);
    if (encryptionOn() || !state.dirty) return;
    draftTimer = setTimeout(function () {
      if (!isDirtyNow() || encryptionOn()) return;
      try {
        localStorage.setItem(draftKey(), JSON.stringify({
          title: titleEl ? titleEl.value : '',
          content: value(),
          parentId: parentEl ? parentEl.value : '',
          ts: Date.now()
        }));
        var when = new Date();
        if (isDirtyNow()) setStatus('草稿已保存 ' + pad2(when.getHours()) + ':' + pad2(when.getMinutes()), 'draft');
      } catch (e) { /* 本地存储不可用时静默失败 */ }
    }, 900);
  }
  function clearDraft() {
    if (draftTimer) { clearTimeout(draftTimer); draftTimer = null; }
    try { localStorage.removeItem(draftKey()); } catch (e) { /* ignore */ }
    if (draftBanner) draftBanner.hidden = true;
    pendingDraft = null;
  }

  /* ── 文本编辑 ── */
  function applyEdit(start, end, text, nextStart, nextEnd) {
    if (!contentEl) return;
    contentEl.focus();
    contentEl.setRangeText(text, start, end, 'end');
    if (typeof nextStart === 'number') {
      contentEl.setSelectionRange(nextStart, typeof nextEnd === 'number' ? nextEnd : nextStart);
    }
    afterEdit();
  }
  function afterEdit() {
    checkDirty();
    updateChrome();
    hideBubble();
    closeMenus();
  }
  function hasMarkerAt(pos, marker) {
    var v = value();
    if (v.slice(pos, pos + marker.length) !== marker) return false;
    if (marker === '*') {
      if (v.charAt(pos - 1) === '*' || v.charAt(pos + marker.length) === '*') return false;
    }
    if (marker === '`') {
      if (v.charAt(pos - 1) === '`' || v.charAt(pos + marker.length) === '`') return false;
    }
    if (marker === '~') {
      if (v.charAt(pos - 1) === '~' || v.charAt(pos + marker.length) === '~') return false;
    }
    return true;
  }
  function isWrapped(marker) {
    var start = selStart(), end = selEnd(), v = value();
    if (start === end) {
      return hasMarkerAt(start - marker.length, marker) && hasMarkerAt(end, marker);
    }
    if (hasMarkerAt(start, marker) && hasMarkerAt(end - marker.length, marker)) return true;
    return hasMarkerAt(start - marker.length, marker) && hasMarkerAt(end, marker);
  }
  function toggleWrap(marker, placeholder) {
    var start = selStart(), end = selEnd(), v = value();
    var selected = v.slice(start, end);

    if (start !== end && hasMarkerAt(start, marker) && hasMarkerAt(end - marker.length, marker)) {
      var inner = v.slice(start + marker.length, end - marker.length);
      applyEdit(start, end, inner, start, start + inner.length);
      return;
    }
    if (start !== end && hasMarkerAt(start - marker.length, marker) && hasMarkerAt(end, marker)) {
      var newStart = start - marker.length;
      applyEdit(newStart, end + marker.length, selected, newStart, newStart + selected.length);
      return;
    }
    if (start === end && hasMarkerAt(start - marker.length, marker) && hasMarkerAt(end, marker)) {
      var p = start - marker.length;
      var text = v.slice(p + marker.length, end);
      var caret = start - marker.length;
      applyEdit(p, end + marker.length, text, caret, caret + text.length);
      return;
    }

    var body = selected || placeholder || '';
    var wrapped = marker + body + marker;
    applyEdit(start, end, wrapped, start + marker.length, start + marker.length + body.length);
  }

  function transformBlock(prefix, isToggle) {
    var v = value();
    var start = selStart(), end = selEnd();
    var blockStart = lineStartAt(start);
    var blockEnd = lineEndAt(end);
    if (end > blockStart && v.charAt(end - 1) === '\n') blockEnd = end - 1;
    var block = v.slice(blockStart, blockEnd);
    var lines = block.split('\n');
    var nonEmpty = lines.filter(function (line) { return line.trim(); });
    var allHave = nonEmpty.length > 0 && nonEmpty.every(function (line) {
      var body = line.replace(/^\s*/, '');
      if (prefix === '- ') return /^[-*+]\s+/.test(body);
      if (prefix === '1. ') return /^\d+[.)]\s+/.test(body);
      if (prefix === '> ') return /^>\s?/.test(body);
      if (prefix === '') return false;
      return body.indexOf(prefix) === 0;
    });

    var counter = 0;
    var nextLines = lines.map(function (line) {
      if (!line.trim()) return '';
      var indentMatch = line.match(/^\s*/);
      var indent = indentMatch[0];
      var body = line.slice(indent.length).replace(BLOCK_RE, '');
      if (isToggle && allHave) return indent + body;
      if (prefix === '1. ' && !(isToggle && allHave)) {
        counter += 1;
        return indent + counter + '. ' + body;
      }
      return indent + prefix + body;
    });
    var nextBlock = nextLines.join('\n');
    var oldFirst = lines[0] || '';
    var newFirst = nextLines[0] || '';
    var caretInFirst = clamp(start - blockStart + (newFirst.length - oldFirst.length), 0, newFirst.length);

    if (start !== end) {
      applyEdit(blockStart, blockEnd, nextBlock, blockStart, blockStart + nextBlock.length);
    } else {
      applyEdit(blockStart, blockEnd, nextBlock, blockStart + caretInFirst);
    }
  }

  function setBlockStyle(prefix) {
    transformBlock(prefix, false);
    if (prefix === '# ') styleLabel.textContent = '标题 1';
    else if (prefix === '## ') styleLabel.textContent = '标题 2';
    else if (prefix === '### ') styleLabel.textContent = '标题 3';
    else if (prefix === '> ') styleLabel.textContent = '引用';
    else styleLabel.textContent = '正文';
  }

  function blockCommand(cmd) {
    if (cmd === 'ul') transformBlock('- ', true);
    else if (cmd === 'ol') transformBlock('1. ', true);
    else if (cmd === 'quote') transformBlock('> ', true);
  }

  function ensureBlock(text, caretOffset) {
    var v = value(), start = selStart(), end = selEnd();
    if (start !== end) {
      applyEdit(start, end, text, start + (typeof caretOffset === 'number' ? caretOffset : text.length));
      return;
    }
    var before = v.slice(0, start), after = v.slice(end);
    var lead = (!before || before.charAt(before.length - 1) === '\n') ? '' : '\n';
    var tail = (!after || after.charAt(0) === '\n') ? '' : '\n';
    var full = lead + text + tail;
    var caret = start + lead.length + (typeof caretOffset === 'number' ? caretOffset : text.length);
    applyEdit(start, end, full, caret);
  }

  function insertCodeBlock() {
    var start = selStart(), end = selEnd();
    var selected = value().slice(start, end);
    if (selected) {
      var text = FENCE + '\n' + selected + '\n' + FENCE;
      applyEdit(start, end, text, start + FENCE.length + 1);
      return;
    }
    ensureBlock(FENCE + '\n\n' + FENCE, FENCE.length + 1);
  }
  function insertTable() {
    ensureBlock('| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n|  |  |  |', 2);
  }
  function insertDivider() {
    ensureBlock('---', 3);
  }
  function insertLink() {
    var start = selStart(), end = selEnd();
    var selected = value().slice(start, end);
    if (selected) {
      var text = '[' + selected + '](https://)';
      var urlStart = start + selected.length + 3;
      applyEdit(start, end, text, urlStart, text.length + start - 1);
    } else {
      var snippet = '[链接文字](https://)';
      applyEdit(start, end, snippet, start + 1, start + 5);
    }
  }
  function runCommand(cmd) {
    if (state.preview) return;
    if (cmd === 'bold') toggleWrap('**', '');
    else if (cmd === 'italic') toggleWrap('*', '');
    else if (cmd === 'strike') toggleWrap('~~', '');
    else if (cmd === 'inlinecode') toggleWrap('`', '');
    else if (cmd === 'link') insertLink();
    else if (cmd === 'note-link') openNoteLink();
    else if (cmd === 'ul' || cmd === 'ol' || cmd === 'quote') blockCommand(cmd);
    else if (cmd === 'codeblock') insertCodeBlock();
    else if (cmd === 'table') insertTable();
    else if (cmd === 'divider') insertDivider();
  }

  /* ── 工具条状态 ── */
  function currentToolbarState() {
    var pos = selStart();
    var line = value().slice(lineStartAt(pos), lineEndAt(pos));
    var head = line.match(HEAD_RE);
    var label = '正文';
    if (head) label = '标题 ' + head[1].length;
    else if (QUOTE_RE.test(line)) label = '引用';
    if (styleLabel) styleLabel.textContent = label;

    var ul = document.querySelector('.editor-tb-btn[data-cmd="ul"]');
    var ol = document.querySelector('.editor-tb-btn[data-cmd="ol"]');
    var quote = document.querySelector('.editor-tb-btn[data-cmd="quote"]');
    setPressed(ul, UL_RE.test(line));
    setPressed(ol, OL_RE.test(line));
    setPressed(quote, QUOTE_RE.test(line));
    setPressed(document.querySelector('.editor-tb-btn[data-cmd="bold"]'), isWrapped('**'));
    setPressed(document.querySelector('.editor-tb-btn[data-cmd="italic"]'), isWrapped('*'));
    setPressed(document.querySelector('.editor-tb-btn[data-cmd="strike"]'), isWrapped('~~'));
    setPressed(document.querySelector('.editor-tb-btn[data-cmd="inlinecode"]'), isWrapped('`'));

    var bubbleButtons = bubbleEl ? bubbleEl.querySelectorAll('[data-bubble]') : [];
    Array.prototype.forEach.call(bubbleButtons, function (btn) {
      var kind = btn.dataset.bubble;
      var on = kind === 'bold' ? isWrapped('**')
        : kind === 'italic' ? isWrapped('*')
          : kind === 'strike' ? isWrapped('~~')
            : kind === 'inlinecode' ? isWrapped('`') : false;
      btn.classList.toggle('is-active', on);
    });
  }
  function setPressed(el, on) {
    if (!el) return;
    el.classList.toggle('is-active', !!on);
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  function updateChrome() {
    var count = wordCount(value());
    if (wordEl) wordEl.textContent = count + ' 字';
    if (readEl) readEl.textContent = '约 ' + readingMinutes(count) + ' 分钟';
    currentToolbarState();
  }

  /* ── 光标坐标（textarea 镜像法） ── */
  var mirrorEl = null;
  function caretCoordinates(position) {
    if (!contentEl) return { top: 0, left: 0 };
    if (!mirrorEl) {
      mirrorEl = document.createElement('div');
      mirrorEl.setAttribute('aria-hidden', 'true');
      document.body.appendChild(mirrorEl);
    }
    var computed = window.getComputedStyle(contentEl);
    var props = ['boxSizing', 'width', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth',
      'borderLeftWidth', 'borderStyle', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'fontStyle', 'fontVariant', 'fontWeight', 'fontSize', 'lineHeight', 'fontFamily',
      'textAlign', 'textTransform', 'textIndent', 'letterSpacing', 'wordSpacing',
      'tabSize', 'whiteSpace', 'wordWrap', 'overflowWrap'];
    var s = mirrorEl.style;
    s.position = 'absolute';
    s.visibility = 'hidden';
    s.top = '0';
    s.left = '0';
    s.height = 'auto';
    s.overflow = 'hidden';
    s.whiteSpace = 'pre-wrap';
    s.wordWrap = 'break-word';
    s.overflowWrap = 'break-word';
    props.forEach(function (p) { s[p] = computed[p]; });

    mirrorEl.textContent = value().slice(0, position);
    var span = document.createElement('span');
    span.textContent = value().slice(position) || '.';
    mirrorEl.appendChild(span);

    var rect = contentEl.getBoundingClientRect();
    var top = rect.top + span.offsetTop + (parseFloat(computed.borderTopWidth) || 0) - contentEl.scrollTop;
    var left = rect.left + span.offsetLeft + (parseFloat(computed.borderLeftWidth) || 0) - contentEl.scrollLeft;
    mirrorEl.textContent = '';
    return { top: top, left: left };
  }

  /* ── 选中浮条 ── */
  function scheduleBubble() {
    if (bubbleTimer) clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(updateBubble, 120);
  }
  function updateBubble() {
    if (!bubbleEl) return;
    if (state.preview || menu || styleOpen || document.activeElement !== contentEl) {
      hideBubble();
      return;
    }
    var start = selStart(), end = selEnd();
    if (start === end || end - start > 1200) {
      hideBubble();
      return;
    }
    var c1 = caretCoordinates(start);
    var c2 = caretCoordinates(end);
    bubbleEl.hidden = false;
    var w = bubbleEl.offsetWidth;
    var h = bubbleEl.offsetHeight;
    var hostRect = contentEl.getBoundingClientRect();
    var left = (c1.left + c2.left) / 2 - w / 2;
    var top = Math.min(c1.top, c2.top) - h - 8;
    // 选区贴近编辑区顶部时放到下一行，避免压住工具栏。
    if (top < hostRect.top + 4) top = Math.max(c1.top, c2.top) + 30;
    bubbleEl.style.left = Math.round(clamp(left, 12, window.innerWidth - w - 12)) + 'px';
    bubbleEl.style.top = Math.round(clamp(top, 62, window.innerHeight - h - 12)) + 'px';
    currentToolbarState();
  }
  function hideBubble() {
    if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null; }
    if (bubbleEl) bubbleEl.hidden = true;
  }

  /* ── 弹层定位 / 关闭 ── */
  function placeAtCaret(el, caret) {
    var c = caretCoordinates(caret);
    el.hidden = false;
    el.style.left = '0px';
    el.style.top = '0px';
    var w = el.offsetWidth, h = el.offsetHeight;
    var left = clamp(c.left, 12, window.innerWidth - w - 12);
    var top = c.top + 26;
    if (top + h > window.innerHeight - 12) top = Math.max(12, c.top - h - 8);
    el.style.left = Math.round(left) + 'px';
    el.style.top = Math.round(top) + 'px';
  }
  function placeUnder(el, anchor) {
    var r = anchor.getBoundingClientRect();
    el.hidden = false;
    el.style.left = '0px';
    el.style.top = '0px';
    var w = el.offsetWidth;
    el.style.left = Math.round(clamp(r.left, 12, window.innerWidth - w - 12)) + 'px';
    el.style.top = Math.round(r.bottom + 6) + 'px';
  }
  function closeMenus() {
    if (slashMenu) slashMenu.hidden = true;
    if (noteAuto) noteAuto.hidden = true;
    if (styleMenu) styleMenu.hidden = true;
    styleOpen = false;
    if (styleBtn) styleBtn.setAttribute('aria-expanded', 'false');
    menu = null;
    if (contentEl) contentEl.removeAttribute('aria-activedescendant');
  }

  /* ── 段落样式菜单 ── */
  function toggleStyleMenu() {
    if (styleOpen) { closeMenus(); return; }
    closeMenus();
    styleOpen = true;
    styleMenu.hidden = false;
    styleBtn.setAttribute('aria-expanded', 'true');
    placeUnder(styleMenu, styleBtn);
  }
  Array.prototype.forEach.call(styleMenu.querySelectorAll('[data-style]'), function (item) {
    item.addEventListener('mousedown', function (e) { e.preventDefault(); });
    item.addEventListener('click', function () {
      var prefix = item.getAttribute('data-style');
      closeMenus();
      setBlockStyle(prefix);
      contentEl.focus();
    });
  });

  /* ── 斜杠命令 ── */
  var TABLE_SNIPPET = '| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n|  |  |  |';
  var slashItems = [
    { id: 'h1', label: '标题 1', desc: '页面大标题', icon: 'heading', kbd: '#', block: '# ' },
    { id: 'h2', label: '标题 2', desc: '段落小标题', icon: 'heading', kbd: '##', block: '## ' },
    { id: 'h3', label: '标题 3', desc: '更小的分组标题', icon: 'heading', kbd: '###', block: '### ' },
    { id: 'ul', label: '无序列表', desc: '用圆点组织内容', icon: 'list', kbd: '-', block: '- ' },
    { id: 'ol', label: '有序列表', desc: '按步骤排列', icon: 'list-ordered', kbd: '1.', block: '1. ' },
    { id: 'quote', label: '引用', desc: '突出引用段落', icon: 'quote', kbd: '>', block: '> ' },
    { id: 'code', label: '代码块', desc: '等宽代码区域', icon: 'code-block', kbd: '```', snippet: FENCE + '\n\n' + FENCE, caret: FENCE.length + 1 },
    { id: 'table', label: '表格', desc: '三行三列表格', icon: 'table', kbd: '表', snippet: TABLE_SNIPPET, caret: 2 },
    { id: 'divider', label: '分割线', desc: '分隔不同段落', icon: 'divider', kbd: '---', snippet: '---', caret: 3 },
    { id: 'note', label: '链接到笔记', desc: '引用站内另一篇笔记', icon: 'note', kbd: '[[', action: 'note-link' },
    { id: 'link', label: '外部链接', desc: '插入网页地址', icon: 'link', kbd: '[]()', snippet: '[链接文字](https://)', select: [1, 5] },
    { id: 'image', label: '图片', desc: '通过图片地址插入', icon: 'image', kbd: '![]()', snippet: '![图片说明](https://)', select: [2, 6] }
  ];

  function renderMenuItems(container, kind, items, activeIndex) {
    container.innerHTML = '';
    if (!items.length) {
      var empty = document.createElement('p');
      empty.className = 'editor-popover-empty';
      empty.textContent = kind === 'note' ? '没有匹配的笔记。' : '没有匹配的插入项。';
      container.appendChild(empty);
      return;
    }
    items.forEach(function (item, index) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'editor-popover-item' + (index === activeIndex ? ' is-active' : '');
      btn.id = (kind === 'note' ? 'noteAutoOpt' : 'slashOpt') + index;
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', index === activeIndex ? 'true' : 'false');
      btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
      btn.addEventListener('click', function () { chooseMenu(index); });

      var icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('class', 'icon');
      icon.setAttribute('aria-hidden', 'true');
      var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', '#i-' + (item.icon || 'note'));
      icon.appendChild(use);
      btn.appendChild(icon);

      var main = document.createElement('span');
      main.className = 'editor-popover-item-main';
      var label = document.createElement('span');
      label.className = 'editor-popover-item-label';
      label.textContent = item.label;
      main.appendChild(label);
      if (item.desc) {
        var desc = document.createElement('small');
        desc.textContent = item.desc;
        main.appendChild(desc);
      }
      btn.appendChild(main);

      if (item.kbd) {
        var kbd = document.createElement('kbd');
        kbd.textContent = item.kbd;
        btn.appendChild(kbd);
      }
      container.appendChild(btn);
    });
  }

  function showSlash(query, lineStart, caret) {
    closeMenus();
    var q = (query || '').toLowerCase();
    var candidates = [];
    slashItems.forEach(function (item, order) {
      var label = item.label.toLowerCase();
      var haystack = (item.label + ' ' + item.desc + ' ' + item.id + ' ' + (item.kbd || '')).toLowerCase();
      if (q && haystack.indexOf(q) < 0) return;
      // 标题命中优先于描述命中，前缀命中再优先。
      var score = !q ? 0 : label.indexOf(q) === 0 ? 0 : label.indexOf(q) >= 0 ? 1 : 2;
      candidates.push({ item: item, score: score, order: order });
    });
    candidates.sort(function (a, b) { return a.score - b.score || a.order - b.order; });
    var items = candidates.map(function (entry) { return entry.item; });
    menu = { kind: 'slash', items: items, index: 0, start: lineStart };
    renderMenuItems(slashMenu, 'slash', items, 0);
    placeAtCaret(slashMenu, caret);
    if (items.length) contentEl.setAttribute('aria-activedescendant', 'slashOpt0');
  }

  function showNoteAuto(query, start, caret) {
    closeMenus();
    var q = (query || '').toLowerCase();
    var items = [];
    linkNotes.forEach(function (note) {
      var path = (note.path || []).join(' / ');
      var haystack = ((note.name || '') + ' ' + path).toLowerCase();
      if (q && haystack.indexOf(q) < 0) return;
      items.push({
        id: note.id,
        label: note.name || '未命名',
        desc: path,
        icon: note.encrypted ? 'lock' : 'note',
        name: note.name || '未命名'
      });
    });
    items = items.slice(0, 8);
    menu = { kind: 'note', items: items, index: 0, start: start };
    renderMenuItems(noteAuto, 'note', items, 0);
    placeAtCaret(noteAuto, caret);
    if (items.length) contentEl.setAttribute('aria-activedescendant', 'noteAutoOpt0');
  }

  function updateMenuActive() {
    if (!menu) return;
    var container = menu.kind === 'slash' ? slashMenu : noteAuto;
    var prefix = menu.kind === 'slash' ? 'slashOpt' : 'noteAutoOpt';
    Array.prototype.forEach.call(container.querySelectorAll('.editor-popover-item'), function (el, index) {
      var on = index === menu.index;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) {
        contentEl.setAttribute('aria-activedescendant', prefix + index);
        if (el.offsetTop < container.scrollTop) container.scrollTop = el.offsetTop;
        else if (el.offsetTop + el.offsetHeight > container.scrollTop + container.clientHeight) {
          container.scrollTop = el.offsetTop + el.offsetHeight - container.clientHeight;
        }
      }
    });
  }

  function chooseMenu(index) {
    if (!menu || !menu.items[index]) return;
    var item = menu.items[index];
    var kind = menu.kind;
    var start = menu.start;
    var caret = selStart();
    closeMenus();
    contentEl.focus();

    if (kind === 'note') {
      var name = String(item.name || '').replace(/\]\]/g, '] ]');
      var snippet = '[[' + name + ']]';
      applyEdit(start, caret, snippet, start + snippet.length);
      return;
    }

    if (item.action === 'note-link') {
      applyEdit(start, caret, '', start);
      openNoteLink();
      return;
    }
    if (item.block) {
      applyEdit(start, caret, item.block, start + item.block.length);
      return;
    }
    if (item.snippet) {
      var lineEnd = lineEndAt(caret);
      applyEdit(start, lineEnd, item.snippet, start + (item.caret || item.snippet.length));
      if (item.select) {
        contentEl.setSelectionRange(start + item.select[0], start + item.select[1]);
      }
      updateChrome();
    }
  }

  /* ── 内联识别：/ 与 [[ ── */
  function inFence(text) {
    return (text.match(/```/g) || []).length % 2 === 1;
  }
  function detectInline() {
    if (!contentEl || state.composing || state.preview) { closeMenus(); return; }
    var start = selStart(), end = selEnd();
    if (start !== end) { closeMenus(); return; }
    var before = value().slice(0, start);
    var lineStart = before.lastIndexOf('\n') + 1;
    var line = before.slice(lineStart);

    // 行首直接输入 /，或在列表/引用标记后输入 / 都可唤起插入菜单。
    var slash = line.match(/^[ \t]*(?:[-*+]|\d+[.)]|>)\s*\/([^\s/]*)$/) ||
      line.match(/^[ \t]*\/([^\s/]*)$/);
    if (slash && !inFence(before)) {
      showSlash(slash[1], lineStart, start);
      return;
    }

    var idx = before.lastIndexOf('[[');
    if (idx >= lineStart) {
      var between = before.slice(idx + 2);
      if (!/[\n\[\]]/.test(between) && !inFence(before)) {
        showNoteAuto(between.trim(), idx, start);
        return;
      }
    }
    closeMenus();
  }

  function handleMenuKey(event) {
    if (!menu) return false;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenus();
      return true;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!menu.items.length) return true;
      var delta = event.key === 'ArrowDown' ? 1 : -1;
      menu.index = (menu.index + delta + menu.items.length) % menu.items.length;
      updateMenuActive();
      return true;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      if (!menu.items.length) {
        if (event.key === 'Enter') closeMenus();
        return true;
      }
      event.preventDefault();
      chooseMenu(menu.index);
      return true;
    }
    return false;
  }

  /* ── 预览 ── */
  function setPreview(on) {
    state.preview = !!on;
    closeMenus();
    hideBubble();
    if (shellEl) shellEl.classList.toggle('is-previewing', state.preview);
    if (previewEl) previewEl.hidden = !state.preview;
    if (contentEl) contentEl.hidden = state.preview;
    if (previewBtn) {
      previewBtn.classList.toggle('is-active', state.preview);
      previewBtn.setAttribute('aria-pressed', state.preview ? 'true' : 'false');
      previewBtn.setAttribute('aria-label', state.preview ? '返回编辑' : '预览');
      previewBtn.setAttribute('data-tip', state.preview ? '返回编辑 · Ctrl+Shift+P' : '预览 · Ctrl+Shift+P');
      var use = previewBtn.querySelector('use');
      if (use) use.setAttribute('href', state.preview ? '#i-pencil' : '#i-eye');
    }
    if (previewLabel) previewLabel.textContent = state.preview ? '编辑' : '预览';
    if (state.preview) renderPreview();
    else if (contentEl) contentEl.focus();
  }
  function renderPreview() {
    if (!previewBody) return;
    var token = ++state.previewToken;
    if (!value().trim()) {
      previewBody.innerHTML = '<p class="editor-preview-empty">还没有正文，返回编辑写点什么吧。</p>';
      return;
    }
    previewBody.innerHTML = '<p class="editor-preview-empty">正在生成预览…</p>';
    fetch(cfg.previewUrl || '/note/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ content: value() })
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (token !== state.previewToken || !state.preview) return;
      if (data.code === 1) {
        previewBody.innerHTML = data.html || '<p class="editor-preview-empty">还没有正文。</p>';
      } else {
        previewBody.textContent = data.msgs || '预览失败，请重试。';
      }
    }).catch(function () {
      if (token !== state.previewToken || !state.preview) return;
      previewBody.innerHTML = '<p class="editor-preview-empty">预览加载失败，请检查网络后重试。</p>';
    });
  }
  function togglePreview(force) {
    setPreview(typeof force === 'boolean' ? force : !state.preview);
  }

  /* ── 专注模式 ── */
  function setFocus(on) {
    state.focus = !!on;
    document.body.classList.toggle('editor-focus', state.focus);
    if (focusBtn) {
      focusBtn.classList.toggle('is-active', state.focus);
      focusBtn.setAttribute('aria-pressed', state.focus ? 'true' : 'false');
      focusBtn.setAttribute('aria-label', state.focus ? '退出专注' : '专注写作');
      focusBtn.setAttribute('data-tip', state.focus ? '退出专注 · Esc' : '专注写作 · Esc 退出');
      var use = focusBtn.querySelector('use');
      if (use) use.setAttribute('href', state.focus ? '#i-minimize' : '#i-maximize');
    }
    if (focusLabel) focusLabel.textContent = state.focus ? '退出' : '专注';
    if (!state.preview) contentEl.focus();
  }

  /* ── 保存 ── */
  function save() {
    if (state.saving) return;
    var title = titleEl ? titleEl.value.trim() : '';
    if (!title) {
      if (messageEl) messageEl.textContent = '标题不能为空';
      if (titleEl) titleEl.focus();
      return;
    }
    if (encryptionOn() && !cfg.hasPassword && passwordEl && !passwordEl.value) {
      if (messageEl) messageEl.textContent = '加密笔记必须设置密码';
      passwordEl.focus();
      return;
    }
    if (messageEl) messageEl.textContent = '';
    state.saving = true;
    saveBtn.disabled = true;
    setStatus('保存中…', 'dirty');

    var payload = {
      title: title,
      content: value(),
      content_format: 'markdown',
      parent_id: parentEl ? parentEl.value : '',
      is_encrypted: encryptionOn() ? '1' : '0',
      password: passwordEl ? passwordEl.value : ''
    };
    var url = '/note/save';
    if (cfg.mode === 'edit') {
      url = '/note/update';
      payload.KeyID = cfg.keyid;
    }
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(payload)
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (data.code === 1) {
        state.saved = true;
        state.dirty = false;
        clearDraft();
        setStatus('已保存', 'saved');
        var keyId = data.keyid || cfg.keyid;
        window.location.href = '/note/view/' + encodeURIComponent(keyId);
        return;
      }
      if (messageEl) messageEl.textContent = data.msgs || '保存失败';
      state.saving = false;
      saveBtn.disabled = false;
      setStatus('保存失败', 'error');
    }).catch(function () {
      if (messageEl) messageEl.textContent = '网络错误，请重试';
      state.saving = false;
      saveBtn.disabled = false;
      setStatus('保存失败', 'error');
    });
  }

  /* ── 笔记链接弹窗 ── */
  var linkModal = null;
  function openNoteLink() {
    if (state.preview) setPreview(false);
    linkInsert = { start: selStart(), end: selEnd() };
    linkModal = linkModal || UI.modal(linkModalEl);
    if (linkSearchEl) linkSearchEl.value = '';
    renderLinkList('');
    linkModal.show();
    if (linkSearchEl) setTimeout(function () { linkSearchEl.focus(); }, 60);
  }
  function renderLinkList(filter) {
    if (!linkListEl) return;
    var q = (filter || '').trim().toLowerCase();
    linkListEl.innerHTML = '';
    var shown = 0;
    linkNotes.forEach(function (note) {
      var pathText = (note.path || []).join(' / ');
      var haystack = ((note.name || '') + ' ' + pathText).toLowerCase();
      if (q && haystack.indexOf(q) < 0) return;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'note-link-item';
      var name = document.createElement('span');
      name.textContent = note.name;
      button.appendChild(name);
      if (pathText) {
        var small = document.createElement('small');
        small.textContent = pathText;
        button.appendChild(small);
      }
      button.addEventListener('click', function () {
        if (linkModal) linkModal.hide();
        insertWikiLink(note.name);
      });
      linkListEl.appendChild(button);
      shown += 1;
    });
    if (!shown) {
      var empty = document.createElement('p');
      empty.className = 'note-link-empty';
      empty.textContent = q ? '没有匹配的笔记。' : '还没有其他笔记可以链接。';
      linkListEl.appendChild(empty);
    }
  }
  function insertWikiLink(name) {
    var snippet = '[[' + String(name).replace(/\]\]/g, '] ]') + ']]';
    var pos = linkInsert || { start: selStart(), end: selEnd() };
    applyEdit(pos.start, pos.end, snippet, pos.start + snippet.length);
    linkInsert = null;
  }

  /* ── 所属层级提示 ── */
  function updateParentHint() {
    if (!parentEl || !parentHint) return;
    var option = parentEl.options[parentEl.selectedIndex];
    var parentDepth = option && option.dataset.depth !== undefined ? parseInt(option.dataset.depth, 10) : -1;
    var level = parentDepth >= 0 ? parentDepth + 2 : 1;
    var maxLevel = (cfg.maxChildDepth || 3) + 1;
    parentHint.textContent = '保存后位于第 ' + level + ' 层；最深处是第 ' + maxLevel + ' 层。';
  }

  /* ── 加密开关 ── */
  function syncEncryption() {
    if (passwordWrap) passwordWrap.hidden = !encryptionOn();
    if (encryptionOn()) {
      clearDraft();
      if (passwordEl) passwordEl.value = '';
    }
    checkDirty();
  }

  /* ── 事件绑定 ── */
  if (contentEl) {
    contentEl.addEventListener('input', function () {
      if (messageEl && messageEl.textContent) messageEl.textContent = '';
      checkDirty();
      updateChrome();
      detectInline();
      scheduleBubble();
    });
    contentEl.addEventListener('compositionstart', function () { state.composing = true; });
    contentEl.addEventListener('compositionend', function () {
      state.composing = false;
      detectInline();
    });
    contentEl.addEventListener('keydown', function (event) {
      if (handleMenuKey(event)) return;
      if (state.composing || event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;

      var start = selStart();
      if (start !== selEnd()) return;
      var v = value();
      if (inFence(v.slice(0, start))) return;
      var lineStart = lineStartAt(start);
      var line = v.slice(lineStart, start);
      var listMatch = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
      var quoteMatch = line.match(/^(\s*)>\s?(.*)$/);

      if (listMatch) {
        event.preventDefault();
        var indent = listMatch[1];
        var marker = listMatch[2];
        var rest = listMatch[3];
        if (!rest.trim()) {
          applyEdit(lineStart, start, indent, lineStart + indent.length);
          return;
        }
        var nextMarker = /^\d/.test(marker)
          ? String(parseInt(marker, 10) + 1) + marker.slice(marker.search(/[.)]/))
          : marker;
        var listText = '\n' + indent + nextMarker + ' ';
        applyEdit(start, selEnd(), listText, start + listText.length);
        return;
      }
      if (quoteMatch) {
        event.preventDefault();
        var quoteIndent = quoteMatch[1];
        var quoteRest = quoteMatch[2];
        if (!quoteRest.trim()) {
          applyEdit(lineStart, start, quoteIndent, lineStart + quoteIndent.length);
          return;
        }
        var quoteText = '\n' + quoteIndent + '> ';
        applyEdit(start, selEnd(), quoteText, start + quoteText.length);
      }
    });
    contentEl.addEventListener('keyup', function () { scheduleBubble(); });
    contentEl.addEventListener('mouseup', function () { scheduleBubble(); });
    contentEl.addEventListener('blur', function () { setTimeout(hideBubble, 120); });
    contentEl.addEventListener('scroll', hideBubble);
  }

  document.addEventListener('selectionchange', function () {
    if (document.activeElement === contentEl) {
      updateChrome();
      scheduleBubble();
    }
  });
  window.addEventListener('scroll', function () { hideBubble(); closeMenus(); }, { passive: true });
  window.addEventListener('resize', function () { hideBubble(); closeMenus(); });

  if (titleEl) titleEl.addEventListener('input', checkDirty);
  if (parentEl) parentEl.addEventListener('change', function () { checkDirty(); updateParentHint(); });
  if (encryptEl) encryptEl.addEventListener('change', syncEncryption);
  if (styleBtn) styleBtn.addEventListener('click', toggleStyleMenu);
  if (previewBtn) previewBtn.addEventListener('click', function () { togglePreview(); });
  if (focusBtn) focusBtn.addEventListener('click', function () { setFocus(!state.focus); });
  if (saveBtn) saveBtn.addEventListener('click', save);
  if (insertLinkBtn) insertLinkBtn.addEventListener('click', openNoteLink);
  if (insertLinkBtnAside) insertLinkBtnAside.addEventListener('click', openNoteLink);
  if (linkSearchEl) linkSearchEl.addEventListener('input', function () { renderLinkList(linkSearchEl.value); });

  if (toolbarEl) {
    toolbarEl.addEventListener('mousedown', function (event) {
      if (event.target.closest('button')) event.preventDefault();
    });
    toolbarEl.addEventListener('click', function (event) {
      var btn = event.target.closest('button[data-cmd]');
      if (!btn) return;
      runCommand(btn.dataset.cmd);
    });
  }
  if (bubbleEl) {
    bubbleEl.addEventListener('mousedown', function (event) {
      if (event.target.closest('button')) event.preventDefault();
    });
    bubbleEl.addEventListener('click', function (event) {
      var btn = event.target.closest('button[data-bubble]');
      if (!btn) return;
      runCommand(btn.dataset.bubble);
    });
  }

  document.addEventListener('mousedown', function (event) {
    if (!event.target.closest('.editor-popover') && !event.target.closest('#styleBtn')) closeMenus();
    if (!event.target.closest('#editorBubble')) hideBubble();
  });

  var modalWasOpen = false;
  document.addEventListener('keydown', function (event) {
    modalWasOpen = event.key === 'Escape' && !!document.querySelector('.app-modal.open');
  }, true);

  document.addEventListener('keydown', function (event) {
    // 弹窗打开时把快捷键让给弹窗（UI 负责 Esc 关闭）。
    if (modalWasOpen || document.querySelector('.app-modal.open')) return;
    var mod = event.ctrlKey || event.metaKey;
    var inEditor = document.activeElement === contentEl && !state.preview;

    if (mod && !event.shiftKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save();
      return;
    }
    if (mod && event.shiftKey && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      togglePreview();
      return;
    }
    if (inEditor && mod && !event.shiftKey && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      runCommand('bold');
      return;
    }
    if (inEditor && mod && !event.shiftKey && event.key.toLowerCase() === 'i') {
      event.preventDefault();
      runCommand('italic');
      return;
    }
    if (inEditor && mod && !event.shiftKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      runCommand('link');
      return;
    }
    if (event.key === 'Escape' && !event.defaultPrevented) {
      if (modalWasOpen || document.querySelector('.app-modal.open')) return;
      if (menu || styleOpen) { closeMenus(); return; }
      if (state.preview) { togglePreview(false); return; }
      if (state.focus) setFocus(false);
    }
  });

  /* ── 取消 / 未保存提醒 ── */
  var discardModal = null;
  if (cancelBtn) {
    cancelBtn.addEventListener('click', function (event) {
      if (!isDirtyNow()) return;
      event.preventDefault();
      discardModal = discardModal || UI.modal(discardModalEl);
      discardModal.show();
    });
  }
  if (discardConfirm) {
    discardConfirm.addEventListener('click', function () {
      clearDraft();
      state.saved = true;
      window.location.href = cfg.cancelUrl || '/note';
    });
  }
  window.addEventListener('beforeunload', function (event) {
    if (!state.saved && isDirtyNow()) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  /* ── 草稿恢复 ── */
  function loadDraft() {
    if (encryptionOn()) return;
    var raw = null;
    try { raw = localStorage.getItem(draftKey()); } catch (e) { return; }
    if (!raw) return;
    try { pendingDraft = JSON.parse(raw); } catch (e) { return; }
    if (!pendingDraft) return;
    var changed = pendingDraft.title !== initial.title || pendingDraft.content !== initial.content;
    if (changed && draftBanner) draftBanner.hidden = false;
  }
  if (draftRestore) {
    draftRestore.addEventListener('click', function () {
      if (!pendingDraft) return;
      if (titleEl) titleEl.value = pendingDraft.title || '';
      if (contentEl) contentEl.value = pendingDraft.content || '';
      if (parentEl && pendingDraft.parentId !== undefined) parentEl.value = pendingDraft.parentId;
      updateParentHint();
      draftBanner.hidden = true;
      checkDirty();
      updateChrome();
      setStatus('已恢复草稿，尚未保存', 'dirty');
      contentEl.focus();
    });
  }
  if (draftDiscard) draftDiscard.addEventListener('click', clearDraft);

  /* ── 初始化 ── */
  updateParentHint();
  syncEncryption();
  updateChrome();
  checkDirty();
  loadDraft();
})();