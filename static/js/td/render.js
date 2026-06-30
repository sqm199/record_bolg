/* 军事塔防 —— 渲染层
 * Renderer：读 Game 状态，用逻辑坐标(960x720)绘制战场。
 * 单位为矢量造型（随 angle 朝向旋转、敌我配色），弹道按 kind 渲染，最后叠加粒子层。
 * 不修改任何游戏状态。
 */
window.TD = window.TD || {};
(function () {
  const CFG = window.TD_CONFIG;
  const L = window.TD.Coords.L;
  const TAU = Math.PI * 2;

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // 我方配色（按兵种类别）
  function allyPalette(kind) {
    if (kind === 'infantry') return { body: '#6a9f6a', dark: '#274d27', accent: '#cdeccd' };
    if (kind === 'vehicle')  return { body: '#4a6fa5', dark: '#243f5e', accent: '#a7c8f0' };
    return { body: '#5f8fb8', dark: '#2c4d66', accent: '#cbe6f6' };  // air
  }
  // 敌军配色（以 enemy.color 为主色）
  function enemyPalette(e) {
    return { body: e.color, dark: 'rgba(0,0,0,0.5)', accent: '#ffdede' };
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.patches = null;   // 地面斑块（一次性生成，避免每帧闪烁）
      this.craters = null;
    }

    draw(game, view) {
      const ctx = this.ctx;
      ctx.setTransform(view.scale * view.dpr, 0, 0, view.scale * view.dpr, 0, 0);
      ctx.clearRect(0, 0, L.w, L.h);
      if (!this.patches) this._initTerrain(game.geom);

      this.drawBackground(game);
      this.drawStations(game.geom.stations);
      this.drawForts(game.forts);
      this.drawWall(game.wall);
      this.drawBase(game.base);
      this.drawSlots(game);
      this.drawUnits(game.units);
      this.drawEnemies(game.enemies);
      this.drawProjectiles(game.projectiles);
      if (game.fx) game.fx.draw(ctx);          // 粒子特效叠加在最上层
    }

    // ── 地图 ────────────────────────────────────────────────────────────
    // 一次性生成地面纹理（草丛斑块 + 弹坑），固定不变避免闪烁
    _initTerrain(g) {
      this.patches = [];
      for (let i = 0; i < 80; i++) {
        this.patches.push({
          x: Math.random() * L.w,
          y: Math.random() * g.wall.top,
          r: 5 + Math.random() * 16,
          c: Math.random() < 0.5 ? 'rgba(74,88,52,0.22)' : 'rgba(38,48,28,0.30)',
        });
      }
      this.craters = [];
      for (let i = 0; i < 13; i++) {
        this.craters.push({ x: Math.random() * L.w, y: 20 + Math.random() * (g.wall.top - 30),
                            r: 4 + Math.random() * 7 });
      }
    }

    drawBackground(game) {
      const ctx = this.ctx, g = game.geom;
      ctx.fillStyle = '#0f1117';
      ctx.fillRect(0, 0, L.w, L.h);

      // 墙外战场：泥土草地渐变
      let grd = ctx.createLinearGradient(0, 0, 0, g.wall.top);
      grd.addColorStop(0, '#3a4528');
      grd.addColorStop(1, '#2b3420');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, L.w, g.wall.top);
      // 草丛斑块
      for (let i = 0; i < this.patches.length; i++) {
        const p = this.patches[i];
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      }
      // 弹坑
      for (let i = 0; i < this.craters.length; i++) {
        const c = this.craters[i];
        ctx.fillStyle = 'rgba(18,22,12,0.55)';
        ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(60,70,40,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      // 工事带：泥土翻动更重
      ctx.fillStyle = 'rgba(96,72,40,0.16)';
      ctx.fillRect(0, g.fortBand[0], L.w, g.fortBand[1] - g.fortBand[0]);

      // 墙内驻防区：水泥铺装
      let grd2 = ctx.createLinearGradient(0, g.wall.bottom, 0, g.base.top);
      grd2.addColorStop(0, '#23262f');
      grd2.addColorStop(1, '#1a1d27');
      ctx.fillStyle = grd2;
      ctx.fillRect(0, g.wall.bottom, L.w, g.base.top - g.wall.bottom);
      ctx.strokeStyle = 'rgba(108,142,245,0.05)'; ctx.lineWidth = 1;
      for (let x = 48; x < L.w; x += 48) {
        ctx.beginPath(); ctx.moveTo(x, g.wall.bottom); ctx.lineTo(x, g.base.top); ctx.stroke();
      }
      // 营地区
      ctx.fillStyle = '#15171f';
      ctx.fillRect(0, g.base.bottom, L.w, L.h - g.base.bottom);
    }

    // 五个前沿阵地：沙袋掩体（面向敌方上方）
    drawStations(stations) {
      const ctx = this.ctx;
      for (let i = 0; i < stations.length; i++) {
        const s = stations[i];
        ctx.save();
        ctx.translate(s.x, s.y);
        // 地面标记圈
        ctx.strokeStyle = 'rgba(180,160,110,0.22)'; ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        // 沙袋（上方弧形排布）
        const bags = 5;
        for (let b = 0; b < bags; b++) {
          const a = -Math.PI * 0.85 + (Math.PI * 0.7) * (b / (bags - 1));
          const bx = Math.cos(a) * 15, by = Math.sin(a) * 15;
          ctx.fillStyle = '#8a7445'; ctx.strokeStyle = '#5f5030'; ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(bx, by, 5, 3.5, a + Math.PI / 2, 0, TAU);
          ctx.fill(); ctx.stroke();
        }
        ctx.restore();
      }
    }

    drawWall(wall) {
      const ctx = this.ctx;
      const segs = [[0, wall.gapX[0]], [wall.gapX[1], L.w]];
      for (let s = 0; s < segs.length; s++) {
        const x0 = segs[s][0], x1 = segs[s][1], w = x1 - x0;
        ctx.save();
        ctx.beginPath(); ctx.rect(x0, wall.top, w, wall.h); ctx.clip();
        // 墙体
        ctx.fillStyle = '#4a4e63';
        ctx.fillRect(x0, wall.top, w, wall.h);
        // 砖纹（两行错缝）
        ctx.strokeStyle = 'rgba(0,0,0,0.32)'; ctx.lineWidth = 1;
        const bh = wall.h / 2;
        for (let row = 0; row < 2; row++) {
          const y = wall.top + row * bh;
          const off = (row % 2) * 16;
          for (let bx = x0 - off; bx < x1; bx += 32) {
            ctx.strokeRect(bx, y, 32, bh);
          }
        }
        // 顶部高光 / 底部阴影，营造立体
        ctx.fillStyle = '#5c6178'; ctx.fillRect(x0, wall.top, w, 3);
        ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(x0, wall.bottom - 3, w, 3);
        ctx.restore();
        // 缺口侧端面加深
        const endX = s === 0 ? wall.gapX[0] - 3 : wall.gapX[1];
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(endX, wall.top, 3, wall.h);
      }
      // 缺口通道虚线
      ctx.save();
      ctx.strokeStyle = 'rgba(108,142,245,0.4)';
      ctx.setLineDash([6, 6]); ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(wall.gapX[0], wall.cy);
      ctx.lineTo(wall.gapX[1], wall.cy);
      ctx.stroke();
      ctx.restore();
    }

    drawForts(forts) {
      const ctx = this.ctx;
      for (let i = 0; i < forts.length; i++) {
        const f = forts[i];
        ctx.save();
        if (f.type === 'trench') {
          ctx.fillStyle = '#5b4636';
          ctx.strokeStyle = '#7a5c44';
          ctx.lineWidth = 2;
          const w = f.radius * 1.8, h = f.radius * 0.8;
          ctx.fillRect(f.x - w / 2, f.y - h / 2, w, h);
          ctx.strokeRect(f.x - w / 2, f.y - h / 2, w, h);
        } else {
          ctx.strokeStyle = '#9a7b53';
          ctx.lineWidth = 3;
          const r = f.radius * 0.7;
          ctx.beginPath();
          ctx.moveTo(f.x - r, f.y - r); ctx.lineTo(f.x + r, f.y + r);
          ctx.moveTo(f.x + r, f.y - r); ctx.lineTo(f.x - r, f.y + r);
          ctx.stroke();
        }
        ctx.restore();
        this.healthBar(f.x, f.y - f.radius - 8, 40, f.hp / f.maxHp, '#c9a26a');
      }
    }

    drawBase(base) {
      const ctx = this.ctx;
      const x = base.left, y = base.top, w = base.right - base.left, h = base.bottom - base.top;
      const cx = x + w / 2;

      // 主装甲板：金属渐变（顶部受光、底部阴影）
      const grd = ctx.createLinearGradient(0, y, 0, y + h);
      grd.addColorStop(0, '#3c4250');
      grd.addColorStop(0.5, '#2e333d');
      grd.addColorStop(1, '#21252d');
      ctx.fillStyle = grd;
      ctx.fillRect(x, y, w, h);

      // 横向钢板分隔（含刻线高光）
      const plates = 3;
      for (let i = 1; i < plates; i++) {
        const py = y + h * i / plates;
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + w, py); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.beginPath(); ctx.moveTo(x, py + 1); ctx.lineTo(x + w, py + 1); ctx.stroke();
      }

      // 铆钉（沿顶/底边等距）
      const rivet = (rx, ry) => {
        ctx.fillStyle = '#5a616f';
        ctx.beginPath(); ctx.arc(rx, ry, 2.2, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath(); ctx.arc(rx - 0.6, ry - 0.6, 0.9, 0, TAU); ctx.fill();
      };
      for (let bx = x + 22; bx < x + w - 14; bx += 46) {
        rivet(bx, y + 12); rivet(bx, y + h - 10);
      }

      // 顶部警示斜纹条（黄黑，朝敌方一侧）
      const stripeH = 8;
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, w, stripeH); ctx.clip();
      ctx.fillStyle = '#1c1f26'; ctx.fillRect(x, y, w, stripeH);
      ctx.fillStyle = '#d4a017';
      for (let sx = x - stripeH; sx < x + w; sx += 18) {
        ctx.beginPath();
        ctx.moveTo(sx, y); ctx.lineTo(sx + 9, y);
        ctx.lineTo(sx + 9 - stripeH, y + stripeH); ctx.lineTo(sx - stripeH, y + stripeH);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();

      // 两端角楼（凸起、带雉堞）
      const tw = 42, th = h + 8;
      for (let s = 0; s < 2; s++) {
        const tx = s === 0 ? x : x + w - tw;
        const tgrd = ctx.createLinearGradient(0, y - 8, 0, y - 8 + th);
        tgrd.addColorStop(0, '#454b59'); tgrd.addColorStop(1, '#24282f');
        ctx.fillStyle = tgrd;
        ctx.fillRect(tx, y - 8, tw, th);
        ctx.strokeStyle = '#565d6d'; ctx.lineWidth = 1.5;
        ctx.strokeRect(tx + 0.5, y - 8, tw - 1, th);
        // 雉堞
        ctx.fillStyle = '#3a3f4a';
        for (let m = 0; m < 3; m++) ctx.fillRect(tx + 3 + m * 14, y - 12, 8, 5);
        // 射孔
        ctx.fillStyle = '#15171d';
        ctx.fillRect(tx + tw / 2 - 3, y + 8, 6, 10);
      }

      // 钢框
      ctx.strokeStyle = '#5c6373'; ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

      // 低血量红色警示
      const ratio = base.hp / base.maxHp;
      if (ratio < 0.5) {
        ctx.fillStyle = 'rgba(248,80,80,' + (0.28 * (1 - ratio / 0.5)).toFixed(3) + ')';
        ctx.fillRect(x, y, w, h);
      }

      // 中央铭牌
      ctx.fillStyle = '#e8eaf0';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🏰 军事基地', cx, y + h * 0.52);
    }

    drawSlots(game) {
      const ctx = this.ctx;
      const slots = game.geom.slots;
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        const camp = game.camps[i];
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (!camp) {
          ctx.strokeStyle = 'rgba(139,146,165,0.6)';
          ctx.setLineDash([5, 4]);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(s.x, s.y, 24, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(139,146,165,0.8)';
          ctx.font = '22px sans-serif';
          ctx.fillText('＋', s.x, s.y + 1);
        } else {
          ctx.fillStyle = 'rgba(108,142,245,0.18)';
          ctx.beginPath();
          ctx.arc(s.x, s.y, 26, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = '#6c8ef5';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.font = '24px sans-serif';
          ctx.fillText(CFG.CAMPS[camp.kind].icon, s.x, s.y);
          ctx.fillStyle = '#e8eaf0';
          ctx.font = '11px sans-serif';
          ctx.fillText('Lv' + camp.level, s.x, s.y + 22);
        }
        ctx.restore();
      }
    }

    // ── 单位 / 敌军 ──────────────────────────────────────────────────────
    drawUnits(units) {
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        this.drawActor(u, allyPalette(u.kind));
        if (u.hp < u.maxHp) this.healthBar(u.x, u.y - u.radius - 8, u.radius * 2.4, u.hp / u.maxHp, '#4ade80');
      }
    }
    drawEnemies(enemies) {
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        this.drawActor(e, enemyPalette(e));
        if (e.hp < e.maxHp) this.healthBar(e.x, e.y - e.radius - 8, e.radius * 2.4, e.hp / e.maxHp, '#f87171');
      }
    }

    drawActor(a, pal) {
      const ctx = this.ctx;
      if (a.flying) {                          // 空中阴影
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(a.x, a.y + a.radius + 5, a.radius * 0.9, a.radius * 0.5, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.angle);                     // 朝向 +x，旋转到实际方向
      if (a.kind === 'infantry') this.shapeSoldier(a, pal);
      else if (a.kind === 'vehicle') this.shapeVehicle(a, pal);
      else this.shapeAircraft(a, pal);
      ctx.restore();
    }

    shapeSoldier(a, pal) {
      const ctx = this.ctx, t = a.type;
      let gl = 10, gw = 1.6;
      if (t === 'sniper') { gl = 16; gw = 1.2; }
      else if (t === 'gunner') { gl = 9; gw = 2.6; }
      else if (t === 'grenadier') { gl = 7; gw = 2.2; }
      else if (t === 'rpg') { gl = 12; gw = 3.2; }
      // 枪
      ctx.strokeStyle = pal.dark; ctx.lineWidth = gw; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(gl, 0); ctx.stroke();
      if (t === 'rpg') { ctx.fillStyle = '#e0533c'; ctx.beginPath(); ctx.arc(gl, 0, 2.2, 0, TAU); ctx.fill(); }
      // 身体
      ctx.fillStyle = pal.body; ctx.strokeStyle = pal.dark; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, a.radius * 0.66, 0, TAU); ctx.fill(); ctx.stroke();
      // 头（前向）
      ctx.fillStyle = pal.accent;
      ctx.beginPath(); ctx.arc(a.radius * 0.32, 0, a.radius * 0.32, 0, TAU); ctx.fill();
    }

    shapeVehicle(a, pal) {
      const ctx = this.ctx, t = a.type;
      let bw = 14, bh = 9;
      if (t === 'heavytank') { bw = 17; bh = 11; }
      else if (t === 'lighttank') { bw = 15; bh = 10; }
      // 履带
      ctx.fillStyle = '#1c1c1c';
      ctx.fillRect(-bw / 2, -bh / 2 - 1.8, bw, 2.6);
      ctx.fillRect(-bw / 2,  bh / 2 - 0.8, bw, 2.6);
      // 车体
      ctx.fillStyle = pal.body; ctx.strokeStyle = pal.dark; ctx.lineWidth = 1;
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 2); ctx.fill(); ctx.stroke();
      // 炮塔
      ctx.fillStyle = pal.dark;
      ctx.beginPath(); ctx.arc(-1, 0, bh * 0.32, 0, TAU); ctx.fill();
      // 武器特征
      ctx.strokeStyle = pal.dark; ctx.lineCap = 'round';
      if (t === 'apc') {
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(9, -2); ctx.moveTo(0, 2); ctx.lineTo(9, 2); ctx.stroke();
      } else if (t === 'flame') {
        ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(8, 0); ctx.stroke();
        ctx.fillStyle = '#ff9a18'; ctx.beginPath(); ctx.arc(9, 0, 2, 0, TAU); ctx.fill();
      } else if (t === 'laser') {
        ctx.strokeStyle = '#39d3e6'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(11, 0); ctx.stroke();
        ctx.fillStyle = '#39d3e6'; ctx.fillRect(10, -2, 3, 4);
      } else {   // 坦克炮管（含敌 tank）
        const gl = t === 'heavytank' ? 17 : t === 'lighttank' ? 14 : 13;
        ctx.lineWidth = t === 'heavytank' ? 3.5 : 2.6;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(gl, 0); ctx.stroke();
      }
    }

    shapeAircraft(a, pal) {
      const ctx = this.ctx, t = a.type;
      ctx.fillStyle = pal.body; ctx.strokeStyle = pal.dark; ctx.lineWidth = 1; ctx.lineCap = 'round';
      if (t === 'heli') {
        ctx.beginPath(); ctx.ellipse(0, 0, 8, 3.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = pal.dark; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-13, 0); ctx.stroke();
        ctx.fillStyle = pal.dark; ctx.beginPath(); ctx.arc(-13, 0, 2, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(220,230,255,0.65)'; ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-10, -10); ctx.lineTo(10, 10);
        ctx.moveTo(-10, 10); ctx.lineTo(10, -10);
        ctx.stroke();
      } else if (t === 'mgdrone' || t === 'kamikaze') {
        ctx.fillStyle = pal.body; roundRect(ctx, -3, -3, 6, 6, 1); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = pal.dark; ctx.lineWidth = 1;
        const arm = 6, pts = [[arm, arm], [arm, -arm], [-arm, arm], [-arm, -arm]];
        for (let i = 0; i < pts.length; i++) {
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
          ctx.fillStyle = (t === 'kamikaze') ? '#ff5a3c' : pal.accent;
          ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], 2, 0, TAU); ctx.fill();
        }
        if (t === 'kamikaze') { ctx.fillStyle = '#ff5a3c'; ctx.beginPath(); ctx.arc(4, 0, 2, 0, TAU); ctx.fill(); }
      } else if (t === 'b2') {
        ctx.beginPath();
        ctx.moveTo(10, 0); ctx.lineTo(-7, 11); ctx.lineTo(-3, 0); ctx.lineTo(-7, -11);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else {   // f22 / 敌机 air：后掠三角
        ctx.beginPath();
        ctx.moveTo(12, 0); ctx.lineTo(-6, 7); ctx.lineTo(-2, 0); ctx.lineTo(-6, -7);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-9, 3); ctx.moveTo(-6, 0); ctx.lineTo(-9, -3); ctx.stroke();
      }
    }

    // ── 弹道（按 kind）──────────────────────────────────────────────────
    drawProjectiles(list) {
      const ctx = this.ctx;
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 0; i < list.length; i++) {
        const p = list[i], ang = p.angle;
        if (p.kind === 'laser') {
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = 'rgba(80,225,245,0.85)'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(p.sx, p.sy); ctx.lineTo(p.tx, p.ty); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(p.sx, p.sy); ctx.lineTo(p.tx, p.ty); ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
        } else if (p.kind === 'sniper') {
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = 'rgba(255,240,180,0.9)'; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(p.sx, p.sy); ctx.lineTo(p.x, p.y); ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
        } else if (p.kind === 'shell' || p.kind === 'rocket') {
          const tx = p.x - Math.cos(ang) * 9, ty = p.y - Math.sin(ang) * 9;
          ctx.strokeStyle = 'rgba(180,180,180,0.5)'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tx, ty); ctx.stroke();
          ctx.fillStyle = p.kind === 'rocket' ? '#ffce54' : '#ffe9a8';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.kind === 'rocket' ? 3 : 2.5, 0, TAU); ctx.fill();
          if (p.kind === 'rocket') {
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = 'rgba(255,140,30,0.8)';
            ctx.beginPath(); ctx.arc(tx, ty, 2.2, 0, TAU); ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
          }
        } else if (p.kind === 'flame') {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = 'rgba(255,140,30,0.85)';
          ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, TAU); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        } else {   // gun 曳光弹
          const tx = p.x - Math.cos(ang) * 7, ty = p.y - Math.sin(ang) * 7;
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = p.fromEnemy ? 'rgba(255,120,90,0.9)' : 'rgba(255,235,130,0.9)';
          ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tx, ty); ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      ctx.restore();
    }

    healthBar(cx, y, w, ratio, color) {
      const ctx = this.ctx, h = 4;
      ratio = Math.max(0, Math.min(1, ratio));
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(cx - w / 2, y, w, h);
      ctx.fillStyle = color;
      ctx.fillRect(cx - w / 2, y, w * ratio, h);
    }
  }

  window.TD.Renderer = Renderer;
})();
