$('#mv_checklist_id_271291789').find('.ml-auto.pull-right').first().hide();
var department = 17144628949071;
let statuses = [];
/*var department = getSessionInfo('sessionuserkeydepartmentid');*/
const CLASS = `<style> .container_271291789{background:#fff;border-radius:10px;overflow:hidden;height:calc(90dvh - 120px);display:flex;flex-direction:column;width:100%;}
  .toolbar{flex-shrink:0;display:flex;gap:8px;padding:0px 20px 14px;align-items:center;position:relative;border-bottom: 1px solid #eceef2;}
  .search{position:relative}
  .search svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#6b7280;}
  .search input{width:207px;height:34px;padding:0 10px 0 34px;border:1px solid #dfe2e8;border-radius:6px;font:inherit;outline:none}
  .search input:focus,.colsearch input:focus{border-color:#1e3f99;}
  .dd{position:relative}
  .btn_271291789{height:34px;display:flex;align-items:center;gap:8px;padding:0 12px;border:1px solid #dfe2e8;border-radius:6px;background:#fff;font:inherit;cursor:pointer;color:#1f2430;}
  .btn_271291789:hover{background:#f8f9fb}
  .menu{display:none;position:absolute;top:40px;left:0;min-width:200px;background:#fff;border:1px solid #eceef2;border-radius:8px;box-shadow:0 8px 24px rgba(16,24,40,.12);padding:6px;z-index:20}
  .menu.open{display:block}
  .menu label,.menu div.opt{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;cursor:pointer;white-space:nowrap}
  .menu label:hover,.menu div.opt:hover{background:#f3f4f7}
  .menu div.opt.active{background:#e8eefc;color:#1e3f99;font-weight:500}
  .scroll{flex:1;min-height:0;overflow:auto}
  .table_271291789{width:100%;border-collapse:separate;border-spacing:0;min-width:1100px;padding:20px;}
  .table_271291789 th,.table_271291789 td{text-align:left;padding:0 16px;border-top:1px solid #eceef2;}
  .table_271291789 thead th{position:sticky;top:0;z-index:3;background:#fff;font-weight:400;color:#3a4150;height:34px;cursor:pointer;user-select:none;white-space:nowrap;border-left:1px solid #eceef2;}
  .table_271291789 thead th:first-child,tbody td:first-child{border-left:0}
  .table_271291789 thead th .arr{opacity:.5;margin-left:4px;font-size:10px}
  .table_271291789 thead th:hover {background-color: #eaf0ff;}
  .table_271291789 thead tr.filters td{position:sticky;top:34px;z-index:3;background:#fff;height:34px;padding:0 8px;border-left:1px solid #eceef2;}
  .table_271291789 thead tr.filters td:first-child{border-left:0}
  .colsearch input{width:100%;border:0;outline:0;background:transparent;font:inherit;padding:6px 8px;border-bottom:1px solid transparent}
  .colsearch input::placeholder{color:#3a4150}
  .table_271291789 tbody td{height:44px;vertical-align:middle}
  .table_271291789 tbody tr:hover{background:#fafbfd}
  tr.group td{background:#f3f5fa;font-weight:600;height:34px;color:#1e3f99;}
  .tn{word-break:break-all;max-width:150px;line-height:1.2}
  .badge_271291789{display:inline-flex;align-items:center;gap:6px;border:1px solid #dfe2e8;border-radius:5px;padding:2px 8px;font-size:12px;background:#fff}
  .badge_271291789 i{width:6px;height:6px;border-radius:50%;background:#22a559;display:inline-block}
  .badge_271291789.closed i{background:#e5484d}
  .table_271291789 td.date,.table_271291789 th.date{text-align:right}
  .open-btn{display:flex;justify-content:center;align-items:center;width:28px;height:28px;border:0;border-radius:6px;background:#1e3f99;color:#fff;cursor:pointer;display:grid;place-items:center}
  .open-btn svg{color: #fff;}
  .open-btn:hover{background:#17327a;}
  tbody tr.sel{background:#eaf0ff}
  tbody tr[data-id]{cursor:pointer}
  .chk{width:44px;padding:0 0 0 16px!important}
  input[type=checkbox],input[type=radio]{width:15px;height:15px;accent-color:#1e3f99;cursor:pointer}
  .empty{padding:40px;text-align:center;color:#6b7280;}
  .footer{flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:0px 20px;border-top:1px solid #eceef2;color:#6b7280;}
  .footer select{height:30px;border:1px solid #dfe2e8;border-radius:6px;padding:0 6px;margin:0 6px;font:inherit;background:#fff}
  .pager{display:flex;align-items:center;gap:4px}
  .pager a{min-width:28px;height:28px;border:0;background:transparent;border-radius:6px;cursor:pointer;font:inherit;color:#1f2430;display: inline-flex;align-items: center;justify-content: center;}
  .pager a:hover:not(:disabled){background:#eef0f4}
  .pager a.active{background:#e6e9ef;font-weight:600}
  .pager a:disabled{opacity:.35;cursor:default}
  .pager .info{margin-right:12px;color:#6b7280;}
  .ov{position:fixed;inset:0;background:rgba(17,24,39,.5);display:none;align-items:center;justify-content:center;z-index:100;padding:20px}
  .ov.open{display:flex}
  .dlg {
    background: #fff;
    border-radius: 10px;
    width: min(1100px, 100%);
    height: min(660px, 100%);
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, .3);
    overflow: hidden;
}
  .dlg.full{width:100%;height:100%;border-radius:8px}
  .dlg.min .mbody,.dlg.min .mfoot{display:none}
  .dlg.min{height:auto}
  .mhead{display:flex;align-items:center;gap:10px;padding:14px 20px;border-bottom:1px solid #eceef2;flex: 0 0 auto;}
  .mhead h2{margin:0;font-size:14px;font-weight:600}
  .mhead .tools{margin-left:auto;display:flex;gap:6px}
  .ib{width:28px;height:28px;border:0;background:none;border-radius:6px;cursor:pointer;color:#4b5563;display:grid;place-items:center}
  .ib:hover{background:#eef0f4}
  .mbody{flex:1;min-height:0;display:grid;}
  .mleft {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 16px 20px;
    line-height: 1.55;
    color: #2b3140;
}
  .mleft p{margin:0 0 12px}
  .mright{background:#f4f5f7;padding:16px 20px;overflow:auto;display:flex;flex-direction:column;gap:14px}
  .panel{background:#fff;border:1px solid #eceef2;border-radius:8px}
  .info{display:grid;grid-template-columns:130px 1fr;row-gap:14px;margin:18px 0 20px;padding-left:2px}
  .info .l{color:#4b5563}
  .info .red{color:#e5484d}
  .info .b{font-weight:600}
  .ptitle{padding:12px 14px;font-weight:600;border-bottom:1px solid #eceef2;}
  .mleft table{min-width:0;font-size:13px}
  .mleft table th{position:static;border-left:0;height:36px;font-weight:400;color:#4b5563;cursor:default;background:#fafbfc;padding:0 14px}
  .mleft table td{height:40px;padding:0 14px}
  .mleft .panel{overflow:hidden}
  .cd-card{padding:14px 16px}
  .cd-card h3{margin:0 0 12px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px}
  .cd{background:#111;border-radius:8px;display:grid;grid-template-columns:repeat(4,1fr);padding:14px 4px;color:#fff;text-align:center}
  .cd div{border-left:1px solid #444}
  .cd div:first-child{border-left:0}
  .cd b{display:block;font-size:28px;font-weight:600;line-height:1.1}
  .cd span{font-size:12px;color:#d1d5db}
  .docs{padding:0}
  .doc{display:flex;align-items:center;gap:12px;padding:10px 16px}
  .doc .ic{width:24px;height:28px;border-radius:4px;display:grid;place-items:center;font-size:7px;font-weight:700;color:#fff;flex-shrink:0}
  .doc .n{flex:1;min-width:0}
  .doc .n div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500}
  .doc .n small{color:#6b7280;}
  .dl{height:30px;padding:0 12px;border:1px solid #dfe2e8;border-radius:6px;background:#fff;cursor:pointer;display:flex;align-items:center;gap:6px;font:inherit;font-weight:500}
  .dl:hover{background:#f3f4f7}
  .mfoot {
    display: flex;
    flex: 0 0 64px;
    height: 64px;
    min-height: 64px;
    box-sizing: border-box;
    justify-content: flex-end;
    align-items: center;
    gap: 12px;
    padding: 0 20px;
    border-top: 1px solid #eceef2;
    background: #fff;
}
  .mfoot button{height:34px;border-radius:6px;font:inherit;font-weight:500;cursor:pointer;padding:0 22px}
  .mfoot .cancel{background:#fff;border:1px solid #dfe2e8;width:136px}
  .mfoot .go{background:#1e3f99;color:#fff;border:0;width:136px}
  .mfoot .go:hover{background:#17327a;}
  @media(max-width:820px){.mbody{grid-template-columns:1fr;overflow:auto}.mleft,.mright{overflow:visible}}
  .seg{display:flex;border:1px solid #dfe2e8;border-radius:6px;overflow:hidden}
  .seg a{width:34px;height:32px;border:0;background:#fff;cursor:pointer;display:grid;place-items:center;color:#6b7280;}
  .seg a.on{background:#e8eefc;color:#1e3f99;}
  .card-con{display:none;padding:16px 20px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;align-content:start}
  .view-cards .card-con{display:grid}
  .view-cards .scroll>table{display:none}
  .gh{grid-column:1/-1;font-weight:600;color:#1e3f99;background:#f3f5fa;border-radius:6px;padding:8px 12px}
  .tc{border:1px solid #eceef2;border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;cursor:pointer;background:#fff;transition:box-shadow .15s,border-color .15s}
  .tc:hover{box-shadow:0 4px 14px rgba(16,24,40,.08)}
  .tc.sel{border-color:#1e3f99;background:#eaf0ff}
  .tc-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
  .tc-title{font-weight:600;font-size:14px;line-height:1.3}
  .tc-type{color:#3a4150}
  .tc-no{color:#6b7280;font-size:12px;word-break:break-all}
  .tc dl{margin:0;display:grid;grid-template-columns:110px 1fr;row-gap:6px;font-size:12.5px}
  .tc dt{color:#6b7280;}
  .tc dd{margin:0}
  .tc-foot{display:flex;justify-content:space-between;align-items:center;border-top:1px solid #eceef2;padding-top:10px;margin-top:2px}
  .tc-foot .due{color:#6b7280;font-size:12px}
  .tc-foot .due b{color:#1f2430;font-weight:600}

  .badge_271291789.s-draft i{background:#9ca3af}.badge_271291789.s-sent i{background:#2563eb}.badge_271291789.s-ok i{background:#22a559}.badge_271291789.s-done i{background:#0d9488}.badge_271291789.s-bad i{background:#e5484d}
  td.num,th.num{text-align:right}
  .mleft table th.num,.mleft table td.num{text-align:right}
  .tot{display:grid;grid-template-columns:1fr auto;gap:6px 24px;justify-content:end;margin-top:14px;padding:0 4px 4px;font-size:13px}
  .tot div:nth-child(odd){color:#6b7280;text-align:right}
  .tot div:nth-child(even){text-align:right;font-weight:500}
  .tot .grand{font-size:15px;font-weight:700!important;color:#1f2430;}
  .tl{padding:14px 16px;display:flex;flex-direction:column}
  .tl .st{display:flex;gap:10px;position:relative;padding-bottom:16px}
  .tl .st:last-child{padding-bottom:0}
  .tl .dot{width:12px;height:12px;border-radius:50%;border:2px solid #cbd0d9;background:#fff;margin-top:2px;flex-shrink:0;z-index:1}
  .tl .st::before{content:'';position:absolute;left:5px;top:14px;bottom:-2px;width:2px;background:#e1e4ea}
  .tl .st:last-child::before{display:none}
  .tl .st.done .dot{background:#1e3f99;border-color:#1e3f99;}
  .tl .st.done::before{background:#1e3f99;}
  .tl .st.cur .dot{box-shadow:0 0 0 4px #dbe5ff}
  .tl .st span{color:#6b7280;}
  .tl .st.done span{color:#1f2430; font-weight:500}
  .tl .cancel-note{margin-top:12px;color:#e5484d;font-weight:500}
.status-menu {
    position: absolute;
    z-index: 9999;
    min-width: 220px;
    max-height: 320px;
    overflow-y: auto;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 5px;
    box-shadow: 0 8px 24px rgba(0,0,0,.12);
}

.status-menu .opt {
    display: flex;
    align-items: center;
    padding: 9px 12px;
    font-size: 13px;
    cursor: pointer;
    border-radius: 5px;
}

.status-menu .opt:hover {
    background: #f1f5f9;
}

.status-menu .opt.active {
    background: #eef2ff;
    color: #3346a8;
}

.status-menu .menu-divider {
    height: 1px;
    background: #e5e7eb;
    margin: 5px 0;
}
.status-description-group {
    margin-top: 20px;
}

.status-description {
    width: 100%;
    min-height: 90px;
    box-sizing: border-box;
    resize: vertical;
    border: 1px solid #dce1e8;
    border-radius: 7px;
    padding: 10px 12px;
    font: inherit;
    font-size: 13px;
    outline: none;
}

.status-description:focus {
    border-color: #4778d0;
}
</style>`;

