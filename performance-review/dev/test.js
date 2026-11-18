// 本機測試：node dev/test.js [截圖輸出資料夾]
const assert = require('assert');
const path = require('path');
const { seed } = require('./seed');
const { start } = require('./server');

function logic() {
  const { be, tokens, call, lastCode } = seed();
  const dash = call('dashboard', { token: tokens.E000 });
  assert(dash.ok, dash.error);
  const d = dash.data;
  const rated = d.people.filter(p => p.rated);
  assert.strictEqual(d.people.length, 16);
  assert.strictEqual(rated.length, 15, '到職未滿三個月者不參加評等');
  assert(d.dist.S <= d.caps.S && d.dist.A <= d.caps.A, '等第未超過上限');
  assert.strictEqual(d.dist.S + d.dist.A + d.dist.B + d.dist.C, rated.filter(p => p.score.total !== null).length);
  rated.forEach(p => assert(p.score.total === null || (p.score.total >= 20 && p.score.total <= 100)));
  const e003 = d.people.find(p => p.id === 'E003');
  assert.strictEqual(e003.light, 'red');
  assert.strictEqual(e003.voice.private, '=最近在考慮其他機會', '以 = 開頭的文字原樣保存，不會變成公式');
  assert(d.people.find(p => p.id === 'E007').flags.some(f => f.text.includes('尚未填寫心聲')));
  assert(d.people.find(p => p.id === 'E006').score.note.includes('未填自評'));

  // 權限
  assert(!call('dashboard', { token: tokens.E002 }).ok, '同仁不能看儀表板');
  assert.strictEqual(call('boot', { token: 'nope' }).code, 'SESSION');
  assert(!call('requestCode', { email: 'stranger@example.com' }).ok, '名冊外的 Email 不能登入');
  assert(call('requestCode', { email: ' E002@Example.com ' }).ok, 'Email 不分大小寫');
  for (let i = 0; i < 5; i++) assert(!call('verifyCode', { email: 'e002@example.com', code: '999999' }).ok);
  assert(!call('verifyCode', { email: 'e002@example.com', code: lastCode() }).ok, '錯誤五次後驗證碼作廢');
  assert(call('logout', { token: tokens.E015 }).ok);
  assert.strictEqual(call('boot', { token: tokens.E015 }).code, 'SESSION', '登出後 session 失效');
  const vi = call('save', { token: tokens.E002, lang: 'vi', form: 'self', target: 'E002', answers: {} });
  assert(/Chưa/.test(vi.error), '越南文錯誤訊息');
  assert.strictEqual(call('boot', { token: tokens.E010 }).data.me.lang, 'vi');
  // 越南文作答會附上中文翻譯；本人回來修改時只看到原文
  const viSelf = Object.assign({}, call('boot', { token: tokens.E010 }).data.self, { ach: 'Hoàn thành kế hoạch giao hàng mùa Trung thu' });
  assert(call('save', { token: tokens.E010, form: 'self', target: 'E010', answers: viSelf }).ok);
  assert.strictEqual(call('boot', { token: tokens.E010 }).data.self.ach, viSelf.ach);
  const seenByMgr = call('boot', { token: tokens.E009 }).data.reports.find(r => r.id === 'E010').self.ach;
  assert(seenByMgr.startsWith(viSelf.ach) && seenByMgr.includes('【中文翻譯】'), '主管看到原文加中文翻譯');
  assert(call('save', { token: tokens.E010, form: 'self', target: 'E010', answers: viSelf }).ok);
  assert.strictEqual(call('boot', { token: tokens.E009 }).data.reports.find(r => r.id === 'E010').self.ach.split('【中文翻譯】').length, 2, '重送不會重複翻譯');
  assert(!call('boot', { token: tokens.E002 }).data.self.ach.includes('【中文翻譯】'), '中文作答不翻譯');
  // 指定同儕
  assert(!call('assign', { token: tokens.E002, target: 'E003', raters: ['E004'] }).ok, '非主管不能指定');
  assert(!call('assign', { token: tokens.E001, target: 'E002', raters: ['E003'] }).ok, '不足三位');
  assert(!call('assign', { token: tokens.E001, target: 'E002', raters: ['E001', 'E002', 'E000'] }).ok, '不能指定本人、主管或執行長');
  const b2 = call('boot', { token: tokens.E002 }).data;
  assert.strictEqual(JSON.stringify(b2).includes('最近在考慮'), false, '同仁看不到別人的心聲');
  assert.strictEqual(b2.received, null, '感謝卡未公開前看不到');
  const b1 = call('boot', { token: tokens.E001 }).data;
  assert.strictEqual(JSON.stringify(b1).includes('最近在考慮'), false, '主管看不到部屬的心聲');
  assert.strictEqual(b1.reports.length, 3);
  const scores = { r1: 5, r2: 5, r3: 5, s1: 5, s2: 5, t1: 5, t2: 5, a1: 5, a2: 5, strength: 'x', risk: '低', keyman: '否' };
  assert(!call('save', { token: tokens.E002, form: 'mgr', target: 'E003', answers: scores }).ok, '不能評非直屬同仁');
  assert(!call('save', { token: tokens.E002, form: 'self', target: 'E002', answers: { r1: 9 } }).ok, '分數需在 1–5');
  assert(!call('setFinal', { token: tokens.E001, id: 'E002', grade: 'S' }).ok);

  // 校準
  const someone = rated.find(p => p.suggested === 'B');
  assert(call('setFinal', { token: tokens.E000, id: someone.id, grade: 'A' }).ok);
  const after = call('dashboard', { token: tokens.E000 }).data.people.find(p => p.id === someone.id);
  assert.strictEqual(after.final, 'A'); assert.strictEqual(after.months, 2); assert(after.calibrated);
  assert(call('setFinal', { token: tokens.E000, id: someone.id, grade: '' }).ok);

  // 重送不會產生重複列；截止後不可修改；匯出結果
  const before = be.sheets['自評'].data.length;
  const mine = call('boot', { token: tokens.E002 }).data.self;
  assert(call('save', { token: tokens.E002, form: 'self', target: 'E002', answers: mine }).ok);
  assert.strictEqual(be.sheets['自評'].data.length, before);
  be.api.writeResults();
  assert.strictEqual(be.sheets['結果'].data.length, 1 + rated.length);
  be.sheets['設定'].data.find(r => r[0] === '開放填寫')[1] = '否';
  assert(!call('save', { token: tokens.E002, form: 'self', target: 'E002', answers: mine }).ok);
  console.log('logic ok', JSON.stringify(d.dist), 'caps', JSON.stringify(d.caps),
    'lights', ['red', 'yellow', 'green'].map(c => d.people.filter(p => p.light === c).length).join('/'));
}

