/* 基準の表・アレルゲンの一覧・抽出・委託元に渡す版の組み立て。
   画面には触らない関数だけを持つ。ブラウザでは window.FL に載り、node では module.exports に出る。 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (root) { root.FL = Object.assign(root.FL || {}, api); }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  /* ---- 2.2 アレルゲンの一覧 ---- */
  var CLASS_SPECIFIC = '特定原材料（別表第十四）';
  var CLASS_RECOMMENDED = '特定原材料に準ずるもの（通知）';
  var SPECIFIC = ['えび', 'カシューナッツ', 'かに', 'くるみ', '小麦', 'そば', '卵', '乳', '落花生（ピーナッツ）'];
  var RECOMMENDED = ['アーモンド', 'あわび', 'いか', 'いくら', 'オレンジ', 'キウイフルーツ', '牛肉', 'ごま', 'さけ', 'さば', '大豆', '鶏肉', 'バナナ', 'ピスタチオ', '豚肉', 'マカダミアナッツ', 'もも', 'やまいも', 'りんご', 'ゼラチン'];
  var BASIS_SCOPE = 'このデモの「参照した基準」は、一般用加工食品（業務用加工食品を除く）の場合です。';
  var ALLERGEN_ASOF = '2026年10月1日時点の基準・通知による一覧です（消費者庁、2026-10-12 取得。2026-11-20 に改正が無いことを確認）';

  function classOf(item) {
    if (SPECIFIC.indexOf(item) >= 0) { return CLASS_SPECIFIC; }
    if (RECOMMENDED.indexOf(item) >= 0) { return CLASS_RECOMMENDED; }
    return '';
  }

  /* ---- 2.1 変わった項目と、関係しうる表示の欄 ---- */
  var KINDS = [
    { id: 'K1', item: '原材料の内訳', field: '原材料名', basis: '食品表示基準 3条1項の表「原材料名」', notes: [] },
    { id: 'K2', item: 'アレルゲン', field: 'アレルゲン', basis: '食品表示基準 3条2項、別表第十四（特定原材料）。特定原材料に準ずるものは「食品表示基準について」（消食表第139号）別添「アレルゲンを含む食品に関する表示」', notes: ['N1', 'N2', 'N3'] },
    { id: 'K3', item: '添加物', field: '添加物', basis: '食品表示基準 3条1項の表「添加物」', notes: [] },
    { id: 'K4', item: '原産地', field: '原料原産地名', basis: '食品表示基準 3条2項の表「原料原産地名」', notes: ['N4'] },
    { id: 'K5', item: '栄養成分の参照値', field: '栄養成分の量及び熱量', basis: '食品表示基準 3条1項の表「栄養成分の量及び熱量」', notes: [] }
  ];
  var KIND_IDS = KINDS.map(function (k) { return k.id; });

  var NOTES = {
    N1: '一覧に載っているかどうかを照合した結果です。表示の書き方（個別に書くか、まとめて書くか など）はこの画面では決めません。',
    N2: 'カシューナッツは、令和8年内閣府令第34号（令和8年4月1日公布・施行）で特定原材料になりました。同府令の附則2条により、令和10年3月31日までに製造・加工・輸入される加工食品（業務用を除く）と、同日までに販売される業務用加工食品は、従前の例によることができます。',
    N3: 'ピスタチオは、令和8年4月1日の通知の改正（消食表第237号）で、特定原材料に準ずるものに加わりました。特定原材料に準ずるものは、同通知の別添で、原材料として含む旨を可能な限り表示するよう努めることとされています。',
    N4: '原料原産地名の定めは、食品表示基準 3条2項の表の「輸入品以外の加工食品」の欄にあります。同欄は、使用した原材料のうち重量の割合が最も高い原材料（対象原材料。除かれる原材料があります）の原産地を、原材料名に対応させて表示するよう定めています。対象原材料が加工食品のときの書き方も同欄にあります。対応表の配合の順位は商品ごとに下の表のとおりです。'
  };

  var FINAL_NOTE = 'このシートは基準の該当箇所との照合結果です。表示の内容の最終的なご判断は御社にお願いします。';
  var OMITTED = '（社内用の記載を含むため省いています）';
  var NEW_UNKNOWN = '記載なし・不明';
  var UNKNOWN_SUFFIX = '規格書に記載がありません。仕入先に確認してください';
  var MANAGER_SUFFIX = '表示の版は委託元が管理しています。どちらが表示案を直すか確認してください';
  var SWITCH_ITEM = '旧の規格書の原料を使う期間の切り替え日';
  var MAKER = '（架空）サンプル食品';

  function kindOf(id) {
    for (var i = 0; i < KINDS.length; i++) { if (KINDS[i].id === id) { return KINDS[i]; } }
    return null;
  }

  /* ---- 日付 ---- */
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function parseDay(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) { return NaN; }
    return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  }
  function fmtDay(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate());
  }
  function addDays(s, n) { return fmtDay(parseDay(s) + n * 86400000); }
  function diffDays(from, to) { return Math.round((parseDay(to) - parseDay(from)) / 86400000); }
  function dayLabel(sw, today) {
    if (!sw) { return '未入力'; }
    var n = diffDays(today, sw);
    if (n > 0) { return 'あと ' + n + ' 日'; }
    if (n === 0) { return '今日'; }
    return (-n) + ' 日経過';
  }
  function deviceToday() {
    var d = new Date();
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }

  /* ---- 抽出 ---- */
  function productsUsing(map, name) {
    var out = [];
    map.products.forEach(function (p) {
      var i = p.ingredients.indexOf(name);
      if (i >= 0) { out.push({ id: p.id, name: p.name, client: p.client, rank: i + 1, manager: p.manager }); }
    });
    return out;
  }

  function allergenDiff(oldItems, newItems, unknown) {
    if (unknown) { return null; }
    var all = SPECIFIC.concat(RECOMMENDED);
    function pick(list) { return all.filter(function (a) { return list.indexOf(a) >= 0; }); }
    var o = pick(oldItems || []);
    var n = pick(newItems || []);
    function tag(a) { return { item: a, cls: classOf(a) }; }
    return {
      onlyNew: n.filter(function (a) { return o.indexOf(a) < 0; }).map(tag),
      onlyOld: o.filter(function (a) { return n.indexOf(a) < 0; }).map(tag)
    };
  }

  function candidateFields(kinds) {
    return KINDS.filter(function (k) { return kinds.indexOf(k.id) >= 0; });
  }

  /* ---- 自由記入に、ほかの委託元・仕入先・担当者・ほかの委託元の商品が含まれるか ---- */
  function norm(s) { return String(s == null ? '' : s).normalize('NFKC'); }
  function mentionsOthers(text, client, map) {
    var t = norm(text);
    var own = norm(client);
    var m, re = /委託元([A-Za-z])/g;
    while ((m = re.exec(t)) !== null) {
      if (norm('委託元' + m[1]) !== own) { return true; }
    }
    if (map.clients.some(function (c) { return c !== client && t.indexOf(norm(c)) >= 0; })) { return true; }
    if (t.indexOf('仕入先') >= 0) { return true; }
    if (map.ingredients.some(function (g) { return t.indexOf(norm(g.supplier)) >= 0; })) { return true; }
    if (map.people.some(function (p) { return t.indexOf(norm(p)) >= 0; })) { return true; }
    return map.products.some(function (p) {
      if (p.client === client) { return false; }
      var base = norm(p.name).split(/\s+/)[0];
      return t.indexOf(norm(p.name)) >= 0 || t.indexOf(base) >= 0 || t.toUpperCase().indexOf(norm(p.id).toUpperCase()) >= 0;
    });
  }

  /* ---- 変更箇所の文 ---- */
  function oldText(c, san) {
    if (c.kind === 'K2') { return c.oldItems.length ? c.oldItems.join('、') : 'なし'; }
    return c.old ? san(c.old) : '（未入力）';
  }
  function newText(c, san) {
    if (c.unknown) { return NEW_UNKNOWN; }
    if (c.kind === 'K2') { return c.newItems.length ? c.newItems.join('、') : 'なし'; }
    return c.new ? san(c.new) : '（未入力）';
  }

  function locationLines(c, material, san, forClient) {
    san = san || function (t) { return t; };
    var o = oldText(c, san);
    var n = newText(c, san);
    switch (c.kind) {
      case 'K1': return ['原材料名: 「' + material + '」の内訳の記載（旧: ' + o + ' → 新: ' + n + '）'];
      case 'K2':
        if (c.unknown) {
          return ['アレルゲン: ' + (forClient ? '規格書に記載がありません' : UNKNOWN_SUFFIX)];
        }
        var lines = [];
        c.diff.onlyNew.forEach(function (a) { lines.push('アレルゲン: 「' + a.item + '」の追記候補'); });
        c.diff.onlyOld.forEach(function (a) { lines.push('アレルゲン: 「' + a.item + '」は旧の記載にだけあります。確認してください'); });
        if (!lines.length) { lines.push('アレルゲン: 旧と新の記載に品目の違いはありません'); }
        return lines;
      case 'K3': return ['添加物: 記載の確認（旧: ' + o + ' → 新: ' + n + '）'];
      case 'K4': return ['原料原産地名: 記載の確認（旧: ' + o + ' → 新: ' + n + '）'];
      case 'K5': return ['栄養成分表示: 原料の栄養成分の参照値が変わっています。栄養成分への影響と再計算が要るかどうかは御社で確認してください'];
    }
    return [];
  }

  function noteFlags(changes, kinds) {
    var k2 = changes.filter(function (c) { return c.kind === 'K2'; })[0];
    var has2 = kinds.indexOf('K2') >= 0 && !!k2;
    var items = has2 ? k2.oldItems.concat(k2.newItems) : [];
    return {
      n1: has2,
      n2: has2 && items.indexOf('カシューナッツ') >= 0,
      n3: has2 && items.indexOf('ピスタチオ') >= 0,
      n4: kinds.indexOf('K4') >= 0
    };
  }

  function stamp(today, hm) { return today + ' ' + (hm || '10:00'); }

  /* ---- 受付 → 社内用のシート ---- */
  function buildSheet(intake, selectedProducts, selectedKinds, ctx) {
    ctx = ctx || {};
    var map = ctx.map;
    var present = intake.changes.map(function (c) { return c.kind; });
    var kinds = KIND_IDS.filter(function (k) { return selectedKinds.indexOf(k) >= 0 && present.indexOf(k) >= 0; });
    var using = productsUsing(map, intake.material);

    var changes = intake.changes.map(function (c) {
      var unknown = !!c.unknown;
      var oldItems = c.kind === 'K2' ? (c.oldItems || []).slice() : [];
      var newItems = c.kind === 'K2' && !unknown ? (c.newItems || []).slice() : [];
      var ch = {
        kind: c.kind, label: kindOf(c.kind).item,
        old: c.old || '', 'new': unknown ? '' : (c['new'] || ''),
        unknown: unknown, oldItems: oldItems, newItems: newItems, diff: null
      };
      if (c.kind === 'K2') { ch.diff = allergenDiff(oldItems, newItems, unknown); }
      return ch;
    });

    var prods = selectedProducts.map(function (p) {
      if (typeof p === 'string') {
        return using.filter(function (u) { return u.id === p; })[0];
      }
      return p;
    }).filter(Boolean).map(function (p) {
      return { id: p.id, name: p.name, client: p.client, manager: p.manager, rank: p.rank };
    }).sort(function (a, b) { return a.id < b.id ? -1 : 1; });

    var clientNames = [];
    prods.forEach(function (p) { if (clientNames.indexOf(p.client) < 0) { clientNames.push(p.client); } });
    clientNames.sort();

    var open = [];
    var seq = 0;
    function addOpen(text, client, include) {
      seq += 1;
      open.push({ id: 'U' + seq, text: text, client: client, owner: '', state: '未確認', result: '', include: include, manual: false });
    }
    changes.forEach(function (c) {
      if (c.unknown) { addOpen(c.label + ': ' + UNKNOWN_SUFFIX, null, false); }
    });
    prods.forEach(function (p) {
      if (p.manager === '委託元') { addOpen(p.id + ': ' + MANAGER_SUFFIX, p.client, true); }
    });
    if (!intake.switchDate) { addOpen(SWITCH_ITEM, null, false); }

    var today = ctx.today || intake.receivedDate;
    var history = (intake.history || []).map(function (e) { return { at: e.at, who: e.who, what: e.what }; });
    history.push({ at: ctx.now || stamp(today), who: ctx.who || '東', what: '変更確認シートを作成（商品' + prods.length + '品・欄' + kinds.length + 'つ）' });

    return {
      id: ctx.id || 'S-000', status: '確認中', doneDate: '', createdDate: today,
      material: intake.material, supplier: intake.supplier,
      verOld: intake.verOld, verNew: intake.verNew,
      receivedDate: intake.receivedDate, switchDate: intake.switchDate || '',
      changes: changes, kinds: kinds, products: prods, usingTotal: using.length,
      notes: noteFlags(changes, kinds),
      open: open, nextOpen: seq + 1,
      clients: clientNames.map(function (c) { return { client: c, state: '未依頼', requestedDate: '', rounds: 0 }; }),
      history: history
    };
  }

  /* ---- 委託元ごとの確認の状態 ---- */
  var CLIENT_STATES = ['未依頼', '依頼済み', '確認済み', '差し戻し'];
  var ALLOWED = { '未依頼': ['依頼済み'], '依頼済み': ['確認済み', '差し戻し'], '差し戻し': ['依頼済み'], '確認済み': [] };
  function transitionClient(row, next, today) {
    if ((ALLOWED[row.state] || []).indexOf(next) < 0) { return null; }
    var req = next === '依頼済み';
    return { client: row.client, state: next, requestedDate: req ? today : row.requestedDate, rounds: row.rounds + (req ? 1 : 0) };
  }

  /* ---- 委託元に渡す版。載せる項目を 1 つずつ写して新しく作る ---- */
  function buildClientView(sheet, client, map) {
    function san(t) { return mentionsOthers(t, client, map) ? OMITTED : t; }
    var changes = sheet.changes.map(function (c) {
      return { label: c.label, oldText: oldText(c, san), newText: newText(c, san) };
    });
    var products = sheet.products.filter(function (p) { return p.client === client; }).map(function (p) {
      var rows = [];
      sheet.changes.forEach(function (c) {
        if (sheet.kinds.indexOf(c.kind) < 0) { return; }
        var k = kindOf(c.kind);
        rows.push({ field: k.field, lines: locationLines(c, sheet.material, san, true), basis: k.basis });
      });
      return { id: p.id, name: p.name, rows: rows };
    });
    var requests = sheet.open.filter(function (o) { return !o.manual && o.include && o.client === client; })
      .map(function (o) { return o.text; });
    var noteTexts = [BASIS_SCOPE];
    if (sheet.notes.n1) { noteTexts.push(NOTES.N1); noteTexts.push(ALLERGEN_ASOF); }
    if (sheet.notes.n2) { noteTexts.push(NOTES.N2); }
    if (sheet.notes.n3) { noteTexts.push(NOTES.N3); }
    return {
      title: '原料の変更のお知らせと確認のお願い',
      to: client + ' 御中',
      maker: MAKER,
      createdDate: sheet.createdDate,
      material: sheet.material,
      verOld: san(sheet.verOld),
      verNew: san(sheet.verNew),
      switchDate: sheet.switchDate || '未入力',
      changes: changes,
      products: products,
      noteTexts: noteTexts,
      requests: requests,
      finalNote: FINAL_NOTE
    };
  }

  return {
    SPECIFIC: SPECIFIC, RECOMMENDED: RECOMMENDED, CLASS_SPECIFIC: CLASS_SPECIFIC, CLASS_RECOMMENDED: CLASS_RECOMMENDED,
    ALLERGEN_ASOF: ALLERGEN_ASOF, BASIS_SCOPE: BASIS_SCOPE, classOf: classOf,
    KINDS: KINDS, KIND_IDS: KIND_IDS, kindOf: kindOf, NOTES: NOTES,
    FINAL_NOTE: FINAL_NOTE, OMITTED: OMITTED, NEW_UNKNOWN: NEW_UNKNOWN, MAKER: MAKER,
    UNKNOWN_SUFFIX: UNKNOWN_SUFFIX, MANAGER_SUFFIX: MANAGER_SUFFIX, SWITCH_ITEM: SWITCH_ITEM,
    CLIENT_STATES: CLIENT_STATES, ALLOWED: ALLOWED,
    parseDay: parseDay, addDays: addDays, diffDays: diffDays, dayLabel: dayLabel, deviceToday: deviceToday,
    productsUsing: productsUsing, allergenDiff: allergenDiff, candidateFields: candidateFields,
    mentionsOthers: mentionsOthers, locationLines: locationLines, oldText: oldText, newText: newText,
    noteFlags: noteFlags, stamp: stamp,
    buildSheet: buildSheet, transitionClient: transitionClient, buildClientView: buildClientView
  };
});