var $card = $('<div>', {
    class: 'container_271291789'
});
var $toolbar = $('<div>', {
    class:'toolbar'
});
var $search = $('<div>', {
    class:'search'
});
$('<i class="far fa-search" style="position:absolute;top:10px;left:10px;color: #9ca3af;font-size: 11px;"></i>').appendTo($search);
var $searchinput = $('<input>', {
    class:'',
    placeholder:'PO дугаар, Төлөв, Тайлбар...'
});
$search.append($searchinput);
var $group = $('<div>', {
    class:'dd'
});
var $groupbtn = $('<a>', {
    class:'btn_271291789',
    'data-menu':'groupMenu'
});
var $groupmenu = $('<div>', {
    class:'menu',
});
$('<i class="far fa-filter" style="color: #9ca3af;font-size: 11px;"></i> Бүлэглэх <i class="far fa-angle-down" style="color: #9ca3af;font-size: 11px;"></i>').appendTo($groupbtn);
$group.append($groupbtn,$groupmenu);

var $column = $('<div>', {
    class:'dd'
});
var $columnbtn = $('<a>', {
    class:'btn_271291789',
    'data-menu':'colMenu'
});
var $columnmenu = $('<div>', {
    class:'menu',
});
$('<i class="far fa-list" style="color: #9ca3af;font-size: 11px;"></i> Мөр харуулах <i class="far fa-angle-down" style="color: #9ca3af;font-size: 11px;"></i>').appendTo($columnbtn);
$column.append($columnbtn,$columnmenu);
$groupbtn.on('click', function() {
    $groupmenu.toggleClass('open');
});
$columnbtn.on('click', function() {
    $columnmenu.toggleClass('open');
});
  $columnmenu.on('change', 'input[data-c]', function () {
    const k = $(this).data('c');
    if (this.checked) delete state.hidden[k]; else state.hidden[k] = true;
    renderHead();
    render();
  });
  $(document).on('click', e => {
    const $trg = $(e.target).closest('[data-menu]');
    $('.menu').each(function () {
      if (!$trg.length && !$.contains(this, e.target)) $(this).removeClass('open');
    });
    const $g = $(e.target).closest('[data-g]');
    if ($g.length) { const g = $g.attr('data-g'); state.group = g==='null' ? null : g; state.page = 1; renderMenus();render();}
  });
