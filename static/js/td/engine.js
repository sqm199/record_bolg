/* 军事塔防 —— 游戏引擎
 * Game：状态、主循环 step、波次状态机、敌军生成、移动/绕缺口寻路、
 *       战斗解析、生产、死亡结算、胜负、reset。
 * 所有数值消费 window.TD_CONFIG。坐标为逻辑像素。
 */
window.TD = window.TD || {};
(function () {
  const CFG     = window.TD_CONFIG;
  const ECONOMY = CFG.ECONOMY;
  const UNITS   = CFG.UNITS;
  const ENEMIES = CFG.ENEMIES;
  const WAVES   = CFG.WAVES;

  // 各弹道类型飞行速度（逻辑像素/秒）
  const PROJ_SPEED = { gun: 780, sniper: 1500, shell: 560, rocket: 480, laser: 2000, flame: 320 };
  // 单位/敌军类型 → 弹道视觉类型
  const PROJ_KIND = {
    rifleman: 'gun', gunner: 'gun', sniper: 'sniper', apc: 'gun', mgdrone: 'gun', kamikaze: 'rocket',
    grenadier: 'shell', rpg: 'rocket', lighttank: 'shell', heavytank: 'shell', f22: 'rocket', b2: 'shell', heli: 'rocket',
    laser: 'laser', flame: 'flame',
    foot: 'gun', tank: 'shell', air: 'gun',
  };
  function projKind(type) { return PROJ_KIND[type] || 'gun'; }

  const ENGAGE_DIST = 270;   // 我方单位离开阵地出击迎敌的警戒距离

  function dist(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function randRange(pair) { return pair[0] + Math.random() * (pair[1] - pair[0]); }

  class Game {
    constructor() {
      this.geom = window.TD.Coords.buildGeom();
      this.reset();
    }

    reset() {
      const g = this.geom;
      this.gold        = ECONOMY.startGold;
      this.wave        = 0;
      this.phase       = 'idle';     // idle | attack | break | win | lose
      this.phaseTimer  = 0;
      this.running     = true;       // 暂停开关（仅影响 attack/break 推进）
      this.camps       = [null, null, null];
      this.units       = [];
      this.enemies     = [];
      this.projectiles = [];
      this.forts       = g.forts.map(function (f) { return new window.TD.Fort(f); });
      this.wall        = new window.TD.Wall(g);
      this.base        = new window.TD.Base(g);
      this.spawnBudget = 0;
      this.spawnMix    = null;
      this.spawnAcc    = 0;
      this.nextSpawnIn = 0;
      if (this.fx) this.fx.reset(); else this.fx = new window.TD.ParticleSystem();
      this.kills       = 0;
    }

    // ── 玩家操作：开始进攻 / 暂停 ──────────────────────────────────────
    startWaves() {
      if (this.phase !== 'idle') return;
      this.wave = 1;
      this.phase = 'attack';
      this.phaseTimer = WAVES.attackSeconds;
      this.onWaveStart(1);
    }
    togglePause() { this.running = !this.running; }

    // ── 玩家操作：建造 / 升级 / 点造 ──────────────────────────────────
    buildCamp(slot, kind) {
      if (this.camps[slot]) return false;
      if (this.gold < ECONOMY.campBuild) return false;
      this.gold -= ECONOMY.campBuild;
      const s = this.geom.slots[slot];
      this.camps[slot] = new window.TD.Camp(slot, s.x, s.y, kind);
      return true;
    }
    upgradeCamp(slot) {
      const c = this.camps[slot];
      if (!c || !c.canUpgrade()) return false;
      const cost = c.upgradeCost();
      if (this.gold < cost) return false;
      this.gold -= cost;
      c.level += 1;
      return true;
    }
    countAlive(type) {
      let n = 0;
      for (let i = 0; i < this.units.length; i++) {
        if (this.units[i].alive && this.units[i].type === type) n++;
      }
      return n;
    }
    countBuilding(type) {
      let n = 0;
      for (let i = 0; i < this.camps.length; i++) {
        const c = this.camps[i];
        if (c && c.buildTimers[type] > 0) n++;
      }
      return n;
    }
    // 存活+在造 < cap、金币够、该营地该兵种未在制造中
    canProduce(slot, type) {
      const c = this.camps[slot];
      if (!c) return false;
      const u = UNITS[type];
      if (this.gold < u.cost) return false;
      if (c.isBuilding(type)) return false;
      if (this.countAlive(type) + this.countBuilding(type) >= u.cap) return false;
      return true;
    }
    produceUnit(slot, type) {
      if (!this.canProduce(slot, type)) return false;
      this.gold -= UNITS[type].cost;
      this.camps[slot].buildTimers[type] = UNITS[type].build;
      return true;
    }

    // ── 主循环步进（固定 dt）─────────────────────────────────────────
    // idle 准备阶段也推进单位制造/移动/战斗（单位出击集结）；仅波次计时与敌军生成依赖 attack。
    update(dt) {
      if (this.phase === 'win' || this.phase === 'lose') return;

      if (this.phase === 'attack') {
        this.phaseTimer -= dt;
        this.spawnEnemies(dt);
        if (this.phaseTimer <= 0) {
          if (this.wave >= WAVES.count) {
            this.spawnBudget = 0;           // 最后一波停止投兵，等清场
          } else {
            this.phase = 'break';
            this.phaseTimer = WAVES.breakSeconds;
          }
        }
      } else if (this.phase === 'break') {
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) {
          this.wave += 1;
          this.phase = 'attack';
          this.phaseTimer = WAVES.attackSeconds;
          this.onWaveStart(this.wave);
        }
      }

      this.updateCamps(dt);
      for (let i = 0; i < this.enemies.length; i++) this.updateActor(this.enemies[i], dt);
      for (let i = 0; i < this.units.length; i++)   this.updateActor(this.units[i], dt);
      this.separate(this.units);
      this.separate(this.enemies);
      this.updateProjectiles(dt);
      this.fx.update(dt);
      this.cleanup();

      // 胜负判定
      if (!this.base.alive) {
        this.phase = 'lose';
      } else if (this.phase === 'attack' && this.wave >= WAVES.count &&
                 this.spawnBudget <= 0 && this.phaseTimer <= 0 &&
                 this.enemies.length === 0 && this.projectiles.length === 0) {
        this.phase = 'win';
      }
    }

    // ── 波次：每波开始时分配生成预算 ──────────────────────────────────
    onWaveStart(w) {
      this.spawnBudget = WAVES.baseBudget * Math.pow(WAVES.powerGrowth, w - 1);
      this.spawnMix    = WAVES.mix(w);
      this.spawnAcc    = 0;
      this.nextSpawnIn = randRange(WAVES.spawnInterval);
    }

    pickWeighted(mix, allow) {
      const keys = Object.keys(mix).filter(function (k) {
        return mix[k] > 0 && (!allow || allow.indexOf(k) >= 0);
      });
      if (!keys.length) return null;
      let total = 0;
      for (let i = 0; i < keys.length; i++) total += mix[keys[i]];
      let r = Math.random() * total;
      for (let i = 0; i < keys.length; i++) {
        r -= mix[keys[i]];
        if (r <= 0) return keys[i];
      }
      return keys[keys.length - 1];
    }

    spawnEnemies(dt) {
      if (this.phase !== 'attack' || this.spawnBudget <= 0) return;
      this.spawnAcc += dt;
      while (this.spawnAcc >= this.nextSpawnIn && this.spawnBudget > 0) {
        this.spawnAcc -= this.nextSpawnIn;
        let type = this.pickWeighted(this.spawnMix);
        let cost = ENEMIES[type].power;
        if (cost > this.spawnBudget) {
          // 余额不足，只在买得起的型号里重抽
          const affordable = Object.keys(ENEMIES).filter((t) => ENEMIES[t].power <= this.spawnBudget);
          if (!affordable.length) { this.spawnBudget = 0; break; }
          type = this.pickWeighted(this.spawnMix, affordable) || affordable[0];
          cost = ENEMIES[type].power;
        }
        this.spawnBudget -= cost;
        this.enemies.push(this.makeEnemy(type, this.wave));
        this.nextSpawnIn = randRange(WAVES.spawnInterval);
      }
    }

    makeEnemy(type, w) {
      const hpScale = Math.pow(1 + WAVES.hpGrowth, w - 1);
      const gap = this.geom.wall.gapX;
      let x;
      if (ENEMIES[type].flying) {
        x = randRange([40, this.geom.L.w - 40]);
      } else {
        x = randRange([gap[0] + 12, gap[1] - 12]);   // 陆军偏缺口列，保证能过墙
      }
      return new window.TD.Enemy(type, x, this.geom.spawnY, hpScale);
    }

    // ── 营地生产计时（各兵种独立并行）────────────────────────────────
    updateCamps(dt) {
      for (let i = 0; i < this.camps.length; i++) {
        const c = this.camps[i];
        if (!c) continue;
        const keys = Object.keys(c.buildTimers);
        for (let k = 0; k < keys.length; k++) {
          const t = keys[k];
          if (c.buildTimers[t] > 0) {
            c.buildTimers[t] -= dt;
            if (c.buildTimers[t] <= 0) {
              c.buildTimers[t] = 0;
              this.spawnUnit(t, c);
            }
          }
        }
      }
    }
    spawnUnit(type, camp) {
      const x = camp.x + (Math.random() * 30 - 15);
      const y = camp.y - 6;
      const u = new window.TD.Unit(type, x, y);
      const st = this.geom.stations;
      u.station = st[(Math.random() * st.length) | 0];   // 随机分配一个前沿阵地
      this.units.push(u);
    }

    // ── 单位/敌军每帧行为：索敌→开火 或 移动 ─────────────────────────
    updateActor(a, dt) {
      if (!a.alive) return;
      a.cooldown -= dt;
      const tgt = this.acquireTarget(a);
      if (tgt) {
        // 面向目标
        a.angle = (tgt.kind === 'base') ? Math.PI / 2 : Math.atan2(tgt.y - a.y, tgt.x - a.x);
        if (a.cooldown <= 0) {
          if (tgt.kind === 'base') {
            tgt.takeDamage(a.damage);            // 基地直接命中（大矩形）
          } else {
            this.fire(a, tgt);
            const mx = a.x + Math.cos(a.angle) * a.radius;
            const my = a.y + Math.sin(a.angle) * a.radius;
            if (projKind(a.type) === 'flame') this.fx.fire(mx, my, a.angle, 1);
            else this.fx.muzzle(mx, my, a.angle);
          }
          a.cooldown = 1 / a.fireRate;
          if (a.oneShot) { a.alive = false; this.fx.explosion(a.x, a.y, 1.5); }  // 自杀式无人机自爆
        }
      } else {
        this.moveActor(a, dt);
      }
    }

    acquireTarget(a) {
      if (a.side === 'ally') {
        return this.nearestInRange(a, this.enemies);
      }
      // 敌军优先级：射程内最近我方单位 > 接触/射程内工事 > 抵近基地
      let t = this.nearestInRange(a, this.units);
      if (t) return t;
      t = this.nearestInRange(a, this.forts);
      if (t) return t;
      if (this.base.alive && a.y + a.range >= this.base.top) return this.base;
      return null;
    }
    nearestInRange(a, list) {
      let best = null, bd = Infinity;
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (!o.alive) continue;
        const d = dist(a.x, a.y, o.x, o.y);
        if (d <= a.range && d < bd) { best = o; bd = d; }
      }
      return best;
    }

    fire(a, target) {
      const kind = projKind(a.type);
      this.projectiles.push(new window.TD.Projectile(
        a.x, a.y, target.x, target.y,
        a.damage, a.splash, a.side === 'enemy', PROJ_SPEED[kind] || 780, kind
      ));
    }

    // 移动目标点：我方→最近敌军（无则墙外集结线）；敌军→最近我方单位（无则基地）
    moveGoal(a) {
      if (a.side === 'ally') {
        const home = a.station || { x: this.wall.gapCenterX, y: this.geom.rallyY };
        const e = this.nearest(a, this.enemies);
        if (e && dist(a.x, a.y, e.x, e.y) < ENGAGE_DIST) return { x: e.x, y: e.y }; // 近敌才出击
        return home;                                                               // 否则回阵地驻守
      } else {
        const u = this.nearest(a, this.units);
        if (u) return { x: u.x, y: u.y };
        return { x: a.x, y: this.base.cy };
      }
    }
    nearest(a, list) {
      let best = null, bd = Infinity;
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (!o.alive) continue;
        const d = dist(a.x, a.y, o.x, o.y);
        if (d < bd) { best = o; bd = d; }
      }
      return best;
    }

    moveActor(a, dt) {
      const goal = this.moveGoal(a);
      let aimX = goal.x, aimY = goal.y;
      if (!a.flying) {
        // 陆军绕缺口：自己与目标分处高墙两侧时，先朝缺口中心
        const w = this.wall;
        const aSide = a.y < w.top ? -1 : (a.y > w.bottom ? 1 : 0);
        const gSide = goal.y < w.top ? -1 : (goal.y > w.bottom ? 1 : 0);
        if (aSide !== 0 && gSide !== 0 && aSide !== gSide) {
          aimX = w.gapCenterX;
          aimY = w.cy;
        }
      }
      const dx = aimX - a.x, dy = aimY - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d > 1) a.angle = Math.atan2(dy, dx);     // 面向移动方向
      const v = Math.min(a.speed * dt, d);
      const nx = a.x + dx / d * v;
      const ny = a.y + dy / d * v;
      this.tryMove(a, nx, ny);
    }
    // 分轴移动，陆军被墙/工事阻挡的轴取消
    tryMove(a, nx, ny) {
      if (a.flying) { a.x = nx; a.y = ny; return; }
      if (!this.blockedAt(nx, a.y, a.radius)) a.x = nx;
      if (!this.blockedAt(a.x, ny, a.radius)) a.y = ny;
    }
    blockedAt(x, y, r) {
      if (this.wall.blocks(x, y, r)) return true;
      for (let i = 0; i < this.forts.length; i++) {
        const f = this.forts[i];
        if (f.alive && f.contains(x, y, r)) return true;
      }
      return false;
    }

    // 单位碰撞分离：同阵营互相轻推开，避免重叠堆叠（O(n²)，n 不大可接受）
    separate(list) {
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (!a.alive) continue;
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          if (!b.alive) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const minD = a.radius + b.radius + 2;
          const d2 = dx * dx + dy * dy;
          if (d2 < minD * minD && d2 > 0.0001) {
            const d = Math.sqrt(d2);
            const push = (minD - d) * 0.5;
            const ux = dx / d, uy = dy / d;
            a.x -= ux * push; a.y -= uy * push;
            b.x += ux * push; b.y += uy * push;
          }
        }
      }
    }

    // ── 抛射物推进与命中结算 ─────────────────────────────────────────
    updateProjectiles(dt) {
      for (let i = 0; i < this.projectiles.length; i++) {
        const p = this.projectiles[i];
        const dx = p.tx - p.x, dy = p.ty - p.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const v = p.speed * dt;
        if (d <= v || d < 1) {
          this.resolveHit(p);
          p.alive = false;
        } else {
          p.x += dx / d * v;
          p.y += dy / d * v;
        }
      }
    }
    friendlyTargets() { return this.units.concat(this.forts); }
    resolveHit(p) {
      const victims = p.fromEnemy ? this.friendlyTargets() : this.enemies;
      if (p.splash > 0) {
        for (let i = 0; i < victims.length; i++) {
          const v = victims[i];
          if (v.alive && dist(p.tx, p.ty, v.x, v.y) <= p.splash + v.radius) {
            v.takeDamage(p.damage);
          }
        }
        this.fx.explosion(p.tx, p.ty, Math.min(2.2, 0.6 + p.splash / 35));
      } else {
        let best = null, bd = Infinity;
        for (let i = 0; i < victims.length; i++) {
          const v = victims[i];
          if (!v.alive) continue;
          const d = dist(p.tx, p.ty, v.x, v.y);
          if (d < bd && d <= v.radius + 14) { best = v; bd = d; }
        }
        if (best) best.takeDamage(p.damage);
        if (p.kind === 'flame') this.fx.fire(p.tx, p.ty, p.angle, 1);
        else this.fx.hit(p.tx, p.ty, p.angle);
      }
    }

    // ── 清理死亡实体 + 击杀金币 ──────────────────────────────────────
    cleanup() {
      const alive = function (o) { return o.alive; };
      const survivors = [];
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (e.alive) { survivors.push(e); }
        else {
          this.gold += ECONOMY.bounty[e.bountyKind] || 0;
          this.kills++;
          this.fx.explosion(e.x, e.y, e.kind === 'vehicle' ? 1.4 : e.kind === 'air' ? 1.1 : 0.7);
        }
      }
      this.enemies = survivors;
      const liveUnits = [];
      for (let i = 0; i < this.units.length; i++) {
        const u = this.units[i];
        if (u.alive) liveUnits.push(u);
        else this.fx.explosion(u.x, u.y, u.kind === 'vehicle' ? 1.1 : 0.6);
      }
      this.units = liveUnits;
      this.forts = this.forts.filter(alive);
      this.projectiles = this.projectiles.filter(alive);
    }
  }

  window.TD.Game = Game;
})();
