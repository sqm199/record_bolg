/* 军事塔防 —— 粒子特效系统
 * 爆炸（火球 + 冲击环 + 火花 + 烟）、火焰、枪口闪光、命中火花。
 * 纯坐标计算 + canvas 绘制，不依赖任何外部库。逻辑像素坐标。
 */
window.TD = window.TD || {};
(function () {
  const MAX = 800;                       // 粒子上限，超出丢弃最旧的
  const TAU = Math.PI * 2;
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  const FIRE_COLORS = ['#ffe24a', '#ff9a18', '#ff5a1f'];
  const BLAST_COLORS = ['#ffd24a', '#ff7a18', '#ff3b1f'];

  class ParticleSystem {
    constructor() { this.list = []; }
    reset() { this.list.length = 0; }

    _add(p) {
      if (this.list.length >= MAX) this.list.shift();
      p.maxLife = p.life;
      this.list.push(p);
    }

    // 爆炸：溅射命中 / 单位死亡。scale 控制规模
    explosion(x, y, scale) {
      scale = scale || 1;
      // 冲击环
      this._add({ kind: 'ring', x: x, y: y, vx: 0, vy: 0, life: 0.34,
                  size: 4, endSize: 30 * scale, color: '#ffe0a8' });
      // 火球核心（叠两层）
      this._add({ kind: 'fireball', x: x, y: y, vx: 0, vy: 0, life: 0.16,
                  size: 13 * scale, color: '#ffd24a' });
      this._add({ kind: 'fireball', x: x, y: y, vx: 0, vy: 0, life: 0.24,
                  size: 9 * scale, color: '#ff7a18' });
      // 火花
      const n = Math.round(10 * scale) + 5;
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), sp = rand(60, 200) * scale;
        this._add({ kind: 'spark', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                    life: rand(0.25, 0.6), size: rand(1.5, 3), color: pick(BLAST_COLORS),
                    grav: 130, drag: 2 });
      }
      // 烟
      const sm = Math.round(2 * scale) + 1;
      for (let i = 0; i < sm; i++) {
        this._add({ kind: 'smoke', x: x + rand(-6, 6), y: y + rand(-6, 6),
                    vx: rand(-12, 12), vy: -rand(10, 32), life: rand(0.5, 1.0),
                    size: rand(6, 12) * scale, color: '#5a5a5a', drag: 1 });
      }
    }

    // 火焰锥：喷火车 / 燃烧。angle 为喷射方向
    fire(x, y, angle, scale) {
      scale = scale || 1;
      for (let i = 0; i < 5; i++) {
        const aa = angle + rand(-0.35, 0.35), sp = rand(70, 150) * scale;
        this._add({ kind: 'fire', x: x, y: y, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp,
                    life: rand(0.18, 0.4), size: rand(3, 6) * scale, color: pick(FIRE_COLORS),
                    grav: -30, drag: 3 });
      }
    }

    // 枪口闪光：射击瞬间。angle 为枪口朝向
    muzzle(x, y, angle) {
      this._add({ kind: 'flash', x: x, y: y, vx: Math.cos(angle) * 30, vy: Math.sin(angle) * 30,
                  life: 0.05, size: 5, color: '#fff4c0' });
      for (let i = 0; i < 3; i++) {
        const aa = angle + rand(-0.3, 0.3), sp = rand(80, 160);
        this._add({ kind: 'spark', x: x, y: y, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp,
                    life: 0.08, size: 1.5, color: '#ffe27a', drag: 6 });
      }
    }

    // 命中火花：普通子弹击中。angle 为子弹飞行方向（火花朝反向溅回）
    hit(x, y, angle) {
      for (let i = 0; i < 4; i++) {
        const aa = angle + Math.PI + rand(-0.7, 0.7), sp = rand(40, 120);
        this._add({ kind: 'spark', x: x, y: y, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp,
                    life: 0.18, size: 1.5, color: '#ffe9b0', drag: 5 });
      }
    }

    update(dt) {
      const l = this.list;
      let hasDead = false;
      for (let i = 0; i < l.length; i++) {
        const p = l[i];
        p.life -= dt;
        if (p.life <= 0) { hasDead = true; continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.grav) p.vy += p.grav * dt;
        if (p.drag) {
          const f = Math.max(0, 1 - p.drag * dt);
          p.vx *= f; p.vy *= f;
        }
      }
      if (hasDead) this.list = l.filter(function (p) { return p.life > 0; });
    }

    draw(ctx) {
      const l = this.list;
      ctx.save();
      for (let i = 0; i < l.length; i++) {
        const p = l[i];
        const t = Math.max(0, Math.min(1, p.life / p.maxLife));   // 1→0
        if (p.kind === 'smoke') {
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = t * 0.35;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.4 - 0.4 * t), 0, TAU);
          ctx.fill();
          continue;
        }
        ctx.globalCompositeOperation = 'lighter';
        if (p.kind === 'spark') {
          ctx.globalAlpha = t;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
          ctx.stroke();
        } else if (p.kind === 'fireball' || p.kind === 'fire' || p.kind === 'flash') {
          ctx.globalAlpha = t;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * t), 0, TAU);
          ctx.fill();
        } else if (p.kind === 'ring') {
          const r = p.size + (p.endSize - p.size) * (1 - t);
          ctx.globalAlpha = t * 0.8;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2 * t + 0.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, TAU);
          ctx.stroke();
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  window.TD.ParticleSystem = ParticleSystem;
})();