var $view = $('<div>', {
    class:'seg'
});
var $listbtn = $('<a>', {
    'data-v':'table',
    title:'Хүснэгт',
    html:'<i class="far fa-th-list" style="color: #9ca3af;font-size: 11px;"></i>'
});
var $cardbtn = $('<a>', {
    'data-v':'cards',
    class:'on',
    title:'Карт',
    html:'<i class="far fa-border-all" style="color: #9ca3af;font-size: 11px;"></i>'
});
$view.append($cardbtn,$listbtn);
$listbtn.on('click',function() {
    state.view = $listbtn.data('v');
    $listbtn.addClass('on');
    $cardbtn.removeClass('on');
    render();
});
$cardbtn.on('click',function() {
    state.view = $cardbtn.data('v');
    $cardbtn.addClass('on');
    $listbtn.removeClass('on');
    render();
});

$toolbar.append($search,$group,$column,$view);
$card.append($toolbar);

var $scroll = $('<div>', {
    class:'scroll'
});
var $stable = $('<table>', {
    class:'table_271291789'
});
var $sthead = $('<thead>');
var $slabel = $('<tr>');
 $slabel.on('click', 'th[data-k]', function () {
    const k = $(this).data('k');
    if (state.sort===k) state.dir *= -1; else { state.sort = k; state.dir = 1; }
    renderHead(); 
    render();
  });
