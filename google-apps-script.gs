/**
 * WINS Cash Control — Google Sheets backend
 * =========================================
 * Turns a Google Sheet into the storage + backup for the WINS cash app.
 *
 * SETUP (about 5 minutes):
 *  1. Go to https://sheets.google.com and create a new blank spreadsheet.
 *     Name it e.g. "WINS Cash Control Data".
 *  2. In that sheet: Extensions -> Apps Script.
 *  3. Delete whatever code is there, paste THIS ENTIRE FILE, then save.
 *  4. Click Deploy -> New deployment.
 *       - Click the gear next to "Select type" and choose "Web app".
 *       - Description: WINS API
 *       - Execute as:        Me  (your own account)
 *       - Who has access:    Anyone
 *         ^ required so the app can reach it. The URL is a long random string;
 *           treat it like a password and do not post it publicly.
 *  5. Click Deploy, then Authorize access and accept the Google prompts.
 *     (Google will warn the app is unverified — that is normal for your own
 *      script. Choose Advanced -> Go to ... (unsafe) to continue.)
 *  6. Copy the "Web app URL". It looks like:
 *       https://script.google.com/macros/s/AKfy....../exec
 *     Send that URL back and the app will be wired to it.
 *
 * WHENEVER YOU CHANGE THIS SCRIPT you must Deploy -> Manage deployments ->
 * edit the existing deployment -> Version: New version -> Deploy, otherwise
 * the old code keeps running.
 *
 * The sheet tabs (cities, branches, staff, sales, expenses, handovers,
 * editRequests) are created automatically on first use. Row 1 of each tab is
 * the header row; every later row is one record, stored as JSON in the "data"
 * column so the structure can evolve without breaking the sheet.
 */

var COLLECTIONS = ['cities', 'branches', 'staff', 'sales', 'expenses', 'handovers', 'editRequests'];

/** Optional shared secret. Leave '' to disable. If set, the app must send the
 *  same value; it stops strangers who guess the URL from writing data. */
var SHARED_SECRET = '';

function _sheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(['id', 'updatedAt', 'data']);
    sh.setFrozenRows(1);
    sh.getRange('A1:C1').setFontWeight('bold');
    sh.setColumnWidth(1, 220);
    sh.setColumnWidth(2, 180);
    sh.setColumnWidth(3, 700);
  }
  return sh;
}

function _readAll(name) {
  var sh = _sheet(name);
  var last = sh.getLastRow();
  var out = {};
  if (last < 2) return out;
  var rows = sh.getRange(2, 1, last - 1, 3).getValues();
  for (var i = 0; i < rows.length; i++) {
    var id = String(rows[i][0] || '').trim();
    if (!id) continue;
    try { out[id] = JSON.parse(rows[i][2] || '{}'); }
    catch (e) { out[id] = { _parseError: true, raw: String(rows[i][2] || '') }; }
  }
  return out;
}

/** Upsert one record. Returns the row number written. */
function _write(name, id, data) {
  var sh = _sheet(name);
  var last = sh.getLastRow();
  var when = new Date().toISOString();
  var payload = JSON.stringify(data);
  if (last >= 2) {
    var ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === String(id)) {
        sh.getRange(i + 2, 2, 1, 2).setValues([[when, payload]]);
        return i + 2;
      }
    }
  }
  sh.appendRow([id, when, payload]);
  return sh.getLastRow();
}

function _delete(name, id) {
  var sh = _sheet(name);
  var last = sh.getLastRow();
  if (last < 2) return false;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === String(id)) { sh.deleteRow(i + 2); return true; }
  }
  return false;
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function _authOk(params) {
  if (!SHARED_SECRET) return true;
  return String(params.secret || '') === SHARED_SECRET;
}

/** GET  -> ?action=all              returns every collection
 *  GET  -> ?action=get&c=sales      returns one collection            */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!_authOk(p)) return _json({ ok: false, error: 'unauthorized' });
  try {
    if (p.action === 'get' && p.c) return _json({ ok: true, collection: p.c, data: _readAll(p.c) });
    var all = {};
    for (var i = 0; i < COLLECTIONS.length; i++) all[COLLECTIONS[i]] = _readAll(COLLECTIONS[i]);
    return _json({ ok: true, data: all, at: new Date().toISOString() });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

/** POST body (JSON):
 *   { secret, op:'set',    collection:'sales', id:'s1', data:{...} }
 *   { secret, op:'delete', collection:'sales', id:'s1' }
 *   { secret, op:'batch',  writes:[ {op,collection,id,data}, ... ] }
 */
function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return _json({ ok: false, error: 'bad json' }); }
  if (!_authOk(body)) return _json({ ok: false, error: 'unauthorized' });

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var op = body.op || 'set';
    if (op === 'batch') {
      var writes = body.writes || [], done = 0;
      for (var i = 0; i < writes.length; i++) {
        var w = writes[i];
        if (w.op === 'delete') { _delete(w.collection, w.id); }
        else { _write(w.collection, w.id, w.data || {}); }
        done++;
      }
      return _json({ ok: true, written: done });
    }
    if (op === 'delete') return _json({ ok: _delete(body.collection, body.id) });
    if (!body.collection || !body.id) return _json({ ok: false, error: 'collection and id required' });
    var row = _write(body.collection, body.id, body.data || {});
    return _json({ ok: true, row: row });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

/** Run this once from the editor to create all tabs up front (optional). */
function setupTabs() {
  for (var i = 0; i < COLLECTIONS.length; i++) _sheet(COLLECTIONS[i]);
  SpreadsheetApp.getActiveSpreadsheet().toast('WINS tabs ready');
}
