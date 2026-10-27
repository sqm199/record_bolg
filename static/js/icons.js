/* ── SVG sprite 注入 + 滚动浮现（无第三方依赖） ── */
(function () {
  'use strict';

  // 把 static/icons.svg 的内联 sprite 注入文档，令 <use href="#i-xxx"> 可用。
  // 必须用 image/svg+xml 解析：HTML innerHTML 会把 svg 命名空间丢掉，symbol 就失效了。
  fetch('/static/icons.svg')
    .then(function (r) { return r.ok ? r.text() : Promise.reject(); })
    .then(function (svg) {
      var doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      var root = doc.documentElement;
      if (!root || root.nodeName.toLowerCase() !== 'svg') return;
      var host = document.importNode(root, true);
      host.setAttribute('aria-hidden', 'true');
      host.setAttribute('focusable', 'false');
      host.style.position = 'absolute';
      host.style.width = '0';
      host.style.height = '0';
      document.body.insertBefore(host, document.body.firstChild);
    })
    .catch(function () { /* 缺图标时文字仍然完整 */ });

  // 进场浮现：观察 .reveal，进入视口后加 .revealed
  var root = document.documentElement;
  root.classList.add('js-ready');

  if (!('IntersectionObserver' in window) ||
      matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) {
        en.target.classList.add('revealed');
        io.unobserve(en.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.04 });

  window.UI_reveal = function (scope) {
    (scope || document).querySelectorAll('.reveal:not(.revealed)').forEach(function (el, i) {
      el.style.setProperty('--reveal-delay', Math.min(i, 8) * 60 + 'ms');
      io.observe(el);
    });
  };
  window.UI_revealStagger = function (items) {
    items.forEach(function (el, i) {
      el.classList.add('reveal');
      el.style.setProperty('--reveal-delay', Math.min(i, 10) * 45 + 'ms');
      io.observe(el);
    });
  };
})();
