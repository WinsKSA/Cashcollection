/** WINS Cash Control — Google Sheets backend.
 *  Paste this whole file into Code.gs, SAVE (Ctrl+S), then
 *  Deploy > New deployment > Web app > Execute as: Me > Access: Anyone.
 */

var COLLECTIONS = ['cities','branches','staff','sales','expenses','handovers','editRequests'];

function sh_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(['id','updatedAt','data']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function readAll_(name) {
  var sh = sh_(name), last = sh.getLastRow(), out = {};
  if (last < 2) return out;
  var rows = sh.getRange(2, 1, last - 1, 3).getValues();
  for (var i = 0; i < rows.length; i++) {
    var id = String(rows[i][0] || '').trim();
    if (!id) continue;
    try { out[id] = JSON.parse(rows[i][2] || '{}'); } catch (e) { out[id] = {}; }
  }
  return out;
}

function write_(name, id, data) {
  var sh = sh_(name), last = sh.getLastRow();
  var when = new Date().toISOString(), payload = JSON.stringify(data);
  if (last >= 2) {
    var ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === String(id)) {
        sh.getRange(i + 2, 2, 1, 2).setValues([[when, payload]]);
        return;
      }
    }
  }
  sh.appendRow([id, when, payload]);
}

function del_(name, id) {
  var sh = sh_(name), last = sh.getLastRow();
  if (last < 2) return;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === String(id)) { sh.deleteRow(i + 2); return; }
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    var all = {};
    for (var i = 0; i < COLLECTIONS.length; i++) all[COLLECTIONS[i]] = readAll_(COLLECTIONS[i]);
    return json_({ ok: true, data: all, at: new Date().toISOString() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (b.op === 'batch') {
      var w = b.writes || [];
      for (var i = 0; i < w.length; i++) {
        if (w[i].op === 'delete') del_(w[i].collection, w[i].id);
        else write_(w[i].collection, w[i].id, w[i].data || {});
      }
      return json_({ ok: true, written: w.length });
    }
    if (b.op === 'delete') { del_(b.collection, b.id); return json_({ ok: true }); }
    write_(b.collection, b.id, b.data || {});
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function setupTabs() {
  for (var i = 0; i < COLLECTIONS.length; i++) sh_(COLLECTIONS[i]);
  SpreadsheetApp.getActiveSpreadsheet().toast('WINS tabs ready');
}
