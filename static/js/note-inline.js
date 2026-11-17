/* ── 笔记页内嵌编辑：编辑 / 新建在当前页面完成，左侧目录保持不动 ── */
(function () {
  'use strict';

  var main = document.getElementById('notesMain');
  var workspace = document.querySelector('.notes-workspace.is-detail');
  if (!main || !workspace) return;

  var readView = null;
  var active = null;
  var loading = false;
  var returnScroll = 0;
  var scriptCache = {};

  // 编辑器脚本的带版本地址由服务端注入，避免反向代理强缓存旧脚本。
  var editorAssets = (function () {
    var defaults = {
      tiptap: '/static/vendor/tiptap.js',
      rich: '/static/js/note-editor-rich.js',
      md: '/static/js/note-editor.js'
    };
    var el = document.getElementById('noteEditorAssets');
    if (!el) return defaults;
    try {
      var data = JSON.parse(el.textContent || '{}');
      return {
        tiptap: data.tiptap || defaults.tiptap,
        rich: data.rich || defaults.rich,
        md: data.md || defaults.md
      };
    } catch (e) {
      return defaults;
    }
  })();

  function isPlainClick(event) {
    return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
  }

  function loadScript(src) {
    if (scriptCache[src]) return scriptCache[src];
    scriptCache[src] = new Promise(function (resolve, reject) {
      var el = document.createElement('script');
      el.src = src;
      el.onload = function () { resolve(); };
      el.onerror = function () { reject(new Error('编辑器资源加载失败，请刷新页面重试')); };
      document.head.appendChild(el);
    });
    return scriptCache[src];
  }

  function loadScripts(list) {
    return list.reduce(function (chain, src) {
      return chain.then(function () { return loadScript(src); });
    }, Promise.resolve());
  }

  function withCacheBust(src) {
    return src + (src.indexOf('?') >= 0 ? '&' : '?') + '_r=' + Date.now();
  }

  function editorReady(editor) {
    if (editor === 'markdown') return !!window.NoteEditorMarkdown;
    return !!(window.TipTapKit && window.NoteEditorRich);
  }

  function editorScripts(editor) {
    return editor === 'markdown'
      ? [editorAssets.md]
      : [editorAssets.tiptap, editorAssets.rich];
  }

  function defaultParentId() {
    return (main && main.dataset.noteId) || '';
  }

  function editorFetchUrl(mode, keyid, parent) {
    if (mode === 'edit') {
      return '/note/' + encodeURIComponent(keyid) + '/edit?embed=1';
    }
    return '/note/new?embed=1&parent=' + encodeURIComponent(parent || '');
  }

  function wrapReadView() {
    if (readView && readView.parentNode === main) return readView;
    readView = main.querySelector(':scope > .notes-read-view');
    if (!readView) {
      readView = document.createElement('div');
      readView.className = 'notes-read-view';
      while (main.firstChild) readView.appendChild(main.firstChild);
      main.appendChild(readView);
    }
    readView.hidden = false;
    return readView;
  }

  function destroyEditor() {
    if (!active) return;
    try { active.handle.destroy(); } catch (e) { /* 编辑器已销毁 */ }
    if (active.root && active.root.parentNode) active.root.parentNode.removeChild(active.root);
    active = null;
    workspace.classList.remove('is-inline-editing');
    document.body.classList.remove('editor-focus');
  }

  function closeEditor(restoreScroll) {
    destroyEditor();
    if (readView) readView.hidden = false;
    main.removeAttribute('aria-busy');
    if (restoreScroll) window.scrollTo(0, returnScroll);
  }

  function mountEditor(data, mode, keyid) {
    var read = wrapReadView();
    read.hidden = true;

    var host = document.createElement('div');
    host.innerHTML = data.html;
    var root = host.firstElementChild;
    if (!root) {
      closeEditor(true);
      UI.toast('编辑器打开失败', 'error');
      return;
    }
    main.appendChild(root);
    workspace.classList.add('is-inline-editing');
    main.removeAttribute('aria-busy');

    // 从页面下方打开编辑器时，让编辑器顶部进入视野。
    var mainTop = main.getBoundingClientRect().top + window.scrollY - 12;
    if (window.scrollY > mainTop) window.scrollTo(0, Math.max(0, mainTop));

    var hooks = {
      onCancel: function () { closeEditor(true); },
      onSaved: function (result) {
        var savedId = (result && result.keyid) || keyid;
        var isNew = mode === 'new';
        closeEditor(false);
        // 新建与编辑一致：在当前页面就地切换到新笔记的阅读态。
        if (isNew) window.scrollTo(0, 0);
        if (window.NotesPage && typeof window.NotesPage.reload === 'function') {
          window.NotesPage.reload('/note/view/' + encodeURIComponent(savedId));
        } else {
          window.location.href = '/note/view/' + encodeURIComponent(savedId);
        }
      }
    };

    var handle;
    if (data.editor === 'markdown' && window.NoteEditorMarkdown) {
      handle = window.NoteEditorMarkdown.mount(root, hooks);
    } else if (window.NoteEditorRich) {
      handle = window.NoteEditorRich.mount(root, hooks);
    }
    if (!handle) {
      root.parentNode && root.parentNode.removeChild(root);
      closeEditor(true);
      console.error('[note-inline] editor mount failed', {
        editor: data.editor,
        hasMarkdown: !!window.NoteEditorMarkdown,
        hasRich: !!window.NoteEditorRich,
        hasTipTap: !!window.TipTapKit
      });
      UI.toast('编辑器初始化失败，请按 Ctrl+F5 强制刷新后重试', 'error');
      return;
    }
    active = { root: root, handle: handle, mode: mode, keyid: keyid };
    main.setAttribute('aria-busy', 'false');
    // 动态插入的 autofocus 不会自动生效，这里把焦点放进标题。
    var titleInput = root.querySelector('#noteTitle');
    if (titleInput) {
      setTimeout(function () {
        try { titleInput.focus({ preventScroll: true }); } catch (e) { titleInput.focus(); }
      }, 0);
    }
  }

  function closeDrawer() {
    var rail = document.getElementById('notesRail');
    if (!rail || !rail.classList.contains('is-open')) return;
    rail.classList.remove('is-open');
    rail.setAttribute('inert', '');
    var backdrop = document.getElementById('notesRailBackdrop');
    if (backdrop) backdrop.hidden = true;
    var toggle = document.querySelector('[data-notes-rail-toggle]');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('notes-drawer-open');
  }

  function openEditor(mode, keyid, parent) {
    if (loading || active) {
      UI.toast('请先保存或取消当前编辑', 'info');
      return;
    }
    closeDrawer();
    loading = true;
    main.setAttribute('aria-busy', 'true');
    returnScroll = window.scrollY;

    var fetchUrl = editorFetchUrl(mode, keyid, parent);
    fetch(fetchUrl, { headers: { 'X-Requested-With': 'fetch' } })
      .then(function (response) {
        if (!response.ok) throw new Error('无法打开编辑器');
        return response.json();
      })
      .then(function (data) {
        if (!data || data.code !== 1 || !data.html) {
          throw new Error((data && data.msgs) || '无法打开编辑器');
        }
        var editor = data.editor === 'markdown' ? 'markdown' : 'rich';
        if (editorReady(editor)) return data;
        return loadScripts(editorScripts(editor)).then(function () {
          if (editorReady(editor)) return data;
          // 命中了没有全局入口的旧缓存时，带随机参数强制重取一次。
          return loadScripts(editorScripts(editor).map(withCacheBust)).then(function () {
            if (!editorReady(editor)) {
              throw new Error('编辑器脚本未能加载，请按 Ctrl+F5 强制刷新后重试');
            }
            return data;
          });
        });
      })
      .then(function (data) {
        loading = false;
        mountEditor(data, mode, keyid);
      })
      .catch(function (error) {
        loading = false;
        main.removeAttribute('aria-busy');
        UI.toast((error && error.message) || '无法打开编辑器', 'error');
      });
  }

  function handleLinkClick(event) {
    if (!isPlainClick(event) || event.defaultPrevented) return;
    var link = event.target.closest('a');
    if (!link || !workspace.contains(link)) return;
    if (link.closest('.notes-inline-editor')) return;

    var url;
    try { url = new URL(link.href, window.location.origin); } catch (e) { return; }
    if (url.origin !== window.location.origin) return;

    var editMatch = url.pathname.match(/\/note\/([^/]+)\/edit\/?$/);
    if (editMatch) {
      event.preventDefault();
      openEditor('edit', decodeURIComponent(editMatch[1]), '');
      return;
    }
    if (/\/note\/new\/?$/.test(url.pathname)) {
      event.preventDefault();
      var parent = url.searchParams.get('parent');
      if (parent === null) parent = defaultParentId();
      openEditor('new', '', parent);
    }
  }

  document.addEventListener('click', handleLinkClick);

  document.addEventListener('notes:workspace-replaced', function () {
    workspace = document.querySelector('.notes-workspace.is-detail');
    readView = null;
    active = null;
    loading = false;
    main = document.getElementById('notesMain');
    var next = main && main.querySelector(':scope > .notes-read-view');
    if (next) readView = next;
  });

  window.NoteInline = {
    open: openEditor,
    close: function () { closeEditor(true); }
  };
})();