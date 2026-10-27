/* ── 主题切换（base.html / base_auth.html 共用） ── */
(function () {
  'use strict';
  var KEY = 'theme';
  var html = document.documentElement;
  if (localStorage.getItem(KEY) === 'dark') html.setAttribute('data-theme', 'dark');

  window.UI_initThemeToggle = function () {
    var btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var isDark = html.getAttribute('data-theme') === 'dark';
      if (isDark) {
        html.removeAttribute('data-theme');
        localStorage.setItem(KEY, 'light');
      } else {
        html.setAttribute('data-theme', 'dark');
        localStorage.setItem(KEY, 'dark');
      }
    });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.UI_initThemeToggle);
  } else {
    window.UI_initThemeToggle();
  }
})();
