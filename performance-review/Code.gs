/**
 * 樂朗奇 年度績效評核系統 — Google Apps Script 後端
 * 綁定在一份 Google 試算表上，資料全部存在該試算表。
 * 部署方式請見 README.md。
 */

const SHEETS = {
  settings: '設定', roster: '名冊', kpi: '部門指標',
  self: '自評', mgr: '主管評', peer: '同儕評', thanks: '感謝卡', voice: '心聲',
  calib: '校準', result: '結果'
};

const ROSTER_HEADERS = ['編號', '姓名', '部門', '職稱', '直屬主管', '到職日', '角色', 'Email', '語言', '參加評等', '同儕評核人'];
const KEY_HEADERS = ['年度', '時間', '填寫人編號', '填寫人', '對象編號', '對象'];
const SCALE = ['待加強', '尚可', '符合期待', '超出期待', '表現卓越'];
const AGREE = ['非常不同意', '不同意', '普通', '同意', '非常同意'];
const THANKS_TAGS = ['最佳支援', '專業可靠', '溫暖貼心', '創意點子', '使命必達'];
const GRADES = ['S', 'A', 'B', 'C'];

const DEFAULT_SETTINGS = [
  ['年度', new Date().getFullYear(), '本次評核的年度。每年年底改成新年度即可重新開始，舊資料會保留'],
  ['開放填寫', '是', '是／否。填「否」後同仁只能看、不能送出'],
  ['截止日', '', '顯示給同仁看的截止日期，例如 2026-12-11'],
  ['公開感謝卡', '否', '是／否。填「是」後同仁可以在自己的頁面看到收到的感謝卡'],
  ['評核基準日', '', '計算年資用，空白代表該年度 12 月 31 日'],
  ['新進門檻月數', 3, '到職未滿這個月數的同仁不參加評等，只填心聲問卷與感謝卡'],
  ['權重_工作成果', 50, '四個構面的權重，合計 100'],
  ['權重_專業成長', 20, ''],
  ['權重_團隊合作', 20, ''],
  ['權重_態度價值', 10, ''],
  ['來源_主管', 60, '三種評分來源的權重，合計 100'],
  ['來源_同儕', 25, ''],
  ['來源_自評', 15, ''],
  ['同儕最少人數', 3, '主管要為每位直屬同仁指定的同儕評核人數；實際評分者少於此人數時不計同儕分數，權重併回主管評'],
  ['同儕回饋最少人數', 0, '除了主管指定的對象外，每位同仁至少還要自選幾位同事填寫同儕回饋。0 代表只需完成指定對象'],
  ['登入有效天數', 30, '同仁用 Email 驗證碼登入後，幾天內不必重新登入'],
  ['感謝卡最少張數', 3, '每人至少要寫給幾位同事'],
  ['S比例上限', 10, '百分比。S 等第人數上限'],
  ['A比例上限', 30, '百分比。A 等第人數上限'],
  ['S門檻', 90, '總分達到此分數才可能列為 S'],
  ['A門檻', 80, '總分達到此分數才可能列為 A'],
  ['C門檻', 60, '總分低於此分數列為 C'],
  ['月數_S', '', '各等第對應的年終月數，由執行長每年填入'],
  ['月數_A', '', ''],
  ['月數_B', '', ''],
  ['月數_C', '', '']
];

const DEFAULT_KPIS = [
  ['管理', '行政與財務作業準時率', '流程改善件數', '內部同仁滿意度'],
  ['行銷', '線上商城營收與轉換率', 'LINE 好友與互動成長', '活動檔期目標達成率'],
  ['設計', '專案準時交付率', '新品與客製設計件數', '內外部滿意度'],
  ['生產', '產量達成率', '良率與報廢率', '食安與衛生稽核結果'],
  ['包裝', '出貨正確率', '準時出貨率', '包材損耗率'],
  ['銷售', '成交盒數', '試吃成交率', '顧客評價'],
  ['企業業務', '成交金額', '新客戶數', '客戶回購率']
];

const DIMENSIONS = [
  { key: 'result', name: '工作成果', weight: '權重_工作成果', items: [
    { k: 'r1', label: '目標達成', desc: '完成年度被交付的目標與任務' },
    { k: 'r2', label: '工作品質', desc: '產出正確、細緻，很少需要返工' },
    { k: 'r3', label: '效率與時效', desc: '在期限內完成，善用時間與資源' }] },
  { key: 'skill', name: '專業能力與成長', weight: '權重_專業成長', items: [
    { k: 's1', label: '專業能力', desc: '具備職務所需的知識與技術' },
    { k: 's2', label: '學習與解決問題', desc: '主動學習新事物，遇到問題能找出解法' }] },
  { key: 'team', name: '團隊合作', weight: '權重_團隊合作', items: [
    { k: 't1', label: '溝通協作', desc: '溝通清楚，與同事、跨部門配合順暢' },
    { k: 't2', label: '支援他人', desc: '願意分享與補位，讓團隊更好' }] },
  { key: 'attitude', name: '態度與品牌價值', weight: '權重_態度價值', items: [
    { k: 'a1', label: '責任感與主動性', desc: '說到做到，主動發現並處理問題' },
    { k: 'a2', label: '品牌價值', desc: '以顧客與品牌為先，維護樂朗奇的品質與形象' }] }
];

const SCALE_VI = ['Cần cải thiện', 'Tạm được', 'Đạt kỳ vọng', 'Vượt kỳ vọng', 'Xuất sắc'];
const AGREE_VI = ['Rất không đồng ý', 'Không đồng ý', 'Bình thường', 'Đồng ý', 'Rất đồng ý'];
const GROUP_VI = { '我的這一年': 'Một năm của tôi', '工作成果': 'Kết quả công việc', '專業能力與成長': 'Năng lực chuyên môn và phát triển',
  '團隊合作': 'Làm việc nhóm', '態度與品牌價值': 'Thái độ và giá trị thương hiệu', '回顧與展望': 'Nhìn lại và hướng tới',
  '工作': 'Công việc', '團隊': 'Đội nhóm', '公司': 'Công ty', '想說的話': 'Điều muốn nói' };
