/**
 * 樂朗奇 年度績效評核系統 — Google Apps Script 後端
 * 綁定在一份 Google 試算表上，資料全部存在該試算表。
 * 部署方式請見 README.md。
 */

const SHEETS = {
  settings: '設定', roster: '名冊',
  self: '自評', mgr: '主管評', peer: '同儕評', thanks: '感謝卡', voice: '心聲',
  calib: '校準', result: '結果',
  up: '主管回饋', upDone: '主管回饋已填'
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
  ['主管回饋最少份數', 3, '某位主管收到的匿名回饋少於此份數時，儀表板不顯示內容，避免被認出是誰寫的'],
  ['同儕最少人數', 3, '主管要為每位直屬同仁指定的同儕評核人數；實際評分者少於此人數時不計同儕分數，權重併回主管評'],
  ['同儕回饋最少人數', 0, '除了主管指定的對象外，每位同仁至少還要自選幾位同事填寫同儕回饋。0 代表只需完成指定對象'],
  ['寄件信箱', '', '驗證信的寄件地址。必須是部署帳號在 Gmail「帳戶和匯入」已驗證的寄件別名；留白或未驗證時用部署帳號寄'],
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

const DIMENSIONS = [
  { key: 'result', name: '工作成果', weight: '權重_工作成果', items: [
    { k: 'r1', label: '目標達成', desc: '主管交代的工作和目標，今年都有做到' },
    { k: 'r2', label: '工作品質', desc: '做出來的東西正確、仔細，很少出錯或重做' },
    { k: 'r3', label: '效率與時效', desc: '事情能準時完成，不會拖到別人' }] },
  { key: 'skill', name: '專業能力與成長', weight: '權重_專業成長', items: [
    { k: 's1', label: '專業能力', desc: '自己份內的工作做得熟練，不太需要別人幫忙收尾' },
    { k: 's2', label: '學習與解決問題', desc: '願意學新東西；遇到問題會想辦法解決，或及時找人幫忙' }] },
  { key: 'team', name: '團隊合作', weight: '權重_團隊合作', items: [
    { k: 't1', label: '溝通協作', desc: '有事會說清楚、會回報，和同事及其他部門配合順利' },
    { k: 't2', label: '支援他人', desc: '同事忙不過來時願意幫忙，也願意教別人' }] },
  { key: 'attitude', name: '工作態度與品質', weight: '權重_態度價值', items: [
    { k: 'a1', label: '責任感與主動性', desc: '答應的事會做到；看到問題會主動處理或提出來' },
    { k: 'a2', label: '對品質的堅持', h: '品牌價值', desc: '不隨便、不將就，在意產品與服務的品質，維護樂朗奇的形象' }] }
];

const SCALE_VI = ['Cần cải thiện', 'Tạm được', 'Đạt kỳ vọng', 'Vượt kỳ vọng', 'Xuất sắc'];
const AGREE_VI = ['Rất không đồng ý', 'Không đồng ý', 'Bình thường', 'Đồng ý', 'Rất đồng ý'];
const GROUP_VI = { '我的這一年': 'Một năm của tôi', '工作成果': 'Kết quả công việc', '專業能力與成長': 'Năng lực chuyên môn và phát triển',
  '團隊合作': 'Làm việc nhóm', '工作態度與品質': 'Thái độ làm việc và chất lượng', '回顧與展望': 'Nhìn lại và hướng tới',
  '工作': 'Công việc', '團隊': 'Đội nhóm', '公司': 'Công ty', '想說的話': 'Điều muốn nói',
  '成果佐證': 'Minh chứng kết quả', '評語': 'Nhận xét', '留才判斷': 'Đánh giá giữ chân nhân sự' };
const FIELD_VI = {
  ach: ['Ba thành quả lớn nhất trong năm', 'Những việc bạn tự hào nhất và muốn được ghi nhận, hãy viết cụ thể'],
  r1: ['Hoàn thành mục tiêu', 'Những công việc và mục tiêu quản lý giao trong năm nay đều đã làm được'],
  r2: ['Chất lượng công việc', 'Làm ra sản phẩm đúng, cẩn thận, ít khi sai hoặc phải làm lại'],
  r3: ['Hiệu suất và đúng hạn', 'Hoàn thành công việc đúng giờ, không làm chậm người khác'],
  s1: ['Năng lực chuyên môn', 'Làm thành thạo công việc của mình, ít khi cần người khác làm giúp phần còn lại'],
  s2: ['Học hỏi và giải quyết vấn đề', 'Sẵn sàng học điều mới; gặp vấn đề thì tìm cách giải quyết hoặc kịp thời nhờ người giúp'],
  t1: ['Giao tiếp và phối hợp', 'Có việc thì nói rõ, có báo cáo lại; phối hợp tốt với đồng nghiệp và các bộ phận khác'],
  t2: ['Hỗ trợ người khác', 'Khi đồng nghiệp bận không xuể thì sẵn sàng giúp, cũng sẵn sàng chỉ dẫn người khác'],
  a1: ['Trách nhiệm và chủ động', 'Đã hứa thì làm; thấy vấn đề thì chủ động xử lý hoặc nêu ra'],
  a2: ['Kiên trì với chất lượng', 'Không làm qua loa, không dễ dãi; quan tâm đến chất lượng sản phẩm và dịch vụ, giữ gìn hình ảnh của enchantée'],
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
  v10: ['Lương và phúc lợi', 'Tôi thấy mức lương và phúc lợi hiện tại là hợp lý'],
  v11: ['Kỳ vọng công việc', 'Tôi hiểu rõ công ty và quản lý mong đợi gì ở công việc của tôi'],
  summary: ['Tổng kết một câu', 'Dùng một câu để tổng kết biểu hiện của nhân viên này trong năm nay'],
  u1: ['Giao việc rõ ràng', 'Khi giao việc, quản lý nói rõ cần làm gì và khi nào cần xong'],
  u2: ['Công bằng', 'Quản lý đối xử công bằng với mọi người, không thiên vị'],
  u3: ['Tôn trọng', 'Quản lý nói năng và hành xử tôn trọng tôi'],
  u4: ['Hỗ trợ và chỉ dẫn', 'Khi tôi gặp khó khăn, quản lý giúp đỡ hoặc chỉ dẫn tôi'],
  u5: ['Phản hồi', 'Tôi làm tốt hay chưa tốt, quản lý đều cho tôi biết'],
  u6: ['Sẵn sàng lắng nghe', 'Quản lý sẵn sàng lắng nghe ý kiến của tôi'],
  u7: ['Tổng thể', 'Tôi muốn tiếp tục làm việc với quản lý này'],
  good: ['Điều quản lý làm tốt', 'Điều quản lý làm tốt và bạn mong tiếp tục duy trì'],
  better: ['Điều mong quản lý điều chỉnh', 'Một điều bạn mong quản lý điều chỉnh'],
  happy: ['Điều vui nhất năm nay', ''],
  change: ['Một điều muốn thay đổi nhất', 'Nếu có thể thay đổi một điều ở công ty hoặc trong công việc'],
  private: ['Điều muốn nói với Giám đốc điều hành', 'Bạn có thể nói bất cứ điều gì, chỉ Giám đốc điều hành xem được'],
  meet: ['Muốn gặp riêng Giám đốc điều hành', ''],
  kpi: ['Thành quả và số liệu cụ thể', 'Viết thành quả cụ thể của nhân viên này trong năm, kèm số liệu nếu có. Có thể để trống'],
  strength: ['Ưu điểm và đóng góp', 'Ví dụ cụ thể đáng ghi nhận nhất trong năm'],
  improve: ['Cần cải thiện', 'Một hoặc hai điều cần điều chỉnh nhất'],
  develop: ['Đề xuất phát triển năm tới', 'Mục tiêu, đào tạo hoặc điều chỉnh công việc được đề xuất'],
  risk: ['Nhận định nguy cơ nghỉ việc', 'Dựa trên quan sát hằng ngày của bạn, chỉ Giám đốc điều hành xem được'],
  keyman: ['Nhân sự chủ chốt', 'Nếu nghỉ việc sẽ ảnh hưởng lớn đến bộ phận']
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
    { k: it.k, label: it.label, h: it.h, desc: it.desc, type: 'score', req: true, group: d.name, scale: SCALE })));
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
    // h 是試算表欄名，沿用舊名以相容已建立的工作表
    { k: 'kpi', label: '具體成果與數字', h: '關鍵數字', desc: '依這位同仁的實際職務，寫下今年的具體成果，有數字請附上（例如成交盒數、良率、出貨正確率、完成的專案）。沒有可留白', type: 'text', group: '成果佐證' },
    { k: 'strength', label: '優點與貢獻', desc: '今年最值得肯定的具體事例', type: 'text', req: true, group: '評語' },
    { k: 'improve', label: '待改善', desc: '最需要調整的一到兩件事', type: 'text', group: '評語' },
    { k: 'develop', label: '明年發展建議', desc: '建議的目標、訓練或職務調整', type: 'text', group: '評語' },
    { k: 'summary', label: '整體總評', desc: '用一句話總結這位同仁今年的表現', type: 'text', req: true, group: '評語' },
    { k: 'risk', label: '離職風險觀察', desc: '依你平日的觀察，僅執行長可見', type: 'choice', options: ['低', '中', '高'], req: true, group: '留才判斷' },
    { k: 'keyman', label: '關鍵人才', desc: '離開會對部門造成重大影響', type: 'choice', options: ['是', '否'], req: true, group: '留才判斷' }]) },
  peer: { sheet: SHEETS.peer, fields: [
    { k: 'p1', label: '溝通順暢', desc: '和這位同事合作時，溝通清楚、好配合', type: 'score', req: true, scale: AGREE },
    { k: 'p2', label: '值得信賴', desc: '答應的事會做到，交付準時', type: 'score', req: true, scale: AGREE },
    { k: 'p3', label: '主動支援', desc: '我需要幫忙時，願意伸出援手', type: 'score', req: true, scale: AGREE },
    { k: 'p4', label: '專業放心', desc: '交給這位同事的事讓我很放心', type: 'score', req: true, scale: AGREE },
    { k: 'praise', label: '值得肯定', desc: '一句話寫下最欣賞的地方', type: 'text', req: true },
    { k: 'better', label: '可以更好', desc: '一句話寫下希望對方調整的地方', type: 'text' }] },
  voice: { sheet: SHEETS.voice, fields: [
    { k: 'v1', label: '成就感', desc: '今年的工作讓我有成就感', type: 'score', req: true, scale: AGREE, group: '工作' },
    { k: 'v2', label: '發揮專長', desc: '我的專長在工作上有被好好發揮', type: 'score', req: true, scale: AGREE, group: '工作' },
    { k: 'v11', label: '工作期待', desc: '我清楚知道公司和主管對我的工作期待', type: 'score', req: true, scale: AGREE, group: '工作' },
    { k: 'v3', label: '學習成長', desc: '我在公司有學習與成長的機會', type: 'score', req: true, scale: AGREE, group: '工作' },
    { k: 'v4', label: '團隊合作', desc: '我和團隊同事合作愉快', type: 'score', req: true, scale: AGREE, group: '團隊' },
    { k: 'v5', label: '主管支持', desc: '我的主管支持我、尊重我', type: 'score', req: true, scale: AGREE, group: '團隊' },
    { k: 'v6', label: '工作負荷', desc: '我的工作量與壓力在可以負荷的範圍', type: 'score', req: true, scale: AGREE, group: '團隊' },
    { k: 'v7', label: '公平對待', desc: '我的付出有被看見，也被公平對待', type: 'score', req: true, scale: AGREE, group: '公司' },
    { k: 'v10', label: '薪資福利', desc: '我覺得目前的薪資與福利是合理的', type: 'score', req: true, scale: AGREE, group: '公司' },
    { k: 'v8', label: '推薦意願', desc: '我會推薦朋友來樂朗奇工作', type: 'score', req: true, scale: AGREE, group: '公司' },
    { k: 'v9', label: '留任意願', desc: '一年後，我仍希望在樂朗奇工作', type: 'score', req: true, scale: AGREE, group: '公司' },
    { k: 'happy', label: '今年最開心的事', desc: '', type: 'text', group: '想說的話' },
    { k: 'change', label: '最想改變的一件事', desc: '如果可以改變公司或工作上的一件事', type: 'text', group: '想說的話' },
    { k: 'private', label: '想對執行長說的話', desc: '任何想法都可以，只有執行長看得到', type: 'text', group: '想說的話' },
    { k: 'meet', label: '希望與執行長一對一面談', desc: '', type: 'choice', options: ['是', '否'], req: true, group: '想說的話' }] }
};