var $sfilter = $('<tr>');
$sfilter.on('input', 'input[data-k]', function () { state.col[$(this).data('k')] = this.value; state.page = 1; render(); });
$sthead.append($slabel,$sfilter);
var $stbody = $('<tbody>');
var $scard = $('<div>', {
    class:'card-con'
});
$stable.append($sthead,$stbody);
$scroll.append($stable,$scard);
var $footer = $('<div>', {
    class:'footer',
    html:'<div>Хуудсанд <select id="perPage"><option selected>20</option><option>50</option><option>100</option></select></div>'
});
var $pagination = $('<div>', {
    class:'pager'
});
$footer.append($pagination);
$card.append($scroll,$footer);

	$('[data-process-id="179481970018711"]').find('.row').first().append($card,CLASS);

  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&','<':'<','>':'>','"':'"'}[c]));
  const fmt = n => (Number(n) || 0).toLocaleString('en-US') + ' ₮';
  const pad = n => String(n).padStart(2, '0');
  const ds = d => `${d.getFullYear()}/${pad(d.getMonth()+1)}/`;/*${pad(d.getDate())}*/
  const join = (arr, fn) => $.map(arr, fn).join('');

  const FLOW = ['Шинэ','Буцаасан','Баталсан','Цуцалсан','Дахин илгээсэн'];
  const SCLASS = {'Шинэ':'s-draft','Буцаасан':'s-sent','Баталсан':'s-ok','Дахин илгээсэн':'s-done','Цуцалсан':'s-bad'};
  const COLS = [
    {k:'booknumber',t:'PO дугаар'}, {k:'bookdate',t:'Захиалсан огноо'}, {k:'duedate',t:'Хүргэх огноо'}, {k:'totalamount',t:'Нийт дүн',cls:'num'}, {k:'wfmstatusname',t:'Төлөв'}, {k:'description',t:'Дэлгэрэнгүй'}, {k:'locationname',t:'Хүргэлтийн цэг'} 
  ];
  const GROUPABLE = [{k:null,t:'Бүлэглэхгүй'},{k:'wfmstatusname',t:'Төлвөөр'}];