const FIELD_VI = {
  ach: ['Ba thành quả lớn nhất trong năm', 'Những việc bạn tự hào nhất và muốn được ghi nhận, hãy viết cụ thể'],
  r1: ['Hoàn thành mục tiêu', 'Hoàn thành các mục tiêu và nhiệm vụ được giao trong năm'],
  r2: ['Chất lượng công việc', 'Sản phẩm chính xác, tỉ mỉ, ít khi phải làm lại'],
  r3: ['Hiệu suất và đúng hạn', 'Hoàn thành đúng thời hạn, sử dụng tốt thời gian và nguồn lực'],
  s1: ['Năng lực chuyên môn', 'Có kiến thức và kỹ năng cần thiết cho công việc'],
  s2: ['Học hỏi và giải quyết vấn đề', 'Chủ động học điều mới, gặp vấn đề biết tìm cách giải quyết'],
  t1: ['Giao tiếp và phối hợp', 'Giao tiếp rõ ràng, phối hợp tốt với đồng nghiệp và các bộ phận khác'],
  t2: ['Hỗ trợ người khác', 'Sẵn sàng chia sẻ và giúp đỡ để cả nhóm tốt hơn'],
  a1: ['Trách nhiệm và chủ động', 'Nói là làm, chủ động phát hiện và xử lý vấn đề'],
  a2: ['Giá trị thương hiệu', 'Đặt khách hàng và thương hiệu lên trước, giữ gìn chất lượng và hình ảnh của enchantée'],
  challenge: ['Thử thách lớn nhất', 'Việc khó khăn nhất trong năm và bạn đã đối mặt thế nào'],
  goal: ['Mục tiêu năm tới', 'Điều bạn muốn đạt được hoặc học được nhất trong năm tới'],
  support: ['Hỗ trợ cần thiết', 'Bạn mong công ty hoặc quản lý hỗ trợ điều gì'],
  p1: ['Giao tiếp thuận lợi', 'Khi làm việc cùng, đồng nghiệp này giao tiếp rõ ràng, dễ phối hợp'],
  p2: ['Đáng tin cậy', 'Đã hứa là làm, giao việc đúng hạn'],
  p3: ['Chủ động hỗ trợ', 'Khi tôi cần giúp, đồng nghiệp này sẵn sàng hỗ trợ'],
  p4: ['Chuyên môn vững', 'Giao việc cho đồng nghiệp này tôi rất yên tâm'],
  praise: ['Điểm đáng ghi nhận', 'Viết một câu về điều bạn quý nhất ở đồng nghiệp này'],
  better: ['Có thể tốt hơn', 'Viết một câu về điều bạn mong đồng nghiệp điều chỉnh'],
  v1: ['Cảm giác thành tựu', 'Công việc năm nay mang lại cho tôi cảm giác thành tựu'],
  v2: ['Phát huy sở trường', 'Sở trường của tôi được phát huy tốt trong công việc'],
  v3: ['Học hỏi và phát triển', 'Tôi có cơ hội học hỏi và phát triển ở công ty'],
  v4: ['Làm việc nhóm', 'Tôi làm việc vui vẻ với đồng nghiệp trong nhóm'],
  v5: ['Quản lý hỗ trợ', 'Quản lý của tôi hỗ trợ và tôn trọng tôi'],
  v6: ['Khối lượng công việc', 'Khối lượng công việc và áp lực nằm trong khả năng của tôi'],
  v7: ['Đối xử công bằng', 'Đóng góp của tôi được ghi nhận và tôi được đối xử công bằng'],
  v8: ['Sẵn sàng giới thiệu', 'Tôi sẽ giới thiệu bạn bè đến làm việc tại enchantée'],
  v9: ['Mong muốn gắn bó', 'Một năm nữa, tôi vẫn muốn làm việc tại enchantée'],
  happy: ['Điều vui nhất năm nay', ''],
  change: ['Một điều muốn thay đổi nhất', 'Nếu có thể thay đổi một điều ở công ty hoặc trong công việc'],
  private: ['Điều muốn nói với Giám đốc điều hành', 'Bạn có thể nói bất cứ điều gì, chỉ Giám đốc điều hành xem được'],
  meet: ['Muốn gặp riêng Giám đốc điều hành', '']
};

// 依請求語言回傳錯誤訊息；LANG 在每次 api() 呼叫時設定
let LANG = 'zh';
function err_(zh, vi, code) {
  const e = new Error(LANG === 'vi' && vi ? vi : zh);
  e.code = code || '';
  return e;
}
function label_(f) { return LANG === 'vi' && FIELD_VI[f.k] ? FIELD_VI[f.k][0] : f.label; }

function scoreFields_() {
  const out = [];
  DIMENSIONS.forEach(d => d.items.forEach(it => out.push(
    { k: it.k, label: it.label, desc: it.desc, type: 'score', req: true, group: d.name, scale: SCALE })));
  return out;
}

const FORMS = {
  self: { sheet: SHEETS.self, fields: [
    { k: 'ach', label: '年度三大成果', desc: '今年最有成就感、最想被看見的事，請盡量具體', type: 'text', req: true, group: '我的這一年' }
  ].concat(scoreFields_()).concat([
    { k: 'challenge', label: '最大挑戰', desc: '今年遇到最困難的事，以及你怎麼面對', type: 'text', group: '回顧與展望' },
    { k: 'goal', label: '明年目標', desc: '明年最想達成或學會的事', type: 'text', req: true, group: '回顧與展望' },
    { k: 'support', label: '需要的支援', desc: '希望公司或主管提供什麼協助', type: 'text', group: '回顧與展望' }]) },
  mgr: { sheet: SHEETS.mgr, fields: scoreFields_().concat([
    { k: 'kpi', label: '關鍵數字', desc: '填入今年的實際數字，沒有可留白', type: 'kpi', group: '成果佐證' },
    { k: 'strength', label: '優點與貢獻', desc: '今年最值得肯定的具體事例', type: 'text', req: true, group: '評語' },
    { k: 'improve', label: '待改善', desc: '最需要調整的一到兩件事', type: 'text', group: '評語' },
    { k: 'develop', label: '明年發展建議', desc: '建議的目標、訓練或職務調整', type: 'text', group: '評語' },
    { k: 'risk', label: '離職風險觀察', desc: '依你平日的觀察，僅執行長可見', type: 'choice', options: ['低', '中', '高'], req: true, group: '留才判斷' },
    { k: 'keyman', label: '關鍵人才', desc: '離開會對部門造成重大影響', type: 'choice', options: ['是', '否'], req: true, group: '留才判斷' }]) },
  peer: { sheet: SHEETS.peer, fields: [
    { k: 'p1', label: '溝通順暢', desc: '和這位同事合作時，溝通清楚、好配合', type: 'score', req: true, scale: AGREE },
    { k: 'p2', label: '值得信賴', desc: '答應的事會做到，交付準時', type: 'score', req: true, scale: AGREE },
    { k: 'p3', label: '主動支援', desc: '我需要幫忙時，願意伸出援手', type: 'score', req: true, scale: AGREE },
    { k: 'p4', label: '專業放心', desc: '交給這位同事的事讓我很放心', type: 'score', req: true, scale: AGREE },
    { k: 'praise', label: '值得肯定', desc: '一句話寫下最欣賞的地方', type: 'text' },
    { k: 'better', label: '可以更好', desc: '一句話寫下希望對方調整的地方', type: 'text' }] },
  voice: { sheet: SHEETS.voice, fields: [
    { k: 'v1', label: '成就感', desc: '今年的工作讓我有成就感', type: 'score', req: true, scale: AGREE, group: '工作' },
    { k: 'v2', label: '發揮專長', desc: '我的專長在工作上有被好好發揮', type: 'score', req: true, scale: AGREE, group: '工作' },
    { k: 'v3', label: '學習成長', desc: '我在公司有學習與成長的機會', type: 'score', req: true, scale: AGREE, group: '工作' },
    { k: 'v4', label: '團隊合作', desc: '我和團隊同事合作愉快', type: 'score', req: true, scale: AGREE, group: '團隊' },
    { k: 'v5', label: '主管支持', desc: '我的主管支持我、尊重我', type: 'score', req: true, scale: AGREE, group: '團隊' },
    { k: 'v6', label: '工作負荷', desc: '我的工作量與壓力在可以負荷的範圍', type: 'score', req: true, scale: AGREE, group: '團隊' },
    { k: 'v7', label: '公平對待', desc: '我的付出有被看見，也被公平對待', type: 'score', req: true, scale: AGREE, group: '公司' },
    { k: 'v8', label: '推薦意願', desc: '我會推薦朋友來樂朗奇工作', type: 'score', req: true, scale: AGREE, group: '公司' },
    { k: 'v9', label: '留任意願', desc: '一年後，我仍希望在樂朗奇工作', type: 'score', req: true, scale: AGREE, group: '公司' },
    { k: 'happy', label: '今年最開心的事', desc: '', type: 'text', group: '想說的話' },
    { k: 'change', label: '最想改變的一件事', desc: '如果可以改變公司或工作上的一件事', type: 'text', group: '想說的話' },
    { k: 'private', label: '想對執行長說的話', desc: '任何想法都可以，只有執行長看得到', type: 'text', group: '想說的話' },
    { k: 'meet', label: '希望與執行長一對一面談', desc: '', type: 'choice', options: ['是', '否'], req: true, group: '想說的話' }] }
};