// 給主管的回饋：匿名。內容與「誰填過」分開存放，內容列不含填寫人與時間，並以隨機位置寫入
FORMS.up = { sheet: SHEETS.up, fields: [
  { k: 'u1', label: '交辦清楚', desc: '主管交代工作時，會說清楚要做什麼、什麼時候要', type: 'score', req: true, scale: AGREE },
  { k: 'u2', label: '公平', desc: '主管對待每個人公平，不偏心', type: 'score', req: true, scale: AGREE },
  { k: 'u3', label: '尊重', desc: '主管說話和做事都尊重我', type: 'score', req: true, scale: AGREE },
  { k: 'u4', label: '支持與教導', desc: '我遇到困難時，主管會幫忙或教我', type: 'score', req: true, scale: AGREE },
  { k: 'u5', label: '給回饋', desc: '我做得好或做不好，主管都會讓我知道', type: 'score', req: true, scale: AGREE },
  { k: 'u6', label: '願意聽', desc: '主管願意聽我的意見', type: 'score', req: true, scale: AGREE },
  { k: 'u7', label: '整體', desc: '我願意繼續跟這位主管一起工作', type: 'score', req: true, scale: AGREE },
  { k: 'good', label: '做得好的事', desc: '主管做得好、希望繼續保持的事', type: 'text' },
  { k: 'better', label: '希望調整的事', desc: '希望主管調整的一件事', type: 'text' }] };
