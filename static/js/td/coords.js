/* 军事塔防 —— 坐标系统与几何派生
 * 三层坐标：比例 r(0..1) → 逻辑 L(960x720) → 设备像素 D
 * 实体内部一律使用逻辑像素；config 的 range/speed/hp 即逻辑像素，无需换算。
 */
window.TD = window.TD || {};
window.TD.Coords = (function () {
  const MAP = window.TD_CONFIG.MAP;
  const L = { w: MAP.logicalW, h: MAP.logicalH };   // 960 x 720

  // 比例 → 逻辑像素
  function rx(r) { return r * L.w; }
  function ry(r) { return r * L.h; }

  // 响应式 + DPR：canvas CSS 宽 = 容器宽，锁 4:3；返回逻辑→CSS 的缩放系数
  function resize(canvas, container) {
    const cssW = Math.max(1, container.clientWidth);
    const cssH = cssW * (L.h / L.w);
    const dpr  = window.devicePixelRatio || 1;
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width  = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    return { scale: cssW / L.w, dpr, cssW, cssH };
  }

  // 鼠标像素 → 逻辑坐标（保留：当前自动部署玩法未用，便于后续扩展）
  function toLogical(evt, canvas, scale) {
    const r = canvas.getBoundingClientRect();
    return { x: (evt.clientX - r.left) / scale, y: (evt.clientY - r.top) / scale };
  }

  // 启动时一次性派生全部几何（逻辑像素），缓存供引擎/渲染共用
  function buildGeom() {
    const wallCy = ry(MAP.wallY);
    const wallHp = ry(MAP.wallH);
    const wall = {
      cy: wallCy,
      top: wallCy - wallHp / 2,
      bottom: wallCy + wallHp / 2,
      h: wallHp,
      gapX: [rx(MAP.gap[0]), rx(MAP.gap[1])],
    };
    wall.gapCenterX = (wall.gapX[0] + wall.gapX[1]) / 2;

    const baseH   = ry(MAP.base.h);
    const baseCy  = ry(MAP.base.y);
    const base = {
      top: baseCy - baseH / 2,
      bottom: baseCy + baseH / 2,
      cy: baseCy,
      h: baseH,
      hp: MAP.base.hp,
    };

    // 工事：trench 较宽，cheval 较小
    const forts = MAP.forts.map(function (f) {
      return {
        type: f.type,
        x: rx(f.x),
        y: ry(f.y),
        hp: f.hp,
        radius: f.type === 'trench' ? 55 : 26,
      };
    });

    const slots = MAP.slots.map(function (s) {
      return { x: rx(s.x), y: ry(s.y) };
    });

    // 五个前沿阵地：墙外、拒马后方，我方单位随机分散驻守，迎击下来的敌军
    const stationXs = [0.20, 0.35, 0.50, 0.65, 0.80];
    const stations = stationXs.map(function (fx) { return { x: rx(fx), y: ry(0.555) }; });

    const defendBand = [ry(MAP.defendBand[0]), ry(MAP.defendBand[1])];
    const fortBand   = [ry(MAP.fortBand[0]),   ry(MAP.fortBand[1])];

    return {
      L: L,
      spawnY: ry(MAP.spawnY),
      fortBand: fortBand,
      wall: wall,
      defendBand: defendBand,
      // 我方单位无敌可索时的墙外集结线（缺口外一点，墙上方）
      rallyY: wall.top - 40,
      base: base,
      forts: forts,
      slots: slots,
      stations: stations,
    };
  }

  return { L: L, rx: rx, ry: ry, resize: resize, toLogical: toLogical, buildGeom: buildGeom };
})();
