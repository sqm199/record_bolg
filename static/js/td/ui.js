/* 军事塔防 —— 界面层
 * DOM HUD + 3 个营地控制面板。建造/升级/点造按钮，每帧 refresh(game)。
 * 面板按“结构签名”变化时重建，平时只更新文本/进度/禁用态。
 */
window.TD = window.TD || {};
(function () {
  const CFG     = window.TD_CONFIG;
  const CAMPS   = CFG.CAMPS;
  const UNITS   = CFG.UNITS;
  const ECONOMY = CFG.ECONOMY;

  const PHASE_LABEL = {
    idle:   '准备中',
    attack: '进攻中',
    break:  '间歇',
    win:    '胜利',
    lose:   '失守',
  };

  class UI {
    constructor(game) {
      this.game = game;
      this.el = {
        gold:     document.getElementById('tdGold'),
        wave:     document.getElementById('tdWave'),
        phase:    document.getElementById('tdPhase'),
        baseBar:  document.getElementById('tdBaseBar'),
        baseText: document.getElementById('tdBaseText'),
        start:    document.getElementById('tdStart'),
        pause:    document.getElementById('tdPause'),
        camps:    document.getElementById('tdCamps'),
        overlay:  document.getElementById('tdOverlay'),
        overText: document.getElementById('tdOverlayText'),
        restart:  document.getElementById('tdRestart'),
      };
      this.panels = [];   // 每 slot 的引用集合
      this.signatures = [null, null, null];
      this._bind();
    }

    _bind() {
      const self = this;
      this.el.start.addEventListener('click', function () {
        self.game.startWaves();
        self.refresh();
      });
      this.el.pause.addEventListener('click', function () {
        self.game.togglePause();
        self.refresh();
      });
      this.el.restart.addEventListener('click', function () {
        self.game.reset();
        self.signatures = [null, null, null];
        self.refresh();
      });
      // 营地面板事件委托
      this.el.camps.addEventListener('click', function (ev) {
        const btn = ev.target.closest('[data-action]');
        if (!btn || btn.disabled) return;
        const slot   = parseInt(btn.getAttribute('data-slot'), 10);
        const action = btn.getAttribute('data-action');
        if (action === 'build')   self.game.buildCamp(slot, btn.getAttribute('data-kind'));
        if (action === 'upgrade') self.game.upgradeCamp(slot);
        if (action === 'produce') self.game.produceUnit(slot, btn.getAttribute('data-type'));
        self.refresh();
      });
    }

    refresh() {
      const g = this.game;
      // ── HUD ──
      this.el.gold.textContent = Math.floor(g.gold);
      this.el.wave.textContent = g.wave + ' / ' + CFG.WAVES.count;
      let phaseTxt = PHASE_LABEL[g.phase] || g.phase;
      if (g.phase === 'attack' || g.phase === 'break') {
        phaseTxt += ' ' + Math.max(0, Math.ceil(g.phaseTimer)) + 's';
        if (!g.running) phaseTxt += '（暂停）';
      }
      this.el.phase.textContent = phaseTxt;

      const ratio = g.base.hp / g.base.maxHp;
      this.el.baseBar.style.width = (ratio * 100) + '%';
      this.el.baseBar.style.background = ratio > 0.5 ? 'var(--success)'
                                       : ratio > 0.25 ? '#f1c40f' : 'var(--danger)';
      this.el.baseText.textContent = Math.ceil(g.base.hp) + ' / ' + g.base.maxHp;

      // 开始/暂停按钮
      const idle = g.phase === 'idle';
      const over = g.phase === 'win' || g.phase === 'lose';
      this.el.start.style.display = idle ? '' : 'none';
      this.el.pause.style.display = idle ? 'none' : '';
      this.el.pause.disabled = over;
      this.el.pause.textContent = g.running ? '暂停' : '继续';

      // ── 营地面板 ──
      for (let s = 0; s < 3; s++) this._syncPanel(s);

      // ── 胜负遮罩 ──
      if (over) {
        this.el.overlay.style.display = 'flex';
        this.el.overText.textContent = g.phase === 'win'
          ? '🎉 胜利！守住了全部 ' + CFG.WAVES.count + ' 波进攻'
          : '💥 基地失守！坚持到第 ' + g.wave + ' 波';
      } else {
        this.el.overlay.style.display = 'none';
      }
    }

    _signature(camp) {
      return camp ? (camp.kind + camp.level) : 'empty';
    }

    _syncPanel(slot) {
      const g = this.game;
      const camp = g.camps[slot];
      const sig = this._signature(camp);
      if (sig !== this.signatures[slot]) {
        this._rebuildPanel(slot);
        this.signatures[slot] = sig;
      }
      this._updatePanel(slot);
    }

    _rebuildPanel(slot) {
      const g = this.game;
      const camp = g.camps[slot];
      let root = this.el.camps.querySelector('.td-camp[data-slot="' + slot + '"]');
      if (!root) {
        root = document.createElement('div');
        root.className = 'td-camp';
        root.setAttribute('data-slot', slot);
        this.el.camps.appendChild(root);
      }
      const refs = { root: root, buildBtns: [], upgradeBtn: null, rows: [] };

      if (!camp) {
        let html = '<div class="td-camp-title">空地 ' + (slot + 1) + '</div>';
        html += '<div class="td-build-row">';
        ['infantry', 'vehicle', 'air'].forEach(function (k) {
          html += '<button class="btn-ghost td-btn" data-action="build" data-slot="' + slot +
                  '" data-kind="' + k + '">' + CAMPS[k].icon + ' ' + CAMPS[k].name +
                  '<span class="td-cost">' + ECONOMY.campBuild + '</span></button>';
        });
        html += '</div>';
        root.innerHTML = html;
        refs.buildBtns = Array.prototype.slice.call(root.querySelectorAll('[data-action="build"]'));
      } else {
        let html = '<div class="td-camp-title">' + CAMPS[camp.kind].icon + ' ' +
                   CAMPS[camp.kind].name + ' <span class="td-lv">Lv' + camp.level + '</span>' +
                   '<button class="btn-ghost td-up" data-action="upgrade" data-slot="' + slot + '"></button>' +
                   '</div>';
        html += '<div class="td-units">';
        camp.unlockedUnits().forEach(function (type) {
          const u = UNITS[type];
          html += '<button class="td-unit-btn" data-action="produce" data-slot="' + slot +
                  '" data-type="' + type + '">' +
                  '<span class="td-u-icon">' + u.icon + '</span>' +
                  '<span class="td-u-name">' + u.name + '</span>' +
                  '<span class="td-u-cost">💰' + u.cost + '</span>' +
                  '<span class="td-u-count" data-count="' + type + '">0/' + u.cap + '</span>' +
                  '<span class="td-prog"><span class="td-prog-fill" data-fill="' + type + '"></span></span>' +
                  '</button>';
        });
        html += '</div>';
        root.innerHTML = html;
        refs.upgradeBtn = root.querySelector('.td-up');
        refs.rows = camp.unlockedUnits().map(function (type) {
          return {
            type: type,
            btn:   root.querySelector('[data-type="' + type + '"]'),
            count: root.querySelector('[data-count="' + type + '"]'),
            fill:  root.querySelector('[data-fill="' + type + '"]'),
          };
        });
      }
      this.panels[slot] = refs;
    }

    _updatePanel(slot) {
      const g = this.game;
      const camp = g.camps[slot];
      const refs = this.panels[slot];
      if (!refs) return;

      if (!camp) {
        refs.buildBtns.forEach(function (b) {
          b.disabled = g.gold < ECONOMY.campBuild;
        });
        return;
      }
      // 升级按钮
      if (refs.upgradeBtn) {
        if (camp.canUpgrade()) {
          const cost = camp.upgradeCost();
          refs.upgradeBtn.textContent = '升级 ' + cost;
          refs.upgradeBtn.disabled = g.gold < cost;
          refs.upgradeBtn.style.display = '';
        } else {
          refs.upgradeBtn.textContent = '满级';
          refs.upgradeBtn.disabled = true;
        }
      }
      // 兵种行
      for (let i = 0; i < refs.rows.length; i++) {
        const row = refs.rows[i];
        const u = UNITS[row.type];
        const alive = g.countAlive(row.type) + g.countBuilding(row.type);
        row.count.textContent = alive + '/' + u.cap;
        row.btn.disabled = !g.canProduce(slot, row.type);
        // 制造进度
        const t = camp.buildTimers[row.type];
        if (t > 0) {
          row.fill.style.width = ((u.build - t) / u.build * 100) + '%';
        } else {
          row.fill.style.width = '0%';
        }
      }
    }
  }

  window.TD.UI = UI;
})();
