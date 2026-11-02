/* ── 笔记工作区：目录树 / 移动端抽屉 / 阅读页交互 ── */
(function () {
  'use strict';

  function $(selector, root) { return (root || document).querySelector(selector); }
  function $$(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }

  function isTyping(target) {
    if (!target) return false;
    var tag = (target.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' ||
      target.isContentEditable || !!target.closest('[contenteditable="true"]');
  }

  function postForm(url, data) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(data)
    }).then(function (r) { return r.json(); });
  }

  /* ── 目录树折叠 ─────────────────────────────────────────────── */
  var COLLAPSE_KEY = 'note-tree-collapsed-v1';
  var treeItems = $$('.note-tree-item');
  var searchInput = $('#noteTreeSearch');
  var noMatch = $('#noteTreeNoMatch');
  var filtering = false;
  var collapsedBeforeSearch = [];

  function readCollapsed() {
    try {
      var value = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (e) { return []; }
  }
  function writeCollapsed(ids) {
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(ids.slice(0, 300))); } catch (e) { /* 忽略存储失败 */ }
  }
  function directToggle(item) {
    return item.querySelector(':scope > .note-tree-row .note-tree-toggle');
  }
  function setCollapsed(item, collapsed, persist) {
    item.classList.toggle('is-collapsed', collapsed);
    var btn = directToggle(item);
    if (btn) {
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      var name = (item.querySelector(':scope > .note-tree-row .note-tree-name') || {}).textContent || '';
      btn.setAttribute('aria-label', (collapsed ? '展开 ' : '收起 ') + name.trim());
    }
    if (persist) {
      var ids = readCollapsed().filter(function (id) { return id !== item.dataset.id; });
      if (collapsed) ids.push(item.dataset.id);
      writeCollapsed(ids);
    }
  }
  function expandAncestors(item) {
    var parent = item.parentElement && item.parentElement.closest('li.note-tree-item');
    while (parent) {
      setCollapsed(parent, false, false);
      parent = parent.parentElement && parent.parentElement.closest('li.note-tree-item');
    }
  }

  var storedCollapsed = readCollapsed();
  treeItems.forEach(function (item) {
    if (storedCollapsed.indexOf(item.dataset.id) >= 0) setCollapsed(item, true, false);
  });
  var currentItem = $('.note-tree-row.is-current');
  if (currentItem) {
    var currentLi = currentItem.closest('li.note-tree-item');
    if (currentLi) expandAncestors(currentLi);
  }

  $$('.note-tree-toggle:not(.is-empty)').forEach(function (btn) {
    btn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      var item = btn.closest('li.note-tree-item');
      if (!item) return;
      setCollapsed(item, !item.classList.contains('is-collapsed'), !filtering);
    });
  });

  function resetTreeFilter() {
    treeItems.forEach(function (item) {
      item.classList.remove('tree-hidden', 'is-search-hit');
    });
    noMatch && (noMatch.hidden = true);
    // 恢复搜索前的折叠状态
    treeItems.forEach(function (item) {
      setCollapsed(item, collapsedBeforeSearch.indexOf(item.dataset.id) >= 0, false);
    });
    if (currentItem && currentItem.closest('li.note-tree-item')) {
      expandAncestors(currentItem.closest('li.note-tree-item'));
    }
  }

  function applyTreeFilter(rawQuery) {
    var q = rawQuery.trim().toLowerCase();
    if (!q) {
      if (filtering) { filtering = false; resetTreeFilter(); }
      return;
    }
    if (!filtering) {
      filtering = true;
      collapsedBeforeSearch = readCollapsed();
    }

    var selfMatch = {};
    treeItems.forEach(function (item) {
      var nameEl = item.querySelector(':scope > .note-tree-row .note-tree-name');
      selfMatch[item.dataset.id] = !!nameEl && nameEl.textContent.toLowerCase().indexOf(q) >= 0;
    });

    var hits = 0;
    treeItems.forEach(function (item) {
      var hasDescendant = $$(':scope > .note-tree-list .note-tree-item', item).some(function (child) {
        return selfMatch[child.dataset.id];
      });
      var show = selfMatch[item.dataset.id] || hasDescendant;
      item.classList.toggle('tree-hidden', !show);
      item.classList.toggle('is-search-hit', selfMatch[item.dataset.id]);
      if (hasDescendant) setCollapsed(item, false, false);
      if (selfMatch[item.dataset.id]) hits += 1;
    });
    if (noMatch) noMatch.hidden = hits > 0;
  }

  if (searchInput) {
    var searchTimer = null;
    searchInput.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { applyTreeFilter(searchInput.value); }, 110);
    });
    searchInput.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && searchInput.value) {
        event.preventDefault();
        searchInput.value = '';
        applyTreeFilter('');
      }
    });
  }

  /* ── 移动端目录抽屉 ─────────────────────────────────────────── */
  var rail = $('#notesRail');
  var backdrop = $('#notesRailBackdrop');
  var railToggle = $('[data-notes-rail-toggle]');
  var mobileQuery = window.matchMedia('(max-width: 900px)');

  function syncRailInert() {
    if (!rail) return;
    if (mobileQuery.matches && !rail.classList.contains('is-open')) {
      rail.setAttribute('inert', '');
    } else {
      rail.removeAttribute('inert');
    }
  }
  function openRail() {
    if (!rail) return;
    rail.classList.add('is-open');
    rail.classList.remove('is-collapsed');
    backdrop && (backdrop.hidden = false);
    document.body.classList.add('notes-drawer-open');
    railToggle && railToggle.setAttribute('aria-expanded', 'true');
    syncRailInert();
    if (searchInput) setTimeout(function () { searchInput.focus(); }, 80);
  }
  function closeRail() {
    if (!rail || !rail.classList.contains('is-open')) return;
    rail.classList.remove('is-open');
    backdrop && (backdrop.hidden = true);
    document.body.classList.remove('notes-drawer-open');
    railToggle && railToggle.setAttribute('aria-expanded', 'false');
    syncRailInert();
    railToggle && railToggle.focus();
  }
  if (railToggle) railToggle.addEventListener('click', openRail);
  if (backdrop) backdrop.addEventListener('click', closeRail);
  if (mobileQuery.addEventListener) {
    mobileQuery.addEventListener('change', function () {
      if (!mobileQuery.matches) closeRail();
      syncRailInert();
    });
  }
  syncRailInert();

  /* ── 阅读页目录 ─────────────────────────────────────────────── */
  var noteBody = $('#noteBody');
  if (noteBody) {
    var headings = $$('h1, h2, h3', noteBody);
    var toc = $('#noteToc');
    var tocSection = $('#noteTocSection');
    var tocLinks = [];
    headings.forEach(function (heading, index) {
      if (!heading.id) heading.id = 'note-section-' + (index + 1);
      var link = document.createElement('a');
      link.className = 'note-toc-link' + (heading.tagName === 'H1' ? '' : ' is-sub');
      link.href = '#' + heading.id;
      link.textContent = heading.textContent.trim();
      if (!link.textContent) return;
      toc.appendChild(link);
      tocLinks.push({ el: link, heading: heading });
    });
    if (tocLinks.length && tocSection) {
      tocSection.hidden = false;
      var ticking = false;
      var updateToc = function () {
        ticking = false;
        var line = 112;
        var activeIndex = -1;
        tocLinks.forEach(function (entry, index) {
          if (entry.heading.getBoundingClientRect().top <= line) activeIndex = index;
        });
        tocLinks.forEach(function (entry, index) {
          entry.el.classList.toggle('is-active', index === activeIndex);
          if (index === activeIndex) entry.el.setAttribute('aria-current', 'location');
          else entry.el.removeAttribute('aria-current');
        });
      };
      window.addEventListener('scroll', function () {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(updateToc);
        }
      }, { passive: true });
      updateToc();
    }
  }

  /* ── 删除 ───────────────────────────────────────────────────── */
  var deleteModal = null;
  var main = $('#notesMain');
  var noteId = main && main.dataset.noteId;
  var deleteBtn = $('#noteDeleteBtn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', function () {
      deleteModal = deleteModal || UI.modal('noteDeleteModal');
      var msg = $('#noteDeleteMsg');
      if (msg) msg.textContent = '';
      deleteModal.show();
    });
  }
  var deleteConfirm = $('#noteDeleteConfirmBtn');
  if (deleteConfirm) {
    deleteConfirm.addEventListener('click', function () {
      var msg = $('#noteDeleteMsg');
      var modeEl = document.querySelector('#noteDeleteModal input[name="deleteMode"]:checked');
      deleteConfirm.disabled = true;
      postForm('/note/delete', {
        KeyID: noteId,
        mode: modeEl ? modeEl.value : 'detach'
      }).then(function (data) {
        if (data.code === 1) {
          window.location.href = data.redirect || '/note';
          return;
        }
        if (msg) msg.textContent = data.msgs || '删除失败';
        deleteConfirm.disabled = false;
      }).catch(function () {
        if (msg) msg.textContent = '网络错误，请重试';
        deleteConfirm.disabled = false;
      });
    });
  }

  /* ── 移动 ───────────────────────────────────────────────────── */
  var moveModal = null;
  var moveBtn = $('#noteMoveBtn');
  if (moveBtn) {
    moveBtn.addEventListener('click', function () {
      moveModal = moveModal || UI.modal('noteMoveModal');
      var msg = $('#noteMoveMsg');
      if (msg) msg.textContent = '';
      moveModal.show();
    });
  }
  var moveSave = $('#noteMoveSaveBtn');
  if (moveSave) {
    moveSave.addEventListener('click', function () {
      var select = $('#noteMoveParent');
      var msg = $('#noteMoveMsg');
      moveSave.disabled = true;
      postForm('/note/move', {
        KeyID: noteId,
        parent_id: select ? select.value : ''
      }).then(function (data) {
        if (data.code === 1) {
          window.location.href = data.redirect || window.location.href;
          return;
        }
        if (msg) msg.textContent = data.msgs || '移动失败';
        moveSave.disabled = false;
      }).catch(function () {
        if (msg) msg.textContent = '网络错误，请重试';
        moveSave.disabled = false;
      });
    });
  }

  /* ── 解锁加密笔记 ───────────────────────────────────────────── */
  var unlockForm = $('#noteUnlockForm');
  if (unlockForm) {
    unlockForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var input = $('#noteUnlockPassword');
      var message = $('#noteUnlockMsg');
      var button = $('#noteUnlockBtn');
      if (!input || !input.value) {
        if (message) message.textContent = '请输入密码';
        return;
      }
      if (message) message.textContent = '';
      button.disabled = true;
      button.textContent = '解锁中…';
      postForm('/note/unlock', { KeyID: noteId, password: input.value }) /* taste-skill-ignore copy: endpoint */
        .then(function (data) {
          if (data.code === 1) {
            window.location.reload();
            return;
          }
          if (message) message.textContent = data.msgs || '密码错误';
          button.disabled = false;
          button.textContent = '解锁';
          input.focus();
          input.select();
        })
        .catch(function () {
          if (message) message.textContent = '网络错误，请重试';
          button.disabled = false;
          button.textContent = '解锁';
        });
    });
  }

  /* ── 键盘快捷键 ─────────────────────────────────────────────── */
  document.addEventListener('keydown', function (event) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (rail && rail.classList.contains('is-open') && event.key === 'Escape') {
      closeRail();
      return;
    }
    if (event.key === '/' && !isTyping(event.target)) {
      if (!searchInput) return;
      event.preventDefault();
      if (window.matchMedia('(max-width: 900px)').matches) openRail();
      else searchInput.focus();
      return;
    }
    if (isTyping(event.target)) return;
    if (event.target.closest('a, button')) return;

    var key = event.key.toLowerCase();
    if (key === 'e') {
      var editLink = $('#noteEditLink');
      if (editLink) {
        event.preventDefault();
        window.location.href = editLink.href;
      }
    } else if (key === 'n') {
      var childLink = $('#noteNewChildLink');
      var newLink = $('#noteNewBtn');
      if (childLink) {
        event.preventDefault();
        window.location.href = childLink.href;
      } else if (newLink) {
        event.preventDefault();
        window.location.href = newLink.href;
      }
    }
  });
})();