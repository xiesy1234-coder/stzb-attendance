/* 率土之滨 · 同盟考勤查询（网页版）
 * 查询式界面：输入 区服 / 同盟 / 个人ID → 生成并展示考勤数据。
 * 当前为「演示模式」：数据由输入确定性地模拟生成，用于展示交互；
 * 接入真实数据源后，只需把 generateMock 换成后端 API 请求即可。
 */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const fmt = (n) => Number(n || 0).toLocaleString('zh-CN');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const state = {
    data: null,
    server: '',
    alliance: '',
    playerId: '',
    search: '',
    group: '',
    sortKey: 'weeklyMerit',
    sortDir: 'desc',
    thresholds: { main: 2, siege: 1, attack: 3 }
  };

  // ---------- 确定性随机（同一输入永远同一结果，便于演示） ----------
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const NAME_POOL = [
    '折戟沉沙', '孤城旧梦', '铁骑三千', '北府兵', '青州浪客', '一剑霜寒', '定军山', '横扫千军',
    '风起陇西', '洛水之滨', '虎啸龙吟', '白马义从', '西凉铁骑', '江东子弟', '并州狼骑', '长歌当行',
    '破阵子', '战八方', '临江仙', '望北楼', '踏雪寻梅', '夜泊秦淮', '射天狼', '渡江云',
    '扬州慢', '满江红', '念奴娇', '青玉案', '水龙吟', '蝶恋花', '贺新郎', '沁园春',
    '燕归梁', '忆江南', '长相思', '如梦令', '醉花阴', '雨霖铃', '渔家傲', '桂枝香'
  ];
  const GROUPS = ['一组', '二组', '三组', '四组'];

  function generateMock(server, alliance, playerId) {
    const seed = hashStr(`${server}|${alliance}|${playerId}`);
    const rnd = mulberry32(seed);
    const count = 12 + Math.floor(rnd() * 19); // 12~30 人
    const names = NAME_POOL.slice().sort(() => rnd() - 0.5);
    const members = [];
    for (let i = 0; i < count; i++) {
      const name = names[i % names.length] + (i >= names.length ? String(Math.floor(i / names.length) + 1) : '');
      members.push({
        name,
        group: GROUPS[Math.floor(rnd() * GROUPS.length)],
        mainTeams: Math.floor(rnd() * 5),        // 0-4
        siegeTeams: Math.floor(rnd() * 4),       // 0-3
        attackCount: Math.floor(rnd() * 19),     // 0-18
        weeklyMerit: 2000 + Math.floor(rnd() * 19000)
      });
    }
    // 个人 ID：高亮对应成员（演示里用 ID 数字映射到一位成员）
    let selfIndex = null;
    if (playerId && /^\d+$/.test(playerId)) {
      selfIndex = Number(playerId) % members.length;
      members[selfIndex].isSelf = true;
    }
    return { alliance, server, members, selfIndex, generatedAt: Date.now() };
  }

  // ---------- 计算 ----------
  function statusOf(m) {
    const t = state.thresholds;
    const pass = m.mainTeams >= t.main && m.siegeTeams >= t.siege && m.attackCount >= t.attack;
    if (pass) return { key: 'ok', label: '达标' };
    const partial = m.mainTeams >= t.main || m.siegeTeams >= t.siege || m.attackCount >= t.attack;
    return partial ? { key: 'mid', label: '部分达标' } : { key: 'bad', label: '未达标' };
  }

  function visibleMembers() {
    const q = state.search.trim().toLowerCase();
    let list = state.data.members.filter((m) => {
      if (state.group && m.group !== state.group) return false;
      if (!q) return true;
      return (m.name + ' ' + m.group).toLowerCase().includes(q);
    });
    const dir = state.sortDir === 'asc' ? 1 : -1;
    const key = state.sortKey;
    return list.slice().sort((a, b) => {
      if (key === 'status') {
        const rank = { ok: 2, mid: 1, bad: 0 };
        return (rank[statusOf(a).key] - rank[statusOf(b).key]) * dir;
      }
      if (key === 'name' || key === 'group') return String(a[key]).localeCompare(String(b[key]), 'zh-CN') * dir;
      return ((a[key] || 0) - (b[key] || 0)) * dir;
    });
  }

  function groupStats() {
    const map = new Map();
    for (const m of state.data.members) {
      if (!map.has(m.group)) map.set(m.group, { group: m.group, count: 0, merit: 0, pass: 0 });
      const g = map.get(m.group);
      g.count++; g.merit += m.weeklyMerit;
      if (statusOf(m).key === 'ok') g.pass++;
    }
    return [...map.values()].sort((a, b) => b.merit - a.merit);
  }

  function totals() {
    const ms = state.data.members;
    const sum = (k) => ms.reduce((s, m) => s + (m[k] || 0), 0);
    const pass = ms.filter((m) => statusOf(m).key === 'ok').length;
    return {
      count: ms.length, main: sum('mainTeams'), siege: sum('siegeTeams'),
      attack: sum('attackCount'), merit: sum('weeklyMerit'),
      pass, passRate: ms.length ? Math.round((pass / ms.length) * 100) : 0
    };
  }

  // ---------- 渲染 ----------
  function renderResultHeader() {
    const d = state.data;
    $('#resultTitle').textContent = `${d.alliance} · 同盟考勤`;
    const self = d.members.find((m) => m.isSelf);
    $('#resultMeta').textContent =
      `区服 ${d.server} · 同盟 ${d.alliance} · 共 ${d.members.length} 名成员` +
      (self ? ` · 已定位：${self.name}` : (state.playerId ? ` · 个人 ID ${state.playerId}（未匹配到成员）` : ''));
  }

  function renderCards() {
    const t = totals();
    const cards = [
      { k: '同盟成员', v: fmt(t.count), cls: '' },
      { k: '主力队伍合计', v: fmt(t.main), cls: 'accent' },
      { k: '拆迁队伍合计', v: fmt(t.siege), cls: 'accent' },
      { k: '攻城次数合计', v: fmt(t.attack), cls: '' },
      { k: '周武勋合计', v: fmt(t.merit), cls: 'ok' },
      { k: '考核达标', v: fmt(t.pass) + `<small>${t.passRate}%</small>`, cls: t.passRate >= 60 ? 'ok' : 'warn' }
    ];
    $('#summaryCards').innerHTML = cards.map((c) => `<div class="card ${c.cls}"><div class="k">${c.k}</div><div class="v">${c.v}</div></div>`).join('');
  }

  function renderGroupFilter() {
    const groups = [...new Set(state.data.members.map((m) => m.group))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
    $('#groupFilter').innerHTML = '<option value="">全部分组</option>' +
      groups.map((g) => `<option${g === state.group ? ' selected' : ''}>${esc(g)}</option>`).join('');
  }

  function renderMembers() {
    const list = visibleMembers();
    $('#emptyHint').hidden = list.length > 0;
    $('#memberBody').innerHTML = list.map((m) => {
      const st = statusOf(m);
      const selfTag = m.isSelf ? ' <span class="self-tag">你</span>' : '';
      return `<tr class="${m.isSelf ? 'is-self' : ''}">
        <td>${esc(m.name)}${selfTag}</td>
        <td class="muted">${esc(m.group)}</td>
        <td class="num">${m.mainTeams}</td>
        <td class="num">${m.siegeTeams}</td>
        <td class="num">${m.attackCount}</td>
        <td class="num">${fmt(m.weeklyMerit)}</td>
        <td><span class="tag ${st.key}">${st.label}</span></td>
      </tr>`;
    }).join('');

    document.querySelectorAll('#memberTable th').forEach((th) => {
      const key = th.dataset.key;
      if (!key) return;
      th.textContent = th.textContent.replace(/[ ▲▼]+$/, '') + (key === state.sortKey ? (state.sortDir === 'asc' ? ' ▲' : ' ▼') : '');
    });
  }

  function renderGroups() {
    const stats = groupStats();
    $('#groupCount').textContent = `共 ${stats.length} 个分组`;
    const max = Math.max(1, ...stats.map((g) => g.merit));
    $('#groupBody').innerHTML = stats.map((g) => {
      const rate = g.count ? Math.round((g.pass / g.count) * 100) : 0;
      return `<tr>
        <td>${esc(g.group)}<div class="bar"><i style="width:${(g.merit / max) * 100}%"></i></div></td>
        <td class="num">${g.count}</td>
        <td class="num">${fmt(g.merit)}</td>
        <td class="num">${fmt(Math.round(g.merit / g.count))}</td>
        <td class="num">${g.pass}</td>
        <td class="num">${rate}%</td>
      </tr>`;
    }).join('');
  }

  function renderAll() {
    renderResultHeader();
    renderCards();
    renderGroupFilter();
    renderMembers();
    renderGroups();
    $('#updatedAt').textContent = '查询于 ' + new Date().toLocaleString('zh-CN');
  }

  // ---------- 查询 ----------
  function runQuery(server, alliance, playerId) {
    state.server = server; state.alliance = alliance; state.playerId = playerId;
    state.data = generateMock(server, alliance, playerId);
    state.search = ''; state.group = '';
    $('#search').value = ''; $('#groupFilter').value = '';
    $('#queryPanel').hidden = true;
    $('#resultPanel').hidden = false;
    renderAll();
    try {
      localStorage.setItem('stzb.lastQuery', JSON.stringify({ server, alliance, playerId }));
    } catch (e) { /* ignore */ }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function backToQuery() {
    $('#resultPanel').hidden = true;
    $('#queryPanel').hidden = false;
    $('#server').focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- 导出 ----------
  function exportCsv() {
    const header = ['成员', '分组', '主力队伍', '拆迁队伍', '攻城次数', '周武勋'];
    const lines = [header.join(',')];
    for (const m of state.data.members) {
      lines.push([m.name, m.group, m.mainTeams, m.siegeTeams, m.attackCount, m.weeklyMerit]
        .map((v) => (String(v).includes(',') ? `"${String(v).replace(/"/g, '""')}"` : v)).join(','));
    }
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `考勤_${state.server}_${state.alliance}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('已导出 CSV');
  }

  // ---------- 提示 ----------
  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  // ---------- 事件 ----------
  function bind() {
    $('#queryForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const server = $('#server').value.trim();
      const alliance = $('#alliance').value.trim();
      const playerId = $('#playerId').value.trim();
      const err = $('#queryError');
      if (!/^\d{1,6}$/.test(server)) { err.textContent = '区服请填写数字，例如 1245'; err.hidden = false; return; }
      if (!alliance) { err.textContent = '请填写同盟名称或 ID'; err.hidden = false; return; }
      err.hidden = true;
      runQuery(server, alliance, playerId);
    });

    $('#again').addEventListener('click', backToQuery);
    $('#exportCsv').addEventListener('click', exportCsv);

    $('#search').addEventListener('input', (e) => { state.search = e.target.value; renderMembers(); });
    $('#groupFilter').addEventListener('change', (e) => { state.group = e.target.value; renderMembers(); });

    const bindTh = (id, key) => $(id).addEventListener('change', (e) => {
      state.thresholds[key] = Math.max(0, Number(e.target.value) || 0);
      renderCards(); renderMembers(); renderGroups();
    });
    bindTh('#thMain', 'main'); bindTh('#thSiege', 'siege'); bindTh('#thAttack', 'attack');

    document.querySelectorAll('#memberTable th[data-key]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.key;
        if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sortKey = key; state.sortDir = key === 'name' || key === 'group' ? 'asc' : 'desc'; }
        renderMembers();
      });
    });
  }

  // ---------- 启动 ----------
  bind();
  // 回填上次查询（不自动执行，避免误导）
  try {
    const last = JSON.parse(localStorage.getItem('stzb.lastQuery') || 'null');
    if (last) {
      $('#server').value = last.server || '';
      $('#alliance').value = last.alliance || '';
      $('#playerId').value = last.playerId || '';
    }
  } catch (e) { /* ignore */ }

  // 支持分享链接直接带参数查询：?server=1245&alliance=洛阳&playerId=12345
  const params = new URLSearchParams(location.search);
  const qServer = params.get('server');
  const qAlliance = params.get('alliance');
  if (qServer && qAlliance) {
    $('#server').value = qServer;
    $('#alliance').value = qAlliance;
    $('#playerId').value = params.get('playerId') || '';
    runQuery(qServer, qAlliance, params.get('playerId') || '');
  }
})();