const UP_HEADERS = ['年度', '主管編號', '主管'].concat(FORMS.up.fields.map(f => f.label));
const UP_DONE_HEADERS = ['年度', '填寫人編號', '填寫人', '狀態'];

function hdr_(f) { return f.h || f.label; }
function formHeaders_(form) {
  return KEY_HEADERS.concat(FORMS[form].fields.map(hdr_));
}
const THANKS_HEADERS = KEY_HEADERS.concat(['標籤', '內容']);
const CALIB_HEADERS = ['年度', '編號', '姓名', '最終等第', '備註', '時間'];
const RESULT_HEADERS = ['年度', '編號', '姓名', '部門', '主管評分', '同儕評分', '同儕人數', '自評分', '總分',
  '建議等第', '最終等第', '年終月數', '在職比例', '折算月數', '關懷燈號', '關懷原因'];

/* ───────────── 試算表選單與初始化 ───────────── */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('績效評核')
    .addItem('① 初始化工作表', 'setup')
    .addItem('② 匯出評核結果', 'writeResults')
    .addToUi();
}

function setup() {
  clearMemo_();
  ALL_TABLES.forEach(touch_);
  ensureSheet_(SHEETS.settings, ['項目', '設定值', '說明']);
  const have = {};
  readTable_(SHEETS.settings).forEach(r => { have[String(r['項目'])] = true; });
  DEFAULT_SETTINGS.forEach(row => { if (!have[row[0]]) appendRow_(SHEETS.settings, row); });

  if (ensureSheet_(SHEETS.roster, ROSTER_HEADERS)) {
    appendRow_(SHEETS.roster, ['E000', '（範例）執行長', '管理', '執行長', '', '', '執行長', 'ceo@example.com', '', '', '']);
    appendRow_(SHEETS.roster, ['E001', '（範例）王主管', '行銷', '行銷主管', 'E000', '2020-03-01', '', 'manager@example.com', '', '', '']);
    appendRow_(SHEETS.roster, ['E002', '（範例）陳同仁', '行銷', '行銷專員', 'E001', '2023-06-15', '', 'staff@example.com', 'vi', '', '']);
  }
  ['self', 'mgr', 'peer', 'voice'].forEach(f => ensureSheet_(FORMS[f].sheet, formHeaders_(f)));
  ensureSheet_(SHEETS.thanks, THANKS_HEADERS);
  ensureSheet_(SHEETS.up, UP_HEADERS);
  ensureSheet_(SHEETS.upDone, UP_DONE_HEADERS);
  ensureSheet_(SHEETS.calib, CALIB_HEADERS);
  ensureSheet_(SHEETS.result, RESULT_HEADERS);
}

