/* 军事塔防 —— 实体类
 * 纯数据 + 轻量查询方法（takeDamage / contains / blocks）。
 * 复杂行为（索敌、移动、绕缺口、开火、生产）统一由 engine.js 的 Game 编排。
 */
window.TD = window.TD || {};
(function () {
  const CFG = window.TD_CONFIG;

  // 单位/敌军绘制与碰撞半径（按兵种）
  const RADIUS = { infantry: 9, vehicle: 14, air: 12 };
  // 我方单位移动速度（逻辑像素/秒）—— config.UNITS 未含 speed（原为驻守设计），
  // 出击玩法在此按兵种补默认值，略快于同类敌军以便主动接敌。
  const UNIT_SPEED = { infantry: 45, vehicle: 25, air: 60 };
  // 我方单位射程上限（逻辑像素）——避免远程单位过早开火，敌军需接近到此距离内才被击中
  const UNIT_RANGE_CAP = 235;

  // ── 基地 ─────────────────────────────────────────────────────────────
  class Base {
    constructor(geom) {
      this.maxHp = geom.base.hp;
      this.hp    = geom.base.hp;
      this.top    = geom.base.top;
      this.bottom = geom.base.bottom;
      this.cy     = geom.base.cy;
      this.left  = 0;
      this.right = geom.L.w;
      this.alive = true;
      this.kind  = 'base';
    }
    takeDamage(d) {
      this.hp -= d;
      if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    }
  }

  // ── 高墙（静态单例，正中缺口）────────────────────────────────────────
  class Wall {
    constructor(geom) {
      this.top    = geom.wall.top;
      this.bottom = geom.wall.bottom;
      this.cy     = geom.wall.cy;
      this.gapX   = geom.wall.gapX;        // [左, 右]
      this.gapCenterX = geom.wall.gapCenterX;
    }
    isInGap(x) { return x >= this.gapX[0] && x <= this.gapX[1]; }
    // 陆军阻挡查询：点落在墙体 y 带且 x 不在缺口内
    blocks(x, y, r) {
      r = r || 0;
      if (y + r < this.top || y - r > this.bottom) return false;
      return !this.isInGap(x);
    }
  }

  // ── 防御工事（trench 战壕 / cheval 拒马）──────────────────────────────
  class Fort {
    constructor(spec) {
      this.type   = spec.type;
      this.x      = spec.x;
      this.y      = spec.y;
      this.maxHp  = spec.hp;
      this.hp     = spec.hp;
      this.radius = spec.radius;
      this.alive  = true;
      this.kind   = 'fort';
    }
    takeDamage(d) {
      this.hp -= d;
      if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    }
    // 圆形重叠（陆军阻挡 / 命中判定）
    contains(x, y, r) {
      const dx = x - this.x, dy = y - this.y, rr = this.radius + (r || 0);
      return dx * dx + dy * dy <= rr * rr;
    }
  }

  // ── 营地（玩家核心操作对象）──────────────────────────────────────────
  class Camp {
    constructor(slotIndex, x, y, kind) {
      this.slotIndex   = slotIndex;
      this.x           = x;
      this.y           = y;
      this.kind        = kind;            // infantry | vehicle | air
      this.level       = 1;
      this.buildTimers = {};              // { unitKey: 剩余制造秒 }，各兵种独立并行
    }
    unlockedUnits() {
      return CFG.CAMPS[this.kind].units.slice(0, this.level);
    }
    canUpgrade() { return this.level < 5; }
    upgradeCost() {
      // campUpgrade[0] 是升到 2 级的花费，对应 level=1
      return this.canUpgrade() ? CFG.ECONOMY.campUpgrade[this.level - 1] : 0;
    }
    isBuilding(unitKey) { return this.buildTimers[unitKey] > 0; }
  }

  // ── 我方单位（会移动、出击交战）──────────────────────────────────────
  class Unit {
    constructor(type, x, y) {
      const u = CFG.UNITS[type];
      this.type     = type;
      this.name     = u.name;
      this.kind     = u.kind;            // infantry | vehicle | air
      this.icon     = u.icon;
      this.flying   = u.kind === 'air';
      this.maxHp    = u.hp;
      this.hp       = u.hp;
      this.damage   = u.damage;
      this.range    = Math.min(u.range, UNIT_RANGE_CAP);
      this.fireRate = u.fireRate;
      this.splash   = u.splash || 0;
      this.oneShot  = !!u.oneShot;
      this.speed    = UNIT_SPEED[u.kind];
      this.radius   = RADIUS[u.kind];
      this.x        = x;
      this.y        = y;
      this.cooldown = 0;
      this.target   = null;
      this.side     = 'ally';
      this.angle    = -Math.PI / 2;     // 朝向（弧度），我方初始朝上出击
      this.station  = null;             // 分配的前沿阵地驻守点
      this.alive    = true;
    }
    takeDamage(d) {
      this.hp -= d;
      if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    }
  }

  // ── 敌军 ─────────────────────────────────────────────────────────────
  class Enemy {
    constructor(type, x, y, hpScale) {
      const e = CFG.ENEMIES[type];
      this.type       = type;
      this.name       = e.name;
      this.flying     = !!e.flying;
      this.kind       = this.flying ? 'air' : (type === 'tank' ? 'vehicle' : 'infantry');
      this.maxHp      = e.hp * hpScale;
      this.hp         = this.maxHp;
      this.speed      = e.speed;
      this.damage     = e.damage;
      this.range      = e.range;
      this.fireRate   = e.fireRate;
      this.color      = e.color;
      this.bountyKind = e.bountyKind;
      this.radius     = RADIUS[this.kind];
      this.x          = x;
      this.y          = y;
      this.cooldown   = 0;
      this.target     = null;
      this.side       = 'enemy';
      this.angle      = Math.PI / 2;    // 敌军初始朝下推进
      this.alive      = true;
    }
    takeDamage(d) {
      this.hp -= d;
      if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    }
  }

  // ── 抛射物（统一命中结算载体）────────────────────────────────────────
  class Projectile {
    constructor(x, y, tx, ty, damage, splash, fromEnemy, speed, kind) {
      this.x = x; this.y = y;
      this.sx = x; this.sy = y;          // 起点（曳光/光束渲染用）
      this.tx = tx; this.ty = ty;
      this.damage = damage;
      this.splash = splash || 0;
      this.fromEnemy = fromEnemy;
      this.speed = speed;
      this.kind = kind || 'gun';         // gun|sniper|shell|rocket|laser|flame
      this.angle = Math.atan2(ty - y, tx - x);
      this.alive = true;
    }
  }

  window.TD.Base       = Base;
  window.TD.Wall       = Wall;
  window.TD.Fort       = Fort;
  window.TD.Camp       = Camp;
  window.TD.Unit       = Unit;
  window.TD.Enemy      = Enemy;
  window.TD.Projectile = Projectile;
  window.TD.RADIUS     = RADIUS;
})();