function formHeaders_(form) {
  return KEY_HEADERS.concat(FORMS[form].fields.map(f => f.label));
}
const THANKS_HEADERS = KEY_HEADERS.concat(['標籤', '內容']);
const CALIB_HEADERS = ['年度', '編號', '姓名', '最終等第', '備註', '時間'];
const RESULT_HEADERS = ['年度', '編號', '姓名', '部門', '主管評分', '同儕評分', '同儕人數', '自評分', '總分',
  '建議等第', '最終等第', '年終月數', '關懷燈號', '關懷原因'];

/* ───────────── 試算表選單與初始化 ───────────── */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('績效評核')
    .addItem('① 初始化工作表', 'setup')
    .addItem('② 匯出評核結果', 'writeResults')
    .addToUi();
}

function setup() {
  ensureSheet_(SHEETS.settings, ['項目', '設定值', '說明']);
  const have = {};
  readTable_(SHEETS.settings).forEach(r => { have[String(r['項目'])] = true; });
  DEFAULT_SETTINGS.forEach(row => { if (!have[row[0]]) appendRow_(SHEETS.settings, row); });

  if (ensureSheet_(SHEETS.roster, ROSTER_HEADERS)) {
    appendRow_(SHEETS.roster, ['E000', '（範例）執行長', '管理', '執行長', '', '', '執行長', 'ceo@example.com', '', '', '']);
    appendRow_(SHEETS.roster, ['E001', '（範例）王主管', '行銷', '行銷主管', 'E000', '2020-03-01', '', 'manager@example.com', '', '', '']);
    appendRow_(SHEETS.roster, ['E002', '（範例）陳同仁', '行銷', '行銷專員', 'E001', '2023-06-15', '', 'staff@example.com', 'vi', '', '']);
  }
  if (ensureSheet_(SHEETS.kpi, ['部門', '指標1', '指標2', '指標3'])) {
    DEFAULT_KPIS.forEach(r => appendRow_(SHEETS.kpi, r));
  }
  ['self', 'mgr', 'peer', 'voice'].forEach(f => ensureSheet_(FORMS[f].sheet, formHeaders_(f)));
  ensureSheet_(SHEETS.thanks, THANKS_HEADERS);
  ensureSheet_(SHEETS.calib, CALIB_HEADERS);
  ensureSheet_(SHEETS.result, RESULT_HEADERS);
}

function writeResults() {
  const ctx = ctx_();
  const res = computeResults_(ctx);
  const sh = ss_().getSheetByName(SHEETS.result);
  const keep = readTable_(SHEETS.result).filter(r => String(r['年度']) !== ctx.year)
    .map(r => RESULT_HEADERS.map(h => r[h]));
  const rows = res.people.filter(p => p.rated).map(p => [ctx.year, p.id, p.name, p.dept,
    nz_(p.score.mgr), nz_(p.score.peer), p.score.peerN, nz_(p.score.self), nz_(p.score.total),
    p.suggested || '', p.final || '', p.months === null ? '' : p.months,
    { red: '紅', yellow: '黃', green: '綠' }[p.light], p.flags.map(f => f.text).join('、')]);
  sh.clearContents();
  const all = [RESULT_HEADERS].concat(keep).concat(rows.map(r => r.map(safe_)));
  sh.getRange(1, 1, all.length, RESULT_HEADERS.length).setValues(all);
}

/* ───────────── 網頁入口 ───────────── */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index').setTitle('樂朗奇 年度績效評核')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function api(action, payloadJson) {
  try {
    const p = JSON.parse(payloadJson || '{}');
    LANG = p.lang === 'vi' ? 'vi' : 'zh';
    const handlers = { requestCode: requestCode_, verifyCode: verifyCode_, logout: logout_,
      boot: boot_, save: save_, assign: assign_, dashboard: dashboard_, setFinal: setFinal_ };
    if (!handlers[action]) throw new Error('不支援的操作');
    return JSON.stringify({ ok: true, data: handlers[action](p) });
  } catch (err) {
    return JSON.stringify({ ok: false, error: String((err && err.message) || err), code: (err && err.code) || '' });
  }
}

/* ───────────── Email 驗證碼登入 ───────────── */

function normEmail_(v) { return String(v || '').trim().toLowerCase(); }
function randomDigits_(n) {
  let out = '';
  while (out.length < n) out += String(parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16));
  return out.slice(-n);
}
function props_() { return PropertiesService.getScriptProperties(); }

