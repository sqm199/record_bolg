/* ── Travel 旅行计划前端逻辑（高德 JS API 2.0） ── */
window.Travel = (function () {
  'use strict';

  var SPOT_TYPES = {
    start: { label: '出发点',  icon: '🚩', color: '#c4907c' },
    food:  { label: '吃饭',    icon: '🍚', color: '#d9a94a' },
    hotel: { label: '住宿',    icon: '🛏', color: '#7c8fd4' },
    sight: { label: '游玩点',  icon: '🏞', color: '#8bab91' },
    way:   { label: '途经点',  icon: '📍', color: '#9a8e7d' },
    end:   { label: '终点',    icon: '🏁', color: '#d4786e' }
  };

  var plans    = (typeof TRAVEL_PLANS !== 'undefined' && TRAVEL_PLANS) || [];
  var plan     = null;      // 正在编辑的计划
  var mapReady = null;      // AMap 加载 Promise
  var map = null, markers = [], polylines = [];
  var geocoder = null, placeSearch = null, autoComplete = null;
  var computing = false;
  var searchTarget = -1, acTimer = null;
  var deleteKeyID  = null;

  // ── 工具 ─────────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function toLngLat(str) {
    var p = String(str || '').split(',');
    if (p.length !== 2) return null;
    var lng = parseFloat(p[0]), lat = parseFloat(p[1]);
    if (isNaN(lng) || isNaN(lat)) return null;
    return [lng, lat];
  }
  function fmtLngLat(lng, lat) {
    return Number(lng).toFixed(6) + ',' + Number(lat).toFixed(6);
  }
  function fmtKm(m) {
    if (m == null) return '—';
    return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m';
  }
  function fmtDur(s) {
    if (s == null) return '—';
    if (s < 60) return '约 1 分钟';
    if (s < 3600) return '约 ' + Math.round(s / 60) + ' 分钟';
    var h = Math.floor(s / 3600);
    return '约 ' + h + ' 小时 ' + Math.round((s % 3600) / 60) + ' 分';
  }

  // ── AMap 加载 ────────────────────────────────────────────────────────────
  function ensureAMap() {
    if (mapReady) return mapReady;
    mapReady = new Promise(function (resolve, reject) {
      if (!AMAP_KEY) { reject(new Error('no key')); return; }
      var s = document.createElement('script');
      s.src = 'https://webapi.amap.com/maps?v=2.0&key=' + encodeURIComponent(AMAP_KEY);
      s.onload = function () {
        window.AMap.plugin(
          ['AMap.PlaceSearch', 'AMap.Driving', 'AMap.AutoComplete', 'AMap.Geocoder', 'AMap.Geolocation'],
          function () { resolve(window.AMap); });
      };
      s.onerror = function () { reject(new Error('高德地图脚本加载失败')); };
      document.head.appendChild(s);
    });
    return mapReady;
  }

  function initMap() {
    if (map) return;
    map = new AMap.Map('travelMap', { zoom: 5, viewMode: '2D' });
    map.on('click', function (e) {
      var lnglat = [e.lnglat.getLng(), e.lnglat.getLat()];
      getGeocoder().getAddress(lnglat, function (st, res) {
        var addr = '';
        try { addr = res.regeocode.formattedAddress; } catch (err) { /* ignore */ }
        var spot = makeSpot('way', addr || '地图选点', addr, fmtLngLat(lnglat[0], lnglat[1]));
        plan.Spots.push(spot);
        invalidateLegs();
        renderSpots(); drawMarkers();
        UI.toast('已添加「' + spot.Name + '」', 'success');
      });
    });
  }

  function getGeocoder()  { if (!geocoder)    geocoder    = new AMap.Geocoder({ city: '全国' }); return geocoder; }
  function getPlace()     { if (!placeSearch) placeSearch = new AMap.PlaceSearch({ pageSize: 8, pageIndex: 1, city: '全国' }); return placeSearch; }
  function getAC()        { if (!autoComplete) autoComplete = new AMap.AutoComplete({ city: '全国' }); return autoComplete; }

  // ── 数据模型 ─────────────────────────────────────────────────────────────
  function makeSpot(type, name, address, lnglat, remark) {
    return {
      SpotID:  Date.now().toString() + Math.floor(Math.random() * 9000 + 1000),
      Type:    type,
      Name:    name || '',
      Address: address || '',
      LngLat:  lnglat || '',
      Remark:  remark || '',
      AddTime: ''
    };
  }
  function newPlanObj() {
    return {
      KeyID: '', Name: '', Date: '', Note: '',
      Spots: [ makeSpot('start', '', '', ''), makeSpot('end', '', '', '') ],
      Legs:  []
    };
  }

  // 坐标变动后使全部缓存行程失效（按索引对位，无法精确保留）
  function invalidateLegs() { plan.Legs = []; }

  // ── 视图切换 ─────────────────────────────────────────────────────────────
  function showEdit() {
    document.getElementById('planListView').style.display = 'none';
    document.getElementById('planEditView').style.display = '';
  }
  function backToList() { window.location.reload(); }

  function newPlan() {
    plan = newPlanObj();
    showEdit();
    fillMeta();
    renderSpots();
    renderLegs();
    ensureAMap().then(function () {
      initMap(); drawMarkers();
    }).catch(function () { UI.toast('地图加载失败，请检查网络或 Key 配置', 'error'); });
  }

  function openPlan(keyid) {
    var found = null;
    plans.forEach(function (p) { if (p.KeyID === keyid) found = p; });
    if (!found) return;
    plan = JSON.parse(JSON.stringify(found));
    showEdit();
    fillMeta();
    renderSpots();
    renderLegs();
    ensureAMap().then(function () {
      initMap(); drawMarkers();
      maybeAutoCompute();
    }).catch(function () { UI.toast('地图加载失败，请检查网络或 Key 配置', 'error'); });
  }

  function fillMeta() {
    document.getElementById('editorTitle').textContent = plan.KeyID ? '编辑计划' : '新建计划';
    document.getElementById('planName').value = plan.Name || '';
    document.getElementById('planDate').value = plan.Date || '';
    document.getElementById('planNote').value = plan.Note || '';
  }

  function collectMeta() {
    plan.Name = document.getElementById('planName').value.trim();
    plan.Date = document.getElementById('planDate').value;
    plan.Note = document.getElementById('planNote').value.trim();
  }

  // ── Spot 列表渲染 ────────────────────────────────────────────────────────
  function typeOptions(t) {
    return Object.keys(SPOT_TYPES).map(function (k) {
      return '<option value="' + k + '"' + (k === t ? ' selected' : '') + '>' +
             SPOT_TYPES[k].icon + ' ' + SPOT_TYPES[k].label + '</option>';
    }).join('');
  }

  function renderSpots() {
    var box = document.getElementById('spotList');
    box.innerHTML = '';
    plan.Spots.forEach(function (s, i) {
      var el = document.createElement('div');
      el.className = 'spot-item' + (s.LngLat ? ' located' : '');
      el.dataset.type = s.Type;
      el.innerHTML =
        '<div class="spot-order">' + (i + 1) + '</div>' +
        '<div class="spot-body">' +
          '<div class="spot-row1">' +
            '<select class="spot-type-select" data-i="' + i + '" data-act="type">' + typeOptions(s.Type) + '</select>' +
            '<input class="spot-name-input" data-i="' + i + '" data-act="name" placeholder="地点名称"' +
                   ' value="' + esc(s.Name) + '">' +
          '</div>' +
          '<div class="spot-addr' + (s.LngLat ? '' : ' unset') + '">' +
            (s.LngLat ? esc(s.Address || s.LngLat) : '未定位 — 点 🔍 搜索或直接在地图点选') +
          '</div>' +
          '<textarea class="spot-remark" rows="1" data-i="' + i + '" data-act="remark" placeholder="备注（可选）">' + esc(s.Remark) + '</textarea>' +
        '</div>' +
        '<div class="spot-tools">' +
          '<button class="spot-mini-btn" data-i="' + i + '" data-act="search" title="搜索地点">🔍</button>' +
          '<button class="spot-mini-btn" data-i="' + i + '" data-act="up" title="上移"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button class="spot-mini-btn" data-i="' + i + '" data-act="down" title="下移"' + (i === plan.Spots.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '<button class="spot-mini-btn danger" data-i="' + i + '" data-act="del" title="删除">✕</button>' +
        '</div>';
      box.appendChild(el);
    });
  }

  function onSpotAction(e) {
    var t = e.target.closest('[data-act]');
    if (!t) return;
    var i = Number(t.dataset.i);
    var act = t.dataset.act;
    var s = plan.Spots[i];
    if (!s) return;

    if (act === 'type' && e.type === 'change') { s.Type = t.value; renderSpots(); drawMarkers(); }
    else if (act === 'name' && e.type === 'input') { s.Name = t.value; }
    else if (act === 'remark' && e.type === 'input') { s.Remark = t.value; }
    else if (act === 'search' && e.type === 'click') { openSearch(i); }
    else if (act === 'up' && e.type === 'click' && i > 0) {
      plan.Spots.splice(i - 1, 0, plan.Spots.splice(i, 1)[0]);
      invalidateLegs(); renderSpots(); renderLegs(); drawMarkers();
    } else if (act === 'down' && e.type === 'click' && i < plan.Spots.length - 1) {
      plan.Spots.splice(i + 1, 0, plan.Spots.splice(i, 1)[0]);
      invalidateLegs(); renderSpots(); renderLegs(); drawMarkers();
    } else if (act === 'del' && e.type === 'click') {
      if (plan.Spots.length <= 2) { UI.toast('至少保留起点和终点', 'error'); return; }
      plan.Spots.splice(i, 1);
      invalidateLegs(); renderSpots(); renderLegs(); drawMarkers();
    }
  }

  // ── 搜索选点 ─────────────────────────────────────────────────────────────
  function openSearch(i) {
    searchTarget = i;
    var s = plan.Spots[i];
    document.getElementById('spotSearchTitle').textContent =
      '搜索地点 — ' + (SPOT_TYPES[s.Type] ? SPOT_TYPES[s.Type].label : '') + ' #' + (i + 1);
    var input = document.getElementById('spotSearchInput');
    input.value = '';
    document.getElementById('spotSearchResults').innerHTML = '';
    UI.modal('spotSearchModal').show();
    setTimeout(function () { input.focus(); }, 50);
  }

  function runAutoComplete(q) {
    var box = document.getElementById('spotSearchResults');
    getAC().search(q, function (st, res) {
      if (st === 'complete' && res.tips && res.tips.length) {
        renderResults(res.tips.filter(function (t) { return t.location && t.location.getLng; })
          .map(function (t) {
            return { name: t.name, addr: (t.district || '') + (t.address ? ' ' + t.address : ''),
                     lng: t.location.getLng(), lat: t.location.getLat() };
          }), box, q);
      } else runPlaceSearch(q);
    });
  }

  function runPlaceSearch(q) {
    var box = document.getElementById('spotSearchResults');
    getPlace().search(q, function (st, res) {
      var list = (res && res.poiList && res.poiList.poiList) || [];
      renderResults(list.map(function (p) {
        return { name: p.name, addr: p.address || (p.pname || '') + (p.cityname || ''),
                 lng: p.location.getLng(), lat: p.location.getLat() };
      }), box, q);
    });
  }

  function renderResults(items, box, q) {
    if (!items.length) {
      box.innerHTML = '<div class="spot-result-empty">没有找到「' + esc(q) + '」，换个关键字试试</div>';
      return;
    }
    box.innerHTML = items.slice(0, 10).map(function (it, idx) {
      return '<div class="spot-result-item" data-idx="' + idx + '">' +
               '<span class="spot-result-name">' + esc(it.name) + '</span>' +
               '<span class="spot-result-addr">' + esc(it.addr) + '</span>' +
             '</div>';
    }).join('');
    box._items = items.slice(0, 10);
  }

  function pickResult(e) {
    var item = e.target.closest('.spot-result-item');
    if (!item) return;
    var it = document.getElementById('spotSearchResults')._items[Number(item.dataset.idx)];
    var s = plan.Spots[searchTarget];
    if (!s) return;
    if (!s.Name) s.Name = it.name;
    s.Address = it.addr;
    s.LngLat = fmtLngLat(it.lng, it.lat);
    invalidateLegs();
    UI.modal('spotSearchModal').hide();
    renderSpots(); renderLegs(); drawMarkers();
    maybeAutoCompute();
  }

  // ── 我的位置（浏览器定位 → 逆地理） ──────────────────────────────────────
  function locateMe() {
    ensureAMap().then(function () {
      initMap();
      var geo = new AMap.Geolocation({ enableHighAccuracy: true, timeout: 8000 });
      UI.toast('定位中…');
      geo.getCurrentPosition(function (st, res) {
        if (st !== 'complete' || !res.position) {
          UI.toast('定位失败：' + (res && res.message ? res.message : '请检查浏览器定位权限（HTTPS/localhost）'), 'error');
          return;
        }
        var lnglat = [res.position.getLng(), res.position.getLat()];
        getGeocoder().getAddress(lnglat, function (st2, r2) {
          var addr = '';
          try { addr = r2.regeocode.formattedAddress; } catch (err) { /* ignore */ }
          var start = plan.Spots[0];
          if (start.Type !== 'start') plan.Spots.unshift(makeSpot('start', '', '', '')), start = plan.Spots[0];
          start.Name = start.Name || '我的位置';
          start.Address = addr;
          start.LngLat = fmtLngLat(lnglat[0], lnglat[1]);
          invalidateLegs();
          renderSpots(); drawMarkers();
          map.setZoomAndCenter(12, lnglat);
          maybeAutoCompute();
          UI.toast('已定位：' + (addr || start.Name), 'success');
        });
      });
    });
  }

  // ── 地图绘制 ─────────────────────────────────────────────────────────────
  function drawMarkers() {
    if (!map) return;
    markers.forEach(function (m) { m.setMap(null); });
    markers = [];
    plan.Spots.forEach(function (s, i) {
      var ll = toLngLat(s.LngLat);
      if (!ll) return;
      var cfg = SPOT_TYPES[s.Type] || SPOT_TYPES.way;
      var mk = new AMap.Marker({
        position: ll,
        offset: new AMap.Pixel(-13, -26),
        content: '<div class="amap-spot-marker" style="--mk-bg:' + cfg.color + '"><span>' + (i + 1) + '</span></div>',
        title: cfg.icon + ' ' + (s.Name || cfg.label)
      });
      mk.setMap(map);
      markers.push(mk);
    });
    if (markers.length) {
      map.setFitView(markers, false, [40, 40, 40, 40]);
    }
  }

  function drawRoute(legIdx, pathPoints) {
    polylines.forEach(function (p, i) { if (p._leg === legIdx) { p.setMap(null); polylines.splice(i, 1); } });
    var pl = new AMap.Polyline({
      path: pathPoints, strokeColor: '#c4907c', strokeWeight: 5,
      strokeOpacity: 0.85, lineJoin: 'round', lineCap: 'round'
    });
    pl._leg = legIdx;
    pl.setMap(map);
    polylines.push(pl);
  }

  // ── 分段驾车路线（串行，防 QPS 超限） ───────────────────────────────────
  function locatedSpots() { return plan.Spots.filter(function (s) { return s.LngLat; }); }

  function maybeAutoCompute() {
    var located = plan.Spots.filter(function (s) { return s.LngLat; });
    if (located.length >= 2 && !plan.Legs.length && !computing) computeRoute();
  }

  function computeRoute() {
    if (computing) return;
    var seq = plan.Spots.map(function (s, i) { return { s: s, i: i }; }).filter(function (x) { return x.s.LngLat; });
    if (seq.length < 2) { UI.toast('至少需要两个已定位的地点', 'error'); return; }

    computing = true;
    polylines.forEach(function (p) { p.setMap(null); });
    polylines = [];
    plan.Legs = [];
    renderLegs();
    setStatus('正在计算 ' + (seq.length - 1) + ' 段路线…');

    var driving = new AMap.Driving({ policy: AMap.DrivingPolicy.LEAST_TIME });
    var idx = 0;
    function next() {
      if (idx >= seq.length - 1) {
        computing = false;
        setStatus('');
        renderLegs();
        if (plan.Legs.length) map && map.setFitView(null, false, [40, 40, 40, 40]);
        return;
      }
      var a = seq[idx], b = seq[idx + 1];
      driving.search(toLngLat(a.s.LngLat), toLngLat(b.s.LngLat), function (st, res) {
        var leg = { FromIndex: a.i, ToIndex: b.i, Distance: null, Duration: null, CachedAt: now(), _ok: false };
        if (st === 'complete' && res.route && res.route.steps && res.route.steps.length) {
          var pts = [];
          res.route.steps.forEach(function (sp) {
            (sp.path || []).forEach(function (p) { pts.push([p.getLng(), p.getLat()]); });
          });
          var r = res.route;
          leg.Distance = r.distance ? r.distance[0] : null;
          leg.Duration = r.time ? r.time[0] : null;
          leg._ok = true;
          drawRoute(idx, pts.length ? pts : [toLngLat(a.s.LngLat), toLngLat(b.s.LngLat)]);
        }
        plan.Legs.push(leg);
        idx++;
        renderLegs();
        setStatus('已计算 ' + idx + ' / ' + (seq.length - 1) + ' 段');
        setTimeout(next, 400);   // 限速：个人 Key 路径规划约 3 次/秒
      });
    }
    next();
  }

  function recompute() {
    if (!map) { UI.toast('请先添加至少两个已定位的地点并打开地图', 'error'); }
    maybeForceCompute();
  }

  function maybeForceCompute() {
    if (computing) { UI.toast('正在计算中…'); return; }
    var located = plan.Spots.filter(function (s) { return s.LngLat; });
    if (located.length < 2) { UI.toast('至少需要两个已定位的地点', 'error'); return; }
    ensureAMap().then(function () { initMap(); computeRoute(); })
      .catch(function () { UI.toast('地图加载失败', 'error'); });
  }

  function now() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
           ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  // ── 行程概览渲染 ─────────────────────────────────────────────────────────
  function renderLegs() {
    var box = document.getElementById('legList');
    var totalEl = document.getElementById('legTotal');
    box.innerHTML = '';
    var seq = plan.Spots.map(function (s, i) { return { s: s, i: i }; }).filter(function (x) { return x.s.LngLat; });

    var totalKm = 0, totalSec = 0, okCount = 0;
    for (var i = 0; i < seq.length - 1; i++) {
      var a = seq[i], b = seq[i + 1];
      var leg = null;
      for (var j = 0; j < plan.Legs.length; j++) {
        if (plan.Legs[j].FromIndex === a.i && plan.Legs[j].ToIndex === b.i) { leg = plan.Legs[j]; break; }
      }
      var el = document.createElement('div');
      var cls = 'leg-item', dist = '—', dur = '—';
      if (leg && leg._ok) {
        dist = fmtKm(leg.Distance); dur = fmtDur(leg.Duration);
        totalKm += (leg.Distance || 0) / 1000; totalSec += leg.Duration || 0; okCount++;
      } else if (leg) {
        cls += ' failed';
      } else {
        cls += ' pending';
      }
      el.className = cls;
      el.innerHTML =
        '<span class="leg-badge">' + (a.i + 1) + '→' + (b.i + 1) + '</span>' +
        '<span class="leg-route">' + esc(a.s.Name || ('地点' + (a.i + 1))) + ' → ' + esc(b.s.Name || ('地点' + (b.i + 1))) + '</span>' +
        '<span class="leg-stat">' + dist + '</span>' +
        '<span class="leg-time">' + dur + '</span>';
      box.appendChild(el);
    }

    if (!seq.length) {
      box.innerHTML = '<div class="calc-status">添加已定位的地点后，这里会显示每段行程的距离与耗时</div>';
      totalEl.textContent = '';
    } else if (seq.length < 2) {
      totalEl.textContent = '待定位';
    } else {
      totalEl.textContent = okCount === seq.length - 1
        ? '全程 ' + totalKm.toFixed(1) + ' km · 驾车 ' + fmtDur(totalSec).replace('约 ', '')
        : okCount + '/' + (seq.length - 1) + ' 段已算';
    }
  }

  function setStatus(msg) {
    document.getElementById('calcStatus').textContent = msg;
  }

  // ── 保存 / 删除 ──────────────────────────────────────────────────────────
  function savePlan() {
    collectMeta();
    if (!plan.Name) { UI.toast('请填写计划名称', 'error'); return; }
    if (plan.Spots.length < 2) { UI.toast('至少需要起点和终点', 'error'); return; }
    for (var i = 0; i < plan.Spots.length; i++) {
      var s = plan.Spots[i];
      if (!s.Name.trim()) { UI.toast('第 ' + (i + 1) + ' 个地点名称为空', 'error'); return; }
      if (!s.LngLat)     { UI.toast('第 ' + (i + 1) + ' 个地点「' + s.Name + '」尚未定位', 'error'); return; }
    }

    // Legs 只存服务端校验需要的字段
    var legs = plan.Legs.map(function (l) {
      return { FromIndex: l.FromIndex, ToIndex: l.ToIndex,
               Distance: l.Distance, Duration: l.Duration, CachedAt: l.CachedAt };
    }).filter(function (l) { return l.Distance != null; });

    var btn = document.getElementById('savePlanBtn');
    btn.disabled = true; btn.textContent = '保存中…';
    fetch('/travel/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        KeyID: plan.KeyID, Name: plan.Name, Date: plan.Date, Note: plan.Note,
        Spots: plan.Spots, Legs: legs
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.code === 1) {
          UI.toast('已保存' + (legs.length ? '（含 ' + legs.length + ' 段行程）' : ''), 'success');
          setTimeout(backToList, 600);
        } else {
          UI.toast(data.msgs || '保存失败', 'error');
          btn.disabled = false; btn.textContent = '保存计划';
        }
      })
      .catch(function () {
        UI.toast('网络错误，请重试', 'error');
        btn.disabled = false; btn.textContent = '保存计划';
      });
  }

  function askDelete(keyid) {
    deleteKeyID = keyid;
    UI.modal('travelDeleteModal').show();
  }

  function doDelete() {
    fetch('/travel/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ KeyID: deleteKeyID })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        UI.modal('travelDeleteModal').hide();
        if (data.code === 1) {
          plans = plans.filter(function (p) { return p.KeyID !== deleteKeyID; });
          var card = document.querySelector('.plan-card[data-keyid="' + deleteKeyID + '"]');
          if (card) card.remove();
          UI.toast('已删除', 'success');
        } else UI.toast(data.msgs || '删除失败', 'error');
      });
  }

  // ── 事件绑定 ─────────────────────────────────────────────────────────────
  document.getElementById('spotList').addEventListener('click', onSpotAction);
  document.getElementById('spotList').addEventListener('change', onSpotAction);
  document.getElementById('spotList').addEventListener('input', onSpotAction);

  var searchInput = document.getElementById('spotSearchInput');
  searchInput.addEventListener('input', function () {
    clearTimeout(acTimer);
    var q = searchInput.value.trim();
    if (q.length < 2) return;
    acTimer = setTimeout(function () { runAutoComplete(q); }, 300);
  });
  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      var q = searchInput.value.trim();
      if (q) runPlaceSearch(q);
    }
  });
  document.getElementById('spotSearchResults').addEventListener('click', pickResult);
  document.getElementById('confirmTravelDeleteBtn').addEventListener('click', doDelete);

  return {
    newPlan: newPlan, openPlan: openPlan, backToList: backToList,
    addSpot: function () {
      plan.Spots.push(makeSpot('way', '', '', ''));
      renderSpots();
    },
    locateMe: locateMe,
    recompute: recompute,
    savePlan: savePlan,
    askDelete: askDelete
  };
})();