function writeResults() {
  clearMemo_();
  ALL_TABLES.forEach(touch_);
  const ctx = ctx_();
  const res = computeResults_(ctx);
  const sh = ss_().getSheetByName(SHEETS.result);
  const keep = readTable_(SHEETS.result).filter(r => String(r['年度']) !== ctx.year)
    .map(r => RESULT_HEADERS.map(h => r[h]));
  const rows = res.people.filter(p => p.rated).map(p => [ctx.year, p.id, p.name, p.dept,
    nz_(p.score.mgr), nz_(p.score.peer), p.score.peerN, nz_(p.score.self), nz_(p.score.total),
    p.suggested || '', p.final || '', p.months === null ? '' : p.months, p.ratio, p.proMonths === null ? '' : p.proMonths,
    { red: '紅', yellow: '黃', green: '綠' }[p.light], p.flags.map(f => f.text).join('、')]);
  sh.clearContents();
  const all = [RESULT_HEADERS].concat(keep).concat(rows.map(r => r.map(safe_)));
  sh.getRange(1, 1, all.length, RESULT_HEADERS.length).setValues(all);
}

/* ───────────── 網頁入口 ───────────── */

const FAVICON_URL = 'https://raw.githubusercontent.com/enchantee-ux/ECTlottery/bdf521548cff20fdf3e59a6a262edd7e0cc6ac98/performance-review/icon.png';

function doGet() {
  const out = HtmlService.createHtmlOutputFromFile('index').setTitle('樂朗奇 年度績效評核')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  // 分頁小圖示：圖檔放在 GitHub，讀不到時不影響頁面
  try { out.setFaviconUrl(FAVICON_URL); } catch (e) { /* 維持預設圖示 */ }
  return out;
}