function requestCode_(p) {
  const email = normEmail_(p.email);
  const ctx = ctx_();
  const me = email && ctx.people.filter(x => x.email === email)[0];
  if (!me) throw err_('找不到這個 Email，請確認是否輸入正確，或洽管理部', 'Không tìm thấy email này. Vui lòng kiểm tra lại hoặc liên hệ bộ phận quản lý.');
  const cache = CacheService.getScriptCache();
  const sent = Number(cache.get('sent_' + email) || 0);
  if (sent >= 5) throw err_('驗證碼寄送次數過多，請一小時後再試', 'Bạn đã yêu cầu mã quá nhiều lần. Vui lòng thử lại sau một giờ.');
  const code = randomDigits_(6);
  cache.put('code_' + email, JSON.stringify({ code: code, tries: 0 }), 600);
  cache.put('sent_' + email, String(sent + 1), 3600);
  MailApp.sendEmail({
    to: email, name: '樂朗奇 績效評核',
    subject: '樂朗奇績效評核 登入驗證碼 ' + code,
    body: me.name + ' 您好，\n\n您的登入驗證碼是：' + code + '\n驗證碼 10 分鐘內有效，請勿提供給他人。\n\n' +
      'Mã đăng nhập của bạn là: ' + code + '\nMã có hiệu lực trong 10 phút. Vui lòng không chia sẻ cho người khác.\n\n樂朗奇 enchantée'
  });
  return { sent: true };
}

function verifyCode_(p) {
  const email = normEmail_(p.email);
  const cache = CacheService.getScriptCache();
  const raw = cache.get('code_' + email);
  const bad = () => err_('驗證碼不正確或已過期，請重新取得', 'Mã không đúng hoặc đã hết hạn. Vui lòng lấy mã mới.');
  if (!raw) throw bad();
  const rec = JSON.parse(raw);
  if (rec.tries >= 5) { cache.remove('code_' + email); throw bad(); }
  if (String(p.code || '').replace(/\D/g, '') !== rec.code) {
    rec.tries++;
    cache.put('code_' + email, JSON.stringify(rec), 600);
    throw err_('驗證碼不正確，請再確認', 'Mã không đúng, vui lòng kiểm tra lại.');
  }
  cache.remove('code_' + email);
  const ctx = ctx_();
  const me = ctx.people.filter(x => x.email === email)[0];
  if (!me) throw bad();
  const days = num_(ctx.settings['登入有效天數'], 30);
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  const store = props_(), now = Date.now();
  const all = store.getProperties();
  Object.keys(all).forEach(k => {
    if (k.indexOf('S_') !== 0) return;
    const v = JSON.parse(all[k]);
    if (v.exp < now) store.deleteProperty(k);
  });
  store.setProperty('S_' + token, JSON.stringify({ id: me.id, exp: now + days * 86400000 }));
  return { token: token };
}

function logout_(p) {
  const token = String(p.token || '').replace(/[^A-Za-z0-9]/g, '');
  if (token) props_().deleteProperty('S_' + token);
  return { ok: true };
}

/* ───────────── 試算表存取 ───────────── */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function headerOf_(sh) {
  const n = sh.getLastColumn();
  return n ? sh.getRange(1, 1, 1, n).getValues()[0].map(v => String(v).trim()) : [];
}

function ensureSheet_(name, headers) {
  let sh = ss_().getSheetByName(name);
  if (sh) return false;
  sh = ss_().insertSheet(name);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.setFrozenRows(1);
  return true;
}

function readTable_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const v = sh.getDataRange().getValues();
  const h = v[0].map(x => String(x).trim());
  return v.slice(1).map((r, i) => {
    const o = { _row: i + 2 };
    h.forEach((k, j) => { if (k) o[k] = r[j]; });
    return o;
  }).filter(o => h.some(k => k && o[k] !== '' && o[k] !== null));
}

// 防止使用者輸入的文字被試算表當成公式執行
function safe_(v) {
  return (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) ? "'" + v : v;
}

function rowValues_(sh, obj) {
  return headerOf_(sh).map(h => (obj[h] === undefined || obj[h] === null) ? '' : safe_(obj[h]));
}

function appendRow_(name, arr) {
  const sh = ss_().getSheetByName(name);
  sh.getRange(sh.getLastRow() + 1, 1, 1, arr.length).setValues([arr.map(safe_)]);
}

function appendObj_(name, obj) {
  const sh = ss_().getSheetByName(name);
  const vals = rowValues_(sh, obj);
  sh.getRange(sh.getLastRow() + 1, 1, 1, vals.length).setValues([vals]);
}

function upsert_(name, match, obj) {
  const sh = ss_().getSheetByName(name);
  const hit = readTable_(name).filter(match)[0];
  if (!hit) return appendObj_(name, obj);
  const vals = rowValues_(sh, obj);
  sh.getRange(hit._row, 1, 1, vals.length).setValues([vals]);
}

function deleteRows_(name, match) {
  const sh = ss_().getSheetByName(name);
  readTable_(name).filter(match).map(r => r._row).sort((a, b) => b - a).forEach(r => sh.deleteRow(r));
}

/* ───────────── 設定與名冊 ───────────── */

function readSettings_() {
  const s = {};
  DEFAULT_SETTINGS.forEach(r => { s[r[0]] = r[1]; });
  readTable_(SHEETS.settings).forEach(r => {
    const k = String(r['項目'] || '').trim();
    if (k) s[k] = r['設定值'];
  });
  return s;
}

function num_(v, dflt) {
  const n = Number(v);
  return (v === '' || v === null || v === undefined || isNaN(n)) ? dflt : n;
}
function nz_(v) { return v === null || v === undefined ? '' : v; }
function yes_(v) { return String(v).trim() === '是'; }

