/** WINS Cash Control — Google Sheets backend.
 *  Paste this whole file into Code.gs, SAVE (Ctrl+S), then
 *  Deploy > New deployment > Web app > Execute as: Me > Access: Anyone.
 */

var VERSION = 'v2-dynamic';

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
    // Read every tab in the spreadsheet, not a fixed list, so new collections
    // added by the app sync without ever redeploying this script again.
    var names = {}, i;
    for (i = 0; i < COLLECTIONS.length; i++) names[COLLECTIONS[i]] = true;
    var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
    for (i = 0; i < sheets.length; i++) {
      var h = sheets[i].getRange(1, 1).getValue();
      if (String(h).trim() === 'id') names[sheets[i].getName()] = true;
    }
    var all = {};
    for (var n in names) all[n] = readAll_(n);
    return json_({ ok: true, version: VERSION, data: all, at: new Date().toISOString() });
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

/* ===================================================================
   BILL REMINDERS — daily email before a bill falls due
   -------------------------------------------------------------------
   ONE-TIME SETUP:
     1. Put your address in REMINDER_EMAIL below (comma-separate several).
     2. Save (Ctrl+S).
     3. Choose setupReminders from the function list and press Run.
        It creates a daily trigger; you only ever do this once.
   To check it works right away, run sendBillReminders manually.
   =================================================================== */

var REMINDER_EMAIL = 'sobhyelsaify3600@gmail.com';
var REMINDER_DAYS  = 5;    // warn this many days before the due date
var REMINDER_HOUR  = 8;    // local hour the daily check runs

var BILL_LABEL = {
  electricity:'كهرباء', internet:'إنترنت', water:'مياه', rent:'إيجار',
  phone:'هاتف', municipality:'رسوم حكومية', other:'أخرى'
};

function daysBetween_(a, b) {
  var d1 = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  var d2 = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((d2 - d1) / 86400000);
}

/** Creates (or re-creates) the once-a-day trigger. Safe to run twice. */
function setupReminders() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'sendBillReminders') {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }
  ScriptApp.newTrigger('sendBillReminders').timeBased().atHour(REMINDER_HOUR).everyDays(1).create();
  SpreadsheetApp.getActiveSpreadsheet()
    .toast('Daily bill reminder set for ~' + REMINDER_HOUR + ':00');
}

/** Emails every unpaid bill that is overdue or due within REMINDER_DAYS.
 *  A bill is only emailed once per day, tracked in the reminderLog tab. */
function sendBillReminders() {
  var bills = readAll_('bills');
  var branches = readAll_('branches');
  var today = new Date();
  var stamp = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var log = readAll_('reminderLog');

  var due = [], overdue = [];
  for (var id in bills) {
    var b = bills[id];
    if (!b || b.status === 'paid' || !b.dueDate) continue;
    if (log[id + '|' + stamp]) continue;             // already emailed today
    var left = daysBetween_(today, new Date(b.dueDate));
    if (left > REMINDER_DAYS) continue;
    var br = branches[b.branchId] || {};
    var row = {
      id: id, left: left,
      branch: br.nameAr || b.branchId || '',
      type: BILL_LABEL[b.type] || b.type || '',
      provider: b.provider || '',
      account: b.accountNo || '',
      amount: Number(b.amount || 0),
      dueDate: b.dueDate
    };
    (left < 0 ? overdue : due).push(row);
  }
  if (!due.length && !overdue.length) return;

  overdue.sort(function (x, y) { return x.left - y.left; });
  due.sort(function (x, y) { return x.left - y.left; });

  var total = 0;
  function rows(list, tone) {
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      total += r.amount;
      var when = r.left < 0 ? ('متأخرة ' + Math.abs(r.left) + ' يوم')
               : r.left === 0 ? 'تستحق اليوم'
               : ('خلال ' + r.left + ' يوم');
      html += '<tr>'
        + '<td style="padding:10px 12px;border-bottom:1px solid #eee">' + r.type
        + (r.provider ? ' — ' + r.provider : '') + '</td>'
        + '<td style="padding:10px 12px;border-bottom:1px solid #eee">' + r.branch + '</td>'
        + '<td style="padding:10px 12px;border-bottom:1px solid #eee;direction:ltr">' + r.dueDate + '</td>'
        + '<td style="padding:10px 12px;border-bottom:1px solid #eee;color:' + tone + ';font-weight:bold">' + when + '</td>'
        + '<td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:left;direction:ltr">'
        + r.amount.toLocaleString('en-US') + ' SAR</td>'
        + '</tr>';
    }
    return html;
  }

  var body = ''
    + '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#0b0d12;padding:26px">'
    + '<div style="max-width:660px;margin:auto;background:#fff;border-radius:14px;overflow:hidden">'
    + '<div style="background:#12141b;padding:20px 24px">'
    + '<div style="color:#C9A04D;font-size:20px;font-weight:bold;letter-spacing:2px">WINS</div>'
    + '<div style="color:#9aa0b4;font-size:12px;margin-top:4px">تذكير الفواتير — إدارة النقدية</div>'
    + '</div><div style="padding:22px 24px">';

  if (overdue.length) {
    body += '<h3 style="color:#c0392b;margin:0 0 10px">⚠ فواتير متأخرة — خطر قطع الخدمة (' + overdue.length + ')</h3>'
         + '<table style="width:100%;border-collapse:collapse;font-size:13px">' + rows(overdue, '#c0392b') + '</table>';
  }
  if (due.length) {
    body += '<h3 style="color:#b8860b;margin:' + (overdue.length ? '22px' : '0') + ' 0 10px">فواتير تستحق خلال '
         + REMINDER_DAYS + ' أيام (' + due.length + ')</h3>'
         + '<table style="width:100%;border-collapse:collapse;font-size:13px">' + rows(due, '#b8860b') + '</table>';
  }

  body += '<p style="margin-top:22px;font-size:14px">الإجمالي المستحق: <b style="direction:ltr;display:inline-block">'
       + total.toLocaleString('en-US') + ' SAR</b></p>'
       + '<p style="font-size:12px;color:#777;margin-top:18px">'
       + 'هذه رسالة تلقائية من نظام ونس لإدارة النقدية. سجّل السداد في التطبيق لإيقاف التذكير.</p>'
       + '</div></div></div>';

  var subject = (overdue.length ? '⚠ ' + overdue.length + ' فاتورة متأخرة — ' : '')
              + 'تذكير: ' + (due.length + overdue.length) + ' فاتورة تحتاج السداد';

  MailApp.sendEmail({ to: REMINDER_EMAIL, subject: subject, htmlBody: body });

  // Mark everything emailed today so tomorrow's run does not repeat it.
  var all = overdue.concat(due);
  for (var k = 0; k < all.length; k++) {
    write_('reminderLog', all[k].id + '|' + stamp, { billId: all[k].id, sentAt: new Date().toISOString() });
  }
}
