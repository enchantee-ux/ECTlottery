// 同儕回饋補強的測試：至少指定四位、回報合作不多、未滿三份不結算、提醒信
const assert = require('assert');
const { seed } = require('./seed');

const { be, tokens, call } = seed();
const ok = r => { assert(r.ok, r.error); return r.data; };
const boot = id => ok(call('boot', { token: tokens[id] }));
const dash = () => ok(call('dashboard', { token: tokens.E000 }));

// 至少四位
let mgr = boot('E001'), rep = mgr.reports[0];
assert.strictEqual(rep.need, 4);
assert.strictEqual(rep.raters.length, 4);
assert(!call('assign', { token: tokens.E001, target: rep.id, raters: rep.raters.slice(0, 3) }).ok, '三位不夠');

// 被指定的人回報合作不多
const x = rep.raters[rep.raters.length - 1];
const outsider = rep.pool.filter(p => rep.raters.indexOf(p.id) < 0)[0];
assert(!call('save', { token: tokens[outsider.id], form: 'peer', target: rep.id, answers: { na: true } }).ok, '沒被指定的人不能回報');
ok(call('save', { token: tokens[x], form: 'peer', target: rep.id, answers: { na: true } }));
const mine = boot(x).peers.filter(p => p.id === rep.id)[0];
assert(mine.na && !mine.answers, '回報後標示合作不多');
assert.notStrictEqual(boot(x).tasks.peer, 'todo', '回報後這一項算處理完');
assert.notStrictEqual(boot('E003').tasks.peer, 'wait', '有人回報不會把同儕回饋重新鎖住');

// 主管要改指定
mgr = boot('E001'); rep = mgr.reports.filter(r => r.id === rep.id)[0];
assert.strictEqual(mgr.tasks.assign, 'todo');
assert.deepStrictEqual(rep.declined, [x]);
assert(/合作不多/.test(call('assign', { token: tokens.E001, target: rep.id, raters: rep.raters }).error), '不能再選回報的人');
const perDept = {}; rep.raters.filter(id => id !== x).forEach(id => { const d = rep.pool.filter(p => p.id === id)[0].dept; perDept[d] = (perDept[d] || 0) + 1; });
const sub = rep.pool.filter(p => rep.raters.indexOf(p.id) < 0 && (perDept[p.dept] || 0) < 2 && p.dept !== rep.dept)[0];
const next = rep.raters.filter(id => id !== x).concat([sub.id]);
ok(call('assign', { token: tokens.E001, target: rep.id, raters: next }));
assert.strictEqual(boot('E001').tasks.assign, 'done');

// 三份有效：照常結算，並列出還沒填的人
let p = dash().people.filter(q => q.id === rep.id)[0];
assert.strictEqual(p.peerGap.have, 3);
assert(!p.score.pending && p.suggested, '滿三份就結算');
assert.deepStrictEqual(p.peerGap.waiting, [sub.name]);

// 未滿三份：不結算，執行長可以直接給等第
const sh = be.sheets['同儕評'], H = sh.data[0], iTo = H.indexOf('對象編號'), iNa = H.indexOf('無法評分');
let kept = 0;
sh.data = sh.data.filter((r, i) => i === 0 || r[iTo] !== rep.id || r[iNa] === '是' || ++kept <= 2);
be.expireCache();
let d = dash(); p = d.people.filter(q => q.id === rep.id)[0];
assert.strictEqual(p.peerGap.have, 2);
assert(p.score.pending && p.score.total !== null && !p.suggested && !p.final, '未滿三份不給等第');
assert(/尚未結算/.test(p.score.note));
assert.strictEqual(d.dist.S + d.dist.A + d.dist.B + d.dist.C, d.ratedCount - 1 - d.people.filter(q => q.rated && q.score.total === null).length);
d = ok(call('setFinal', { token: tokens.E000, id: rep.id, grade: 'B' }));
assert.strictEqual(d.people.filter(q => q.id === rep.id)[0].final, 'B');

// 回報的人改為填寫
ok(call('save', { token: tokens[x], form: 'peer', target: rep.id, answers: { p1: 4, p2: 4, p3: 4, p4: 4, praise: '可靠' } }));
assert(!boot('E001').reports.filter(r => r.id === rep.id)[0].declined.length);

// 提醒信
const setting = (k, v) => { const rows = be.sheets['設定'].data; const r = rows.filter(a => a[0] === k)[0]; if (r) r[1] = v; else rows.push([k, v, '']); be.expireCache(); };
const iso = n => { const t = new Date(); t.setDate(t.getDate() + n); return t.getFullYear() + '-' + (t.getMonth() + 1) + '-' + t.getDate(); };
setting('系統連結', 'https://example.test/app');
setting('截止日', iso(5));
let n0 = be.outbox.length;
assert.strictEqual(be.api.sendReminders_(false).reason, 'notday');
setting('截止日', iso(3));
let r = be.api.sendReminders_(false);
assert(r.sent >= 2 && !r.failed.length, '該寄的有寄');
const mails = be.outbox.slice(n0);
assert.strictEqual(mails.length, r.sent);
const m6 = mails.filter(m => m.to === 'e006@example.com')[0];
assert(m6 && /自評/.test(m6.body) && /還有 3 天/.test(m6.body) && /example\.test\/app/.test(m6.body) && /MAYO/.test(m6.body));
mails.forEach(m => assert(!/年終|獎金|薪/.test(m.subject + m.body), '提醒信不提年終與薪資'));
const done = dash().people.filter(q => Object.keys(q.tasks).every(k => q.tasks[k] !== 'todo')).length;
assert(done > 0 && mails.length <= 17 - done, '已完成的人不會收到');
assert.strictEqual(be.api.sendReminders_(false).reason, 'already');
n0 = be.outbox.length; r = be.api.sendReminders_(true); assert.strictEqual(be.outbox.length - n0, r.sent);
setting('開放填寫', '否');
assert.strictEqual(be.api.sendReminders_(true).reason, 'closed');
console.log('peers ok', { reminders: mails.length });