function toDate_(v) {
  if (!v) return null;
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? null : v;
  const m = String(v).trim().match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
function dateText_(v) {
  const d = toDate_(v);
  if (!d) return String(v || '').trim();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
function monthsBetween_(from, to) {
  let m = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) m--;
  return m;
}

function ctx_() {
  const settings = readSettings_();
  const year = String(settings['年度']).trim();
  const base = toDate_(settings['評核基準日']) || new Date(Number(year), 11, 31);
  const minMonths = num_(settings['新進門檻月數'], 3);

  const rows = readTable_(SHEETS.roster).filter(r => String(r['編號']).trim() && String(r['姓名']).trim());
  const people = rows.map(r => ({
    id: String(r['編號']).trim(), name: String(r['姓名']).trim(),
    dept: String(r['部門'] || '').trim(), title: String(r['職稱'] || '').trim(),
    isCEO: String(r['角色'] || '').trim() === '執行長',
    email: normEmail_(r['Email']), lang: String(r['語言'] || '').trim().toLowerCase() === 'vi' ? 'vi' : 'zh',
    _mgr: String(r['直屬主管'] || '').trim(), _raters: String(r['同儕評核人'] || ''),
    _join: toDate_(r['到職日']), _part: String(r['參加評等'] || '').trim()
  }));
  const byId = {}, byName = {};
  people.forEach(p => { byId[p.id] = p; byName[p.name] = p; });
  const find = key => byId[key] || byName[key] || null;
  people.forEach(p => {
    const m = find(p._mgr);
    p.mgrId = m && m.id !== p.id ? m.id : '';
    p.raterIds = p._raters.split(/[,，、;；\s]+/).map(s => s.trim()).filter(String)
      .map(find).filter(x => x && x.id !== p.id).map(x => x.id)
      .filter((id, i, a) => a.indexOf(id) === i);
    if (p.isCEO) p.rated = false;
    else if (p._part === '是') p.rated = true;
    else if (p._part === '否') p.rated = false;
    else p.rated = !p._join || monthsBetween_(p._join, base) >= minMonths;
  });

  const ctx = { settings: settings, year: year, people: people, byId: byId };
  ['self', 'mgr', 'peer', 'voice'].forEach(f => {
    ctx[f] = readTable_(FORMS[f].sheet).filter(r => String(r['年度']).trim() === year).map(r => ({
      from: String(r['填寫人編號']).trim(), to: String(r['對象編號']).trim(), a: rowToAnswers_(f, r)
    })).filter(r => byId[r.from] && byId[r.to]);
  });
  ctx.thanks = readTable_(SHEETS.thanks).filter(r => String(r['年度']).trim() === year).map(r => ({
    from: String(r['填寫人編號']).trim(), to: String(r['對象編號']).trim(),
    tag: String(r['標籤'] || ''), text: String(r['內容'] || '')
  })).filter(r => byId[r.from] && byId[r.to]);
  ctx.calib = {};
  readTable_(SHEETS.calib).filter(r => String(r['年度']).trim() === year).forEach(r => {
    ctx.calib[String(r['編號']).trim()] = { grade: String(r['最終等第'] || '').trim(), note: String(r['備註'] || '') };
  });
  ctx.kpis = {};
  readTable_(SHEETS.kpi).forEach(r => {
    ctx.kpis[String(r['部門']).trim()] = ['指標1', '指標2', '指標3'].map(k => String(r[k] || '').trim()).filter(String);
  });
  return ctx;
}

function rowToAnswers_(form, row) {
  const a = {};
  FORMS[form].fields.forEach(f => {
    const v = row[f.label];
    a[f.k] = f.type === 'score' ? num_(v, null) : String(v === undefined || v === null ? '' : v);
  });
  return a;
}

function auth_(ctx, token) {
  token = String(token || '').replace(/[^A-Za-z0-9]/g, '');
  const expired = () => err_('登入已過期，請重新登入', 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.', 'SESSION');
  const raw = token && props_().getProperty('S_' + token);
  if (!raw) throw expired();
  const sess = JSON.parse(raw);
  const me = sess.exp > Date.now() && ctx.byId[sess.id];
  if (!me) throw expired();
  return me;
}

function brief_(p) { return { id: p.id, name: p.name, dept: p.dept, title: p.title }; }

/* ───────────── 每個人該做的事 ───────────── */

function reportsOf_(ctx, me) { return ctx.people.filter(p => p.mgrId === me.id && p.rated); }
function assignedTo_(ctx, me) { return ctx.people.filter(p => p.rated && p.raterIds.indexOf(me.id) >= 0); }
function canPeer_(ctx, me) { return !me.isCEO && (me.rated || assignedTo_(ctx, me).length > 0); }
function peerPool_(ctx, me) {
  return ctx.people.filter(x => x.rated && x.id !== me.id && x.id !== me.mgrId && x.mgrId !== me.id);
}
function needRaters_(ctx, p) { return Math.min(num_(ctx.settings['同儕最少人數'], 3), peerPool_(ctx, p).length); }
function minPeerGive_(ctx, me) {
  if (!me.rated) return 0;
  return Math.min(num_(ctx.settings['同儕回饋最少人數'], 3), peerPool_(ctx, me).length);
}

function tasks_(ctx, me) {
  const st = ok => ok ? 'done' : 'todo';
  const t = { self: 'na', voice: 'na', peer: 'na', thanks: 'na', assign: 'na', mgr: 'na' };
  if (me.rated) t.self = st(ctx.self.some(r => r.from === me.id));
  if (!me.isCEO) t.voice = st(ctx.voice.some(r => r.from === me.id));
  if (canPeer_(ctx, me)) {
    const need = assignedTo_(ctx, me);
    const done = id => ctx.peer.some(r => r.from === me.id && r.to === id);
    const given = ctx.peer.filter(r => r.from === me.id).length, min = minPeerGive_(ctx, me);
    t.peer = (need.length || min) ? st(need.every(p => done(p.id)) && given >= min) : (given ? 'done' : 'optional');
  }
  const minThanks = num_(ctx.settings['感謝卡最少張數'], 3);
  t.thanks = st(ctx.thanks.filter(r => r.from === me.id).length >= Math.min(minThanks, ctx.people.length - 1));
  const reps = reportsOf_(ctx, me);
  if (reps.length) {
    t.mgr = st(reps.every(p => ctx.mgr.some(r => r.from === me.id && r.to === p.id)));
    t.assign = st(reps.every(p => p.raterIds.length >= needRaters_(ctx, p)));
  }
  return t;
}

function clientForms_() {
  const out = {};
  const scaleVi = sc => sc === SCALE ? SCALE_VI : AGREE_VI;
  Object.keys(FORMS).forEach(k => {
    out[k] = { fields: FORMS[k].fields.map(f => Object.assign({}, f, {
      vlabel: (FIELD_VI[f.k] || [])[0] || '', vdesc: (FIELD_VI[f.k] || [])[1] || '',
      vgroup: GROUP_VI[f.group] || '', vscale: f.scale ? scaleVi(f.scale) : undefined })) };
  });
  return out;
}

function boot_(p) {
  const ctx = ctx_();
  const me = auth_(ctx, p.token);
  const s = ctx.settings;
  const one = (list, to) => { const r = list.filter(x => x.from === me.id && x.to === to)[0]; return r ? ownAnswers_(r.a) : null; };
  const reps = reportsOf_(ctx, me);

  const assigned = assignedTo_(ctx, me).map(x => x.id);
  const ratedByMe = ctx.peer.filter(r => r.from === me.id).map(r => r.to);
  const peerIds = assigned.concat(ratedByMe.filter(id => assigned.indexOf(id) < 0));

  return {
    me: { id: me.id, name: me.name, dept: me.dept, title: me.title, isCEO: me.isCEO, rated: me.rated, lang: me.lang },
    cfg: {
      year: ctx.year, open: yes_(s['開放填寫']), deadline: dateText_(s['截止日']),
      minThanks: Math.min(num_(s['感謝卡最少張數'], 3), ctx.people.length - 1), tags: THANKS_TAGS,
      minPeers: minPeerGive_(ctx, me)
    },
    forms: clientForms_(),
    tasks: tasks_(ctx, me),
    self: one(ctx.self, me.id),
    voice: one(ctx.voice, me.id),
    canPeer: canPeer_(ctx, me),
    peers: peerIds.map(id => Object.assign(brief_(ctx.byId[id]),
      { assigned: assigned.indexOf(id) >= 0, answers: one(ctx.peer, id) })),
    peerCandidates: canPeer_(ctx, me) ? peerPool_(ctx, me).filter(x => peerIds.indexOf(x.id) < 0).map(brief_) : [],
    thanks: ctx.thanks.filter(r => r.from === me.id).map(r => ({ to: r.to, tag: r.tag, text: stripTr_(r.text) })),
    directory: ctx.people.filter(x => x.id !== me.id).map(brief_),
    reports: reps.map(r => Object.assign(brief_(r), {
      self: (ctx.self.filter(x => x.from === r.id)[0] || {}).a || null,
      answers: one(ctx.mgr, r.id), kpis: ctx.kpis[r.dept] || [],
      raters: r.raterIds, need: needRaters_(ctx, r), pool: peerPool_(ctx, r).map(brief_)
    })),
    received: yes_(s['公開感謝卡']) ? ctx.thanks.filter(r => r.to === me.id).map(r => ({
      from: ctx.byId[r.from].name, dept: ctx.byId[r.from].dept, tag: r.tag, text: r.text })) : null
  };
}

/* ───────────── 送出問卷 ───────────── */

const TR_MARK = '\n\n【中文翻譯】';
function stripTr_(v) {
  const t = String(v === undefined || v === null ? '' : v);
  const i = t.indexOf(TR_MARK);
  return i < 0 ? t : t.slice(0, i);
}
// 內容大部分不是中文時（例如越南文），用 Google 翻譯附上中文，原文保留
function withTr_(text) {
  if (!text) return text;
  const letters = text.replace(/[\s\d.,!?;:，。！？；：、()（）\-]/g, '');
  const cjk = (letters.match(/[\u3400-\u9fff]/g) || []).length;
  if (!letters.length || cjk / letters.length > 0.3) return text;
  try {
    const zh = LanguageApp.translate(text, '', 'zh-TW');
    return (zh && zh !== text) ? text + TR_MARK + zh : text;
  } catch (e) { return text; }
}
function ownAnswers_(a) {
  if (!a) return a;
  const o = {};
  Object.keys(a).forEach(k => { o[k] = typeof a[k] === 'string' ? stripTr_(a[k]) : a[k]; });
  return o;
}

function cleanText_(v, max) {
  return String(v === undefined || v === null ? '' : v).replace(/\r/g, '').trim().slice(0, max);
}

function validate_(form, answers) {
  const out = {};
  FORMS[form].fields.forEach(f => {
    const v = answers ? answers[f.k] : undefined;
    if (f.type === 'score') {
      const n = Number(v);
      if (!(n >= 1 && n <= 5 && Math.floor(n) === n)) throw err_('「' + f.label + '」尚未評分', 'Chưa chấm điểm: ' + label_(f));
      out[f.label] = n;
    } else if (f.type === 'choice') {
      if (f.options.indexOf(v) < 0) {
        if (f.req) throw err_('「' + f.label + '」尚未選擇', 'Chưa chọn: ' + label_(f));
        out[f.label] = '';
      } else out[f.label] = v;
    } else {
      const t = cleanText_(stripTr_(v), 2000);
      if (f.req && !t) throw err_('「' + f.label + '」尚未填寫', 'Chưa điền: ' + label_(f));
      out[f.label] = f.type === 'kpi' ? t : withTr_(t);
    }
  });
  return out;
}

function save_(p) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ctx = ctx_();
    const me = auth_(ctx, p.token);
    if (!yes_(ctx.settings['開放填寫'])) throw err_('本年度評核已截止，無法再修改', 'Đợt đánh giá năm nay đã kết thúc, không thể chỉnh sửa.');
    const form = String(p.form);
    const keyOf = (to) => ({ '年度': ctx.year, '時間': new Date(), '填寫人編號': me.id, '填寫人': me.name,
      '對象編號': to.id, '對象': to.name });
    const same = (toId) => r => String(r['年度']).trim() === ctx.year &&
      String(r['填寫人編號']).trim() === me.id && String(r['對象編號']).trim() === toId;

    if (form === 'thanks') {
      const cards = (p.answers && p.answers.cards) || [];
      if (!Array.isArray(cards) || cards.length > 60) throw err_('資料格式錯誤', 'Dữ liệu không hợp lệ.');
      const seen = {};
      const rows = cards.map(c => {
        const to = ctx.byId[String(c.to)];
        if (!to || to.id === me.id) throw err_('請選擇要感謝的同事', 'Vui lòng chọn đồng nghiệp bạn muốn cảm ơn.');
        if (seen[to.id]) throw err_('每位同事只能寫一張感謝卡：' + to.name, 'Mỗi đồng nghiệp chỉ viết một thiệp: ' + to.name);
        seen[to.id] = true;
        const text = cleanText_(stripTr_(c.text), 300);
        if (!text) throw err_('給 ' + to.name + ' 的感謝卡還沒寫內容', 'Thiệp gửi ' + to.name + ' chưa có nội dung.');
        return Object.assign(keyOf(to), { '標籤': THANKS_TAGS.indexOf(c.tag) >= 0 ? c.tag : '', '內容': withTr_(text) });
      });
      deleteRows_(SHEETS.thanks, r => String(r['年度']).trim() === ctx.year && String(r['填寫人編號']).trim() === me.id);
      rows.forEach(r => appendObj_(SHEETS.thanks, r));
      return { saved: true };
    }

    if (!FORMS[form]) throw err_('不支援的問卷', 'Biểu mẫu không hợp lệ.');
    let target = me;
    if (form === 'self') {
      if (!me.rated) throw err_('您本年度不需要填寫自評', 'Năm nay bạn không cần tự đánh giá.');
    } else if (form === 'voice') {
      if (me.isCEO) throw new Error('執行長不需要填寫心聲問卷');
    } else {
      target = ctx.byId[String(p.target)];
      if (!target || target.id === me.id || !target.rated) throw err_('評核對象不正確', 'Người được đánh giá không hợp lệ.');
      if (form === 'mgr' && target.mgrId !== me.id) throw new Error('只能評核您的直屬同仁');
      if (form === 'peer') {
        if (!canPeer_(ctx, me)) throw err_('您本年度不需要填寫同儕回饋', 'Năm nay bạn không cần nhận xét đồng nghiệp.');
        const assigned = target.raterIds.indexOf(me.id) >= 0;
        if (!assigned && (target.mgrId === me.id || me.mgrId === target.id)) {
          throw err_('直屬主管與部屬之間不使用同儕回饋', 'Không dùng nhận xét đồng nghiệp giữa quản lý trực tiếp và nhân viên.');
        }
        if (p.answers === null) {
          if (assigned) throw err_('這位同事是指定的評核對象，無法移除', 'Đồng nghiệp này được chỉ định, không thể xóa.');
          deleteRows_(FORMS.peer.sheet, same(target.id));
          return { saved: true };
        }
      }
    }
    const obj = Object.assign(keyOf(target), validate_(form, p.answers));
    upsert_(FORMS[form].sheet, same(target.id), obj);
    return { saved: true };
  } finally {
    lock.releaseLock();
  }
}