var DATA = [];
var raw = getProcessParam('procportalpurchaseorderlist_004',department + '@filterdepartmentid');  
if(raw) {
    DATA = raw.purchaseorders;
}
  // ---------- state ----------
  const state = {q:'', col:{}, sort:null, dir:1, group:null, page:1, per:20, hidden:{}, selected:null, view:'cards'};
  const val = (r,k) => k==='totalamount' ? fmt(r.totalamount) : r[k];
  const visibleCols = () => $.grep(COLS, c => !state.hidden[c.k]);
  const badge = s => `<span class="badge_271291789 ${SCLASS[s]}"><i></i>${s}</span>`;
  const OPEN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></svg>';
  const CHANGE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"stroke="currentColor" stroke-width="2"stroke-linecap="round" stroke-linejoin="round"><path d="M20 7v5h-5"></path><path d="M4 17v-5h5"></path><path d="M5.64 9A8 8 0 0 1 19.07 5L20 7"></path><path d="M4 17l.93 2A8 8 0 0 0 18.36 15"></path></svg>';

  function filtered() {
    const q = $.trim(state.q).toLowerCase();
    let rows = $.grep(DATA, r => {
      if (q && !['booknumber','bookdate','duedate','totalamount','wfmstatusname','description','locationname'].some(k => r[k].toLowerCase().includes(q))) return false;
      return Object.keys(state.col).every(k => !state.col[k] || String(val(r,k)).toLowerCase().includes(state.col[k].toLowerCase()));
    });
    if (state.sort) {
      const k = state.sort;
      rows.sort((a,b) => (k==='totalamount' ? a.totalamount-b.totalamount : String(a[k]).localeCompare(String(b[k]),'mn',{numeric:true})) * state.dir);
    }
    if (state.group) { const g = state.group; rows.sort((a,b) => a[g].localeCompare(b[g],'mn')); }
    return rows;
  }
function getNextStatus(id, isManyRows = 0) {
    return $.ajax({
        url: '/mdobject/getWorkflowNextStatus',
        type: 'POST',
        data: {
            metaDataId: 1794543250835647,
            'dataRow[id]': id,
            isManyRows: isManyRows
        },
        dataType: 'json'
    });
};
function renderStatusMenu(response, orderId, x, y) {
    if (response.status !== 'success' || !response.data?.length) return;

    $('.status-menu').remove();

    const $menu = $(`<div class="menu open status-menu"></div>`);

    response.data.forEach(status => {
        const $option = $('<div>', {
            class: 'opt status-option',
            'data-status-id': status.wfmstatusid,
            'data-process-id': status.wfmstatusprocessid,
            'data-order-id': orderId
        });

        $('<span>').css({
            width: '9px',
            height: '9px',
            borderRadius: '50%',
            background: status.wfmstatuscolor || '#999',
            marginRight: '8px',
            flexShrink: 0
        }).appendTo($option);

        $option.append(document.createTextNode(status.wfmstatusname));
        $menu.append($option);
    });

    $('body').append($menu);

    $menu.css({
        position: 'absolute',
        left: x + 5,
        top: y + 5,
        zIndex: 99999
    });

    const rect = $menu[0].getBoundingClientRect();

    if (rect.right > window.innerWidth) {
        $menu.css('left', x - rect.width - 5 + window.scrollX);
    }

    if (rect.bottom > window.innerHeight) {
        $menu.css('top', y - rect.height - 5 + window.scrollY);
    }
}

