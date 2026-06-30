/* 军事塔防 —— 配置（数据驱动，所有可调数值集中于此） */
window.TD_CONFIG = (function () {

  // ── 经济 ──────────────────────────────────────────────────────────────
  const ECONOMY = {
    startGold:   100000,                 // 初始金币（可配置）
    campBuild:   100,                    // 营地初始建造费
    campUpgrade: [200, 400, 800, 1600],  // 升到 2/3/4/5 级的花费
    bounty:      { infantry: 5, vehicle: 20, air: 50 }, // 击杀奖励
  };

  // ── 营地（三类，5 级，每级解锁一个单位）────────────────────────────────
  const CAMPS = {
    infantry: { name: '步兵营', icon: '🪖',
      units: ['rifleman', 'sniper', 'gunner', 'grenadier', 'rpg'] },
    vehicle:  { name: '战车营', icon: '🛡️',
      units: ['apc', 'flame', 'laser', 'lighttank', 'heavytank'] },
    air:      { name: '制空营', icon: '🛩️',
      units: ['kamikaze', 'mgdrone', 'heli', 'f22', 'b2'] },
  };

  // ── 军事单位 ───────────────────────────────────────────────────────────
  // cost/cap/build 严格对齐规格；hp/damage/range/fireRate/splash 为本方案战斗初值
  // kind: infantry|vehicle|air；range 为逻辑像素；fireRate 为每秒攻击次数
  const UNITS = {
    rifleman:  { name: '步兵',     kind: 'infantry', icon: '🔫', cost: 10,   cap: 20, build: 1,
                 hp: 40,  damage: 6,   range: 150, fireRate: 3,   splash: 0 },
    sniper:    { name: '狙击兵',   kind: 'infantry', icon: '🎯', cost: 20,   cap: 5,  build: 2,
                 hp: 30,  damage: 65,  range: 380, fireRate: 0.5, splash: 0 },
    gunner:    { name: '机枪兵',   kind: 'infantry', icon: '🔩', cost: 40,   cap: 10, build: 3,
                 hp: 60,  damage: 5,   range: 170, fireRate: 8,   splash: 0 },
    grenadier: { name: '手榴弹兵', kind: 'infantry', icon: '💣', cost: 40,   cap: 10, build: 5,
                 hp: 50,  damage: 45,  range: 210, fireRate: 0.6, splash: 45 },
    rpg:       { name: '重火力手', kind: 'infantry', icon: '🚀', cost: 80,   cap: 10, build: 5,
                 hp: 60,  damage: 130, range: 250, fireRate: 0.4, splash: 35 },

    apc:       { name: '装甲车',   kind: 'vehicle',  icon: '🚙', cost: 100,  cap: 5,  build: 5,
                 hp: 260, damage: 8,   range: 190, fireRate: 6,   splash: 0 },
    flame:     { name: '喷火车',   kind: 'vehicle',  icon: '🔥', cost: 100,  cap: 5,  build: 5,
                 hp: 300, damage: 26,  range: 95,  fireRate: 5,   splash: 40 },
    laser:     { name: '激光战车', kind: 'vehicle',  icon: '🔆', cost: 200,  cap: 5,  build: 5,
                 hp: 280, damage: 55,  range: 270, fireRate: 2,   splash: 0 },
    lighttank: { name: '轻型坦克', kind: 'vehicle',  icon: '🚜', cost: 400,  cap: 5,  build: 5,
                 hp: 520, damage: 95,  range: 250, fireRate: 1,   splash: 45 },
    heavytank: { name: '重型坦克', kind: 'vehicle',  icon: '🚛', cost: 800,  cap: 5,  build: 10,
                 hp: 950, damage: 190, range: 270, fireRate: 0.6, splash: 55 },

    kamikaze:  { name: '自杀式无人机', kind: 'air', icon: '🛸', cost: 50,   cap: 10, build: 2,
                 hp: 12,  damage: 160, range: 420, fireRate: 0.5, splash: 70, oneShot: true },
    mgdrone:   { name: '机枪无人机',   kind: 'air', icon: '📡', cost: 200,  cap: 5,  build: 5,
                 hp: 70,  damage: 6,   range: 230, fireRate: 7,   splash: 0 },
    heli:      { name: '武装直升机',   kind: 'air', icon: '🚁', cost: 400,  cap: 2,  build: 10,
                 hp: 220, damage: 32,  range: 300, fireRate: 3,   splash: 30 },
    f22:       { name: 'F22战机',      kind: 'air', icon: '✈️', cost: 2000, cap: 2,  build: 10,
                 hp: 160, damage: 110, range: 430, fireRate: 1.5, splash: 50 },
    b2:        { name: 'B2轰炸机',     kind: 'air', icon: '🛫', cost: 8000, cap: 1,  build: 20,
                 hp: 240, damage: 320, range: 500, fireRate: 0.3, splash: 90 },
  };

  // ── 敌军模板 ───────────────────────────────────────────────────────────
  const ENEMIES = {
    foot: { name: '敌步兵', bountyKind: 'infantry', power: 1,
            hp: 55,  speed: 30, damage: 8,  range: 95,  fireRate: 1,   color: '#c0392b' },
    tank: { name: '敌战车', bountyKind: 'vehicle',  power: 6,
            hp: 420, speed: 17, damage: 32, range: 130, fireRate: 0.7, color: '#7f5539' },
    air:  { name: '敌机',   bountyKind: 'air',      power: 4, flying: true,
            hp: 130, speed: 42, damage: 16, range: 150, fireRate: 1,   color: '#6c5ce7' },
  };

  // ── 波次 ───────────────────────────────────────────────────────────────
  const WAVES = {
    count:         10,
    attackSeconds: 60,
    breakSeconds:  20,
    powerGrowth:   1.2,
    baseBudget:    40,
    hpGrowth:      0.12,
    spawnInterval: [0.6, 1.4],
    mix: function (waveIndex) {        // waveIndex 从 1 开始
      const t = (waveIndex - 1) / 9;   // 0..1
      return {
        foot: 0.7 - 0.4 * t,
        tank: 0.15 + 0.3 * t,
        air:  0.15 + 0.1 * t,
      };
    },
  };

  // ── 地图（比例坐标 0..1，x 相对宽、y 相对高，y 向下增大）─────────────────
  const MAP = {
    logicalW: 960,
    logicalH: 720,
    spawnY:     -0.04,           // 敌军在屏幕外上方生成
    fortBand:   [0.40, 0.52],    // 防御工事带 y 区间
    wallY:      0.60,            // 高墙中心 y
    wallH:      0.035,           // 高墙厚度
    gap:        [0.42, 0.58],    // 缺口 x 区间
    defendBand: [0.64, 0.77],    // 我方驻防网格 y 区间
    defendCols: 9,
    defendRows: 3,
    slots: [ { x: 0.27, y: 0.90 }, { x: 0.50, y: 0.90 }, { x: 0.73, y: 0.90 } ],
    base: { y: 0.835, h: 0.16, hp: 2000 },
    forts: [
      { type: 'trench', x: 0.50, y: 0.44, hp: 600 },
      { type: 'cheval', x: 0.20, y: 0.49, hp: 300 },
      { type: 'cheval', x: 0.35, y: 0.49, hp: 300 },
      { type: 'cheval', x: 0.50, y: 0.50, hp: 300 },
      { type: 'cheval', x: 0.65, y: 0.49, hp: 300 },
      { type: 'cheval', x: 0.80, y: 0.49, hp: 300 },
    ],
  };

  return { ECONOMY, CAMPS, UNITS, ENEMIES, WAVES, MAP };
})();