function assign_(p) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ctx = ctx_();
    const me = auth_(ctx, p.token);
    if (!yes_(ctx.settings['開放填寫'])) throw err_('本年度評核已截止，無法再修改', 'Đợt đánh giá năm nay đã kết thúc, không thể chỉnh sửa.');
    const target = ctx.byId[String(p.target)];
    if (!target || target.mgrId !== me.id || !target.rated) throw new Error('只能為您的直屬同仁指定同儕評核人');
    const pool = peerPool_(ctx, target).map(x => x.id);
    const ids = (Array.isArray(p.raters) ? p.raters : []).map(String)
      .filter((id, i, a) => pool.indexOf(id) >= 0 && a.indexOf(id) === i);
    const need = needRaters_(ctx, target);
    if (ids.length < need) throw new Error('請至少指定 ' + need + ' 位同儕評核人');
    if (ids.length > 6) throw new Error('最多指定 6 位同儕評核人');
    const sh = ss_().getSheetByName(SHEETS.roster);
    const col = headerOf_(sh).indexOf('同儕評核人') + 1;
    const row = readTable_(SHEETS.roster).filter(r => String(r['編號']).trim() === target.id)[0];
    if (!col || !row) throw new Error('名冊缺少「同儕評核人」欄');
    sh.getRange(row._row, col, 1, 1).setValues([[ids.join(',')]]);
    return { saved: true };
  } finally {
    lock.releaseLock();
  }
}