function api(action, payloadJson) {
  try {
    clearMemo_();
    const p = JSON.parse(payloadJson || '{}');
    LANG = p.lang === 'vi' ? 'vi' : 'zh';
    const handlers = { requestCode: requestCode_, verifyCode: verifyCode_, logout: logout_,
      boot: boot_, save: save_, assign: assign_, dashboard: dashboard_, setFinal: setFinal_ };
    if (!handlers[action]) throw new Error('不支援的操作');
    let data = handlers[action](p);
    // 寫入後直接回傳最新畫面資料，省掉一次往返
    if (action === 'save' || action === 'assign') data = boot_(p);
    if (action === 'setFinal') data = dashboard_(p);
    return JSON.stringify({ ok: true, data: data });
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
  const subject = '樂朗奇績效評核 登入驗證碼 ' + code;
  const body = me.name + ' 您好，\n\n您的登入驗證碼是：' + code + '\n驗證碼 10 分鐘內有效，請勿提供給他人。\n\n' +
    'Mã đăng nhập của bạn là: ' + code + '\nMã có hiệu lực trong 10 phút. Vui lòng không chia sẻ cho người khác.\n\n樂朗奇 enchantée';
  sendMail_(ctx, email, subject, body);
  return { sent: true };
}

// 「設定」的「寄件信箱」若是部署帳號在 Gmail 已驗證的寄件別名，就用它寄；否則用部署帳號本身寄
function sendMail_(ctx, to, subject, body) {
  const name = '樂朗奇 績效評核';
  const from = normEmail_(ctx.settings['寄件信箱']);
  if (from) {
    try {
      if (GmailApp.getAliases().map(normEmail_).indexOf(from) >= 0) {
        GmailApp.sendEmail(to, subject, body, { from: from, name: name });
        return;
      }
    } catch (e) { /* 別名不可用時改用部署帳號寄，不讓同仁登入不了 */ }
  }
  MailApp.sendEmail({ to: to, name: name, subject: subject, body: body });
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

let SS_ = null;
function ss_() { return SS_ || (SS_ = SpreadsheetApp.getActiveSpreadsheet()); }

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

/*
 * 讀取加速：每張工作表讀出後存進快取，之後的請求直接取用，不必每次重讀整份試算表。
 * 經由本系統的寫入會立即清掉該表的快取；執行長直接在試算表手動修改「設定」「名冊」，最慢 60 秒後生效。
 */
const MEMO_ = {};
const CACHE_PREFIX = 'T2_';
const MANUAL_SHEETS = [SHEETS.settings, SHEETS.roster];
const ALL_TABLES = [SHEETS.settings, SHEETS.roster, SHEETS.self, SHEETS.mgr, SHEETS.peer, SHEETS.thanks, SHEETS.voice, SHEETS.calib, SHEETS.up, SHEETS.upDone];

function clearMemo_() { Object.keys(MEMO_).forEach(k => { delete MEMO_[k]; }); }
function touch_(name) {
  delete MEMO_[name];
  try { CacheService.getScriptCache().remove(CACHE_PREFIX + name); } catch (e) { /* 快取失敗不影響功能 */ }
}
function prime_() {
  try {
    const got = CacheService.getScriptCache().getAll(ALL_TABLES.filter(n => !MEMO_[n]).map(n => CACHE_PREFIX + n));
    Object.keys(got).forEach(k => { MEMO_[k.slice(CACHE_PREFIX.length)] = JSON.parse(got[k]); });
  } catch (e) { /* 快取失敗就直接讀試算表 */ }
}
function plainCell_(v) {
  if (Object.prototype.toString.call(v) !== '[object Date]') return v;
  if (isNaN(v.getTime())) return '';
  const z = n => ('0' + n).slice(-2);
  return v.getFullYear() + '-' + z(v.getMonth() + 1) + '-' + z(v.getDate()) + ' ' + z(v.getHours()) + ':' + z(v.getMinutes()) + ':' + z(v.getSeconds());
}
function readSheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) return [];
  const v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  const h = v[0].map(x => String(x).trim());
  return v.slice(1).map((r, i) => {
    const o = { _row: i + 2 };
    h.forEach((k, j) => { if (k) o[k] = plainCell_(r[j]); });
    return o;
  }).filter(o => h.some(k => k && o[k] !== '' && o[k] !== null));
}
// fresh = true 時一定重讀試算表（寫入前定位列號用，避免依據過期資料寫錯列）
function readTable_(name, fresh) {
  if (!fresh && MEMO_[name]) return MEMO_[name];
  let rows = null;
  if (!fresh) {
    try { const raw = CacheService.getScriptCache().get(CACHE_PREFIX + name); if (raw) rows = JSON.parse(raw); } catch (e) { rows = null; }
  }
  if (!rows) {
    rows = readSheet_(name);
    try {
      const json = JSON.stringify(rows);
      if (json.length < 90000) CacheService.getScriptCache().put(CACHE_PREFIX + name, json, MANUAL_SHEETS.indexOf(name) >= 0 ? 60 : 600);
    } catch (e) { /* 快取失敗不影響功能 */ }
  }
  MEMO_[name] = rows;
  return rows;
}

// 防止使用者輸入的文字被試算表當成公式執行
function safe_(v) {
  return (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) ? "'" + v : v;
}

function rowValues_(sh, obj) {
  const have = headerOf_(sh);
  const missing = Object.keys(obj).filter(k => have.indexOf(k) < 0);
  if (missing.length) sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing]);
  return headerOf_(sh).map(h => (obj[h] === undefined || obj[h] === null) ? '' : safe_(obj[h]));
}

function appendRow_(name, arr) {
  const sh = ss_().getSheetByName(name);
  sh.getRange(sh.getLastRow() + 1, 1, 1, arr.length).setValues([arr.map(safe_)]);
  touch_(name);
}

function appendObj_(name, obj) {
  const sh = ss_().getSheetByName(name);
  const vals = rowValues_(sh, obj);
  sh.getRange(sh.getLastRow() + 1, 1, 1, vals.length).setValues([vals]);
  touch_(name);
}

function upsert_(name, match, obj) {
  const sh = ss_().getSheetByName(name);
  const hit = readTable_(name, true).filter(match)[0];
  if (!hit) return appendObj_(name, obj);
  const vals = rowValues_(sh, obj);
  sh.getRange(hit._row, 1, 1, vals.length).setValues([vals]);
  touch_(name);
}