function renderHead() {
    const cols = visibleCols();
    $slabel.html(join(cols, c => `<th class="${c.cls||''}" data-k="${c.k}">${c.t}<span class="arr">${state.sort===c.k?(state.dir>0?'▲':'▼'):''}</span></th>`) + '<th style="width:60px;cursor:default"></th>');
    $sfilter.html(join(cols, c => `<td class="colsearch ${c.cls||''}"><input data-k="${c.k}" placeholder="Хайх" value="${esc(state.col[c.k]||'')}" ${c.cls?'style="text-align:right"':''}></td>`) + '<td></td>');
}

function renderMenus() {
    $groupmenu.html(join(GROUPABLE, g => `<div class="opt ${state.group===g.k?'active':''}" data-g="${g.k}">${g.t}</div>`));
    $columnmenu.html(join(COLS, c => `<label><input type="checkbox" data-c="${c.k}" ${state.hidden[c.k]?'':'checked'}> ${c.t}</label>`));
}

  function render() {
    const rows = filtered(), total = rows.length, cols = visibleCols();
    const pages = Math.max(1, Math.ceil(total/state.per));
    state.page = Math.min(state.page, pages);
    const start = (state.page-1)*state.per, slice = rows.slice(start, start+state.per);

    let html = '', last = null;
    $.each(slice, (_, r) => {
      if (state.group && r[state.group] !== last) { last = r[state.group]; html += `<tr class="group"><td colspan="${cols.length+1}">${esc(last)}</td></tr>`; }
      html += `<tr data-id="${r.orderbookid}" class="${state.selected===r.orderbookid?'sel':''}">` +
        join(cols, c => c.k==='wfmstatusname' ? `<td>${badge(r.wfmstatusname)}</td>` : `<td class="${c.cls||''}">${esc(val(r,c.k) ?? '')}</td>`) +
        `<td style="text-align:right"><span style="display:flex;"><a class="open-btn" style="background: #1e9988; margin-right:10px;" title="Төлөв өөрчлөх" data-event="change">${CHANGE}</a><a class="open-btn" title="Нээх" data-event="open">${OPEN}</a></span></td></tr>`;
    });
    $stbody.html(html || `<tr><td class="empty" colspan="${cols.length+1}">Илэрц олдсонгүй</td></tr>`);

    let ch = '', lg = null;
    $.each(slice, (_, x) => {
      if (state.group && x[state.group] !== lg) { lg = x[state.group]; ch += `<div class="gh">${esc(lg)}</div>`; }
      ch += `<div class="tc ${state.selected===x.orderbookid?'sel':''}" data-id="${x.orderbookid}">
        <div class="tc-top"><div class="tc-title">${esc(x.booknumber ?? '')}</div>${badge(x.wfmstatusname)}</div>
        <div class="tc-type">${esc(x.description ?? '')}</div>
        <dl><dt>Захиалсан</dt><dd>${esc(x.bookdate ?? '')}</dd><dt>Хүргэх</dt><dd>${esc(x.duedate ?? '')}</dd><dt>Хүргэлтийн цэг</dt><dd>${esc(x.locationname ?? '')}</dd></dl>
        <div class="tc-foot"><span class="due">Нийт дүн: <b>${fmt(x.totalamount)}</b></span><span class="due" style="display:flex;gap:10px;"><a class="open-btn" style="background:#1e9988;" title="Төлөв өөрчлөх" data-event="change">${CHANGE}</a><a class="open-btn" title="Нээх" data-event="open">${OPEN}</a></span></div></div>`;
    });
    $scard.html(ch || '<div class="empty" style="grid-column:1/-1">Илэрц олдсонгүй</div>');
    $('.container_271291789').toggleClass('view-cards', state.view==='cards');

    const a = total ? start+1 : 0, b = Math.min(start+state.per, total);
    let p = `<span class="info">${a}-${b} of ${total}</span><a ${state.page===1?'disabled':''} data-p="${state.page-1}">←</a>`;
    const from = Math.max(1, Math.min(state.page-2, pages-4)), to = Math.min(pages, from+4);
    for (let i=from; i<=to; i++) p += `<a class="${i===state.page?'active':''}" data-p="${i}">${i}</a>`;
    p += `<a ${state.page===pages?'disabled':''} data-p="${state.page+1}">→</a>`;
    $pagination.html(p);
  }
  function getOrderById(id) {
    return DATA.find(r =>
        String(r.orderbookid) === String(id)
    );
  }



