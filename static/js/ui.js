/* ── UI 组件：modal / toast（无第三方依赖） ── */
window.UI = (function () {
  'use strict';

  var openModals = [];

  function modal(elOrId) {
    var el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
    if (!el) return null;

    if (!el.dataset.uiBound) {
      el.dataset.uiBound = '1';
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
        el.classList.add('open');
        document.body.classList.add('modal-open');
        openModals.push(el);
      },
      hide: function () {
        if (!el.classList.contains('open')) return;
        el.classList.remove('open');
        openModals = openModals.filter(function (m) { return m !== el; });
        if (!openModals.length) document.body.classList.remove('modal-open');
      },
      toggle: function () {
        el.classList.contains('open') ? api.hide() : api.show();
      }
    };
    return api;
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && openModals.length) {
      modal(openModals[openModals.length - 1]).hide();
    }
  });

  function toast(msg, type, ms) {
    var stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    var t = document.createElement('div');
    t.className = 'toast' + (type ? ' ' + type : '');
    t.textContent = msg;
    stack.appendChild(t);
    setTimeout(function () {
      t.classList.add('leaving');
      setTimeout(function () { t.remove(); }, 300);
    }, ms || 2600);
  }

  return { modal: modal, toast: toast };
})();