function deleteRows_(name, match) {
  const sh = ss_().getSheetByName(name);
  readTable_(name, true).filter(match).map(r => r._row).sort((a, b) => b - a).forEach(r => sh.deleteRow(r));
  touch_(name);
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
  prime_();
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

  const ctx = { settings: settings, year: year, people: people, byId: byId, base: base };
  ['self', 'mgr', 'peer', 'voice'].forEach(f => {
    ctx[f] = readTable_(FORMS[f].sheet).filter(r => String(r['年度']).trim() === year).map(r => ({
      from: String(r['填寫人編號']).trim(), to: String(r['對象編號']).trim(), a: rowToAnswers_(f, r)
    })).filter(r => byId[r.from] && byId[r.to]);
  });
  ctx.thanks = readTable_(SHEETS.thanks).filter(r => String(r['年度']).trim() === year).map(r => ({
    from: String(r['填寫人編號']).trim(), to: String(r['對象編號']).trim(),
    tag: String(r['標籤'] || ''), text: String(r['內容'] || '')
  })).filter(r => byId[r.from] && byId[r.to]);
  ctx.up = readTable_(SHEETS.up).filter(r => String(r['年度']).trim() === year).map(r => {
    const a = {};
    FORMS.up.fields.forEach(f => { a[f.k] = f.type === 'score' ? num_(r[f.label], null) : String(r[f.label] || ''); });
    return { to: String(r['主管編號']).trim(), a: a };
  }).filter(r => byId[r.to]);
  ctx.upDone = {};
  readTable_(SHEETS.upDone).filter(r => String(r['年度']).trim() === year).forEach(r => {
    ctx.upDone[String(r['填寫人編號']).trim()] = String(r['狀態'] || '').trim();
  });
  ctx.calib = {};
  readTable_(SHEETS.calib).filter(r => String(r['年度']).trim() === year).forEach(r => {
    ctx.calib[String(r['編號']).trim()] = { grade: String(r['最終等第'] || '').trim(), note: String(r['備註'] || '') };
  });
  return ctx;
}

