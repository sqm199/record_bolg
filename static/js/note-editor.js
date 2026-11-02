/* ── 笔记编辑器：Markdown / 草稿 / 位置 / 站内链接 ── */
(function () {
  'use strict';

  var configEl = document.getElementById('editorConfig');
  if (!configEl) return;
  var cfg;
  try { cfg = JSON.parse(configEl.textContent); } catch (e) { return; }

  var linkEl = document.getElementById('noteLinkData');
  var linkNotes = [];
  try { linkNotes = JSON.parse(linkEl ? linkEl.textContent : '[]'); } catch (e) { linkNotes = []; }

  var titleEl = document.getElementById('noteTitle');
  var contentEl = document.getElementById('noteContent');
  var statusEl = document.getElementById('editorStatus');
  var messageEl = document.getElementById('editorMsg');
  var saveBtn = document.getElementById('editorSaveBtn');
  var cancelBtn = document.getElementById('editorCancelBtn');
  var encryptEl = document.getElementById('noteEncrypt');
  var passwordEl = document.getElementById('notePassword');
  var passwordWrap = document.getElementById('passwordWrap');
  var parentEl = document.getElementById('noteParent');
  var parentHint = document.getElementById('parentDepthHint');
  var wordEl = document.getElementById('editorWordCount');
  var draftBanner = document.getElementById('draftBanner');
  var draftRestore = document.getElementById('draftRestoreBtn');
  var draftDiscard = document.getElementById('draftDiscardBtn');
  var discardModalEl = document.getElementById('editorDiscardModal');
  var discardConfirm = document.getElementById('editorDiscardConfirmBtn');
  var linkModalEl = document.getElementById('noteLinkModal');
  var linkSearchEl = document.getElementById('noteLinkSearch');
  var linkListEl = document.getElementById('noteLinkList');
  var insertLinkBtn = document.getElementById('insertNoteLinkBtn');

  var easyMDE = null;
  var saving = false;
  var saved = false;
  var dirty = false;
  var initialTitle = titleEl ? titleEl.value : '';
  var initialContent = contentEl ? contentEl.value : '';
  var initialParent = parentEl ? parentEl.value : '';
  var draftTimer = null;
  var pendingDraft = null;

  function currentContent() {
    return easyMDE ? easyMDE.value() : (contentEl ? contentEl.value : '');
  }
  function setContent(value) {
    if (easyMDE) easyMDE.value(value);
    else if (contentEl) contentEl.value = value;
    updateWordCount();
  }
  function wordCount(text) {
    var chinese = (text.match(/[㐀-鿿]/g) || []).length;
    var words = (text.match(/[A-Za-z0-9_]+/g) || []).length;
    return chinese + words;
  }
  function updateWordCount() {
    if (wordEl) wordEl.textContent = wordCount(currentContent()) + ' 字';
  }
  function setStatus(text, isDirty) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle('is-dirty', !!isDirty);
  }
  function checkDirty() {
    dirty = (titleEl && titleEl.value !== initialTitle) ||
      currentContent() !== initialContent ||
      (parentEl && parentEl.value !== initialParent);
    if (dirty) {
      setStatus('未保存', true);
      scheduleDraft();
    } else {
      setStatus('未修改', false);
    }
  }
  function clearDraft() {
    try { localStorage.removeItem(draftKey()); } catch (e) { /* ignore */ }
    if (draftBanner) draftBanner.hidden = true;
    pendingDraft = null;
  }
  function draftKey() {
    return 'note-draft-v1:' + (cfg.mode === 'edit' ? cfg.keyid : 'new');
  }
  function encryptionOn() {
    return !!(encryptEl && encryptEl.checked);
  }
  function scheduleDraft() {
    if (draftTimer) clearTimeout(draftTimer);
    if (encryptionOn()) return;
    draftTimer = setTimeout(function () {
      if (!dirty || encryptionOn()) return;
      try {
        localStorage.setItem(draftKey(), JSON.stringify({
          title: titleEl ? titleEl.value : '',
          content: currentContent(),
          parentId: parentEl ? parentEl.value : '',
          ts: Date.now()
        }));
        var when = new Date();
        setStatus('草稿已自动保存 ' + String(when.getHours()).padStart(2, '0') + ':' + /* taste-skill-ignore numbering: clock */
          String(when.getMinutes()).padStart(2, '0'), true); /* taste-skill-ignore numbering: clock */
      } catch (e) { /* 本地存储不可用时静默失败 */ }
    }, 900);
  }

  /* EasyMDE 动态加载：CDN 慢或不可用时立即退回可用的纯文本 + 工具条 */
  var fallbackToolbar = document.getElementById('editorFallbackToolbar');
  var easyMDELoading = false;
  var fallbackBound = false;

  function wrapSelection(before, after, placeholder) {
    if (!contentEl) return;
    var start = contentEl.selectionStart || 0;
    var end = contentEl.selectionEnd || 0;
    var selected = contentEl.value.slice(start, end) || placeholder || '';
    var text = before + selected + after;
    contentEl.value = contentEl.value.slice(0, start) + text + contentEl.value.slice(end);
    contentEl.selectionStart = start + before.length;
    contentEl.selectionEnd = start + before.length + selected.length;
    contentEl.focus();
    checkDirty();
  }
  function prefixLines(prefix) {
    if (!contentEl) return;
    var start = contentEl.selectionStart || 0;
    var end = contentEl.selectionEnd || 0;
    var lineStart = contentEl.value.lastIndexOf('\n', start - 1) + 1;
    var block = contentEl.value.slice(lineStart, end) || '';
    var next = block.split('\n').map(function (line) { return prefix + line; }).join('\n');
    contentEl.value = contentEl.value.slice(0, lineStart) + next + contentEl.value.slice(end);
    contentEl.selectionStart = lineStart;
    contentEl.selectionEnd = lineStart + next.length;
    contentEl.focus();
    checkDirty();
  }
  function bindFallbackToolbar() {
    if (!fallbackToolbar || fallbackBound) return;
    fallbackBound = true;
    fallbackToolbar.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-md]');
      if (!button) return;
      var kind = button.dataset.md;
      if (kind === 'bold') wrapSelection('**', '**', '粗体');
      else if (kind === 'italic') wrapSelection('*', '*', '斜体');
      else if (kind === 'heading') prefixLines('## ');
      else if (kind === 'list') prefixLines('- ');
      else if (kind === 'quote') prefixLines('> ');
      else if (kind === 'link') wrapSelection('[', '](https://)', '链接文字');
      else if (kind === 'code') wrapSelection('`', '`', '代码');
    });
  }
  function showFallbackEditor() {
    if (easyMDE) return;
    if (fallbackToolbar) {
      fallbackToolbar.hidden = false;
      bindFallbackToolbar();
    }
  }
  function initEasyMDE() {
    if (easyMDE || typeof EasyMDE === 'undefined' || !contentEl) return;
    var wasDirty = isDirtyNow();
    easyMDE = new EasyMDE({
      element: contentEl,
      spellChecker: false,
      autosave: { enabled: false },
      status: false,
      placeholder: '用 Markdown 写点什么……',
      toolbar: [
        'bold', 'italic', 'heading', '|',
        'quote', 'unordered-list', 'ordered-list', '|',
        'link', 'image', 'code', 'table', '|',
        'preview', 'side-by-side', 'fullscreen'
      ]
    });
    easyMDE.codemirror.on('change', function () {
      updateWordCount();
      checkDirty();
    });
    if (fallbackToolbar) fallbackToolbar.hidden = true;
    if (!wasDirty) {
      initialContent = easyMDE.value();
      initialTitle = titleEl ? titleEl.value : initialTitle;
      initialParent = parentEl ? parentEl.value : initialParent;
    }
    updateWordCount();
    checkDirty();
  }
  function loadEasyMDE() {
    if (easyMDE || easyMDELoading) return;
    if (typeof EasyMDE !== 'undefined') {
      initEasyMDE();
      return;
    }
    easyMDELoading = true;
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdn.jsdelivr.net/npm/easymde/dist/easymde.min.css';
    document.head.appendChild(css);
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/easymde/dist/easymde.min.js';
    script.async = true;
    script.onload = function () { initEasyMDE(); };
    script.onerror = function () { showFallbackEditor(); };
    document.head.appendChild(script);
    window.setTimeout(function () { if (!easyMDE) showFallbackEditor(); }, 1500);
  }

  if (contentEl) contentEl.addEventListener('input', checkDirty);
  if (titleEl) titleEl.addEventListener('input', checkDirty);
  if (parentEl) parentEl.addEventListener('change', checkDirty);
  initialContent = currentContent();
  updateWordCount();
  checkDirty();

  /* 草稿恢复 */
  function loadDraft() {
    if (encryptionOn()) return;
    var raw = null;
    try { raw = localStorage.getItem(draftKey()); } catch (e) { return; }
    if (!raw) return;
    try { pendingDraft = JSON.parse(raw); } catch (e) { return; }
    if (!pendingDraft) return;
    var changed = pendingDraft.title !== initialTitle || pendingDraft.content !== initialContent;
    if (changed && draftBanner) draftBanner.hidden = false;
  }
  loadDraft();

  if (draftRestore) {
    draftRestore.addEventListener('click', function () {
      if (!pendingDraft) return;
      if (titleEl) titleEl.value = pendingDraft.title || '';
      setContent(pendingDraft.content || '');
      if (parentEl && pendingDraft.parentId !== undefined) parentEl.value = pendingDraft.parentId;
      updateParentHint();
      checkDirty();
      if (draftBanner) draftBanner.hidden = true;
      setStatus('已恢复草稿，尚未保存', true);
    });
  }
  if (draftDiscard) {
    draftDiscard.addEventListener('click', clearDraft);
  }

  /* 所属层级提示 */
  function updateParentHint() {
    if (!parentEl || !parentHint) return;
    var option = parentEl.options[parentEl.selectedIndex];
    var parentDepth = option && option.dataset.depth !== undefined ? parseInt(option.dataset.depth, 10) : -1;
    var level = parentDepth >= 0 ? parentDepth + 2 : 1;
    var maxLevel = (cfg.maxChildDepth || 3) + 1;
    parentHint.textContent = '保存后位于第 ' + level + ' 层；最深处是第 ' + maxLevel + ' 层。';
  }
  updateParentHint();

  /* 加密开关 */
  function syncEncryption() {
    if (passwordWrap) passwordWrap.hidden = !encryptionOn();
    if (encryptionOn()) clearDraft();
  }
  if (encryptEl) encryptEl.addEventListener('change', syncEncryption);
  syncEncryption();

  /* 保存 */
  function save() {
    if (saving) return;
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
    saving = true;
    saveBtn.disabled = true;
    setStatus('保存中…', true);

    var payload = {
      title: title,
      content: currentContent(),
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
        saved = true;
        dirty = false;
        clearDraft();
        setStatus('已保存', false);
        var keyId = data.keyid || cfg.keyid;
        window.location.href = '/note/view/' + encodeURIComponent(keyId);
        return;
      }
      if (messageEl) messageEl.textContent = data.msgs || '保存失败';
      saving = false;
      saveBtn.disabled = false;
      setStatus('保存失败', true);
    }).catch(function () {
      if (messageEl) messageEl.textContent = '网络错误，请重试';
      saving = false;
      saveBtn.disabled = false;
      setStatus('保存失败', true);
    });
  }
  if (saveBtn) saveBtn.addEventListener('click', save);

  document.addEventListener('keydown', function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save();
    }
  });

  /* 取消 / 未保存提醒 */
  var discardModal = null;
  function isDirtyNow() {
    return (titleEl && titleEl.value !== initialTitle) ||
      currentContent() !== initialContent ||
      (parentEl && parentEl.value !== initialParent);
  }
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
      saved = true;
      window.location.href = cfg.cancelUrl || '/note';
    });
  }
  window.addEventListener('beforeunload', function (event) {
    if (!saved && isDirtyNow()) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  /* 插入站内笔记链接 */
  var linkModal = null;
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
    if (easyMDE && easyMDE.codemirror) {
      easyMDE.codemirror.replaceSelection(snippet);
      easyMDE.codemirror.focus();
    } else if (contentEl) {
      var start = contentEl.selectionStart || 0;
      var end = contentEl.selectionEnd || 0;
      contentEl.value = contentEl.value.slice(0, start) + snippet + contentEl.value.slice(end);
      contentEl.selectionStart = contentEl.selectionEnd = start + snippet.length;
      contentEl.focus();
    }
    checkDirty();
  }
  if (insertLinkBtn) {
    insertLinkBtn.addEventListener('click', function () {
      linkModal = linkModal || UI.modal(linkModalEl);
      if (linkSearchEl) linkSearchEl.value = '';
      renderLinkList('');
      linkModal.show();
      if (linkSearchEl) setTimeout(function () { linkSearchEl.focus(); }, 60);
    });
  }
  if (linkSearchEl) {
    linkSearchEl.addEventListener('input', function () { renderLinkList(linkSearchEl.value); });
  }
  if (typeof EasyMDE !== 'undefined') initEasyMDE();
  else {
    showFallbackEditor();
    loadEasyMDE();
  }
})();