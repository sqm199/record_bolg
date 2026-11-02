/* ── UI 组件：modal / toast（无第三方依赖） ── */
window.UI = (function () {
  'use strict';

  var openModals = [];
  var focusReturn = new WeakMap();

  function focusables(el) {
    return Array.prototype.slice.call(el.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(function (node) {
      return node.offsetWidth > 0 || node.offsetHeight > 0 || node === document.activeElement;
    });
  }

  function onKeydown(e) {
    if (!openModals.length) return;
    var top = openModals[openModals.length - 1];
    if (e.key === 'Escape') {
      e.preventDefault();
      modal(top).hide();
      return;
    }
    if (e.key !== 'Tab') return;
    var items = focusables(top);
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !top.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !top.contains(document.activeElement))) {
      e.preventDefault();
      first.focus();
    }
  }

  function modal(elOrId) {
    var el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
    if (!el) return null;

    if (!el.dataset.uiBound) {
      el.dataset.uiBound = '1';
      el.setAttribute('role', el.getAttribute('role') || 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.addEventListener('mousedown', function (e) {
        if (e.target.classList.contains('app-modal-backdrop')) api.hide();
      });
      el.querySelectorAll('[data-modal-dismiss]').forEach(function (btn) {
        btn.addEventListener('click', function () { api.hide(); });
      });
    }

    var api = {
      show: function () {
        if (el.classList.contains('open')) return;
        if (document.activeElement && document.activeElement !== document.body) {
          focusReturn.set(el, document.activeElement);
        }
        el.classList.add('open');
        document.body.classList.add('modal-open');
        openModals.push(el);
        var items = focusables(el);
        var target = el.querySelector('[autofocus]') || items[0] || el;
        if (!target.hasAttribute('tabindex') && target === el) target.setAttribute('tabindex', '-1');
        setTimeout(function () { target.focus(); }, 0);
      },
      hide: function () {
        if (!el.classList.contains('open')) return;
        el.classList.remove('open');
        openModals = openModals.filter(function (m) { return m !== el; });
        if (!openModals.length) document.body.classList.remove('modal-open');
        var previous = focusReturn.get(el);
        if (previous && document.contains(previous)) previous.focus();
      },
      toggle: function () {
        el.classList.contains('open') ? api.hide() : api.show();
      }
    };
    return api;
  }

  document.addEventListener('keydown', onKeydown);

  function toast(msg, type, ms) {
    var stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      stack.setAttribute('aria-live', 'polite');
      stack.setAttribute('aria-atomic', 'false');
      document.body.appendChild(stack);
    }
    var t = document.createElement('div');
    t.className = 'toast' + (type ? ' ' + type : '');
    t.setAttribute('role', type === 'error' ? 'alert' : 'status');
    t.textContent = msg;
    stack.appendChild(t);
    setTimeout(function () {
      t.classList.add('leaving');
      setTimeout(function () { t.remove(); }, 300);
    }, ms || 2600);
  }

  return { modal: modal, toast: toast };
})();