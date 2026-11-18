// 本機測試用：以記憶體模擬 Google 試算表，直接執行 Code.gs。不會部署到 Apps Script。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class Sheet {
  constructor(name) { this.name = name; this.data = []; }
  getLastRow() { return this.data.length; }
  getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 0); }
  getDataRange() { return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  getRange(r, c, nr, nc) {
    const sh = this;
    return {
      getValues() {
        const out = [];
        for (let i = 0; i < nr; i++) {
          const row = [];
          for (let j = 0; j < nc; j++) { const v = (sh.data[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); }
          out.push(row);
        }
        return out;
      },
      setValues(vals) {
        vals.forEach((row, i) => {
          while (sh.data.length < r + i) sh.data.push([]);
          row.forEach((v, j) => {
            const target = sh.data[r - 1 + i];
            while (target.length < c + j) target.push('');
            if (typeof v === 'string' && v[0] === '=') throw new Error('formula written to sheet: ' + v);
            target[c - 1 + j] = (typeof v === 'string' && v[0] === "'") ? v.slice(1) : v;
          });
        });
      }
    };
  }
  deleteRow(r) { this.data.splice(r - 1, 1); }
  clearContents() { this.data = []; }
  setFrozenRows() {}
}

function createBackend() {
  const sheets = {};
  const ss = {
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => (sheets[n] = new Sheet(n))
  };
  let uuid = 0;
  const cache = {}, props = {}, outbox = [];
  const sandbox = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { getUuid: () => ('00000000-0000-4000-8000-' + String(++uuid * 7919 + 100000).padStart(12, '0')) },
    CacheService: { getScriptCache: () => ({
      getAll: ks => { const o = {}; ks.forEach(k => { if (k in cache) o[k] = cache[k]; }); return o; },
      get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = String(v); }, remove: k => { delete cache[k]; } }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); },
      deleteProperty: k => { delete props[k]; }, getProperties: () => Object.assign({}, props) }) },
    MailApp: { sendEmail: m => outbox.push(m) },
    LanguageApp: { translate: text => '（譯）' + text.length + ' 字' },
    console
  };
  vm.createContext(sandbox);
  const code = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  vm.runInContext(code + '\n;globalThis.__api = { setup, writeResults, api };', sandbox);
  // 測試直接改工作表（等同執行長手動編輯並等快取過期）後呼叫
  const expireCache = () => Object.keys(cache).filter(k => k.indexOf('T2_') === 0).forEach(k => { delete cache[k]; });
  return { sheets, api: sandbox.__api, outbox, props, cache, expireCache };
}

module.exports = { createBackend };
