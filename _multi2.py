import io

p = "index.html"
s = io.open(p, encoding="utf-8").read()
orig = s

old = io.open("/tmp/old_sale.txt", encoding="utf-8").read().rstrip("\n")
assert old in s, "exact old function not found"

NEW = r"""function openSaleSheet(){
  /* One row per payment type so a whole day is entered in a single pass and
     saved once, instead of reopening this form for every type. */
  var ics={pos:'bank',cash:'wallet',other:'wallet',hospitality:'user'};
  var rows=PAY_TYPES.map(function(pt){
    return '<div class="mrow" data-type="'+pt.id+'">'+
      '<div class="mrow-ic">'+icon(ics[pt.id]||'wallet','ic-s')+'</div>'+
      '<div class="mrow-label">'+catLabel(PAY_TYPES,pt.id)+
        (pt.id==='hospitality'?'<i>'+t('notRevenue')+'</i>':'')+'</div>'+
      '<div class="mrow-input"><input type="number" step="0.01" min="0" inputmode="decimal" '+
        'data-amt="'+pt.id+'" placeholder="0"><span>'+t('sar')+'</span></div>'+
    '</div>';
  }).join('');

  var body='<div class="mlist">'+rows+'</div>'+
    '<div class="mtotal"><div><span>'+t('totRevenue')+'</span><b class="mono" id="m-rev">0</b></div>'+
      '<div id="m-hosp-wrap" hidden><span>'+t('totHospitality')+'</span><b class="mono" id="m-hosp">0</b></div></div>'+
    '<div class="field" style="margin-top:16px"><label>'+t('note')+'</label>'+
      '<textarea id="m-note" placeholder="'+t('notePh')+'"></textarea></div>'+
    '<button class="btn btn-primary btn-block" id="m-save">'+icon('check')+t('save')+'</button>';

  openSheet(t('addSale'),body,function(overlay){
    var inputs=Array.prototype.slice.call(overlay.querySelectorAll('[data-amt]'));
    function recalc(){
      var rev=0, hosp=0;
      inputs.forEach(function(inp){
        var v=Number(inp.value)||0;
        if(inp.getAttribute('data-amt')==='hospitality') hosp+=v; else rev+=v;
        inp.closest('.mrow').classList.toggle('filled', v>0);
      });
      overlay.querySelector('#m-rev').textContent=fmtMoney(rev);
      overlay.querySelector('#m-hosp').textContent=fmtMoney(hosp);
      overlay.querySelector('#m-hosp-wrap').hidden = hosp<=0;
    }
    inputs.forEach(function(inp){ inp.addEventListener('input',recalc); });
    recalc();

    overlay.querySelector('#m-save').onclick=async function(){
      var note=(overlay.querySelector('#m-note').value||'').trim();
      var entries=inputs.map(function(inp){
        return {type:inp.getAttribute('data-amt'), amount:Number(inp.value)||0};
      }).filter(function(e){ return e.amount>0; });
      if(!entries.length){ toast(t('enterOne'),'err'); return; }
      var now=new Date().toISOString(), dk=now.slice(0,10);
      /* Each type stays its own record so reports and cash maths are unchanged. */
      for(var k=0;k<entries.length;k++){
        await Store.add('sales',{
          branchId:STATE.session.branchId, type:entries[k].type, amount:entries[k].amount,
          note:note, staffId:STATE.session.id, staffName:STATE.session.name,
          createdAt:now, dateKey:dk
        });
      }
      closeSheet();
      toast(t('savedCount').replace('{n}', entries.length));
    };
  });
}"""

s = s.replace(old, NEW, 1)

anchor = '''totExpenses:{ar:"المصروفات",en:"Expenses"},'''
assert anchor in s
s = s.replace(anchor, anchor + '''
notRevenue:{ar:"لا تُحتسب إيراداً",en:"not revenue"},
enterOne:{ar:"أدخل مبلغاً واحداً على الأقل",en:"Enter at least one amount"},
savedCount:{ar:"تم حفظ {n} عملية",en:"Saved {n} entries"},''', 1)

style_anchor = "/* ---------- date range calendar ---------- */"
assert style_anchor in s
s = s.replace(style_anchor, r'''/* ---------- multi-entry rows ---------- */
.mlist{display:flex;flex-direction:column;gap:9px;margin-bottom:16px}
.mrow{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;
  border:1.5px solid var(--line);background:rgba(255,255,255,.03);transition:all .2s}
.mrow.filled{border-color:rgba(201,160,77,.45);background:rgba(201,160,77,.08)}
.mrow-ic{flex:none;width:34px;height:34px;border-radius:11px;display:flex;align-items:center;
  justify-content:center;background:rgba(255,255,255,.05);color:var(--ink-dim)}
.mrow.filled .mrow-ic{background:rgba(201,160,77,.18);color:var(--brand-lift)}
.mrow-label{flex:1;min-width:0;font-size:13px;font-weight:700;color:var(--ink)}
.mrow-label i{display:block;font-style:normal;font-size:10px;font-weight:600;color:var(--ink-faint);margin-top:2px}
.mrow-input{flex:none;display:flex;align-items:center;gap:6px;width:132px}
.mrow-input input{width:100%;padding:9px 11px;border-radius:10px;text-align:end;
  background:rgba(0,0,0,.28);border:1px solid var(--line);color:var(--ink);
  font-family:var(--font-mono);font-size:16px;font-weight:600;font-variant-numeric:tabular-nums}
.mrow-input input:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px rgba(201,160,77,.15)}
.mrow-input span{flex:none;font-size:10px;font-weight:800;color:var(--ink-faint)}
.mtotal{display:flex;gap:14px;flex-wrap:wrap;padding:14px 16px;border-radius:14px;
  border:1px solid rgba(0,230,162,.3);background:linear-gradient(160deg,rgba(0,230,162,.12),transparent)}
.mtotal>div{flex:1;min-width:110px}
.mtotal span{display:block;font-size:9.5px;font-weight:800;letter-spacing:.11em;
  text-transform:uppercase;color:var(--ink-faint)}
.mtotal b{display:block;margin-top:4px;font-size:21px;font-weight:600;color:var(--mint)}
.mtotal>div#m-hosp-wrap b{color:var(--violet)}

''' + style_anchor, 1)

io.open(p, "w", encoding="utf-8").write(s)
print("installed | changed:", s != orig)