function rowToAnswers_(form, row) {
  const a = {};
  FORMS[form].fields.forEach(f => {
    const v = row[hdr_(f)];
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
// 還沒為所有直屬同仁指定完同儕評核人的主管（含執行長）。全部指定完，同儕回饋才開放
function assignPending_(ctx) {
  if (!ctx._pending) ctx._pending = ctx.people.filter(m => reportsOf_(ctx, m).some(r => r.raterIds.length < needRaters_(ctx, r)));
  return ctx._pending;
}
function needRaters_(ctx, p) { return Math.min(num_(ctx.settings['同儕最少人數'], 3), peerPool_(ctx, p).length); }
function minPeerGive_(ctx, me) {
  if (!me.rated) return 0;
  return Math.min(num_(ctx.settings['同儕回饋最少人數'], 3), peerPool_(ctx, me).length);
}

function tasks_(ctx, me) {
  const st = ok => ok ? 'done' : 'todo';
  const t = { self: 'na', voice: 'na', up: 'na', peer: 'na', thanks: 'na', assign: 'na', mgr: 'na' };
  if (ctx.byId[me.mgrId]) t.up = st(!!ctx.upDone[me.id]);
  if (me.rated) t.self = st(ctx.self.some(r => r.from === me.id));
  if (!me.isCEO) t.voice = st(ctx.voice.some(r => r.from === me.id));
  if (canPeer_(ctx, me)) {
    const need = assignedTo_(ctx, me);
    const done = id => ctx.peer.some(r => r.from === me.id && r.to === id);
    const given = ctx.peer.filter(r => r.from === me.id).length, min = minPeerGive_(ctx, me);
    t.peer = (need.length || min) ? st(need.every(p => done(p.id)) && given >= min) : (given ? 'done' : 'optional');
    if (assignPending_(ctx).length) t.peer = 'wait';
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
      minPeers: minPeerGive_(ctx, me), assignPending: assignPending_(ctx).length,
      weights: { mgr: num_(s['來源_主管'], 60), peer: num_(s['來源_同儕'], 25), self: num_(s['來源_自評'], 15) }
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
      answers: one(ctx.mgr, r.id),
      raters: r.raterIds, need: needRaters_(ctx, r), max: MAX_RATERS, maxPerDept: MAX_PER_DEPT, loadWarn: RATER_LOAD_WARN,
      pool: peerPool_(ctx, r).map(x => Object.assign(brief_(x), {
        load: ctx.people.filter(o => o.id !== r.id && o.raterIds.indexOf(x.id) >= 0).length }))
    })),
    up: ctx.byId[me.mgrId] ? { target: Object.assign(brief_(ctx.byId[me.mgrId]), { isCEO: ctx.byId[me.mgrId].isCEO }), state: ctx.upDone[me.id] || '' } : null,
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
      out[hdr_(f)] = n;
    } else if (f.type === 'choice') {
      if (f.options.indexOf(v) < 0) {
        if (f.req) throw err_('「' + f.label + '」尚未選擇', 'Chưa chọn: ' + label_(f));
        out[hdr_(f)] = '';
      } else out[hdr_(f)] = v;
    } else {
      const t = cleanText_(stripTr_(v), 2000);
      if (f.req && !t) throw err_('「' + f.label + '」尚未填寫', 'Chưa điền: ' + label_(f));
      out[hdr_(f)] = withTr_(t);
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
    if (form === 'up') return saveUp_(ctx, me, p.answers || {});
    let target = me;
    if (form === 'self') {
      if (!me.rated) throw err_('您本年度不需要填寫自評', 'Năm nay bạn không cần tự đánh giá.');
    } else if (form === 'voice') {
      if (me.isCEO) throw err_('執行長不需要填寫心聲問卷', 'Giám đốc điều hành không cần làm khảo sát này.');
    } else {
      target = ctx.byId[String(p.target)];
      if (!target || target.id === me.id || !target.rated) throw err_('評核對象不正確', 'Người được đánh giá không hợp lệ.');
      if (form === 'mgr' && target.mgrId !== me.id) throw err_('只能評核您的直屬同仁', 'Bạn chỉ có thể đánh giá nhân viên trực thuộc.');
      if (form === 'peer') {
        if (!canPeer_(ctx, me)) throw err_('您本年度不需要填寫同儕回饋', 'Năm nay bạn không cần nhận xét đồng nghiệp.');
        if (assignPending_(ctx).length) throw err_('主管還在指定同儕回饋的對象，全部完成後才會開放', 'Các quản lý đang chỉ định người nhận xét. Mục này sẽ mở khi tất cả hoàn thành.');
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

const MAX_RATERS = 5, MAX_PER_DEPT = 2, RATER_LOAD_WARN = 8;

function trOnly_(text) {
  const both = withTr_(text);
  const i = both.indexOf(TR_MARK);
  return i < 0 ? both : both.slice(i + TR_MARK.length);
}

function saveUp_(ctx, me, answers) {
  const boss = ctx.byId[me.mgrId];
  if (!boss) throw err_('您沒有需要回饋的直屬主管', 'Bạn không có quản lý trực tiếp để nhận xét.');
  ensureSheet_(SHEETS.up, UP_HEADERS);
  ensureSheet_(SHEETS.upDone, UP_DONE_HEADERS);
  const mine = r => String(r['年度']).trim() === ctx.year && String(r['填寫人編號']).trim() === me.id;
  const state = (readTable_(SHEETS.upDone, true).filter(mine)[0] || {})['狀態'];
  if (state === '已填') throw err_('您已經送出過了。這是匿名問卷，送出後無法修改', 'Bạn đã gửi rồi. Đây là khảo sát ẩn danh, không thể chỉnh sửa sau khi gửi.');
  const mark = st => upsert_(SHEETS.upDone, mine, { '年度': ctx.year, '填寫人編號': me.id, '填寫人': me.name, '狀態': st });
  if (answers.skip) { mark('略過'); return { saved: true }; }
  const row = { '年度': ctx.year, '主管編號': boss.id, '主管': boss.name };
  FORMS.up.fields.forEach(f => {
    if (f.type === 'score') {
      const n = Number(answers[f.k]);
      if (!(n >= 1 && n <= 5 && Math.floor(n) === n)) throw err_('「' + f.label + '」尚未評分', 'Chưa chấm điểm: ' + label_(f));
      row[f.label] = n;
    } else row[f.label] = trOnly_(cleanText_(answers[f.k], 1000));   // 只存中文，避免從語言認出是誰
  });
  // 插在隨機位置，讓列的順序對不上送出的先後
  const sh = ss_().getSheetByName(SHEETS.up);
  const n = Math.max(0, sh.getLastRow() - 1);
  const pos = Math.floor(Math.random() * (n + 1));
  if (pos < n) sh.insertRowBefore(pos + 2);
  const vals = rowValues_(sh, row);
  sh.getRange(pos + 2, 1, 1, vals.length).setValues([vals]);
  touch_(SHEETS.up);
  mark('已填');
  return { saved: true };
}

function assign_(p) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ctx = ctx_();
    const me = auth_(ctx, p.token);
    if (!yes_(ctx.settings['開放填寫'])) throw err_('本年度評核已截止，無法再修改', 'Đợt đánh giá năm nay đã kết thúc, không thể chỉnh sửa.');
    const target = ctx.byId[String(p.target)];
    if (!target || target.mgrId !== me.id || !target.rated) throw err_('只能為您的直屬同仁指定同儕評核人', 'Bạn chỉ có thể chỉ định cho nhân viên trực thuộc.');
    const pool = peerPool_(ctx, target).map(x => x.id);
    const ids = (Array.isArray(p.raters) ? p.raters : []).map(String)
      .filter((id, i, a) => pool.indexOf(id) >= 0 && a.indexOf(id) === i);
    const need = needRaters_(ctx, target);
    if (ids.length < need) throw err_('請至少指定 ' + need + ' 位同儕評核人', 'Vui lòng chỉ định ít nhất ' + need + ' người.');
    if (ids.length > MAX_RATERS) throw err_('最多指定 ' + MAX_RATERS + ' 位同儕評核人', 'Chỉ định tối đa ' + MAX_RATERS + ' người.');
    const poolPeople = peerPool_(ctx, target);
    const chosen = ids.map(id => ctx.byId[id]);
    const perDept = {};
    chosen.forEach(x => { perDept[x.dept] = (perDept[x.dept] || 0) + 1; });
    if (Object.keys(perDept).some(d => perDept[d] > MAX_PER_DEPT)) throw err_('同一個部門最多指定 ' + MAX_PER_DEPT + ' 位', 'Mỗi bộ phận tối đa ' + MAX_PER_DEPT + ' người.');
    if (poolPeople.some(x => x.dept === target.dept) && !chosen.some(x => x.dept === target.dept)) throw err_('請至少指定 1 位同部門的同事', 'Vui lòng chỉ định ít nhất 1 đồng nghiệp cùng bộ phận.');
    if (poolPeople.some(x => x.dept !== target.dept) && !chosen.some(x => x.dept !== target.dept)) throw err_('請至少指定 1 位其他部門的同事', 'Vui lòng chỉ định ít nhất 1 đồng nghiệp khác bộ phận.');
    const sh = ss_().getSheetByName(SHEETS.roster);
    const col = headerOf_(sh).indexOf('同儕評核人') + 1;
    const row = readTable_(SHEETS.roster, true).filter(r => String(r['編號']).trim() === target.id)[0];
    if (!col || !row) throw new Error('名冊缺少「同儕評核人」欄');
    sh.getRange(row._row, col, 1, 1).setValues([[ids.join(',')]]);
    touch_(SHEETS.roster);
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

// 在職比例：評核年度內的在職天數 ÷ 全年天數（算到評核基準日）。沒有到職日視為整年
function serviceRatio_(ctx, person) {
  const y = Number(ctx.year), start = new Date(y, 0, 1), end = ctx.base;
  const day = 86400000, whole = Math.round((end - start) / day) + 1;
  if (!person._join) return 1;
  const from = person._join > start ? person._join : start;
  const days = Math.round((end - from) / day) + 1;
  return Math.max(0, Math.min(1, Math.round(days / whole * 100) / 100));
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
      thanksOut: ctx.thanks.filter(r => r.from === p.id).length,
      ratio: serviceRatio_(ctx, p), joined: p._join ? dateText_(p._join) : ''
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
    p.proMonths = p.months === null ? null : Math.round(p.months * p.ratio * 100) / 100;
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
    const all = avg_(['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10', 'v11'].map(k => v[k]));
    if (v.v9 <= 2) add('red', '留任意願低', '「如果有一件事改變了，會讓你更想留下來，那會是什麼？」');
    else if (v.v9 === 3) add('yellow', '留任意願普通', '「你對自己明年在公司的角色有什麼期待？」');
    if (all !== null && all <= 2.5) add('red', '整體滿意度偏低', '「今年有哪些事讓你覺得特別辛苦或失望？」');
    else if (all !== null && all < 3.5) add('yellow', '整體滿意度中等偏低', '「工作上有什麼是我們可以馬上改善的？」');
    if (v.v1 <= 2) add('yellow', '工作成就感低', '「你最希望做哪一類的工作？現在的工作哪裡讓你使不上力？」');
    if (v.v4 <= 2) add('yellow', '團隊合作不愉快', '「和同事配合上，最卡的地方是什麼？」');
    if (v.v5 <= 2) add('red', '與主管關係緊張', '「你希望主管用什麼方式和你溝通與交辦工作？」（請避免讓主管得知問卷內容）');
    if (v.v6 <= 2) add('yellow', '工作負荷過重', '「哪些工作佔掉最多時間？有哪些可以簡化或分出去？」');
    if (v.v10 !== null && v.v10 <= 2) add('yellow', '對薪資福利不滿意', '「除了薪資數字之外，哪些福利或制度對你最重要？」先了解在意的是金額、公平性還是制度');
    if (v.v11 !== null && v.v11 <= 2) add('yellow', '不清楚公司對他的期待', '請主管和他一起訂出明年三個最重要的工作目標');
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
    assignPending: assignPending_(ctx).map(m => m.name),
    people: res.people, dist: res.dist, caps: res.caps, ratedCount: res.ratedCount, mood: mood, upward: upward_(ctx),
    months: { S: num_(s['月數_S'], null), A: num_(s['月數_A'], null), B: num_(s['月數_B'], null), C: num_(s['月數_C'], null) }
  };
}

function upward_(ctx) {
  const min = num_(ctx.settings['主管回饋最少份數'], 3);
  return ctx.people.filter(m => ctx.people.some(x => x.mgrId === m.id)).map(m => {
    const team = ctx.people.filter(x => x.mgrId === m.id);
    const rows = ctx.up.filter(r => r.to === m.id);
    const out = { id: m.id, name: m.name, dept: m.dept, team: team.length, n: rows.length, min: min,
      skipped: team.filter(x => ctx.upDone[x.id] === '略過').length, pending: team.filter(x => !ctx.upDone[x.id]).length, shown: rows.length >= min };
    if (out.shown) {
      out.avg = {};
      FORMS.up.fields.filter(f => f.type === 'score').forEach(f => { out.avg[f.k] = round1_(avg_(rows.map(r => r.a[f.k]))); });
      // 兩題文字各自排序後分開列出，不讓同一個人的兩段話和分數被連在一起
      out.good = rows.map(r => r.a.good).filter(String).sort();
      out.better = rows.map(r => r.a.better).filter(String).sort();
    }
    return out;
  });
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