async function ui(outDir) {
  const { chromium } = require('playwright');
  const { server, tokens, call, lastCode } = await start(8766, { fill: false });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = async name => { if (outDir) await page.screenshot({ path: path.join(outDir, name + '.png'), fullPage: true }); };
  const fillScores = async () => {
    const groups = await page.locator('.scale').count();
    for (let i = 0; i < groups; i++) await page.locator('.scale').nth(i).locator('button').nth(3).click();
  };
  const noOverflow = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '頁面不可橫向捲動');

  // 同仁：自評
  await page.goto('http://localhost:8766/');
  await page.waitForSelector('#lg_email'); await shot('00-login');
  await page.fill('#lg_email', 'nobody@example.com'); await page.click('[data-login="send"]');
  await page.waitForSelector('.toast'); await page.waitForSelector('#lg_email');
  await page.fill('#lg_email', 'e002@example.com'); await page.click('[data-login="send"]');
  await page.waitForSelector('#lg_code'); await page.fill('#lg_code', lastCode()); await page.click('[data-login="verify"]');
  await page.waitForSelector('.task'); await shot('01-home'); await noOverflow();
  assert.strictEqual(await page.locator('[data-go="peerList"] .pill').innerText(), '選填');
  await page.click('[data-go="self"]');
  await page.click('[data-submit]');
  assert(await page.locator('.q.miss').count() > 0, '未填完會標示必填');
  await fillScores();
  await page.fill('#f_ach', '完成中秋檔期出貨規劃'); await page.fill('#f_goal', '學會數據分析');
  await shot('02-self'); await noOverflow();
  await page.click('[data-submit]'); await page.waitForSelector('.task');
  // 心聲
  await page.click('[data-go="voice"]'); await fillScores();
  await page.locator('[data-k="v9"][data-v="2"]').click();
  await page.locator('[data-k="meet"][data-c="是"]').click();
  await page.click('[data-submit]'); await page.waitForSelector('.task');
  // 同儕
  await page.click('[data-go="peerList"]'); await shot('03-peers');
  for (let i = 0; i < 3; i++) {
    await page.selectOption('#peerAdd', { index: 1 }); await fillScores();
    if (i === 0) await page.fill('#f_praise', '很可靠');
    await page.click('[data-submit]'); await page.waitForSelector('#peerAdd');
  }
  await shot('03b-peers-done');
  await page.click('[data-go="home"]');
  // 感謝卡
  await page.click('[data-go="thanks"]');
  for (let i = 0; i < 3; i++) { await page.selectOption('#tk_to' + i, { index: i + 2 }); await page.fill('#tk_tx' + i, '謝謝你幫忙頂班'); }
  await page.locator('[data-card="0"][data-tag]').first().click();
  await shot('04-thanks'); await noOverflow();
  await page.click('[data-submit]'); await page.waitForSelector('.task');
  await shot('05-home-progress');
  const me = call('boot', { token: tokens.E002 }).data;
  assert.strictEqual(me.tasks.self, 'done'); assert.strictEqual(me.tasks.voice, 'done'); assert.strictEqual(me.tasks.thanks, 'done');
  assert.strictEqual(me.peers.filter(p => p.answers).length, 3); assert.strictEqual(me.tasks.peer, 'done');

  // 越南文
  await page.click('[data-lang="vi"]'); await page.waitForSelector('text=Tự đánh giá'); await shot('07-home-vi');
  await page.click('[data-go="voice"]'); await page.waitForSelector('text=Mong muốn gắn bó'); await shot('08-voice-vi'); await noOverflow();
  await page.click('[data-go="home"]'); await page.click('[data-lang="zh"]');
  // 主管評
  await page.evaluate(tk => localStorage.setItem('pr:session', tk), tokens.E001);
  await page.goto('http://localhost:8766/');
  await page.waitForSelector('.task'); await page.click('[data-go="assignList"]');
  await page.locator('[data-assign]').first().click();
  for (let i = 0; i < 3; i++) await page.locator('[data-pick]').nth(i).click();
  await shot('06a-assign'); await noOverflow();
  await page.click('[data-submit]'); await page.waitForSelector('[data-assign]');
  assert.strictEqual(call('boot', { token: tokens.E001 }).data.reports[0].raters.length, 3);
  assert.strictEqual(call('boot', { token: tokens.E003 }).data.peers.filter(p => p.assigned).length, 1, '被指定的人會看到對象');
  await page.click('[data-go="home"]'); await page.click('[data-go="mgrList"]');
  await page.locator('[data-report]').first().click(); await fillScores();
  await page.fill('#kpi0', '營收成長 12%'); await page.fill('#f_strength', '主動補位');
  await page.locator('[data-k="risk"][data-c="中"]').click(); await page.locator('[data-k="keyman"][data-c="是"]').click();
  await page.locator('details summary').click(); await shot('06-manager'); await noOverflow();
  await page.click('[data-submit]'); await page.waitForSelector('[data-report]');
  assert.strictEqual(call('boot', { token: tokens.E001 }).data.reports[0].answers.kpi, '線上商城營收與轉換率：營收成長 12%');

  await browser.close(); server.close();

  // 儀表板：用填滿的資料
  const full = await start(8767);
  const b2 = await chromium.launch();
  const p2 = await (await b2.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  p2.on('pageerror', e => errors.push(String(e)));
  await p2.goto('http://localhost:8767/');
  await p2.evaluate(tk => localStorage.setItem('pr:session', tk), full.tokens.E000);
  await p2.reload();
  await p2.waitForSelector('[data-go="dash"]'); await p2.click('[data-go="dash"]');
  await p2.waitForSelector('.tabs');
  const tabs = ['progress', 'result', 'care', 'thanks', 'mood'];
  for (let i = 0; i < tabs.length; i++) {
    await p2.click('[data-tab="' + tabs[i] + '"]');
    if (outDir) await p2.screenshot({ path: path.join(outDir, '1' + i + '-dash-' + tabs[i] + '.png'), fullPage: true });
    assert(await p2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), tabs[i] + ' 不可橫向捲動');
  }
  await p2.click('[data-tab="result"]');
  await p2.locator('select[data-final]').nth(5).selectOption('A');
  await p2.waitForSelector('.toast');
  await p2.click('[data-tab="care"]'); await p2.locator('[data-person]').first().click();
  await p2.waitForSelector('.quote');
  if (outDir) await p2.screenshot({ path: path.join(outDir, '20-person.png'), fullPage: true });
  await b2.close(); full.server.close();
  assert.deepStrictEqual(errors, []);
  console.log('ui ok');
}

logic();
ui(process.argv[2]).catch(e => { console.error(e); process.exit(1); });
