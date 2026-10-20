/* 率土之滨 · 同盟考勤（网页版 · 纯展示）
 * 数据来源：导入 JSON / CSV，或使用内置示例数据。
 * 所有数据保存在浏览器 localStorage，不上传任何服务器。
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'stzb.attendance.v1';

  // ---------- 示例数据 ----------
  function sampleData() {
    const groups = ['一组', '二组', '三组', '四组'];
    const names = [
      '折戟沉沙', '孤城旧梦', '铁骑三千', '北府兵', '青州浪客',
      '一剑霜寒', '定军山', '横扫千军', '风起陇西', '洛水之滨',
      '虎啸龙吟', '白马义从', '西凉铁骑', '江东子弟', '并州狼骑',
      '长歌当行', '破阵子', '战八方', '临江仙', '望北楼'
    ];
    const members = names.map((name, i) => ({
      name,
      group: groups[i % groups.length],
      mainTeams: 1 + ((i * 7 + 3) % 4),          // 主力队伍 1-4
      siegeTeams: (i * 3) % 4,                     // 拆迁队伍 0-3
      attackCount: (i * 5 + 2) % 16,               // 攻城次数 0-15
      weeklyMerit: 3000 + ((i * 2311) % 18000)     // 周武勋
    }));
    return { alliance: '示例同盟 · 洛阳', season: 'S1 赛季第 3 周', members };
  }

  // ---------- 状态 ----------
  const state = {
    data: null,
    search: '',
    group: '',
    sortKey: 'weeklyMerit',
    sortDir: 'desc',
    thresholds: { main: 2, siege: 1, attack: 3 }
  };

  const $ = (sel) => document.querySelector(sel);
  const fmt = (n) => Number(n || 0).toLocaleString('zh-CN');

  // ---------- 存取 ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.members)) return normalize(parsed);
      }
    } catch (e) { console.warn('读取本地数据失败', e); }
    return normalize(sampleData());
  }

  function normalize(d) {
    return {
      alliance: d.alliance || '未命名同盟',
      season: d.season || '',
      members: (d.members || []).map((m) => ({
        name: String(m.name ?? m.成员 ?? '').trim() || '未命名',
        group: String(m.group ?? m.分组 ?? '未分组').trim() || '未分组',
        mainTeams: num(m.mainTeams ?? m.main_teams ?? m.主力队伍 ?? m.主力),
        siegeTeams: num(m.siegeTeams ?? m.siege_teams ?? m.拆迁队伍 ?? m.拆迁),
        attackCount: num(m.attackCount ?? m.attack_count ?? m.攻城次数 ?? m.攻城),
        weeklyMerit: num(m.weeklyMerit ?? m.weekly_merit ?? m.周武勋 ?? m.武勋)
      }))
    };
  }
  function num(v) { const n = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return isFinite(n) ? n : 0; }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data)); } catch (e) { /* 忽略 */ }
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
    list = list.slice().sort((a, b) => {
      if (key === 'status') {
        const rank = { ok: 2, mid: 1, bad: 0 };
        return (rank[statusOf(a).key] - rank[statusOf(b).key]) * dir;
      }
      if (key === 'name' || key === 'group') {
        return String(a[key]).localeCompare(String(b[key]), 'zh-CN') * dir;
      }
      return ((a[key] || 0) - (b[key] || 0)) * dir;
    });
    return list;
  }

  function groupStats() {
    const map = new Map();
    for (const m of state.data.members) {
      if (!map.has(m.group)) map.set(m.group, { group: m.group, count: 0, merit: 0, pass: 0 });
      const g = map.get(m.group);
      g.count++;
      g.merit += m.weeklyMerit;
      if (statusOf(m).key === 'ok') g.pass++;
    }
    return [...map.values()].sort((a, b) => b.merit - a.merit);
  }

  function totals() {
    const ms = state.data.members;
    const sum = (k) => ms.reduce((s, m) => s + (m[k] || 0), 0);
    const pass = ms.filter((m) => statusOf(m).key === 'ok').length;
    return {
      count: ms.length,
      main: sum('mainTeams'),
      siege: sum('siegeTeams'),
      attack: sum('attackCount'),
      merit: sum('weeklyMerit'),
      pass,
      passRate: ms.length ? Math.round((pass / ms.length) * 100) : 0
    };
  }

  // ---------- 渲染 ----------
  function renderMeta() {
    const d = state.data;
    $('#metaLine').textContent = `· ${d.alliance}${d.season ? ' · ' + d.season : ''}`;
    $('#updatedAt').textContent = '本地数据 · 更新于 ' + new Date().toLocaleString('zh-CN');
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
    $('#summaryCards').innerHTML = cards.map((c) =>
      `<div class="card ${c.cls}"><div class="k">${c.k}</div><div class="v">${c.v}</div></div>`
    ).join('');
  }

  function renderGroupFilter() {
    const groups = [...new Set(state.data.members.map((m) => m.group))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
    const sel = $('#groupFilter');
    sel.innerHTML = '<option value="">全部分组</option>' +
      groups.map((g) => `<option${g === state.group ? ' selected' : ''}>${esc(g)}</option>`).join('');
  }

  function renderMembers() {
    const list = visibleMembers();
    $('#emptyHint').hidden = list.length > 0;
    $('#memberBody').innerHTML = list.map((m) => {
      const st = statusOf(m);
      return `<tr>
        <td>${esc(m.name)}</td>
        <td class="muted">${esc(m.group)}</td>
        <td class="num">${m.mainTeams}</td>
        <td class="num">${m.siegeTeams}</td>
        <td class="num">${m.attackCount}</td>
        <td class="num">${fmt(m.weeklyMerit)}</td>
        <td><span class="tag ${st.key}">${st.label}</span></td>
      </tr>`;
    }).join('');

    // 表头排序指示
    document.querySelectorAll('#memberTable th').forEach((th) => {
      const key = th.dataset.key;
      if (!key) return;
      th.style.color = key === state.sortKey ? 'var(--text)' : '';
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
        <td>${esc(g.group)}
          <div class="bar"><i style="width:${(g.merit / max) * 100}%"></i></div>
        </td>
        <td class="num">${g.count}</td>
        <td class="num">${fmt(g.merit)}</td>
        <td class="num">${fmt(Math.round(g.merit / g.count))}</td>
        <td class="num">${g.pass}</td>
        <td class="num">${rate}%</td>
      </tr>`;
    }).join('');
  }

  function renderAll() {
    renderMeta();
    renderCards();
    renderGroupFilter();
    renderMembers();
    renderGroups();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- 导入 ----------
  function parseCsv(text) {
    const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((r) => r.trim());
    if (!rows.length) throw new Error('CSV 是空的');
    const sep = rows[0].includes('\t') ? '\t' : ',';
    const header = rows[0].split(sep).map((h) => h.trim().toLowerCase());
    const members = rows.slice(1).map((line) => {
      const cells = splitCsvLine(line, sep);
      const obj = {};
      header.forEach((h, i) => { obj[h] = (cells[i] || '').trim(); });
      return {
        name: obj['成员'] || obj['name'] || obj['姓名'],
        group: obj['分组'] || obj['group'] || '未分组',
        mainTeams: obj['主力队伍'] || obj['主力'] || obj['mainteams'] || 0,
        siegeTeams: obj['拆迁队伍'] || obj['拆迁'] || obj['siegeteams'] || 0,
        attackCount: obj['攻城次数'] || obj['攻城'] || obj['attackcount'] || 0,
        weeklyMerit: obj['周武勋'] || obj['武勋'] || obj['weeklymerit'] || 0
      };
    });
    return { alliance: '导入数据', season: '', members };
  }

  function splitCsvLine(line, sep) {
    if (sep === '\t') return line.split('\t');
    const out = []; let cur = ''; let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
        else quoted = !quoted;
      } else if (ch === ',' && !quoted) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  function importFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        const isJson = /\.json$/i.test(file.name) || text.trim().startsWith('{') || text.trim().startsWith('[');
        let data;
        if (isJson) {
          const parsed = JSON.parse(text);
          data = Array.isArray(parsed) ? { members: parsed } : parsed;
        } else {
          data = parseCsv(text);
        }
        const normalized = normalize(data);
        if (!normalized.members.length) throw new Error('没有解析到成员数据');
        state.data = normalized;
        save();
        renderAll();
        toast(`导入成功：${normalized.members.length} 名成员`);
      } catch (e) {
        toast('导入失败：' + e.message);
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  function exportJson() {
    download(JSON.stringify(state.data, null, 2), 'stzb-attendance.json', 'application/json');
    toast('已导出 JSON');
  }

  function exportCsv() {
    const header = ['成员', '分组', '主力队伍', '拆迁队伍', '攻城次数', '周武勋'];
    const lines = [header.join(',')];
    for (const m of state.data.members) {
      lines.push([m.name, m.group, m.mainTeams, m.siegeTeams, m.attackCount, m.weeklyMerit]
        .map((v) => (String(v).includes(',') ? `"${String(v).replace(/"/g, '""')}"` : v)).join(','));
    }
    download('\uFEFF' + lines.join('\r\n'), 'stzb-attendance.csv', 'text/csv');
    toast('已导出 CSV（可用 Excel 打开）');
  }

  function download(content, filename, type) {
    const blob = new Blob([content], { type: type + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- 提示 ----------
  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  // ---------- 事件 ----------
  function bind() {
    $('#importFile').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importFile(f);
      e.target.value = '';
    });
    $('#exportJson').addEventListener('click', exportJson);
    $('#exportCsv').addEventListener('click', exportCsv);

    $('#search').addEventListener('input', (e) => { state.search = e.target.value; renderMembers(); });
    $('#groupFilter').addEventListener('change', (e) => { state.group = e.target.value; renderMembers(); });

    const bindTh = (id, key) => {
      $(id).addEventListener('change', (e) => {
        state.thresholds[key] = Math.max(0, Number(e.target.value) || 0);
        renderCards(); renderMembers(); renderGroups();
      });
    };
    bindTh('#thMain', 'main');
    bindTh('#thSiege', 'siege');
    bindTh('#thAttack', 'attack');

    document.querySelectorAll('#memberTable th[data-key]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.key;
        if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sortKey = key; state.sortDir = key === 'name' || key === 'group' ? 'asc' : 'desc'; }
        renderMembers();
      });
    });

    // 拖拽导入
    document.addEventListener('dragover', (e) => { e.preventDefault(); });
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) importFile(f);
    });
  }

  // ---------- 启动 ----------
  state.data = load();
  bind();
  renderAll();
})();
