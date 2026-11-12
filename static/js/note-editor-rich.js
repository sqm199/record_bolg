/* ── 富文本笔记编辑器：TipTap + 站内工具栏 / 斜杠菜单 / 笔记联想 ── */
(function () {
  'use strict';

  var kit = window.TipTapKit;
  var configEl = document.getElementById('richEditorConfig');
  if (!configEl) return;
  var cfg;
  try { cfg = JSON.parse(configEl.textContent); } catch (e) { return; }

  var linkEl = document.getElementById('noteLinkData');
  var linkNotes = [];
  try { linkNotes = JSON.parse(linkEl ? linkEl.textContent : '[]'); } catch (e) { linkNotes = []; }

  var titleEl = document.getElementById('noteTitle');
  var hostEl = document.getElementById('richContent');
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
  var tableBtn = document.getElementById('tableBtn');
  var tableMenu = document.getElementById('tableMenu');
  var slashMenu = document.getElementById('slashMenu');
  var noteAuto = document.getElementById('noteAuto');
  var bubbleEl = document.getElementById('editorBubble');
  var focusBtn = document.getElementById('focusBtn');
  var focusLabel = document.getElementById('focusLabel');
  var undoBtn = document.getElementById('undoBtn');
  var redoBtn = document.getElementById('redoBtn');
  var draftBanner = document.getElementById('draftBanner');
  var draftRestore = document.getElementById('draftRestoreBtn');
  var draftDiscard = document.getElementById('draftDiscardBtn');
  var discardModalEl = document.getElementById('editorDiscardModal');
  var discardConfirm = document.getElementById('editorDiscardConfirmBtn');
  var noteLinkModalEl = document.getElementById('noteLinkModal');
  var noteLinkSearchEl = document.getElementById('noteLinkSearch');
  var noteLinkListEl = document.getElementById('noteLinkList');
  var richLinkModalEl = document.getElementById('richLinkModal');
  var richLinkForm = document.getElementById('richLinkForm');
  var richLinkUrlEl = document.getElementById('richLinkUrl');
  var richImageModalEl = document.getElementById('richImageModal');
  var richImageForm = document.getElementById('richImageForm');
  var richImageUrlEl = document.getElementById('richImageUrl');
  var richImageAltEl = document.getElementById('richImageAlt');

  if (!kit) {
    if (hostEl) hostEl.innerHTML = '<p class="editor-preview-empty">富文本编辑器资源加载失败，请刷新页面重试。</p>';
    return;
  }

  var state = {
    saving: false,
    saved: false,
    dirty: false,
    focus: false,
    draftTimer: null,
    bubbleTimer: null,
    suggestion: null,
    styleOpen: false,
    tableOpen: false,
    escapeHandled: false
  };
  var initial = {
    title: titleEl ? titleEl.value : '',
    html: '',
    parent: parentEl ? parentEl.value : '',
    encrypted: !!(encryptEl && encryptEl.checked)
  };
  var editor = null;
  var pendingDraft = null;
  var noteLinkRange = null;
  var linkRange = null;
  var imageRange = null;
  var modalWasOpen = false;

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function encryptionOn() { return !!(encryptEl && encryptEl.checked); }

  function wordCount(text) {
    var chinese = (text.match(/[㐀-鿿]/g) || []).length;
    var words = (text.match(/[A-Za-z0-9_]+/g) || []).length;
    return chinese + words;
  }
  function readingMinutes(count) { return Math.max(1, Math.ceil(count / 300)); }
  function getHtml() { return editor ? editor.getHTML() : ''; }
  function getText() { return editor ? editor.getText() : ''; }

  /* ── 状态 / 草稿 ── */
  function setStatus(text, status) {
    if (!statusEl) return;
    if (statusTextEl) statusTextEl.textContent = text;
    statusEl.dataset.state = status || 'clean';
  }
  function isDirtyNow() {
    return (titleEl && titleEl.value !== initial.title) ||
      getHtml() !== initial.html ||
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
    return 'note-draft-rich-v1:' + (cfg.mode === 'edit' ? cfg.keyid : 'new');
  }
  function scheduleDraft() {
    if (state.draftTimer) clearTimeout(state.draftTimer);
    if (encryptionOn() || !state.dirty) return;
    state.draftTimer = setTimeout(function () {
      if (!isDirtyNow() || encryptionOn()) return;
      try {
        localStorage.setItem(draftKey(), JSON.stringify({
          title: titleEl ? titleEl.value : '',
          html: getHtml(),
          parentId: parentEl ? parentEl.value : '',
          ts: Date.now()
        }));
        var when = new Date();
        if (isDirtyNow()) setStatus('草稿已保存 ' + pad2(when.getHours()) + ':' + pad2(when.getMinutes()), 'draft');
      } catch (e) { /* 本地存储不可用时静默失败 */ }
    }, 900);
  }
  function clearDraft() {
    if (state.draftTimer) { clearTimeout(state.draftTimer); state.draftTimer = null; }
    try { localStorage.removeItem(draftKey()); } catch (e) { /* ignore */ }
    if (draftBanner) draftBanner.hidden = true;
    pendingDraft = null;
  }

  function updateWordCount() {
    var count = wordCount(getText());
    if (wordEl) wordEl.textContent = count + ' 字';
    if (readEl) readEl.textContent = '约 ' + readingMinutes(count) + ' 分钟';
  }

  /* ── 菜单 ── */
  function menuEl(kind) { return kind === 'note' ? noteAuto : slashMenu; }
  function closeMenus() {
    if (slashMenu) slashMenu.hidden = true;
    if (noteAuto) noteAuto.hidden = true;
    if (styleMenu) styleMenu.hidden = true;
    if (tableMenu) tableMenu.hidden = true;
    state.suggestion = null;
    state.styleOpen = false;
    state.tableOpen = false;
    if (styleBtn) styleBtn.setAttribute('aria-expanded', 'false');
    if (tableBtn) tableBtn.setAttribute('aria-expanded', 'false');
  }
  function closeOtherMenus(kind) {
    if (styleMenu) styleMenu.hidden = true;
    if (tableMenu) tableMenu.hidden = true;
    if (styleBtn) styleBtn.setAttribute('aria-expanded', 'false');
    if (tableBtn) tableBtn.setAttribute('aria-expanded', 'false');
    state.styleOpen = false;
    state.tableOpen = false;
    var other = kind === 'note' ? slashMenu : noteAuto;
    if (other) other.hidden = true;
  }

  function placeAtRect(el, rect) {
    if (!el) return;
    el.hidden = false;
    el.style.left = '0px';
    el.style.top = '0px';
    var w = el.offsetWidth, h = el.offsetHeight;
    var left = (rect && rect.left) || 12;
    var top = (rect && rect.bottom ? rect.bottom + 8 : 80);
    if (top + h > window.innerHeight - 12) {
      top = Math.max(12, ((rect && rect.top) || 80) - h - 8);
    }
    el.style.left = Math.round(clamp(left, 12, window.innerWidth - w - 12)) + 'px';
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

  function renderMenuItems(container, kind, items, activeIndex) {
    if (!container) return;
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
      btn.addEventListener('click', function () { chooseSuggestion(index); });

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

  function showSuggestion(kind, props) {
    closeOtherMenus(kind);
    var items = props.items || [];
    state.suggestion = {
      kind: kind,
      props: props,
      items: items,
      index: 0
    };
    var container = menuEl(kind);
    renderMenuItems(container, kind, items, 0);
    var rect = props.clientRect ? props.clientRect() : null;
    if (!rect && editor) {
      var c = editor.view.coordsAtPos(editor.state.selection.from);
      rect = { left: c.left, bottom: c.bottom, top: c.top, right: c.right };
    }
    placeAtRect(container, rect);
    if (items.length && editor) {
      editor.view.dom.setAttribute('aria-activedescendant', (kind === 'note' ? 'noteAutoOpt' : 'slashOpt') + '0');
    }
  }
  function updateSuggestion(kind, props) {
    if (!state.suggestion || state.suggestion.kind !== kind) {
      showSuggestion(kind, props);
      return;
    }
    var items = props.items || [];
    state.suggestion.props = props;
    state.suggestion.items = items;
    if (state.suggestion.index >= items.length) state.suggestion.index = 0;
    var container = menuEl(kind);
    renderMenuItems(container, kind, items, state.suggestion.index);
    var rect = props.clientRect ? props.clientRect() : null;
    placeAtRect(container, rect);
  }
  function hideSuggestion(kind) {
    var container = menuEl(kind);
    if (container) container.hidden = true;
    if (state.suggestion && state.suggestion.kind === kind) state.suggestion = null;
    if (editor) editor.view.dom.removeAttribute('aria-activedescendant');
  }
  function updateSuggestionActive() {
    if (!state.suggestion) return;
    var kind = state.suggestion.kind;
    var container = menuEl(kind);
    var prefix = kind === 'note' ? 'noteAutoOpt' : 'slashOpt';
    Array.prototype.forEach.call(container.querySelectorAll('.editor-popover-item'), function (el, index) {
      var on = index === state.suggestion.index;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) {
        if (editor) editor.view.dom.setAttribute('aria-activedescendant', prefix + index);
        if (el.offsetTop < container.scrollTop) container.scrollTop = el.offsetTop;
        else if (el.offsetTop + el.offsetHeight > container.scrollTop + container.clientHeight) {
          container.scrollTop = el.offsetTop + el.offsetHeight - container.clientHeight;
        }
      }
    });
  }
  function handleSuggestionKey(props) {
    if (!state.suggestion) return false;
    var event = props.event;
    if (!event) return false;
    if (event.key === 'Escape') {
      hideSuggestion(state.suggestion.kind);
      // 同一次按键的 document 处理器不要再退出专注模式。
      state.escapeHandled = true;
      setTimeout(function () { state.escapeHandled = false; }, 0);
      return true;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!state.suggestion.items.length) return true;
      var delta = event.key === 'ArrowDown' ? 1 : -1;
      state.suggestion.index =
        (state.suggestion.index + delta + state.suggestion.items.length) % state.suggestion.items.length;
      updateSuggestionActive();
      return true;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      if (!state.suggestion.items.length) {
        if (event.key === 'Enter') hideSuggestion(state.suggestion.kind);
        return true;
      }
      chooseSuggestion(state.suggestion.index);
      return true;
    }
    return false;
  }
  function chooseSuggestion(index) {
    if (!state.suggestion || !state.suggestion.items[index]) return;
    var props = state.suggestion.props;
    var item = state.suggestion.items[index];
    hideSuggestion(state.suggestion.kind);
    if (props && typeof props.command === 'function') props.command(item);
  }

  /* ── 斜杠命令 / 笔记联想数据 ── */
  var slashItems = [
    { id: 'h1', label: '标题 1', desc: '页面大标题', icon: 'heading', kbd: 'H1' },
    { id: 'h2', label: '标题 2', desc: '段落小标题', icon: 'heading', kbd: 'H2' },
    { id: 'h3', label: '标题 3', desc: '更小的分组标题', icon: 'heading', kbd: 'H3' },
    { id: 'paragraph', label: '正文', desc: '普通段落', icon: 'note', kbd: '—' },
    { id: 'ul', label: '无序列表', desc: '用圆点组织内容', icon: 'list', kbd: '-' },
    { id: 'ol', label: '有序列表', desc: '按步骤排列', icon: 'list-ordered', kbd: '1.' },
    { id: 'quote', label: '引用', desc: '突出引用段落', icon: 'quote', kbd: '>' },
    { id: 'code', label: '代码块', desc: '等宽代码区域', icon: 'code-block', kbd: '```' },
    { id: 'table', label: '表格', desc: '插入 3 × 3 表格', icon: 'table', kbd: '表' },
    { id: 'divider', label: '分割线', desc: '分隔不同段落', icon: 'divider', kbd: '---' },
    { id: 'link', label: '外部链接', desc: '插入网页地址', icon: 'link', kbd: '[]()' },
    { id: 'note', label: '链接到笔记', desc: '引用站内另一篇笔记', icon: 'note', kbd: '[[' },
    { id: 'image', label: '图片', desc: '通过图片地址插入', icon: 'image', kbd: '![]()' }
  ];
  function filterSlashItems(query) {
    var q = (query || '').toLowerCase();
    var candidates = [];
    slashItems.forEach(function (item, order) {
      var label = item.label.toLowerCase();
      var haystack = (item.label + ' ' + item.desc + ' ' + item.id + ' ' + item.kbd).toLowerCase();
      if (q && haystack.indexOf(q) < 0) return;
      var score = !q ? 0 : label.indexOf(q) === 0 ? 0 : label.indexOf(q) >= 0 ? 1 : 2;
      candidates.push({ item: item, score: score, order: order });
    });
    candidates.sort(function (a, b) { return a.score - b.score || a.order - b.order; });
    return candidates.map(function (entry) { return entry.item; });
  }
  function filterNoteItems(query) {
    var q = (query || '').toLowerCase();
    var items = [];
    linkNotes.forEach(function (note) {
      var path = (note.path || []).join(' / ');
      var haystack = ((note.name || '') + ' ' + path).toLowerCase();
      if (q && haystack.indexOf(q) < 0) return;
      items.push({
        id: note.id,
        name: note.name || '未命名',
        label: note.name || '未命名',
        desc: path,
        icon: 'note'
      });
    });
    return items.slice(0, 8);
  }

  function applySlashItem(targetEditor, range, item) {
    var chain = targetEditor.chain().focus().deleteRange(range);
    if (item.id === 'h1') chain.setHeading({ level: 1 }).run();
    else if (item.id === 'h2') chain.setHeading({ level: 2 }).run();
    else if (item.id === 'h3') chain.setHeading({ level: 3 }).run();
    else if (item.id === 'paragraph') chain.setParagraph().run();
    else if (item.id === 'ul') chain.toggleBulletList().run();
    else if (item.id === 'ol') chain.toggleOrderedList().run();
    else if (item.id === 'quote') chain.toggleBlockquote().run();
    else if (item.id === 'code') chain.toggleCodeBlock().run();
    else if (item.id === 'table') chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    else if (item.id === 'divider') chain.setHorizontalRule().run();
    else if (item.id === 'link') { chain.run(); openLinkModal(); }
    else if (item.id === 'note') { chain.run(); openNoteLink(); }
    else if (item.id === 'image') { chain.run(); openImageModal(); }
    updateToolbar();
  }
  function insertNoteLinkItem(targetEditor, range, note) {
    var href = '/note/view/' + note.id;
    targetEditor.chain()
      .focus()
      .deleteRange(range)
      .insertContent({
        type: 'text',
        text: note.name,
        marks: [{ type: 'link', attrs: { href: href } }]
      })
      .run();
    updateToolbar();
  }

  function makeSuggestionRenderer(kind) {
    return {
      onStart: function (props) { showSuggestion(kind, props); },
      onUpdate: function (props) { updateSuggestion(kind, props); },
      onKeyDown: function (props) { return handleSuggestionKey(props); },
      onExit: function () { hideSuggestion(kind); }
    };
  }

  var SlashSuggestion = kit.Extension.create({
    name: 'slashSuggestion',
    addOptions: function () {
      return {
        suggestion: {
          pluginKey: new kit.PluginKey('slashSuggestion'),
          char: '/',
          allowedPrefixes: [' '],
          allowSpaces: false,
          allow: function (props) {
            return !props.editor.isActive('codeBlock') && !props.editor.isActive('code');
          },
          items: function (props) { return filterSlashItems(props.query); },
          command: function (props) { applySlashItem(props.editor, props.range, props.props); },
          render: function () { return makeSuggestionRenderer('slash'); }
        }
      };
    },
    addProseMirrorPlugins: function () {
      return [kit.Suggestion(Object.assign({ editor: this.editor }, this.options.suggestion))];
    }
  });

  var NoteSuggestion = kit.Extension.create({
    name: 'noteSuggestion',
    addOptions: function () {
      return {
        suggestion: {
          pluginKey: new kit.PluginKey('noteSuggestion'),
          char: '[[',
          allowedPrefixes: [' '],
          allowSpaces: false,
          allow: function (props) {
            return !props.editor.isActive('codeBlock') && !props.editor.isActive('code');
          },
          items: function (props) { return filterNoteItems(props.query); },
          command: function (props) { insertNoteLinkItem(props.editor, props.range, props.props); },
          render: function () { return makeSuggestionRenderer('note'); }
        }
      };
    },
    addProseMirrorPlugins: function () {
      return [kit.Suggestion(Object.assign({ editor: this.editor }, this.options.suggestion))];
    }
  });

  /* ── 工具栏 ── */
  function updateToolbar() {
    if (!editor) return;
    var map = {
      bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strike',
      inlinecode: 'code', ul: 'bulletList', ol: 'orderedList', quote: 'blockquote',
      codeblock: 'codeBlock'
    };
    Object.keys(map).forEach(function (cmd) {
      var btn = toolbarEl.querySelector('[data-cmd="' + cmd + '"]');
      if (!btn) return;
      var on = editor.isActive(map[cmd]);
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var label = '正文';
    var headingLevel = 0;
    [1, 2, 3, 4, 5, 6].forEach(function (level) {
      if (editor.isActive('heading', { level: level })) headingLevel = level;
    });
    if (headingLevel) label = '标题 ' + headingLevel;
    else if (editor.isActive('blockquote')) label = '引用';
    else if (editor.isActive('codeBlock')) label = '代码块';
    if (styleLabel) styleLabel.textContent = label;
    if (undoBtn) undoBtn.disabled = !editor.can().undo();
    if (redoBtn) redoBtn.disabled = !editor.can().redo();
    if (tableBtn) tableBtn.classList.toggle('is-active', editor.isActive('table'));
    Array.prototype.forEach.call(bubbleEl.querySelectorAll('[data-bubble]'), function (btn) {
      var kind = btn.dataset.bubble;
      var active = kind === 'bold' ? editor.isActive('bold')
        : kind === 'italic' ? editor.isActive('italic')
          : kind === 'underline' ? editor.isActive('underline')
            : kind === 'strike' ? editor.isActive('strike')
              : kind === 'inlinecode' ? editor.isActive('code') : false;
      btn.classList.toggle('is-active', active);
    });
  }

  function toggleStyleMenu() {
    if (state.styleOpen) { closeMenus(); return; }
    closeMenus();
    state.styleOpen = true;
    styleMenu.hidden = false;
    styleBtn.setAttribute('aria-expanded', 'true');
    placeUnder(styleMenu, styleBtn);
  }
  function toggleTableMenu() {
    if (state.tableOpen) { closeMenus(); return; }
    closeMenus();
    state.tableOpen = true;
    tableMenu.hidden = false;
    tableBtn.setAttribute('aria-expanded', 'true');
    var inTable = editor && editor.isActive('table');
    Array.prototype.forEach.call(tableMenu.querySelectorAll('[data-table]'), function (btn) {
      var kind = btn.getAttribute('data-table');
      btn.disabled = !inTable && kind !== 'insert';
    });
    placeUnder(tableMenu, tableBtn);
  }

  function runCommand(cmd) {
    if (!editor) return;
    var chain = editor.chain().focus();
    if (cmd === 'bold') chain.toggleBold().run();
    else if (cmd === 'italic') chain.toggleItalic().run();
    else if (cmd === 'underline') chain.toggleUnderline().run();
    else if (cmd === 'strike') chain.toggleStrike().run();
    else if (cmd === 'inlinecode') chain.toggleCode().run();
    else if (cmd === 'ul') chain.toggleBulletList().run();
    else if (cmd === 'ol') chain.toggleOrderedList().run();
    else if (cmd === 'quote') chain.toggleBlockquote().run();
    else if (cmd === 'codeblock') chain.toggleCodeBlock().run();
    else if (cmd === 'divider') chain.setHorizontalRule().run();
    else if (cmd === 'link') { openLinkModal(); return; }
    else if (cmd === 'note-link') { openNoteLink(); return; }
    else if (cmd === 'image') { openImageModal(); return; }
    else if (cmd === 'undo') { if (editor.can().undo()) chain.undo().run(); }
    else if (cmd === 'redo') { if (editor.can().redo()) chain.redo().run(); }
    updateToolbar();
  }

  function runTableCommand(kind) {
    if (!editor) return;
    var chain = editor.chain().focus();
    if (kind === 'insert') chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    else if (kind === 'row-before') chain.addRowBefore().run();
    else if (kind === 'row-after') chain.addRowAfter().run();
    else if (kind === 'col-before') chain.addColumnBefore().run();
    else if (kind === 'col-after') chain.addColumnAfter().run();
    else if (kind === 'delete-row') chain.deleteRow().run();
    else if (kind === 'delete-column') chain.deleteColumn().run();
    else if (kind === 'delete-table') chain.deleteTable().run();
    closeMenus();
    updateToolbar();
  }

  /* ── 选中浮条 ── */
  function scheduleBubble() {
    if (state.bubbleTimer) clearTimeout(state.bubbleTimer);
    state.bubbleTimer = setTimeout(updateBubble, 100);
  }
  function updateBubble() {
    if (!editor || !bubbleEl) return;
    if (!editor.isFocused || state.suggestion || state.styleOpen || state.tableOpen) {
      hideBubble();
      return;
    }
    var sel = editor.state.selection;
    if (sel.empty) { hideBubble(); return; }
    var c1, c2;
    try {
      c1 = editor.view.coordsAtPos(sel.from);
      c2 = editor.view.coordsAtPos(sel.to);
    } catch (e) { hideBubble(); return; }
    bubbleEl.hidden = false;
    var w = bubbleEl.offsetWidth, h = bubbleEl.offsetHeight;
    var host = hostEl.getBoundingClientRect();
    var left = (c1.left + c2.left) / 2 - w / 2;
    var top = Math.min(c1.top, c2.top) - h - 8;
    if (top < host.top + 4) top = Math.max(c1.bottom, c2.bottom) + 10;
    bubbleEl.style.left = Math.round(clamp(left, 12, window.innerWidth - w - 12)) + 'px';
    bubbleEl.style.top = Math.round(clamp(top, 62, window.innerHeight - h - 12)) + 'px';
    updateToolbar();
  }
  function hideBubble() {
    if (state.bubbleTimer) { clearTimeout(state.bubbleTimer); state.bubbleTimer = null; }
    if (bubbleEl) bubbleEl.hidden = true;
  }

  /* ── 链接 / 图片 / 笔记链接弹窗 ── */
  var noteLinkModal = null;
  var richLinkModal = null;
  var richImageModal = null;

  function normalizeUrl(raw) {
    var url = (raw || '').trim();
    if (!url) return '';
    if (/^(javascript|vbscript|data):/i.test(url)) return '';
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) || url.charAt(0) === '/' || url.charAt(0) === '#') return url;
    return 'https://' + url;
  }

  function openNoteLink() {
    if (!editor) return;
    closeMenus();
    hideBubble();
    noteLinkRange = { from: editor.state.selection.from, to: editor.state.selection.to };
    noteLinkModal = noteLinkModal || UI.modal(noteLinkModalEl);
    if (noteLinkSearchEl) noteLinkSearchEl.value = '';
    renderNoteLinkList('');
    noteLinkModal.show();
    if (noteLinkSearchEl) setTimeout(function () { noteLinkSearchEl.focus(); }, 60);
  }
  function renderNoteLinkList(filter) {
    if (!noteLinkListEl) return;
    var q = (filter || '').trim().toLowerCase();
    noteLinkListEl.innerHTML = '';
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
        if (noteLinkModal) noteLinkModal.hide();
        insertNoteLink(note);
      });
      noteLinkListEl.appendChild(button);
      shown += 1;
    });
    if (!shown) {
      var empty = document.createElement('p');
      empty.className = 'note-link-empty';
      empty.textContent = q ? '没有匹配的笔记。' : '还没有其他笔记可以链接。';
      noteLinkListEl.appendChild(empty);
    }
  }
  function insertNoteLink(note) {
    if (!editor) return;
    var href = '/note/view/' + note.id;
    var range = noteLinkRange || { from: editor.state.selection.from, to: editor.state.selection.to };
    var chain = editor.chain().focus().setTextSelection(range);
    if (range.from === range.to) {
      chain.insertContent({
        type: 'text',
        text: note.name,
        marks: [{ type: 'link', attrs: { href: href } }]
      }).run();
    } else {
      chain.setLink({ href: href }).run();
    }
    noteLinkRange = null;
    updateToolbar();
  }

  function openLinkModal() {
    if (!editor) return;
    closeMenus();
    hideBubble();
    linkRange = { from: editor.state.selection.from, to: editor.state.selection.to };
    richLinkModal = richLinkModal || UI.modal(richLinkModalEl);
    var attrs = editor.getAttributes('link');
    if (richLinkUrlEl) richLinkUrlEl.value = attrs && attrs.href ? attrs.href : '';
    richLinkModal.show();
    if (richLinkUrlEl) setTimeout(function () { richLinkUrlEl.focus(); richLinkUrlEl.select(); }, 60);
  }
  if (richLinkForm) {
    richLinkForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var url = normalizeUrl(richLinkUrlEl ? richLinkUrlEl.value : '');
      if (!url) {
        UI.toast('请输入有效的链接地址', 'error');
        return;
      }
      if (messageEl) messageEl.textContent = '';
      if (richLinkModal) richLinkModal.hide();
      var range = linkRange || { from: editor.state.selection.from, to: editor.state.selection.to };
      var chain = editor.chain().focus().setTextSelection(range);
      if (range.from === range.to) {
        chain.insertContent({
          type: 'text',
          text: url,
          marks: [{ type: 'link', attrs: { href: url } }]
        }).run();
      } else {
        chain.setLink({ href: url }).run();
      }
      linkRange = null;
      updateToolbar();
    });
  }

  function openImageModal() {
    if (!editor) return;
    closeMenus();
    hideBubble();
    imageRange = { from: editor.state.selection.from, to: editor.state.selection.to };
    richImageModal = richImageModal || UI.modal(richImageModalEl);
    if (richImageUrlEl) richImageUrlEl.value = '';
    if (richImageAltEl) richImageAltEl.value = '';
    richImageModal.show();
    if (richImageUrlEl) setTimeout(function () { richImageUrlEl.focus(); }, 60);
  }
  if (richImageForm) {
    richImageForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var url = normalizeUrl(richImageUrlEl ? richImageUrlEl.value : '');
      if (!url) {
        UI.toast('请输入有效的图片地址', 'error');
        return;
      }
      if (messageEl) messageEl.textContent = '';
      if (richImageModal) richImageModal.hide();
      var range = imageRange || { from: editor.state.selection.from, to: editor.state.selection.to };
      var chain = editor.chain().focus().setTextSelection(range);
      if (range.from !== range.to) chain.deleteSelection();
      chain.setImage({
        src: url,
        alt: richImageAltEl ? richImageAltEl.value.trim() : ''
      }).run();
      imageRange = null;
      updateToolbar();
    });
  }

  /* ── 焦点 / 保存 ── */
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
    if (editor) editor.chain().focus().run();
  }

  function save() {
    if (state.saving || !editor) return;
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
    if (saveBtn) saveBtn.disabled = true;
    setStatus('保存中…', 'dirty');

    var payload = {
      title: title,
      content: editor.getHTML(),
      content_format: 'html',
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
      if (saveBtn) saveBtn.disabled = false;
      setStatus('保存失败', 'error');
    }).catch(function () {
      if (messageEl) messageEl.textContent = '网络错误，请重试';
      state.saving = false;
      if (saveBtn) saveBtn.disabled = false;
      setStatus('保存失败', 'error');
    });
  }

  function updateParentHint() {
    if (!parentEl || !parentHint) return;
    var option = parentEl.options[parentEl.selectedIndex];
    var parentDepth = option && option.dataset.depth !== undefined ? parseInt(option.dataset.depth, 10) : -1;
    var level = parentDepth >= 0 ? parentDepth + 2 : 1;
    var maxLevel = (cfg.maxChildDepth || 3) + 1;
    parentHint.textContent = '保存后位于第 ' + level + ' 层；最深处是第 ' + maxLevel + ' 层。';
  }

  function syncEncryption() {
    if (passwordWrap) passwordWrap.hidden = !encryptionOn();
    if (encryptionOn()) {
      clearDraft();
      if (passwordEl) passwordEl.value = '';
    }
    checkDirty();
  }

  /* ── 事件绑定 ── */
  if (titleEl) titleEl.addEventListener('input', checkDirty);
  if (parentEl) parentEl.addEventListener('change', function () { checkDirty(); updateParentHint(); });
  if (encryptEl) encryptEl.addEventListener('change', syncEncryption);
  if (saveBtn) saveBtn.addEventListener('click', save);
  if (cancelBtn) {
    cancelBtn.addEventListener('click', function (event) {
      if (!isDirtyNow()) return;
      event.preventDefault();
      discardModal = discardModal || UI.modal(discardModalEl);
      discardModal.show();
    });
  }
  var discardModal = null;
  if (discardConfirm) {
    discardConfirm.addEventListener('click', function () {
      clearDraft();
      state.saved = true;
      window.location.href = cfg.cancelUrl || '/note';
    });
  }
  if (styleBtn) styleBtn.addEventListener('click', toggleStyleMenu);
  if (tableBtn) tableBtn.addEventListener('click', toggleTableMenu);
  if (focusBtn) focusBtn.addEventListener('click', function () { setFocus(!state.focus); });
  if (undoBtn) undoBtn.addEventListener('click', function () { runCommand('undo'); });
  if (redoBtn) redoBtn.addEventListener('click', function () { runCommand('redo'); });
  if (document.getElementById('insertNoteLinkBtnAside')) {
    document.getElementById('insertNoteLinkBtnAside').addEventListener('click', openNoteLink);
  }
  if (noteLinkSearchEl) {
    noteLinkSearchEl.addEventListener('input', function () { renderNoteLinkList(noteLinkSearchEl.value); });
  }

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
  if (styleMenu) {
    Array.prototype.forEach.call(styleMenu.querySelectorAll('[data-style]'), function (item) {
      item.addEventListener('mousedown', function (e) { e.preventDefault(); });
      item.addEventListener('click', function () {
        var style = item.getAttribute('data-style');
        var chain = editor.chain().focus();
        if (style === 'paragraph') chain.setParagraph().run();
        else if (style === 'h1') chain.setHeading({ level: 1 }).run();
        else if (style === 'h2') chain.setHeading({ level: 2 }).run();
        else if (style === 'h3') chain.setHeading({ level: 3 }).run();
        else if (style === 'blockquote') chain.toggleBlockquote().run();
        else if (style === 'codeBlock') chain.toggleCodeBlock().run();
        closeMenus();
        updateToolbar();
      });
    });
  }
  if (tableMenu) {
    Array.prototype.forEach.call(tableMenu.querySelectorAll('[data-table]'), function (item) {
      item.addEventListener('mousedown', function (e) { e.preventDefault(); });
      item.addEventListener('click', function () { runTableCommand(item.getAttribute('data-table')); });
    });
  }
  if (bubbleEl) {
    bubbleEl.addEventListener('mousedown', function (event) {
      if (event.target.closest('button')) event.preventDefault();
    });
    bubbleEl.addEventListener('click', function (event) {
      var btn = event.target.closest('button[data-bubble]');
      if (!btn) return;
      var kind = btn.dataset.bubble;
      if (kind === 'link') { openLinkModal(); return; }
      if (!editor) return;
      var chain = editor.chain().focus();
      if (kind === 'bold') chain.toggleBold().run();
      else if (kind === 'italic') chain.toggleItalic().run();
      else if (kind === 'underline') chain.toggleUnderline().run();
      else if (kind === 'strike') chain.toggleStrike().run();
      else if (kind === 'inlinecode') chain.toggleCode().run();
      updateToolbar();
    });
  }

  document.addEventListener('mousedown', function (event) {
    if (!event.target.closest('.editor-popover') &&
        !event.target.closest('#styleBtn') &&
        !event.target.closest('#tableBtn')) {
      closeMenus();
    }
    if (!event.target.closest('#editorBubble')) hideBubble();
  });

  var modalWasOpenCapture = function (event) {
    modalWasOpen = event.key === 'Escape' && !!document.querySelector('.app-modal.open');
  };
  document.addEventListener('keydown', modalWasOpenCapture, true);

  document.addEventListener('keydown', function (event) {
    if (modalWasOpen || document.querySelector('.app-modal.open')) return;
    var mod = event.ctrlKey || event.metaKey;
    if (mod && !event.shiftKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save();
      return;
    }
    if (mod && !event.shiftKey && event.key.toLowerCase() === 'k' && editor && editor.isFocused) {
      event.preventDefault();
      openLinkModal();
      return;
    }
    if (event.key === 'Escape') {
      if (state.escapeHandled) { state.escapeHandled = false; return; }
      if (state.suggestion || state.styleOpen || state.tableOpen) { closeMenus(); return; }
      if (state.focus) setFocus(false);
    }
  });

  window.addEventListener('beforeunload', function (event) {
    if (!state.saved && isDirtyNow()) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  window.addEventListener('scroll', function () { hideBubble(); }, { passive: true });
  window.addEventListener('resize', function () { hideBubble(); closeMenus(); });

  /* ── 初始化编辑器 ── */
  function initEditor() {
    if (!hostEl || !kit || editor) return;
    var extensions = [
      kit.StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] }
      }),
      kit.Underline,
      kit.Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { rel: 'noopener noreferrer' }
      }),
      kit.Image.configure({ inline: false, allowBase64: false }),
      kit.Placeholder.configure({
        placeholder: '用富文本写点什么…… 输入 / 插入标题、表格或笔记链接'
      }),
      kit.Table.configure({ resizable: false, HTMLAttributes: { class: 'rich-table' } }),
      kit.TableRow,
      kit.TableCell,
      kit.TableHeader,
      SlashSuggestion,
      NoteSuggestion
    ];

    editor = new kit.Editor({
      element: hostEl,
      extensions: extensions,
      content: cfg.initialHtml || '',
      editorProps: {
        attributes: {
          class: 'rich-content note-body',
          spellcheck: 'false'
        }
      },
      onUpdate: function () {
        updateWordCount();
        checkDirty();
      },
      onSelectionUpdate: function () {
        updateToolbar();
        scheduleBubble();
      },
      onTransaction: function () {
        updateToolbar();
      },
      onBlur: function () {
        setTimeout(hideBubble, 80);
      },
      onFocus: function () {
        scheduleBubble();
      }
    });

    initial.html = editor.getHTML();
    updateWordCount();
    updateToolbar();
    syncEncryption();
    updateParentHint();
    checkDirty();
    loadDraft();

    if (cfg.mode === 'new' && titleEl && !titleEl.value) titleEl.focus();
  }

  function loadDraft() {
    if (encryptionOn()) return;
    var raw = null;
    try { raw = localStorage.getItem(draftKey()); } catch (e) { return; }
    if (!raw) return;
    try { pendingDraft = JSON.parse(raw); } catch (e) { return; }
    if (!pendingDraft) return;
    var changed = pendingDraft.title !== initial.title || pendingDraft.html !== initial.html;
    if (changed && draftBanner) draftBanner.hidden = false;
  }
  if (draftRestore) {
    draftRestore.addEventListener('click', function () {
      if (!pendingDraft || !editor) return;
      if (titleEl) titleEl.value = pendingDraft.title || '';
      if (parentEl && pendingDraft.parentId !== undefined) parentEl.value = pendingDraft.parentId;
      editor.commands.setContent(pendingDraft.html || '<p></p>', false);
      draftBanner.hidden = true;
      updateParentHint();
      checkDirty();
      updateWordCount();
      updateToolbar();
      setStatus('已恢复草稿，尚未保存', 'dirty');
      editor.chain().focus().run();
    });
  }
  if (draftDiscard) draftDiscard.addEventListener('click', clearDraft);

  initEditor();
})();