/* 画面の描画と操作。状態はこのファイルの変数（メモリ）だけ。利用者の入力は textContent / テキストノードで入れる。 */
(function () {
  'use strict';
  var FL = window.FL;
  var app = document.getElementById('app');
  var tabsEl = document.getElementById('tabs');
  var resetMsg = document.getElementById('reset-msg');

  var DEVICE_DAY = FL.deviceToday();
  var qp = /[?&]today=(\d{4}-\d{2}-\d{2})(?:&|$)/.exec(location.search);
  var TODAY = (qp && !isNaN(FL.parseDay(qp[1]))) ? qp[1] : DEVICE_DAY;

  var S;

  /* ---------- 小さな部品 ---------- */
  var PROPS = { value: 1, checked: 1, disabled: 1, maxLength: 1, selected: 1 };
  function append(el, x) {
    if (x == null || x === false) { return; }
    if (Array.isArray(x)) { x.forEach(function (y) { append(el, y); }); return; }
    el.appendChild(x.nodeType ? x : document.createTextNode(String(x)));
  }
  function h(tag, props) {
    var el = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) { return; }
      if (k === 'class') { el.className = v; }
      else if (k === 'fk') { el.setAttribute('data-fk', v); }
      else if (k.slice(0, 2) === 'on') { el.addEventListener(k.slice(2), v); }
      else if (PROPS[k]) { el[k] = v; }
      else { el.setAttribute(k, v === true ? '' : v); }
    });
    for (var i = 2; i < arguments.length; i++) { append(el, arguments[i]); }
    return el;
  }
  function select(options, value, onchange, fk, cls) {
    var s = h('select', { onchange: function (e) { onchange(e.target.value); }, fk: fk, id: fk, class: cls });
    options.forEach(function (o) {
      var v = typeof o === 'string' ? o : o.v;
      var l = typeof o === 'string' ? o : o.l;
      s.appendChild(h('option', { value: v, selected: v === value }, l));
    });
    return s;
  }
  function twin(control, printText) {
    return [h('span', { class: 'screen-only' }, control), h('span', { class: 'print-only' }, printText)];
  }
  function tableWrap(table) { return h('div', { class: 'table-wrap' }, table); }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function hm() { var d = new Date(); return p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function trunc(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }
  function pad3(n) { return ('00' + n).slice(-3); }

  /* ---------- 状態 ---------- */
  function newRow(kind) { return { kind: kind, old: '', 'new': '', unknown: false, oldItems: {}, newItems: {} }; }
  function newDraft() {
    return { material: '', verOld: '', verNew: '', receivedDate: TODAY, switchDate: '', rows: [], errors: {} };
  }
  function fresh() {
    return {
      data: FL.makeData(DEVICE_DAY), draft: newDraft(), accepted: '', confirm: {}, manual: {},
      filter: 'all', who: '東', nextSheet: 3, nextIntake: 2
    };
  }
  function findSheet(id) { return S.data.sheets.filter(function (s) { return s.id === id; })[0]; }
  function conf(id) {
    if (!S.confirm[id]) { S.confirm[id] = { prod: {}, kinds: {}, reason: '', busy: false }; }
    return S.confirm[id];
  }
  function hist(sh, what) { sh.history.push({ at: FL.stamp(TODAY, hm()), who: S.who, what: what }); }
  function remain(sh) { return sh.open.filter(function (o) { return o.state !== '確認済み'; }).length; }
  function clientsDone(sh) { return sh.clients.filter(function (c) { return c.state === '確認済み'; }).length; }
  function seqOf(sh) { return parseInt(sh.id.slice(2), 10) || 0; }

  /* ---------- 経路 ---------- */
  function route() {
    var raw = location.hash.replace(/^#/, '') || 'list';
    var p = raw.split('/');
    var name = p[0];
    if (['list', 'intake', 'sheet', 'client', 'map', 'p1', 'p2', 'p3'].indexOf(name) < 0) { name = 'list'; }
    var dec = function (x) { try { return decodeURIComponent(x || ''); } catch (e) { return ''; } };
    return { name: name, a: dec(p[1]), b: dec(p[2]) };
  }

  function renderTabs(r) {
    var items = [
      { hash: 'list', label: '変更の一覧', cur: r.name === 'list' },
      { hash: 'intake', label: '変更の受付', cur: r.name === 'intake' },
      { hash: 'map', label: '商品と原料の対応表', cur: r.name === 'map' },
      { hash: 'p1', label: '一括表示の作成（準備中）', cur: r.name === 'p1', soon: true },
      { hash: 'p2', label: '栄養成分の計算（準備中）', cur: r.name === 'p2', soon: true },
      { hash: 'p3', label: '基準の改正からの洗い出し（準備中）', cur: r.name === 'p3', soon: true }
    ];
    if (r.name === 'sheet' || r.name === 'client') {
      items.splice(1, 0, { hash: 'sheet/' + encodeURIComponent(r.a), label: '変更確認シート ' + r.a, cur: r.name === 'sheet' });
    }
    if (r.name === 'client') {
      items.splice(2, 0, { hash: location.hash.replace(/^#/, ''), label: '委託元に渡す版 ' + r.b, cur: true });
    }
    tabsEl.replaceChildren();
    items.forEach(function (it) {
      tabsEl.appendChild(h('a', { href: '#' + it.hash, class: it.soon ? 'soon' : '', 'aria-current': it.cur ? 'page' : null }, it.label));
    });
  }

  /* ---------- 画面 1: 変更の一覧 ---------- */
  function viewList() {
    var d = S.data;
    var intakes = d.intakes.filter(function (i) { return i.status === '受付'; });
    var closed = d.intakes.filter(function (i) { return i.status === '閉じた'; });
    var sheets = d.sheets.slice().sort(function (a, b) { return seqOf(b) - seqOf(a); });
    var active = sheets.filter(function (s) { return s.status === '確認中'; });
    var withOpen = active.filter(function (s) { return remain(s) > 0; });
    var done = sheets.filter(function (s) { return s.status === '済'; });
    var shown = sheets.filter(function (s) {
      if (S.filter === 'active') { return s.status === '確認中'; }
      if (S.filter === 'open') { return remain(s) > 0; }
      return true;
    });

    return h('div', null,
      h('h1', null, '変更の一覧'),
      h('p', { class: 'role' }, '受託メーカーの表示担当者の画面'),
      h('div', { class: 'steps' },
        h('p', null, '①規格書の変更を受け付ける → ②影響する商品と表示の欄を選んで変更確認シートを作る → ③未確認事項を埋め、委託元ごとに確認を回す'),
        h('p', null, h('a', { href: '#intake' }, '①の変更の受付へ'))),
      h('div', { class: 'summary' },
        h('span', { class: 'chip' }, '受付 ' + intakes.length),
        h('span', { class: 'chip' }, '確認中のシート ' + active.length),
        h('span', { class: 'chip' }, 'うち未確認事項が残るもの ' + withOpen.length),
        h('span', { class: 'chip' }, '済んだシート ' + done.length)),

      h('h2', null, '受付（まだシートはありません）'),
      intakes.length ? intakes.map(intakeCard) : h('p', null, '受付はありません。'),

      h('h2', null, '変更確認シート'),
      h('div', { class: 'toolbar no-print' },
        h('label', null, '絞り込み',
          select([{ v: 'all', l: '全部' }, { v: 'active', l: '確認中' }, { v: 'open', l: '未確認事項が残る' }], S.filter,
            function (v) { S.filter = v; render(); }, 'filter'))),
      shown.length ? sheetTable(shown) : h('p', null, '該当するシートはありません。'),

      closed.length ? [
        h('h2', null, 'シートを作らなかった受付'),
        tableWrap(h('table', null,
          h('thead', null, h('tr', null, ['受付番号', '受付日', '原料', '規格書の版', '理由'].map(function (t) { return h('th', null, t); }))),
          h('tbody', null, closed.map(function (i) {
            return h('tr', null, h('td', null, i.id), h('td', { class: 'date' }, i.receivedDate), h('td', null, i.material),
              h('td', null, i.verOld + ' → ' + i.verNew), h('td', null, i.closeReason || '（理由は入力されていません）'));
          }))))
      ] : null);
  }

  function sheetTable(list) {
    return tableWrap(h('table', null,
      h('thead', null, h('tr', null, ['シート番号', '原料', '商品数と委託元の数', '未確認事項', '委託元の確認', '切替予定日', '状態'].map(function (t) { return h('th', null, t); }))),
      h('tbody', null, list.map(function (s) {
        return h('tr', { class: 'clickable', onclick: function () { location.hash = '#sheet/' + s.id; } },
          h('td', null, h('a', { href: '#sheet/' + s.id }, s.id)),
          h('td', null, s.material),
          h('td', null, s.products.length + '品・' + s.clients.length + '社'),
          h('td', null, '残り ' + remain(s) + '／全 ' + s.open.length),
          h('td', null, '確認済み ' + clientsDone(s) + '／全 ' + s.clients.length + ' 社'),
          h('td', null, FL.dayLabel(s.switchDate, TODAY)),
          h('td', null, h('span', { class: 'state-tag' }, s.status)));
      }))));
  }

  function intakeCard(i) {
    var isOpen = S.openIntake === i.id;
    var card = h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        kv('受付日', i.receivedDate), kv('原料', i.material), kv('規格書の版', i.verOld + ' → ' + i.verNew),
        kv('変わった項目', i.changes.map(function (c) { return FL.kindOf(c.kind).item; }).join('、')),
        kv('切替予定日', FL.dayLabel(i.switchDate, TODAY)),
        h('div', { class: 'no-print' }, h('button', { type: 'button', class: 'small-btn', fk: 'open-' + i.id, 'aria-expanded': isOpen ? 'true' : 'false',
          onclick: function () { S.openIntake = isOpen ? null : i.id; render(); } }, isOpen ? '閉じる' : '確認する'))));
    if (isOpen) { card.appendChild(confirmPanel(i)); }
    return card;
  }
  function kv(k, v) { return h('div', null, h('span', { class: 'k' }, k), v); }

  function confirmPanel(i) {
    var c = conf(i.id);
    var using = FL.productsUsing(S.data, i.material);
    var chosenProd = using.filter(function (p) { return c.prod[p.id]; });
    var kindsPresent = i.changes.map(function (x) { return x.kind; });
    var chosenKinds = kindsPresent.filter(function (k) { return c.kinds[k]; });
    var canMake = chosenProd.length > 0 && chosenKinds.length > 0 && !c.busy;

    var k2 = i.changes.filter(function (x) { return x.kind === 'K2'; })[0];
    var diff = k2 && !k2.unknown ? FL.allergenDiff(k2.oldItems, k2.newItems, false) : null;
    var k2items = k2 ? k2.oldItems.concat(k2.unknown ? [] : k2.newItems) : [];

    return h('div', { class: 'panel' },
      h('p', null, h('strong', null, '表示を直すかどうかは、この画面では決めません。'), '規格書と基準の原文を確認のうえ、確認する商品と表示の欄を選んでください。'),

      h('h3', null, 'この原料を使う商品（対応表から）'),
      using.length ? using.map(function (p) {
        return h('label', { class: 'choice-line' },
          h('input', { type: 'checkbox', checked: !!c.prod[p.id], fk: 'prod-' + i.id + p.id, onchange: function (e) { c.prod[p.id] = e.target.checked; render(); } }),
          h('span', { class: 'body' }, p.name + '（' + p.id + '）',
            h('span', { class: 'sub' }, p.client + '／配合の順位: ' + p.rank + '番目／表示の版の管理者: ' + p.manager)));
      }) : h('p', null, 'この原料を使う商品は対応表にありません。'),
      h('p', { class: 'small muted' }, '対応表で' + i.material + 'を使っている商品は' + using.length + '品です。うち' + chosenProd.length + '品を選んでいます。対応表に載っていない商品は出ません。'),

      h('h3', null, '関係しうる表示の欄（確認候補）'), h('p', { class: 'small muted' }, FL.BASIS_SCOPE),
      FL.candidateFields(kindsPresent).map(function (k) {
        var body = [h('span', null, k.field), h('span', { class: 'sub' }, '参照した基準: ' + k.basis)];
        if (k.id === 'K2') {
          if (k2.unknown) {
            body.push(h('span', { class: 'sub' }, 'アレルゲン: ' + FL.UNKNOWN_SUFFIX));
          } else {
            body.push(h('span', { class: 'sub' }, '一覧との照合結果'));
            var rows = [];
            diff.onlyNew.forEach(function (a) { rows.push(h('li', null, a.item + '（' + a.cls + '）: 追記候補')); });
            diff.onlyOld.forEach(function (a) { rows.push(h('li', null, a.item + '（' + a.cls + '）: 旧の記載にだけあります。確認してください')); });
            if (!rows.length) { rows.push(h('li', null, '旧と新の記載に品目の違いはありません')); }
            body.push(h('ul', { class: 'plain' }, rows));
          }
          body.push(h('span', { class: 'sub' }, FL.NOTES.N1));
          body.push(h('span', { class: 'sub' }, FL.ALLERGEN_ASOF));
          if (k2items.indexOf('カシューナッツ') >= 0) { body.push(h('span', { class: 'sub' }, FL.NOTES.N2)); }
          if (k2items.indexOf('ピスタチオ') >= 0) { body.push(h('span', { class: 'sub' }, FL.NOTES.N3)); }
        }
        if (k.id === 'K4') { body.push(h('span', { class: 'sub' }, FL.NOTES.N4)); }
        return h('label', { class: 'choice-line' },
          h('input', { type: 'checkbox', checked: !!c.kinds[k.id], fk: 'kind-' + i.id + k.id, onchange: function (e) { c.kinds[k.id] = e.target.checked; render(); } }),
          h('span', { class: 'body' }, body));
      }),

      h('div', { class: 'toolbar' },
        h('button', { type: 'button', disabled: !canMake, fk: 'make-' + i.id, onclick: function () { makeSheet(i); } }, '選んだ内容で変更確認シートを作る')),
      h('div', { class: 'field' },
        h('label', { for: 'reason-' + i.id }, 'シートを作らずに閉じる（理由は任意・100字まで）'),
        h('input', { type: 'text', id: 'reason-' + i.id, maxLength: 100, value: c.reason, fk: 'reason-' + i.id, oninput: function (e) { c.reason = e.target.value; } })),
      h('button', { type: 'button', class: 'secondary', disabled: c.busy, fk: 'close-' + i.id, onclick: function () { closeIntake(i); } }, 'シートを作らずに閉じる'));
  }

  function makeSheet(i) {
    var c = conf(i.id);
    if (i.status !== '受付' || c.busy) { return; }
    c.busy = true;
    i.status = '作成済み';
    var using = FL.productsUsing(S.data, i.material).filter(function (p) { return c.prod[p.id]; });
    var kinds = Object.keys(c.kinds).filter(function (k) { return c.kinds[k]; });
    var id = 'S-' + pad3(S.nextSheet++);
    var sh = FL.buildSheet(i, using, kinds, { map: S.data, id: id, today: TODAY, who: S.who, now: FL.stamp(TODAY, hm()) });
    S.data.sheets.push(sh);
    i.sheetId = id;
    S.openIntake = null;
    location.hash = '#sheet/' + id;
    render();
  }
  function closeIntake(i) {
    var c = conf(i.id);
    if (i.status !== '受付' || c.busy) { return; }
    c.busy = true;
    i.status = '閉じた';
    i.closeReason = c.reason.trim();
    S.openIntake = null;
    render();
  }

  /* ---------- 画面 2: 変更の受付 ---------- */
  function fieldBlock(label, control, err, req, id) {
    return h('div', { class: 'field' },
      h('label', { for: id }, label, req ? h('span', { class: 'req' }, '必須') : h('span', { class: 'opt' }, '任意')),
      control,
      err ? h('span', { class: 'error' }, ' ' + err) : null);
  }

  function allergenGroup(selected, fkp, onToggle) {
    function group(title, list) {
      return h('div', null, h('span', { class: 'sub' }, title),
        h('div', { class: 'item-group' }, list.map(function (a) {
          return h('label', null, h('input', { type: 'checkbox', checked: !!selected[a], fk: fkp + a, onchange: function (e) { onToggle(a, e.target.checked); } }), a);
        })));
    }
    return [group(FL.CLASS_SPECIFIC, FL.SPECIFIC), group(FL.CLASS_RECOMMENDED, FL.RECOMMENDED), h('p', { class: 'small muted' }, FL.ALLERGEN_ASOF)];
  }

  function viewIntake() {
    var dr = S.draft;
    var er = dr.errors;
    var used = dr.rows.map(function (r) { return r.kind; });
    var ing = S.data.ingredients.filter(function (g) { return g.name === dr.material; })[0];
    var left = FL.KIND_IDS.filter(function (k) { return used.indexOf(k) < 0; });

    var rows = dr.rows.map(function (r, idx) {
      var kinds = FL.KINDS.filter(function (k) { return k.id === r.kind || used.indexOf(k.id) < 0; })
        .map(function (k) { return { v: k.id, l: k.item }; });
      var body;
      if (r.kind === 'K2') {
        body = [
          h('p', { class: 'sub' }, '旧の記載に含まれる品目'),
          allergenGroup(r.oldItems, 'o' + idx + '-', function (a, on) { r.oldItems[a] = on; }),
          r.unknown ? h('p', { class: 'small muted' }, '新の記載は「記載なし・不明」として扱います（選んであった品目は使いません）。') : [
            h('p', { class: 'sub' }, '新の記載に含まれる品目'),
            allergenGroup(r.newItems, 'n' + idx + '-', function (a, on) { r.newItems[a] = on; })]
        ];
      } else {
        body = [
          h('div', { class: 'field' }, h('label', { for: 'old' + idx }, '旧の記載（100字まで）'),
            h('input', { type: 'text', id: 'old' + idx, maxLength: 100, value: r.old, fk: 'old' + idx, oninput: function (e) { r.old = e.target.value; } })),
          h('div', { class: 'field' }, h('label', { for: 'new' + idx }, '新の記載（100字まで）'),
            r.unknown ? h('p', { class: 'small muted' }, '記載なし・不明') :
              h('input', { type: 'text', id: 'new' + idx, maxLength: 100, value: r['new'], fk: 'new' + idx, oninput: function (e) { r['new'] = e.target.value; } }))
        ];
      }
      return h('div', { class: 'change-row' },
        h('div', { class: 'field' }, h('label', { for: 'kind' + idx }, '変わった項目' + (idx + 1)),
          select(kinds, r.kind, function (v) { r.kind = v; r.oldItems = {}; r.newItems = {}; render(); }, 'kind' + idx)),
        body,
        h('label', { class: 'choice' }, h('input', { type: 'checkbox', checked: r.unknown, fk: 'unk' + idx,
          onchange: function (e) { r.unknown = e.target.checked; if (r.unknown) { r['new'] = ''; r.newItems = {}; } render(); } }),
          '規格書に記載が無い・読み取れない'),
        h('button', { type: 'button', class: 'secondary small-btn', fk: 'del' + idx, onclick: function () { dr.rows.splice(idx, 1); render(); } }, 'この行を削除'));
    });

    return h('div', null,
      h('h1', null, '変更の受付'),
      h('p', { class: 'role' }, '受託メーカーの表示担当者の画面'),
      S.accepted ? h('div', { class: 'done-box', role: 'status' },
        '受け付けました。', h('strong', null, 'この時点ではシートはできていません'), '。一覧で内容を確認してください。 ',
        h('a', { href: '#list' }, '一覧を見る')) : null,
      h('div', { class: 'form' },
        fieldBlock('原料', select([{ v: '', l: '（選んでください）' }].concat(S.data.ingredients.map(function (g) { return { v: g.name, l: g.name }; })),
          dr.material, function (v) { dr.material = v; render(); }, 'material'), er.material ? '入力してください' : '', true, null),
        ing ? h('p', { class: 'small muted' }, '仕入先: ' + ing.supplier) : null,
        fieldBlock('規格書の版（旧・20字まで）', h('input', { type: 'text', id: 'verOld', maxLength: 20, value: dr.verOld, fk: 'verOld', oninput: function (e) { dr.verOld = e.target.value; } }), er.verOld ? '入力してください' : '', true, 'verOld'),
        fieldBlock('規格書の版（新・20字まで）', h('input', { type: 'text', id: 'verNew', maxLength: 20, value: dr.verNew, fk: 'verNew', oninput: function (e) { dr.verNew = e.target.value; } }), er.verNew ? '入力してください' : '', true, 'verNew'),
        fieldBlock('受付日', h('input', { type: 'date', id: 'received', max: TODAY, value: dr.receivedDate, fk: 'received', oninput: function (e) { dr.receivedDate = e.target.value; } }),
          er.received ? '今日までの日付を入力してください' : '', true, 'received'),
        fieldBlock('切替予定日', h('input', { type: 'date', id: 'switch', value: dr.switchDate, fk: 'switch', oninput: function (e) { dr.switchDate = e.target.value; } }), '', false, 'switch'),
        h('p', { class: 'small muted' }, '切替予定日が未入力のときは、シートの未確認事項に入ります。'),
        h('h2', null, '変わった項目（1〜5行。同じ種類は1行まで）'),
        er.rows ? h('p', { class: 'error' }, '入力してください（変わった項目を1行以上）') : null,
        rows,
        h('button', { type: 'button', class: 'secondary', disabled: !left.length, fk: 'addrow',
          onclick: function () { dr.rows.push(newRow(left[0])); render(); } }, '変わった項目の行を足す'),
        h('p', { class: 'small muted' }, '実際の原料名・社名・規格書の内容を入れないでください'),
        h('div', { class: 'toolbar' }, h('button', { type: 'button', fk: 'submit', onclick: submitIntake }, '受け付ける'))));
  }

  function submitIntake() {
    var dr = S.draft;
    var e = {};
    if (!dr.material) { e.material = 1; }
    if (!dr.verOld.trim()) { e.verOld = 1; }
    if (!dr.verNew.trim()) { e.verNew = 1; }
    if (!dr.rows.length) { e.rows = 1; }
    if (isNaN(FL.parseDay(dr.receivedDate)) || dr.receivedDate > TODAY) { e.received = 1; }
    dr.errors = e;
    if (Object.keys(e).length) { render(); return; }
    var order = function (obj) { return FL.SPECIFIC.concat(FL.RECOMMENDED).filter(function (a) { return obj[a]; }); };
    var ing = S.data.ingredients.filter(function (g) { return g.name === dr.material; })[0];
    var id = 'R-' + pad3(S.nextIntake++);
    S.data.intakes.push({
      id: id, status: '受付', closeReason: '', sheetId: '',
      receivedDate: dr.receivedDate, material: dr.material, supplier: ing.supplier,
      verOld: dr.verOld.trim(), verNew: dr.verNew.trim(), switchDate: dr.switchDate,
      changes: dr.rows.map(function (r) {
        return {
          kind: r.kind, old: r.kind === 'K2' ? '' : r.old.trim(), 'new': r.kind === 'K2' || r.unknown ? '' : r['new'].trim(),
          unknown: r.unknown, oldItems: r.kind === 'K2' ? order(r.oldItems) : [], newItems: r.kind === 'K2' && !r.unknown ? order(r.newItems) : []
        };
      }),
      history: [{ at: FL.stamp(TODAY, hm()), who: S.who, what: '変更を受け付け（' + dr.material + ' ' + dr.verOld.trim() + ' → ' + dr.verNew.trim() + '）' }]
    });
    S.draft = newDraft();
    S.accepted = id;
    render();
  }

  /* ---------- 画面 3: 変更確認シート ---------- */
  function noteBlocks(notes, withN4) {
    var out = [];
    out.push(h('p', { class: 'note' }, FL.BASIS_SCOPE));
    if (notes.n1) { out.push(h('p', { class: 'note' }, FL.NOTES.N1)); out.push(h('p', { class: 'note' }, FL.ALLERGEN_ASOF)); }
    if (notes.n2) { out.push(h('p', { class: 'note' }, FL.NOTES.N2)); }
    if (notes.n3) { out.push(h('p', { class: 'note' }, FL.NOTES.N3)); }
    if (withN4 && notes.n4) { out.push(h('p', { class: 'note' }, FL.NOTES.N4)); }
    return out;
  }

  function viewSheet(id) {
    var sh = findSheet(id);
    if (!sh) { return h('div', null, h('h1', null, 'シートが見つかりません'), h('p', null, h('a', { href: '#list' }, '一覧へ戻る'))); }
    var rem = remain(sh);
    var m = S.manual[sh.id] || (S.manual[sh.id] = { text: '', client: '', err: false });

    var changesDl = h('dl', null,
      dt('原料名', sh.material), dt('仕入先の記号', sh.supplier), dt('規格書の版', sh.verOld + ' → ' + sh.verNew),
      dt('受付日', sh.receivedDate), dt('切替予定日', sh.switchDate || '未入力'),
      sh.changes.map(function (c) { return dt(c.label, '旧: ' + FL.oldText(c, id1) + ' → 新: ' + FL.newText(c, id1)); }));

    var prodTable = tableWrap(h('table', null,
      h('thead', null, h('tr', null, ['商品', '委託元', '変更箇所', '参照した基準'].map(function (t) { return h('th', null, t); }))),
      h('tbody', null, sh.products.map(function (p) {
        var lines = [], bases = [];
        sh.changes.forEach(function (c) {
          if (sh.kinds.indexOf(c.kind) < 0) { return; }
          FL.locationLines(c, sh.material, id1, false).forEach(function (l) { lines.push(h('li', null, l)); });
          bases.push(h('li', null, FL.kindOf(c.kind).basis));
        });
        return h('tr', null, h('td', null, p.name + '（' + p.id + '）'), h('td', null, p.client),
          h('td', null, h('ul', { class: 'plain' }, lines)), h('td', null, h('ul', { class: 'plain' }, bases)));
      }))));

    var openTable = tableWrap(h('table', null,
      h('thead', null, h('tr', null, ['内容', '関係する委託元', '担当者', '状態', '確認の結果（100字まで）', '委託元に渡す版に載せる'].map(function (t) { return h('th', null, t); }))),
      h('tbody', null, sh.open.map(function (o) {
        return h('tr', null,
          h('td', null, o.text),
          h('td', null, o.client || 'なし'),
          h('td', null, twin(select([{ v: '', l: '（未選択）' }].concat(S.data.people.map(function (p) { return { v: p, l: p }; })), o.owner,
            function (v) { if (v !== o.owner) { o.owner = v; hist(sh, '未確認事項「' + trunc(o.text, 20) + '」の担当を ' + (v || '（未選択）') + ' に変更'); render(); } }, 'own' + o.id), o.owner || '未選択')),
          h('td', null, twin(select(['未確認', '確認中', '確認済み'], o.state,
            function (v) { if (v !== o.state) { o.state = v; hist(sh, '未確認事項「' + trunc(o.text, 20) + '」の状態を「' + v + '」に変更'); render(); } }, 'st' + o.id), o.state)),
          h('td', null, twin(h('input', { type: 'text', maxLength: 100, value: o.result, 'aria-label': '確認の結果', fk: 'res' + o.id,
            onchange: function (e) { if (e.target.value !== o.result) { o.result = e.target.value; hist(sh, '未確認事項「' + trunc(o.text, 20) + '」の確認の結果を変更'); render(); } } }), o.result || '（なし）')),
          h('td', null, o.manual ? '社内用（委託元に渡す版には載りません）' :
            o.client ? twin(h('label', null, h('input', { type: 'checkbox', checked: o.include, fk: 'inc' + o.id,
              onchange: function (e) { o.include = e.target.checked; hist(sh, '未確認事項「' + trunc(o.text, 20) + '」の「委託元に渡す版に載せる」を' + (o.include ? 'オン' : 'オフ') + 'に変更'); render(); } }), '載せる'), o.include ? '載せる' : '載せない')
              : '載せない'));
      }))));

    var addForm = h('div', { class: 'no-print' },
      h('h3', null, '未確認事項を足す'),
      h('div', { class: 'field' }, h('label', { for: 'mtext' }, '内容（100字まで）'),
        h('input', { type: 'text', id: 'mtext', maxLength: 100, value: m.text, fk: 'mtext', oninput: function (e) { m.text = e.target.value; } }),
        m.err ? h('span', { class: 'error' }, ' 入力してください') : null),
      h('div', { class: 'field' }, h('label', { for: 'mcl' }, '関係する委託元'),
        select([{ v: '', l: 'なし' }].concat(sh.clients.map(function (c) { return { v: c.client, l: c.client }; })), m.client, function (v) { m.client = v; }, 'mcl')),
      h('button', { type: 'button', class: 'secondary', fk: 'madd', onclick: function () {
        if (!m.text.trim()) { m.err = true; render(); return; }
        sh.open.push({ id: 'U' + (sh.nextOpen++), text: m.text.trim(), client: m.client || null, owner: '', state: '未確認', result: '', include: false, manual: true });
        hist(sh, '未確認事項を追加（「' + trunc(m.text.trim(), 20) + '」）');
        S.manual[sh.id] = { text: '', client: '', err: false };
        render();
      } }, '未確認事項を追加する'));

    var clientTable = tableWrap(h('table', null,
      h('thead', null, h('tr', null, ['委託元', '状態', '依頼した日', '往復の回数', '委託元に渡す版'].map(function (t) { return h('th', null, t); }))),
      h('tbody', null, sh.clients.map(function (c) {
        var opts = [c.state].concat(FL.ALLOWED[c.state]);
        return h('tr', null, h('td', null, c.client),
          h('td', null, twin(select(opts, c.state, function (v) {
            var r = FL.transitionClient(c, v, TODAY);
            if (!r) { return; }
            var from = c.state;
            c.state = r.state; c.requestedDate = r.requestedDate; c.rounds = r.rounds;
            hist(sh, c.client + 'の確認状態を「' + from + '」から「' + v + '」に変更');
            render();
          }, 'cs' + c.client), c.state)),
          h('td', null, c.requestedDate || '（なし）'), h('td', null, c.rounds + ' 回'),
          h('td', { class: 'no-print' }, h('a', { href: '#client/' + sh.id + '/' + encodeURIComponent(c.client) }, '委託元に渡す版を開く')));
      }))));

    var histTable = tableWrap(h('table', null,
      h('thead', null, h('tr', null, ['日時', '誰が', '何をした'].map(function (t) { return h('th', null, t); }))),
      h('tbody', null, sh.history.slice().reverse().map(function (e) {
        return h('tr', null, h('td', { class: 'date' }, e.at), h('td', null, e.who), h('td', null, e.what));
      }))));

    return h('div', null,
      h('h1', null, '変更確認シート　' + FL.MAKER),
      h('p', { class: 'role' }, '受託メーカーの表示担当者の画面'),
      h('div', { class: 'toolbar' },
        h('strong', null, 'シート番号 ' + sh.id),
        h('label', null, '状態',
          twin(select(['確認中', '済'], sh.status, function (v) {
            if (v === sh.status) { return; }
            var from = sh.status;
            sh.status = v; sh.doneDate = v === '済' ? TODAY : '';
            hist(sh, 'シートの状態を「' + from + '」から「' + v + '」に変更');
            render();
          }, 'sheetstatus'), sh.status)),
        sh.status === '済' && rem > 0 ? h('span', { class: 'warn-line' }, '未確認事項が ' + rem + ' 件残っています') : null,
        h('label', { class: 'no-print' }, '操作する人',
          select(S.data.people, S.who, function (v) { S.who = v; render(); }, 'who'))),

      h('h2', null, '変更内容'), changesDl,

      h('h2', null, '影響する商品（' + sh.products.length + '品・委託元' + sh.clients.length + '社）'),
      prodTable,
      h('p', { class: 'small muted' }, '対応表で' + sh.material + 'を使っている商品 ' + sh.usingTotal + '品のうち、' + sh.products.length + '品を選んでいます。'),
      noteBlocks(sh.notes, true),
      sh.notes.n4 ? tableWrap(h('table', null,
        h('thead', null, h('tr', null, h('th', null, '商品'), h('th', null, sh.material + 'の配合の順位'))),
        h('tbody', null, sh.products.map(function (p) { return h('tr', null, h('td', null, p.name + '（' + p.id + '）'), h('td', null, p.rank + '番目')); })))) : null,

      h('h2', null, '未確認事項（御社で確認してください）'),
      openTable, addForm,

      h('h2', null, '委託元ごとの確認'),
      clientTable,
      h('p', { class: 'small muted' }, 'デモでは委託元へ何も送りません。実際の製品でも、委託元への連絡は御社から行います。'),

      h('h2', null, '履歴'), histTable,

      h('h2', null, '注記'),
      h('p', { class: 'note' }, FL.FINAL_NOTE),
      h('p', { class: 'no-print' }, h('button', { type: 'button', fk: 'print', onclick: function () { window.print(); } }, '印刷する')));
  }
  function id1(t) { return t; }
  function dt(k, v) { return h('div', { class: 'dl-row' }, h('dt', null, k), h('dd', { style: 'margin:0 0 0.6rem 0' }, v)); }

  /* ---------- 画面 4: 委託元に渡す版 ---------- */
  function viewClient(id, client) {
    var sh = findSheet(id);
    if (!sh || S.data.clients.indexOf(client) < 0 || !sh.clients.some(function (c) { return c.client === client; })) {
      return h('div', null, h('h1', null, '渡す版が見つかりません'), h('p', null, h('a', { href: '#list' }, '一覧へ戻る')));
    }
    var v = FL.buildClientView(sh, client, S.data);
    function blank(tall) { return h('div', { class: 'blank-box' + (tall ? ' tall' : '') }); }

    return h('div', null,
      h('p', { class: 'no-print' }, h('a', { href: '#sheet/' + encodeURIComponent(id) }, '社内用のシートに戻る'), '　',
        h('button', { type: 'button', fk: 'print', onclick: function () { window.print(); } }, '印刷する')),
      h('p', { class: 'warn-line no-print' }, '渡す前に、ほかの委託元や仕入先の情報が入っていないかを確認してください'),
      h('p', { class: 'role no-print' }, '委託元に渡す紙の見え方'),
      h('div', { class: 'paper' },
        h('h1', null, v.title),
        h('p', { class: 'to' }, v.to),
        h('p', null, v.maker),
        h('p', null, '作成日: ' + v.createdDate),

        h('h2', null, '変更内容'),
        h('dl', null, dt('原料名', v.material), dt('規格書の版', v.verOld + ' → ' + v.verNew), dt('切替予定日', v.switchDate),
          v.changes.map(function (c) { return dt(c.label, '旧: ' + c.oldText + ' → 新: ' + c.newText); })),

        h('h2', null, '御社の商品'),
        tableWrap(h('table', null,
          h('thead', null, h('tr', null, ['商品', '変更箇所', '参照した基準'].map(function (t) { return h('th', null, t); }))),
          h('tbody', null, v.products.map(function (p) {
            var lines = [], bases = [];
            p.rows.forEach(function (r) { r.lines.forEach(function (l) { lines.push(h('li', null, l)); }); bases.push(h('li', null, r.basis)); });
            return h('tr', null, h('td', null, p.name + '（' + p.id + '）'), h('td', null, h('ul', { class: 'plain' }, lines)), h('td', null, h('ul', { class: 'plain' }, bases)));
          })))),
        v.noteTexts.map(function (t) { return h('p', { class: 'note' }, t); }),

        h('h2', null, 'ご確認いただきたいこと'),
        v.requests.length ? h('ul', null, v.requests.map(function (t) { return h('li', null, t); })) : h('p', null, '現時点で、この欄に載せている事項はありません。'),

        h('h2', null, '確認欄'),
        h('p', { class: 'small muted' }, '印刷して書き込んでください（画面では入力できません）。'),
        h('p', null, '確認した方'), blank(false),
        h('p', null, '日付'), blank(false),
        h('p', null, 'ご意見'), blank(true),

        h('h2', null, '注記'),
        h('p', { class: 'note' }, v.finalNote),
        h('p', null, h('strong', null, 'デモ・架空のデータです'))));
  }

  /* ---------- 画面 5: 商品と原料の対応表 ---------- */
  function viewMap() {
    var d = S.data;
    return h('div', null,
      h('h1', null, '商品と原料の対応表'),
      h('p', { class: 'role' }, '受託メーカーの画面（見るだけ）'),
      h('p', null, h('strong', null, '配合の割合は登録しません。'), '持つのは、商品がどの原料を使っているかと、配合の順位だけです。'),
      h('h2', null, '商品'),
      tableWrap(h('table', null,
        h('thead', null, h('tr', null, ['商品', '委託元', '表示の版の管理者', '原料（配合の順位の順）'].map(function (t) { return h('th', null, t); }))),
        h('tbody', null, d.products.map(function (p) {
          return h('tr', null, h('td', null, p.name + '（' + p.id + '）'), h('td', null, p.client), h('td', null, p.manager),
            h('td', null, h('ol', { style: 'margin:0' }, p.ingredients.map(function (g) { return h('li', null, g); }))));
        })))),
      h('h2', null, '原料'),
      tableWrap(h('table', null,
        h('thead', null, h('tr', null, ['原料名', '仕入先の記号', '使っている商品の数'].map(function (t) { return h('th', null, t); }))),
        h('tbody', null, d.ingredients.map(function (g) {
          return h('tr', null, h('td', null, g.name), h('td', null, g.supplier), h('td', null, FL.productsUsing(d, g.name).length + '品'));
        })))));
  }

  /* ---------- 準備中 ---------- */
  var SOON = {
    p1: ['一括表示の作成', '準備中です。原材料と配合から一括表示の案を作る画面を予定しています'],
    p2: ['栄養成分の計算', '準備中です。日本食品標準成分表による計算値を出す画面を予定しています'],
    p3: ['基準の改正からの洗い出し', '準備中です。基準の改正で確認が要る商品を、対応表から並べる画面を予定しています']
  };
  function viewSoon(k) { return h('div', null, h('h1', null, SOON[k][0]), h('p', null, SOON[k][1])); }

  /* ---------- 描画 ---------- */
  function render() {
    var r = route();
    if (r.name !== 'intake') { S.accepted = ''; }
    var active = document.activeElement;
    var fk = active && active.getAttribute ? active.getAttribute('data-fk') : null;
    var y = window.pageYOffset;
    var view;
    if (r.name === 'intake') { view = viewIntake(); }
    else if (r.name === 'sheet') { view = viewSheet(r.a); }
    else if (r.name === 'client') { view = viewClient(r.a, r.b); }
    else if (r.name === 'map') { view = viewMap(); }
    else if (SOON[r.name]) { view = viewSoon(r.name); }
    else { view = viewList(); }
    renderTabs(r);
    app.replaceChildren(view);
    if (fk) {
      var all = app.querySelectorAll('[data-fk]');
      for (var i = 0; i < all.length; i++) {
        if (all[i].getAttribute('data-fk') === fk) { all[i].focus(); break; }
      }
    }
    window.scrollTo(0, y);
  }

  var lastHash = location.hash;
  window.addEventListener('hashchange', function () {
    if (location.hash !== lastHash) { window.scrollTo(0, 0); }
    lastHash = location.hash;
    render();
  });

  document.getElementById('reset-btn').addEventListener('click', function () {
    S = fresh();
    S.openIntake = null;
    resetMsg.textContent = '戻しました';
    setTimeout(function () { resetMsg.textContent = ''; }, 4000);
    if (location.hash && location.hash !== '#list') { location.hash = '#list'; } else { render(); }
  });

  S = fresh();
  S.openIntake = null;
  render();
})();
