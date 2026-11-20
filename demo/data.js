/* 架空データ。日付は「今日（D）」からの日数で持つ。会社名・担当者・商品はすべて架空。 */
(function (root) {
  'use strict';
  var R = (typeof module !== 'undefined' && module.exports) ? require('./rules.js') : root.FL;

  function makeData(D) {
    function d(n) { return R.addDays(D, n); }
    function at(n, hm) { return d(n) + ' ' + (hm || '10:00'); }

    var data = {
      maker: R.MAKER,
      people: ['東', '西', '南'],
      roles: { '東': '表示担当', '西': '品質管理', '南': '委託元の窓口' },
      clients: ['委託元A', '委託元B', '委託元C'],
      ingredients: [
        { name: '醤油', supplier: '仕入先Y' },
        { name: 'ミックスナッツペースト', supplier: '仕入先X' },
        { name: '砂糖', supplier: '仕入先Z' },
        { name: '食用植物油', supplier: '仕入先W' },
        { name: 'すりごま', supplier: '仕入先V' },
        { name: '米酢', supplier: '仕入先Y' },
        { name: '香辛料ミックス', supplier: '仕入先U' }
      ],
      products: [
        { id: 'P01', name: 'ナッツだれ 200g', client: '委託元A', ingredients: ['醤油', 'ミックスナッツペースト', '砂糖'], manager: '当方' },
        { id: 'P02', name: 'ナッツだれ 徳用 500g', client: '委託元A', ingredients: ['醤油', 'ミックスナッツペースト', '砂糖'], manager: '当方' },
        { id: 'P03', name: '胡麻とナッツのドレッシング 300ml', client: '委託元B', ingredients: ['食用植物油', 'ミックスナッツペースト', 'すりごま', '米酢'], manager: '委託元' },
        { id: 'P04', name: 'ごまだれ 200g', client: '委託元A', ingredients: ['醤油', 'すりごま', '砂糖'], manager: '当方' },
        { id: 'P05', name: '和風ドレッシング 300ml', client: '委託元C', ingredients: ['食用植物油', '醤油', '米酢', '香辛料ミックス'], manager: '当方' },
        { id: 'P06', name: '焼肉のたれ 中辛 240g', client: '委託元C', ingredients: ['醤油', '砂糖', '香辛料ミックス', 'すりごま'], manager: '委託元' }
      ],
      intakes: [],
      sheets: []
    };

    function supplierOf(name) {
      return data.ingredients.filter(function (g) { return g.name === name; })[0].supplier;
    }

    /* 受付（最初から入っている 1 件） */
    data.intakes.push({
      id: 'R-001', status: '受付', closeReason: '', sheetId: '',
      receivedDate: d(-1), material: 'ミックスナッツペースト', supplier: supplierOf('ミックスナッツペースト'),
      verOld: '第3版', verNew: '第4版', switchDate: d(25),
      changes: [
        { kind: 'K1', old: 'アーモンド・ピーナッツ', 'new': 'アーモンド・ピーナッツ・カシューナッツ', unknown: false, oldItems: [], newItems: [] },
        { kind: 'K2', old: '', 'new': '', unknown: false, oldItems: ['アーモンド', '落花生（ピーナッツ）'], newItems: ['アーモンド', '落花生（ピーナッツ）', 'カシューナッツ'] },
        { kind: 'K3', old: '記載なし', 'new': '', unknown: true, oldItems: [], newItems: [] },
        { kind: 'K5', old: '第3版の内訳に基づく参照値', 'new': '内訳が変わった', unknown: false, oldItems: [], newItems: [] }
      ],
      history: [{ at: at(-1, '09:30'), who: '東', what: '変更を受け付け（ミックスナッツペースト 第3版 → 第4版）' }]
    });

    function seedSheet(id, intake, prodIds, kinds, createdOffset) {
      var using = R.productsUsing(data, intake.material);
      var sel = using.filter(function (p) { return prodIds.indexOf(p.id) >= 0; });
      var sh = R.buildSheet(intake, sel, kinds, { map: data, id: id, today: d(createdOffset), now: at(createdOffset, '10:00'), who: '東' });
      return sh;
    }

    /* S-001（済） */
    var in1 = {
      receivedDate: d(-20), material: '食用植物油', supplier: supplierOf('食用植物油'),
      verOld: '第2版', verNew: '第3版', switchDate: d(-5),
      changes: [{ kind: 'K5', old: '第2版の参照値', 'new': '第3版で参照値が変わった', unknown: false, oldItems: [], newItems: [] }],
      history: []
    };
    var s1 = seedSheet('S-001', in1, ['P03', 'P05'], ['K5'], -19);
    s1.status = '済';
    s1.doneDate = d(-10);
    s1.open[0].state = '確認済み';
    s1.open[0].owner = '南';
    s1.open[0].result = '委託元Bが直す';
    s1.clients = [
      { client: '委託元B', state: '確認済み', requestedDate: d(-12), rounds: 2 },
      { client: '委託元C', state: '確認済み', requestedDate: d(-15), rounds: 1 }
    ];
    s1.history = [
      { at: at(-20), who: '東', what: '変更を受け付け（食用植物油 第2版 → 第3版）' },
      { at: at(-19), who: '東', what: '変更確認シートを作成（商品2品・欄1つ）' },
      { at: at(-15), who: '東', what: '委託元Cの確認状態を「未依頼」から「依頼済み」に変更' },
      { at: at(-13), who: '東', what: '委託元Cの確認状態を「依頼済み」から「確認済み」に変更' },
      { at: at(-11), who: '東', what: '委託元Bの確認状態を「依頼済み」「差し戻し」「依頼済み」「確認済み」の順に変更（往復2回）' },
      { at: at(-10), who: '東', what: 'シートの状態を「確認中」から「済」に変更' }
    ];

    /* S-002（確認中） */
    var in2 = {
      receivedDate: d(-6), material: '香辛料ミックス', supplier: supplierOf('香辛料ミックス'),
      verOld: '第1版', verNew: '第2版', switchDate: d(12),
      changes: [
        { kind: 'K1', old: '唐辛子・こしょう', 'new': '唐辛子・こしょう・ごま', unknown: false, oldItems: [], newItems: [] },
        { kind: 'K2', old: '', 'new': '', unknown: false, oldItems: [], newItems: ['ごま'] }
      ],
      history: []
    };
    var s2 = seedSheet('S-002', in2, ['P05', 'P06'], ['K1', 'K2'], -5);
    s2.open[0].owner = '南';
    s2.clients = [{ client: '委託元C', state: '依頼済み', requestedDate: d(-3), rounds: 1 }];
    s2.history = [
      { at: at(-6), who: '東', what: '変更を受け付け（香辛料ミックス 第1版 → 第2版）' },
      { at: at(-5), who: '東', what: '変更確認シートを作成（商品2品・欄2つ）' },
      { at: at(-4, '14:00'), who: '東', what: '未確認事項「P06: 表示の版は委託元が管理…」の担当を 南 に変更' },
      { at: at(-3, '11:00'), who: '東', what: '委託元Cの確認状態を「未依頼」から「依頼済み」に変更' }
    ];

    data.sheets.push(s1, s2);
    return data;
  }

  var api = { makeData: makeData };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  else { root.FL = Object.assign(root.FL || {}, api); }
})(typeof window !== 'undefined' ? window : globalThis);
