// 本機測試用的虛構名冊與作答，姓名皆為範例。
const { createBackend } = require('./mock');

function seed({ fill = true } = {}) {
  const be = createBackend();
  be.api.setup();
  const roster = be.sheets['名冊'];
  roster.data = [roster.data[0]];
  const add = (id, name, dept, title, mgr, joined, role, lang) => roster.data.push([id, name, dept, title, mgr, joined, role, id.toLowerCase() + '@example.com', lang || '', '', '']);
  add('E000', '範例執行長', '管理', '執行長', '', '2015-01-01', '執行長');
  const depts = ['行銷', '設計', '生產', '銷售'];
  let n = 0;
  depts.forEach((d, di) => {
    const mgr = 'E' + String(++n).padStart(3, '0');
    add(mgr, d + '主管', d, d + '主管', '範例執行長', '2018-05-01', '');
    for (let i = 1; i <= 3; i++) {
      const id = 'E' + String(++n).padStart(3, '0');
      const joined = (di === 3 && i === 3) ? '2026-11-01' : '2022-0' + (i + 1) + '-15';
      add(id, d + '同仁' + i, d, d + '專員', mgr, joined, '', (di === 2 && i === 1) ? 'vi' : '');
    }
  });
  be.sheets['設定'].data.forEach(r => {
    if (r[0] === '年度') r[1] = 2026;
    if (r[0] === '截止日') r[1] = '2026-12-11';
    if (r[0] === '月數_S') r[1] = 3; if (r[0] === '月數_A') r[1] = 2; if (r[0] === '月數_B') r[1] = 1.5; if (r[0] === '月數_C') r[1] = 1;
  });
  const call = (action, payload) => JSON.parse(be.api.api(action, JSON.stringify(payload)));
  const lastCode = () => be.outbox[be.outbox.length - 1].subject.match(/\d{6}/)[0];
  const tokens = {};
  roster.data.slice(1).forEach(r => {
    const email = r[7];
    if (!call('requestCode', { email }).ok) throw new Error('requestCode failed');
    tokens[r[0]] = call('verifyCode', { email, code: lastCode() }).data.token;
  });

  // 主管為每位直屬同仁指定三位同儕評核人
  const assignAll = () => Object.keys(tokens).forEach(id => {
    const b = call('boot', { token: tokens[id] }).data;
    b.reports.forEach((r, i) => {
      const same = r.pool.filter(x => x.dept === r.dept).slice(0, 2), per = {};
      const cross = r.pool.filter(x => x.dept !== r.dept);
      const picks = same.slice();
      for (let k = 0; picks.length < 3 && k < cross.length; k++) {
        const c = cross[(k + i * 2) % cross.length];
        if (picks.indexOf(c) < 0 && (per[c.dept] || 0) < 2) { picks.push(c); per[c.dept] = (per[c.dept] || 0) + 1; }
      }
      const res = call('assign', { token: tokens[id], target: r.id, raters: picks.map(x => x.id) });
      if (!res.ok) throw new Error(res.error);
    });
  });
  if (fill) {
    assignAll();
    let seedN = 7;
    const rnd = () => { seedN = (seedN * 1103515245 + 12345) % 2147483648; return seedN / 2147483648; };
    const pick = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
    const must = (r) => { if (!r.ok) throw new Error(r.error); return r.data; };
    const ids = Object.keys(tokens).filter(id => id !== 'E000');
    ids.forEach((id, idx) => {
      const t = tokens[id];
      const b = must(call('boot', { token: t }));
      const level = 2 + (idx % 4); // 讓不同人有不同水準
      const scores = (keys, base) => Object.fromEntries(keys.map(k => [k, Math.max(1, Math.min(5, base + pick(-1, 1)))]));
      const sk = ['r1', 'r2', 'r3', 's1', 's2', 't1', 't2', 'a1', 'a2'];
      if (b.tasks.self !== 'na' && id !== 'E006') {
        must(call('save', { token: t, form: 'self', target: id, answers: Object.assign(scores(sk, Math.min(5, level + 1)),
          { ach: '完成中秋檔期的出貨規劃\n導入新的排程表', challenge: '旺季人手不足', goal: '學會數據分析', support: '希望有更多跨部門交流' }) }));
      }
      if (b.tasks.voice !== 'na' && id !== 'E007') {
        const low = id === 'E003' || id === 'E010';
        must(call('save', { token: t, form: 'voice', target: id, answers: Object.assign(
          scores(['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9'], low ? 2 : 4),
          { happy: '春酒抽到獎', change: low ? '希望排班可以更早公布' : '', private: low ? '=最近在考慮其他機會' : '', meet: low ? '是' : '否' }) }));
      }
      b.peers.forEach(p => must(call('save', { token: t, form: 'peer', target: p.id,
        answers: Object.assign(scores(['p1', 'p2', 'p3', 'p4'], 4), { praise: '很可靠，交辦的事都有回音', better: '' }) })));
      const others = b.directory.filter((_, i) => (i + idx) % 4 === 0).slice(0, 3);
      must(call('save', { token: t, form: 'thanks', answers: { cards: others.map(o => ({ to: o.id, tag: '最佳支援', text: '謝謝你在旺季幫忙頂班' })) } }));
      b.reports.forEach((r, ri) => must(call('save', { token: t, form: 'mgr', target: r.id, answers: Object.assign(
        scores(sk, 3 + ((idx + ri) % 3)), { kpi: (r.kpis[0] || '指標') + '：達成 105%', strength: '主動補位，品質穩定', improve: '回報可以更即時',
          develop: '建議接手新人訓練', risk: ri === 2 ? '高' : '低', keyman: ri === 0 ? '是' : '否' }) })));
    });
    const ceo = must(call('boot', { token: tokens.E000 }));
    ceo.reports.forEach((r, i) => must(call('save', { token: tokens.E000, form: 'mgr', target: r.id, answers: {
      r1: 5, r2: 5 - (i % 2), r3: 4, s1: 5, s2: 4, t1: 4 + (i % 2), t2: 4, a1: 5, a2: 5,
      kpi: '', strength: '帶領部門達成年度目標', improve: '', develop: '', risk: '低', keyman: '是' } })));
  }
  return { be, tokens, call, lastCode };
}

module.exports = { seed };