function openModal(data) {
    if (!data) return;

    $('.po-modal-overlay').remove();

    const items = Array.isArray(data.orderitems) ? data.orderitems : [];

    const lines = items.map((item, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${esc(item.description)}</td>
            <td class="num">${esc(item.qty ?? '')}</td>
            <td class="num">${fmt(item.unitprice)}</td>
            <td class="num">${fmt(item.totalamount)}</td>
        </tr>
    `).join('');

    const $html = $(`
        <div class="ov open po-modal-overlay">
            <div class="dlg" role="dialog" aria-modal="true">
                <div class="mhead">
                    <h2 class="m-title">${esc(data.booknumber)}</h2>

                    ${badge(data.wfmstatusname)}

                    <div class="tools">
                        <button class="ib m-close" title="Хаах">
                            <svg width="15" height="15" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" stroke-width="2"
                                stroke-linecap="round">
                                <path d="M18 6 6 18M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                </div>

                <div class="mleft">
                    <div class="info" style="margin-top:4px">
                        <div class="l">PO дугаар</div>
                        <div class="b">${esc(data.booknumber)}</div>

                        <div class="l">Захиалсан огноо</div>
                        <div>${esc(data.bookdate)}</div>

                        <div class="l">Хүргэх огноо</div>
                        <div class="red">${esc(data.duedate)}</div>

                        <div class="l">Хүргэлтийн цэг</div>
                        <div>${esc(data.locationname)}</div>

                        <div class="l">Тайлбар</div>
                        <div>${esc(data.description)}</div>
                    </div>

                    <div class="panel">
                        <div class="ptitle">
                            Захиалгын мөр (${items.length})
                        </div>

                        <table>
                            <thead>
                                <tr>
                                    <th style="width:44px">№</th>
                                    <th style="width:66%">Бараа, үйлчилгээ</th>
                                    <th class="num"style="width:10%">Тоо</th>
                                    <th class="num"style="width:10%">Нэгж үнэ</th>
                                    <th class="num"style="width:10%">Дүн</th>
                                </tr>
                            </thead>
                            <tbody class="m-lines">
                                ${lines || `
                                    <tr>
                                        <td colspan="5" style="text-align:center">
                                            Захиалгын мөр байхгүй
                                        </td>
                                    </tr>
                                `}
                            </tbody>
                        </table>
                    </div>

                    <div class="tot">
                        <div>Нийт дүн</div>
                        <div class="grand">${fmt(data.totalamount)}</div>
                    </div>
                </div>

                <div class="mfoot">
                    <button class="cancel m-cancel">Хаах</button>
                    <button class="go m-go" data-id="${data.orderbookid}">Төлөв өөрчлөх</button>
                </div>
            </div>
        </div>
    `);

    $('body').append($html);
};

    function closeModal() {
		const $overlay = $('.po-modal-overlay');
        $overlay.remove();
        $(document).off('keydown.po-modal-overlay');
    }
function openOrder($row) {
    const orderId = $row.attr('data-id');
    const order = DATA.find(r => String(r.orderbookid) === String(orderId));

    if (order) openModal(order);
}
$(document)
    .off('click.po-modal-overlay', '.m-close, .m-cancel')
    .on('click.po-modal-overlay', '.m-close, .m-cancel', function () {
        closeModal();
    });

$(document)
    .off('click.po-modal-overlay', '.ov')
    .on('click.po-modal-overlay', '.ov', function (e) {
        if (e.target === this) closeModal();
    });

$(document)
    .off('click.po-modal-overlay', '.m-full')
    .on('click.po-modal-overlay', '.m-full', function () {
        $(this).closest('.dlg').toggleClass('fullscreen');
    });

$(document)
    .off('click.po-modal-overlay', '.m-min')
    .on('click.po-modal-overlay', '.m-min', function () {
        $(this).closest('.dlg').toggleClass('minimized');
    });

$(document)
    .off('keydown.po-modal-overlay')
    .on('keydown.po-modal-overlay', function (e) {
        if (e.key === 'Escape') closeModal();
    });

$(document)
    .off('click.po-modal-overlay', '.m-go')
    .on('click.po-modal-overlay', '.m-go', function (e) {
        const orderId = $(this).attr('data-id');
        const x = e.pageX;
        const y = e.pageY;

        getNextStatus(orderId)
            .done(response => {
                if (response.status === 'success') {
                    renderStatusMenu(response, orderId, x, y);
                }
            })
            .fail(xhr => {
                console.error(xhr.responseText);
            });
    });
 $stbody.on('click', e => {
    const $t = $(e.target), $row = $t.closest('[data-id]');
    if (!$row.length) return;
    if ($t.closest('.open-btn').length) {
    	const orderId = $row.attr('data-id');
    	const orderEvent = $t.closest('.open-btn').attr('data-event');
	    if (orderEvent === 'open') {
    	    const order = DATA.find(r =>
        	    String(r.orderbookid) === String(orderId)
        	);

	        if (order) openModal(order);
    		    return;
	    }
	    if (orderEvent === 'change') {
        	getNextStatus(orderId)
            	.done(response => {
                	statuses = response.data;
                	renderStatusMenu(response, orderId, e.pageX, e.pageY);
            	})
        	    .fail(xhr => {
    	            console.error(xhr.responseText);
	            });
    	    return;
	    }
    	return;
	}
    const id = $row.attr('data-id');
    state.selected = state.selected===id ? null : id;
    render();
    $(document).trigger('po:select', [state.selected===null ? null : getOrderById(state.selected)]);
  });

  $scard.on('click', e => {
    const $t = $(e.target), $row = $t.closest('[data-id]');
    if (!$row.length) return;
    if ($t.closest('.open-btn').length) {
	    const orderId = $row.attr('data-id');
    	const orderEvent = $t.closest('.open-btn').attr('data-event');
	    if (orderEvent === 'open') {
    	    const order = DATA.find(r =>
        	    String(r.orderbookid) === String(orderId)
        	);

	        if (order) openModal(order);
    	    return;
    	}
	    if (orderEvent === 'change') {
    	    getNextStatus(orderId)
        	    .done(response => {
            	    statuses = response.data;
	                renderStatusMenu(response, orderId, e.pageX, e.pageY);
            	})
            	.fail(xhr => {
                	console.error(xhr.responseText);
            	});
	        return;
    	}
	    return;
	}
    const id = $row.attr('data-id');
    state.selected = state.selected===id ? null : id;
    render();
    $(document).trigger('po:select', [state.selected===null ? null : getOrderById(state.selected)]);
  });

function openStatusModal(data,status) {
    if (!data) return;

    $('.po-modal-overlay').remove();

    const $html = $(`
        <div class="ov open po-modal-overlay">
            <div class="dlg" role="dialog" aria-modal="true">
                <div class="mhead">
                    <h2 class="m-title">${esc(data.booknumber)}</h2>

                    ${badge(data.wfmstatusname)}

                    <div class="tools">
                        <button class="ib m-close" title="Хаах">
                            <svg width="15" height="15" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" stroke-width="2"
                                stroke-linecap="round">
                                <path d="M18 6 6 18M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                </div>

                <div class="mleft">
                    <div class="info" style="margin-top:4px">
                        <div class="l">PO дугаар</div>
                        <div class="b">${esc(data.booknumber)}</div>

                        <div class="l">Захиалсан огноо</div>
                        <div>${esc(data.bookdate)}</div>

                        <div class="l">Хүргэх огноо</div>
                        <div class="red">${esc(data.duedate)}</div>

                        <div class="l">Хүргэлтийн цэг</div>
                        <div>${esc(data.locationname)}</div>

                        <div class="l">Тайлбар</div>
                        <div>${esc(data.description)}</div>
                    </div>
					<div class="status-description-group">
                        <label>Тайлбар</label>
                        <input class="status-description"
                            placeholder="Тайлбар оруулна уу...">
                    </div>
                </div>

                <div class="mfoot">
                    <button class="cancel m-cancel">Хаах</button>
                    <button class="go m-go" data-id="${data.orderbookid}" style="background:${status.wfmstatuscolor};">${status.processname}</button>
                </div>
            </div>
        </div>
    `);

    $('body').append($html);
};
  $('#q').on('input', function () { state.q = this.value; state.page = 1; render(); });
  $('#perPage').on('change', function () { state.per = +this.value; state.page = 1; render(); });
  $pagination.on('click', 'a[data-p]', function () { if (this.disabled) return; state.page = +$(this).data('p'); render(); });

  
$(document)
    .off('click.statusMenuClose')
    .on('click.statusMenuClose', function (e) {
        if (!$(e.target).closest('.status-menu, .open-btn').length) {
            $('.status-menu').remove();
        }
    });
$(document)
    .off('click.status-option', '.status-option')
    .on('click.status-option', '.status-option', function () {
        const orderId = $(this).attr('data-order-id');
        const statusId = $(this).attr('data-status-id');

        const order = DATA.find(r =>
            String(r.orderbookid) === String(orderId)
        );

        const status = statuses.find(s =>
            String(s.wfmstatusid) === String(statusId)
        );

        openStatusModal(order, status);

        $('.status-menu').remove();
    });
 renderMenus(); renderHead(); render();