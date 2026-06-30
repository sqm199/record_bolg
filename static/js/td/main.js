/* 军事塔防 —— 入口装配
 * 实例化 Game/Renderer/UI，装配 requestAnimationFrame 主循环（固定步长），监听 resize。
 */
window.TD = window.TD || {};
(function () {
  function boot() {
    const canvas = document.getElementById('tdCanvas');
    const stage  = document.getElementById('tdStage');
    if (!canvas || !stage) return;

    const game     = new window.TD.Game();
    const renderer = new window.TD.Renderer(canvas);
    const ui       = new window.TD.UI(game);

    let view = window.TD.Coords.resize(canvas, stage);
    window.addEventListener('resize', function () {
      view = window.TD.Coords.resize(canvas, stage);
    });

    const STEP = 1 / 60;       // 固定逻辑步长
    let last = performance.now();
    let acc = 0;

    function frame(now) {
      let real = (now - last) / 1000;
      last = now;
      if (real > 0.25) real = 0.25;   // 防止切后台回来后大跳

      if (game.running && game.phase !== 'win' && game.phase !== 'lose') {
        acc += real;
        let guard = 0;
        while (acc >= STEP && guard < 600) { game.update(STEP); acc -= STEP; guard++; }
      } else {
        acc = 0;
      }

      renderer.draw(game, view);
      ui.refresh();
      requestAnimationFrame(frame);
    }

    ui.refresh();
    requestAnimationFrame(frame);
    window.__tdGame = game;    // 便于调试
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