/* ───────────── 分數、等第與關懷燈號 ───────────── */

function avg_(arr) {
  const v = arr.filter(x => typeof x === 'number' && !isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
function round1_(n) { return n === null ? null : Math.round(n * 10) / 10; }

function dimScores_(ctx, a) {
  if (!a) return null;
  const dims = {};
  let sum = 0, wsum = 0;
  DIMENSIONS.forEach(d => {
    const v = avg_(d.items.map(it => a[it.k]));
    const w = num_(ctx.settings[d.weight], 0);
    dims[d.key] = v === null ? null : round1_(v * 20);
    if (v !== null) { sum += v * 20 * w; wsum += w; }
  });
  return { dims: dims, total: wsum ? sum / wsum : null };
}

function computeResults_(ctx) {
  const s = ctx.settings;
  const minPeers = num_(s['同儕最少人數'], 3);
  const totalThanks = ctx.thanks.length;

  const people = ctx.people.filter(p => !p.isCEO).map(p => {
    const selfRow = ctx.self.filter(r => r.from === p.id)[0];
    const mgrRow = ctx.mgr.filter(r => r.to === p.id && r.from === p.mgrId)[0];
    const peerRows = ctx.peer.filter(r => r.to === p.id);
    const voiceRow = ctx.voice.filter(r => r.from === p.id)[0];
    const selfS = dimScores_(ctx, selfRow && selfRow.a);
    const mgrS = dimScores_(ctx, mgrRow && mgrRow.a);
    const peerAvg = avg_(peerRows.map(r => avg_(['p1', 'p2', 'p3', 'p4'].map(k => r.a[k]))));
    const peerScore = peerAvg === null ? null : peerAvg * 20;

    let total = null, note = '';
    if (p.rated) {
      if (!mgrS || mgrS.total === null) note = '主管尚未評分';
      else {
        let wM = num_(s['來源_主管'], 60), wP = num_(s['來源_同儕'], 25), wS = num_(s['來源_自評'], 15);
        const notes = [];
        if (peerRows.length < minPeers || peerScore === null) { wM += wP; wP = 0; notes.push('同儕評分不足 ' + minPeers + ' 人，未計入'); }
        if (!selfS || selfS.total === null) { wM += wS; wS = 0; notes.push('未填自評，未計入'); }
        total = (wM * mgrS.total + wP * (peerScore || 0) + wS * ((selfS && selfS.total) || 0)) / (wM + wP + wS);
        note = notes.join('；');
      }
    } else note = '本年度不參加評等';

    const mgr = ctx.byId[p.mgrId];
    return {
      id: p.id, name: p.name, dept: p.dept, title: p.title, rated: p.rated, mgrName: mgr ? mgr.name : '',
      tasks: tasks_(ctx, p),
      score: {
        mgr: mgrS ? round1_(mgrS.total) : null, self: selfS ? round1_(selfS.total) : null,
        peer: round1_(peerScore), peerN: peerRows.length, total: round1_(total), note: note,
        mgrDims: mgrS ? mgrS.dims : null, selfDims: selfS ? selfS.dims : null
      },
      self: selfRow ? selfRow.a : null, mgr: mgrRow ? mgrRow.a : null, voice: voiceRow ? voiceRow.a : null,
      peers: peerRows.map(r => ({ from: ctx.byId[r.from].name, dept: ctx.byId[r.from].dept, a: r.a })),
      thanksIn: ctx.thanks.filter(r => r.to === p.id).map(r => ({
        from: ctx.byId[r.from].name, dept: ctx.byId[r.from].dept, tag: r.tag, text: r.text })),
      thanksOut: ctx.thanks.filter(r => r.from === p.id).length
    };
  });

  // 等第：先依門檻，再受人數比例上限限制
  const rated = people.filter(p => p.rated);
  const capS = Math.max(1, Math.round(rated.length * num_(s['S比例上限'], 10) / 100));
  const capA = Math.max(1, Math.round(rated.length * num_(s['A比例上限'], 30) / 100));
  const thS = num_(s['S門檻'], 90), thA = num_(s['A門檻'], 80), thC = num_(s['C門檻'], 60);
  let nS = 0, nA = 0;
  rated.filter(p => p.score.total !== null).sort((a, b) => b.score.total - a.score.total).forEach(p => {
    const t = p.score.total;
    if (t >= thS && nS < capS) { p.suggested = 'S'; nS++; }
    else if (t >= thA && nA < capA) { p.suggested = 'A'; nA++; }
    else if (t < thC) p.suggested = 'C';
    else p.suggested = 'B';
  });
  const dist = { S: 0, A: 0, B: 0, C: 0 };
  people.forEach(p => {
    p.suggested = p.suggested || '';
    const c = ctx.calib[p.id];
    p.final = p.rated ? ((c && GRADES.indexOf(c.grade) >= 0) ? c.grade : p.suggested) : '';
    p.calibrated = !!(c && GRADES.indexOf(c.grade) >= 0 && p.rated);
    p.calibNote = c ? c.note : '';
    const m = p.final ? s['月數_' + p.final] : '';
    p.months = num_(m, null);
    if (p.final) dist[p.final]++;
    const f = flags_(p, totalThanks, ctx.people.length);
    p.flags = f;
    const reds = f.filter(x => x.level === 'red').length, yellows = f.filter(x => x.level === 'yellow').length;
    p.light = (reds || yellows >= 3) ? 'red' : (yellows ? 'yellow' : 'green');
  });

  return { people: people, dist: dist, caps: { S: capS, A: capA }, ratedCount: rated.length };
}

function flags_(p, totalThanks, headcount) {
  const f = [];
  const add = (level, text, ask) => f.push({ level: level, text: text, ask: ask });
  const v = p.voice;
  if (!v) add('yellow', '尚未填寫心聲問卷', '了解沒有填寫的原因，確認是否有顧慮');
  else {
    const all = avg_(['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9'].map(k => v[k]));
    if (v.v9 <= 2) add('red', '留任意願低', '「如果有一件事改變了，會讓你更想留下來，那會是什麼？」');
    else if (v.v9 === 3) add('yellow', '留任意願普通', '「你對自己明年在公司的角色有什麼期待？」');
    if (all !== null && all <= 2.5) add('red', '整體滿意度偏低', '「今年有哪些事讓你覺得特別辛苦或失望？」');
    else if (all !== null && all < 3.5) add('yellow', '整體滿意度中等偏低', '「工作上有什麼是我們可以馬上改善的？」');
    if (v.v1 <= 2) add('yellow', '工作成就感低', '「你最希望做哪一類的工作？現在的工作哪裡讓你使不上力？」');
    if (v.v4 <= 2) add('yellow', '團隊合作不愉快', '「和同事配合上，最卡的地方是什麼？」');
    if (v.v5 <= 2) add('red', '與主管關係緊張', '「你希望主管用什麼方式和你溝通與交辦工作？」（請避免讓主管得知問卷內容）');
    if (v.v6 <= 2) add('yellow', '工作負荷過重', '「哪些工作佔掉最多時間？有哪些可以簡化或分出去？」');
    if (v.v7 <= 2) add('yellow', '覺得付出未被公平對待', '「你覺得哪些貢獻沒有被看見？」');
    if (v.meet === '是') add('yellow', '希望與您一對一面談', '由同仁主導話題，先聽完再回應');
    if ((p.final === 'S' || p.final === 'A') && ((all !== null && all < 3.5) || v.v9 <= 3)) {
      add('red', '高績效但滿意度不高，優先留才', '具體說明公司對他的肯定與未來規劃，詢問他最在意的條件');
    }
  }
  if (p.mgr && p.mgr.risk === '高') add('red', '主管判斷離職風險高', '先向主管了解觀察到的具體跡象');
  else if (p.mgr && p.mgr.risk === '中') add('yellow', '主管判斷有離職風險', '先向主管了解觀察到的具體跡象');
  if (p.score.self !== null && p.score.mgr !== null && p.score.self - p.score.mgr >= 15) {
    add('yellow', '自評明顯高於主管評（差 ' + round1_(p.score.self - p.score.mgr) + ' 分）',
      '請主管在回饋面談中用具體事例說明落差，避免同仁覺得不被認同');
  }
  if (totalThanks >= headcount && !p.thanksIn.length) {
    add('yellow', '沒有收到任何感謝卡', '留意是否與團隊互動偏少，或工作內容不容易被看見');
  }
  return f;
}

/* ───────────── 執行長儀表板 ───────────── */

function dashboard_(p) {
  const ctx = ctx_();
  const me = auth_(ctx, p.token);
  if (!me.isCEO) throw new Error('僅執行長可以檢視儀表板');
  const res = computeResults_(ctx);
  const s = ctx.settings;

  const depts = {};
  res.people.forEach(x => {
    if (!x.voice) return;
    const d = depts[x.dept] = depts[x.dept] || { dept: x.dept, n: 0, sums: {} };
    d.n++;
    Object.keys(x.voice).forEach(k => { if (typeof x.voice[k] === 'number') d.sums[k] = (d.sums[k] || 0) + x.voice[k]; });
  });
  const mood = Object.keys(depts).map(k => {
    const d = depts[k], avg = {};
    Object.keys(d.sums).forEach(q => { avg[q] = round1_(d.sums[q] / d.n); });
    return { dept: d.dept, n: d.n, avg: avg };
  });

  return {
    cfg: { year: ctx.year, open: yes_(s['開放填寫']), deadline: dateText_(s['截止日']) },
    forms: clientForms_(), dims: DIMENSIONS.map(d => ({ key: d.key, name: d.name })),
    people: res.people, dist: res.dist, caps: res.caps, ratedCount: res.ratedCount, mood: mood,
    months: { S: num_(s['月數_S'], null), A: num_(s['月數_A'], null), B: num_(s['月數_B'], null), C: num_(s['月數_C'], null) }
  };
}

function setFinal_(p) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ctx = ctx_();
    const me = auth_(ctx, p.token);
    if (!me.isCEO) throw new Error('僅執行長可以調整等第');
    const target = ctx.byId[String(p.id)];
    if (!target || !target.rated) throw new Error('對象不正確');
    const grade = String(p.grade || '');
    if (grade && GRADES.indexOf(grade) < 0) throw new Error('等第不正確');
    const match = r => String(r['年度']).trim() === ctx.year && String(r['編號']).trim() === target.id;
    if (!grade) deleteRows_(SHEETS.calib, match);
    else upsert_(SHEETS.calib, match, { '年度': ctx.year, '編號': target.id, '姓名': target.name,
      '最終等第': grade, '備註': cleanText_(p.note, 500), '時間': new Date() });
    return { saved: true };
  } finally {
    lock.releaseLock();
  }
}
