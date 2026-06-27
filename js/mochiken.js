/* =========================================================
 * 常総学院シミュレーター - 持ち物検査（持ち検）システム
 *
 *   年1回・抜き打ちで朝に発生する特別イベント。
 *   前週に予告 → プレイヤーは対策（家に置く / 友達に預ける / そのまま）。
 *   当日、所持品が見つかると 注意 / 一時没収 / 生徒指導 / 停学。
 *   NPCも性格タイプ（石川=反発 / ちのね=メンタル / 西山=トラブル）で反応。
 *   結果は メンタル・学校評価・問題行動値・出席（life.jsと共有）に波及する。
 *
 *   依存: game.js（S / showAdv / showEvent / showResultOverlay / applyFx /
 *         applyRel / applyStress / parseLines / render / esc / save / pick /
 *         npcName / BGS / WEEK_LABELS / bgmPlay / showMain）
 *         data.js（MOCHIKEN_ITEMS / MOCHIKEN_START_ITEMS / MOCHIKEN_NPC）
 * ========================================================= */

/* ---------- 状態初期化（持ち検週の抽選・初期所持品） ---------- */
function ensureMochikenState(S) {
  if (S.checkWeek == null) {
    // テスト週・大型行事週を避け、年間の通常週からランダムに1週決定
    const pool = [4, 5, 8, 10, 15, 21];
    S.checkWeek = pool[Math.floor(Math.random() * pool.length)];
  }
  if (S.items === undefined)        S.items = (MOCHIKEN_START_ITEMS[S.type] || ["manga"]).slice();
  if (S.carry === undefined)        S.carry = null;   // 当日カバンに入れて持っていく物
  if (S.preCheckDone === undefined) S.preCheckDone = false;
  if (S.checkDone === undefined)    S.checkDone = false;
  if (S.heldFor === undefined)      S.heldFor = null; // 友達から預かった場合の持ち主
  if (S.heldItem === undefined)     S.heldItem = null;
  if (S.lentTo === undefined)       S.lentTo = null;  // 自分の物を預けた相手
}

/* 朝イベントのフック（showMain の冒頭から呼ばれる）。処理したら true */
function mochikenMorning() {
  ensureMochikenState(S);
  if (S.route === "leave" || S.route === "path_change") return false; // 終端ルート中は出さない
  if (S.week === S.checkWeek - 1 && !S.preCheckDone) { showPreCheckInfo(); return true; }
  if (S.week === S.checkWeek && !S.checkDone)        { startMochiken();   return true; }
  return false;
}

/* 続行用の共通ボタンハンドラ */
function mochikenProceed() {
  const f = window.__mochikenNext;
  window.__mochikenNext = null;
  if (f) f();
}

/* 結果チップ＋続行ボタン付きの短いADV */
function mochikenInfo(title, text, fx, stress, next) {
  window.__mochikenNext = next;
  showAdv({
    bg: BGS.entrance, badge: "🎒 持ち物検査", title,
    lines: parseLines(text),
    onDone: () => showResultOverlay(fx || null, null, stress || 0, "つづく", "mochikenProceed"),
  });
}

/* =========================================================
 * 前週: 予告 → 友達の頼み → 対策
 * ========================================================= */
function showPreCheckInfo() {
  ADV = null;
  bgmPlay("comedy");
  showAdv({
    bg: BGS.classroom, badge: "📢 朝の教室", title: "来週、持ち検があるらしい",
    lines: parseLines(
      "朝、教室がいつもよりざわついている。\n" +
      "「なあ、来週さ、抜き打ちで持ち物検査あるらしいよ。通称『持ち検』」\n\n" +
      "持ち検——年に一度あるかないかの、朝の関門だ。先生たちが昇降口と廊下に立ち、カバンの中を改める。\n" +
      "漫画、ゲーム機、トレカ……普段こっそり持ち込んでいる物がある奴は、今のうちに対策しないとまずい。"
    ),
    onDone: showPreCheckFavor,
  });
}

/* 誰がプレイヤーに「預かって」と頼んでくるか（軽度70% / 重度30%） */
function pickFavor() {
  if (Math.random() < 0.3) {
    return { friend: "toya", item: "lighter",
      ask: "これ、ちょっと火遊びしようと思って持ってきちゃってさ……完全にヤバいやつ。持ち検まで預かってくれ！" };
  }
  return { friend: "kuno", item: "game",
    ask: "俺のゲーム機、持ち検でぜってぇ見つかる！声がでかいからすぐバレる！頼む、預かってくれ！" };
}

function showPreCheckFavor() {
  const fav = pickFavor();
  const fname = npcName(fav.friend);
  const heavy = MOCHIKEN_ITEMS[fav.item].severity === "heavy";
  const ev = {
    id: "mochiken_favor", place: "教室", bgm: "comedy", title: "友達からの頼み",
    text: `${fname}が深刻な顔で寄ってきた。\n「${fav.ask}」\n\n` +
      `${MOCHIKEN_ITEMS[fav.item].icon} ${MOCHIKEN_ITEMS[fav.item].name}——` +
      (heavy ? "正直、これはかなりまずい物だ。預かれば、リスクを背負うのは自分になる。" :
               "見つかっても没収くらいだろうが、預かれば責任は自分に移る。") +
      `\n友情と、リスク。天秤が揺れる。`,
    choices: [
      {
        label: "預かってあげる", nextLabel: "自分の物はどうする？",
        text: `「いいよ、貸しにしとく」と引き受けた。${fname}は「お前、マジで親友だわ！」と拝んできた。\n` +
          `ただし——持ち検で見つかったとき、責任を取るのは自分だ。`,
        fx: { omoide: 2 }, rel: { [fav.friend]: 5 },
        fn: (S) => { S.items.push(fav.item); S.heldFor = fav.friend; S.heldItem = fav.item; },
      },
      {
        label: "丁重に断る", nextLabel: "自分の物はどうする？",
        text: `「悪い、自分の分だけで手一杯だわ」と断った。${fname}は「だよな……」と肩を落として去っていった。\n` +
          `薄情かもしれないが、自衛も大事だ。`,
        fx: {}, rel: { [fav.friend]: -2 },
      },
    ],
  };
  showEvent(ev, showPreCheckStash, true);
}

/* 預け先（最も仲の良い生徒。預かり主は除く） */
function pickLendTarget() {
  let best = null, bestRel = -1;
  for (const n of NPCS) {
    if (n.group !== "男子" && n.group !== "女子") continue;
    if (n.id === "damaki" || n.id === S.heldFor) continue;
    const r = S.rel[n.id] || 0;
    if (r > bestRel) { bestRel = r; best = n.id; }
  }
  return best || "kuno";
}

function showPreCheckStash() {
  ADV = null;
  bgmPlay("comedy");
  const items = (S.items || []).map(id =>
    `<span class="mk-item">${MOCHIKEN_ITEMS[id].icon} ${MOCHIKEN_ITEMS[id].name}</span>`).join("")
    || `<span class="hint">特になし</span>`;

  render(`
    <div class="screen prep-screen">
      <div class="panel">
        <div class="panel-title">🎒 持ち検対策 — いまのカバンの中身</div>
        <div class="mk-items">${items}</div>
        <p class="hint">来週の抜き打ち持ち物検査。これらをどうする？</p>
        <div class="prep-grid">
          <button class="prep-card c-teal" onclick="mochikenStash('home')">
            <span class="prep-icon">🏠</span><span class="prep-body">
            <span class="prep-label">全部、家に置いてくる</span>
            <span class="prep-desc">いちばん安全。手ぶらで堂々と検査を通過できる。</span></span></button>
          <button class="prep-card c-green" onclick="mochikenStash('lend')">
            <span class="prep-icon">🤝</span><span class="prep-body">
            <span class="prep-label">仲のいい友達に預ける</span>
            <span class="prep-desc">自分は安全。ただし預けた友達にリスクが移る。</span></span></button>
          <button class="prep-card c-orange" onclick="mochikenStash('keep')">
            <span class="prep-icon">😎</span><span class="prep-body">
            <span class="prep-label">気にせず持っていく</span>
            <span class="prep-desc">バレなければ問題なし。見つかればその時はその時。</span></span></button>
        </div>
      </div>
    </div>
  `);
  save();
}

function mochikenStash(mode) {
  const items = S.items || [];
  let fx = {}, rel = null, title, text;

  if (mode === "home") {
    S.carry = [];
    title = "家に置いてきた";
    text = "念のため、漫画もゲームも全部、家の机にしまってきた。\n" +
      "カバンの中は教科書とノートだけ。これで持ち検は怖くない。安全第一だ。";
  } else if (mode === "lend") {
    const t = pickLendTarget();
    S.lentTo = t; S.lentItems = items.slice(); S.carry = [];
    rel = { [t]: 3 }; fx = { omoide: 1 };
    title = `${npcName(t)}に預けた`;
    text = `${npcName(t)}に「持ち検まで預かって」と頼んだら、「いいよ」と引き受けてくれた。\n` +
      `自分のカバンは綺麗になった。……${npcName(t)}、悪いな。見つからないことを祈る。`;
  } else {
    S.carry = items.slice();
    fx = { nori: 1 };
    title = "そのまま持っていく";
    text = "対策？しない。バレなきゃいいんだ。いつも通りの中身のまま、持ち検に挑むことにした。\n" +
      "度胸か、無謀か。それは当日わかる。";
  }

  applyFx(fx); applyRel(rel);
  S.preCheckDone = true; save();
  window.__mochikenNext = showMain;
  showAdv({
    bg: BGS.home, badge: "🎒 持ち検対策", title,
    lines: parseLines(text),
    onDone: () => showResultOverlay(fx, rel, 0, "来週へ——", "mochikenProceed"),
  });
}

/* =========================================================
 * 当日: 導入 → プレイヤー判定 → NPC判定 → 後日談
 * ========================================================= */
function concealPlayer() {
  // 能力は0〜1000なので0〜100換算して使う
  return Math.max(10, Math.min(78, 35 + (S.stats.komyu / 10) * 0.3 + (S.stats.mental / 10 - 40) * 0.2));
}
/* conceal=隠し能力(高いほど安全)。見つかったら true */
function rollFound(conceal) {
  return Math.random() * 100 > conceal + (Math.random() * 16 - 8);
}

function startMochiken() {
  ADV = null;
  bgmPlay("eerie");
  if (!S.carry) S.carry = (S.items || []).slice(); // 前週を飛ばした保険
  showAdv({
    bg: BGS.entrance, badge: "🎒 持ち物検査", title: "今日は、様子がおかしい",
    lines: parseLines(
      "登校すると、今日は朝から先生たちが昇降口と廊下にずらりと立っていた。\n" +
      "ただならぬ空気。生徒たちが互いに目配せする。\n\n" +
      "「……持ち物検査だ」\n" +
      "誰かがつぶやいた。年に一度の『持ち検』が、抜き打ちで始まった。"
    ),
    onDone: () => mochikenPlayer(() => mochikenNpc(() => mochikenPost())),
  });
}

function mochikenPlayer(next) {
  const carry = S.carry || [];
  if (!carry.length) {
    applyFx({ mental: 1 });
    S.schoolEval = Math.min(100, S.schoolEval + 1);
    mochikenInfo("無事、通過",
      "カバンの中は教科書とノートだけ。先生は軽くうなずいて「はい、次」。\n" +
      "何も持っていない者にとって、持ち検はただの朝の通過儀礼だ。堂々と通り抜けた。",
      { mental: 1 }, 0, next);
    return;
  }
  const heavy = carry.find(id => MOCHIKEN_ITEMS[id].severity === "heavy");
  const target = heavy || carry[0];

  if (!rollFound(concealPlayer())) {
    sePlay("se/ピューンと逃げる.mp3", 0.7);
    applyFx({ nori: 2, omoide: 2 });
    mochikenInfo("セーフ……！",
      `先生がカバンを開ける。心臓が跳ねる。\n` +
      `${MOCHIKEN_ITEMS[target].name}は弁当箱の下に隠れていて——見つからなかった。\n` +
      `何食わぬ顔で通過した。今日ばかりは、自分の強運に感謝した。`,
      { nori: 2, omoide: 2 }, 0, next);
    return;
  }

  sePlay("se/ショック1.mp3", 0.7);
  if (MOCHIKEN_ITEMS[target].severity === "heavy") mochikenPlayerHeavy(target, next);
  else mochikenPlayerLight(target, next);
}

function mochikenPlayerLight(target, next) {
  const nm = MOCHIKEN_ITEMS[target].name;
  const isFriend = S.heldFor && target === S.heldItem;
  let ev;

  if (isFriend) {
    const fn = npcName(S.heldFor);
    ev = {
      id: "mk_found_friend", place: "昇降口", bgm: "sad", title: `${nm}が見つかった`,
      text: `先生がカバンから${nm}を取り出した。「これは？」\n` +
        `まずい。これは——${fn}から預かった物だ。正直に言えば${fn}が指導を受ける。どうする？`,
      choices: [
        {
          label: "「自分のです」とかばう", nextLabel: "その後",
          text: `「……それ、自分のです」。${fn}の名前は出さなかった。一時没収と注意で済んだが、先生の心証は少し下がった。\n` +
            `後で${fn}が「お前……かばってくれたのか」と声を震わせていた。大きな貸しが一つできた。`,
          fx: { mental: -6, omoide: 3 }, rel: { [S.heldFor]: 8 },
          fn: (S) => { S.schoolEval = Math.max(0, S.schoolEval - 2); S.trouble = Math.min(100, S.trouble + 4); },
        },
        {
          label: "正直に持ち主を伝える", nextLabel: "その後",
          text: `「それ、${fn}に頼まれて預かった物で……」。正直に話した。先生は${fn}を呼び出した。\n` +
            `嘘はつかなかったが、${fn}とは少し気まずくなってしまった。`,
          fx: { mental: -2, shinrai: 1 }, rel: { [S.heldFor]: -6 },
        },
      ],
    };
  } else {
    ev = {
      id: "mk_found_light", place: "昇降口", bgm: "sad", title: `${nm}が見つかった`,
      text: `先生がカバンの底から${nm}を見つけ出した。「持ち込み禁止だぞ」\n` +
        `周りの視線が集まる。どう対応する？`,
      choices: [
        {
          label: "素直に従って没収される", nextLabel: "その後",
          text: `「……すみません」と素直に差し出した。一時没収と軽い注意で済んだ。放課後に取りに来いとのこと。\n` +
            `ちょっと恥ずかしいが、これで終わりだ。`,
          fx: { mental: -5 },
          fn: (S) => { S.schoolEval = Math.max(0, S.schoolEval - 1); },
        },
        {
          label: "しらばっくれる", nextLabel: "その後",
          text: `「え、なんでこれが……知らないです」と白を切ったが、自分のカバンから出た物に説得力はない。\n` +
            `余計に長い説教を食らった。なおクラスメイトには「あの往生際、逆にウケる」と妙に好評だった。`,
          fx: { mental: -8, ninki: 1 },
          fn: (S) => { S.trouble = Math.min(100, S.trouble + 6); },
        },
      ],
    };
  }
  showEvent(ev, next, true);
}

function mochikenSuspend() {
  S.schoolEval = Math.max(0, S.schoolEval - 18);
  S.trouble = Math.min(100, S.trouble + 26);
  S.attendance = Math.max(0, S.attendance - 18);
  S.flags.suspended = true;
  S.log.push(`${WEEK_LABELS[S.week]}: 持ち検で禁止物が見つかり、停学処分`);
}

function mochikenPlayerHeavy(target, next) {
  const nm = MOCHIKEN_ITEMS[target].name;
  const isFriend = S.heldFor && target === S.heldItem;
  const fn = S.heldFor ? npcName(S.heldFor) : null;
  const ev = {
    id: "mk_found_heavy", place: "職員室", bgm: "sad", title: "禁止物が、見つかった",
    text: `先生の手が止まった。カバンから出てきたのは——${nm}。校則で固く禁じられた物だ。\n` +
      `空気が一変する。「ちょっと、生徒指導室まで来なさい」\n\n` +
      (isFriend ? `これは${fn}から「ヤバいやつ」と言われて預かった物だった。さあ、どうする？`
                : `言い訳のしようがない。どう向き合う？`),
    choices: [],
  };

  if (isFriend) {
    ev.choices = [
      {
        label: "全部自分が持ち込んだと主張する（停学覚悟）", nextLabel: "処分",
        text: `${fn}を巻き込みたくなくて、「全部、自分のです」と言い張った。\n` +
          `結果は——停学。重い処分だが、${fn}の名前は守り抜いた。${fn}は泣きながら「一生忘れない」と言った。`,
        fx: { mental: -22 }, stress: 35,
        fn: (S) => { mochikenSuspend(); S.rel[S.heldFor] = Math.min(100, (S.rel[S.heldFor] || 0) + 12); },
      },
      {
        label: "正直に事情をすべて話す", nextLabel: "処分",
        text: `「${fn}に頼まれて、中身も知らずに預かりました」と正直に話した。\n` +
          `自分は厳重注意と生徒指導で済んだが、${fn}は重い処分を受けた。これでよかったのか、答えは出ない。`,
        fx: { mental: -10, shinrai: 1 }, stress: 15, rel: { [S.heldFor]: -8 },
        fn: (S) => { S.schoolEval = Math.max(0, S.schoolEval - 8); S.trouble = Math.min(100, S.trouble + 12); S.attendance = Math.max(0, S.attendance - 5); },
      },
    ];
  } else {
    ev.choices = [
      {
        label: "素直に謝り、深く反省する", nextLabel: "処分",
        text: `言い訳せず、深く頭を下げた。保護者も呼ばれ、こってり絞られた。\n` +
          `生徒指導という重い処分。だが反省の姿勢が認められ、停学だけは免れた。しばらく評判は最悪だ。`,
        fx: { mental: -12 }, stress: 20,
        fn: (S) => { S.schoolEval = Math.max(0, S.schoolEval - 8); S.trouble = Math.min(100, S.trouble + 12); S.attendance = Math.max(0, S.attendance - 3); },
      },
      {
        label: "先生に反発する", nextLabel: "処分",
        text: `カッとなって先生に食ってかかった。事態は悪化。保護者召喚、職員会議、そして——停学。\n` +
          `意地を通した代償は、あまりに大きかった。`,
        fx: { mental: -20 }, stress: 40,
        fn: (S) => { mochikenSuspend(); },
      },
    ];
  }
  showEvent(ev, next, true);
}

/* ---------- NPC判定（1イベント） ---------- */
function mochikenNpc(next) {
  // 自分が物を預けた相手が見つかるパターンを優先
  if (S.lentTo) {
    const prof = MOCHIKEN_NPC[S.lentTo] || { conceal: 50 };
    if (rollFound(prof.conceal - 15)) return showEvent(npcEvLentCaught(S.lentTo), next, true);
  }
  const maker = pick([npcEvIshikawa, npcEvChinone, npcEvNishiyama]);
  showEvent(maker(), next, true);
}

function npcEvIshikawa() {
  return {
    id: "mk_ishikawa", place: "昇降口", bgm: "comedy", title: "石川、持ち検に抗議する",
    text: "石川君のカバンから携帯ゲーム機が発見された。先生が没収しようとすると——\n" +
      "石川「待ってほしい。これは遊具ではなく思考の補助器具なんだが。没収は論理的に不当だ」\n" +
      "先生「いいから出しなさい」\n石川「だから——」\n" +
      "朝から不毛な口論が始まり、周囲がざわつき始めた。問題が大きくなりそうだ。",
    choices: [
      { label: "石川を全力で止める", text: "「石川、それ以上はマジでヤバいって！」と羽交い締めにした。我に返った石川君が渋々ゲーム機を差し出し、注意だけで収まった。「……お前の判断は、まあ及第点なんだが」。礼は素直に言えないらしい。", fx: { shinrai: 2, omoide: 2 }, rel: { ishikawa: 4 } },
      { label: "石川の理屈に加勢する", text: "「確かに思考の補助になり得ますよね！」と援護射撃したら、口論が二倍に膨らんだ。最終的に二人まとめて長い説教を食らった。石川君は「君は同志なんだが」と謎の満足げな顔。", fx: { nori: 3, omoide: 2 }, rel: { ishikawa: 5 }, fn: (S) => { S.trouble = Math.min(100, S.trouble + 4); } },
    ],
  };
}

function npcEvChinone() {
  return {
    id: "mk_chinone", place: "教室", bgm: "sad", title: "ちのね、注意される",
    text: "ちのね君のカバンから、トトロのキーホルダー（と、こっそり持ってきた漫画）が見つかった。\n" +
      "先生に軽く注意されただけなのに、ちのね君はクラス中の視線を感じて、みるみる青ざめていく。\n" +
      "「……みんな、見てる……ぼく、変なやつだって、思われてる……」。放っておくと、ずるずる落ち込みそうだ。",
    choices: [
      { label: "「気にすんなって」と明るく声をかける", text: "「トトロ持ち歩くの最高だろ。俺は好きだぜ」と笑い飛ばした。ちのね君の顔に、少しだけ血の気が戻る。「……ありがと。きみがいると、こわくない」。落ち込みは、友達の一言で救われることがある。", fx: { omoide: 4, mental: 1 }, rel: { chinone: 7 } },
      { label: "そっとそばにいてやる", text: "何も言わず、ただ隣の席に座っていた。ちのね君は俯いたままだったが、少しして「……いてくれて、ありがと」と小さく言った。言葉がなくても伝わるものはある。", fx: { omoide: 3 }, rel: { chinone: 5 } },
    ],
  };
}

function npcEvNishiyama() {
  return {
    id: "mk_nishiyama", place: "昇降口", bgm: "comedy", title: "西山、苦しい言い訳",
    text: "西山君のカバンからトレカの束が発見された。咄嗟に西山君が叫ぶ。\n" +
      "西山「こ、これは資料です！社会科の！武将の！」\n先生「……どう見てもアニメのキャラだが」\n" +
      "石川「往生際が悪いんだが」\n名物の二人が、今日は持ち検の前で因縁の口論を再開した。",
    choices: [
      { label: "西山の言い訳に全力で乗っかる", text: "「そうです、これは歴史資料です！」と二人で謎の援護をしたが、無理があった。先生は呆れ顔。西山君は没収されつつ「……お前は、いい奴だ」と握手を求めてきた。共犯の絆である。", fx: { nori: 3, omoide: 3 }, rel: { nishiyama: 4 } },
      { label: "「素直に出しなよ」と促す", text: "「西山、潔く出した方が傷は浅いって」と促した。西山君は渋々トレカを差し出し、注意だけで済んだ。後で「……お前が正しかった。サンキュ」と認めていた。素直になれる相手はいるものだ。", fx: { shinrai: 2, omoide: 2 }, rel: { nishiyama: 4 } },
    ],
  };
}

function npcEvLentCaught(npc) {
  const nm = npcName(npc);
  return {
    id: "mk_lent_caught", place: "昇降口", bgm: "sad", title: "預けた物が、見つかった",
    text: `持ち検で、${nm}のカバンから——自分が預けた漫画やゲームが出てきてしまった。\n` +
      `${nm}が先生に注意を受けている。自分の代わりに、だ。さあ、どうする？`,
    choices: [
      { label: "「それ、自分のです」と名乗り出る", text: `前に出て「それ、自分が預けた物です」と正直に言った。二人で軽い注意を受けたが、${nm}は「庇わなくてよかったのに……でも、ありがと」と笑ってくれた。筋は通した。`, fx: { mental: -4, omoide: 3 }, rel: { [npc]: 8 }, fn: (S) => { S.schoolEval = Math.max(0, S.schoolEval - 1); S.trouble = Math.min(100, S.trouble + 2); } },
      { label: "黙っている", text: `言い出せず、黙ってしまった。${nm}は一人で注意を受け、こちらを一度だけ見た。その視線が、しばらく胸に刺さって抜けなかった。`, fx: { mental: -3, shinrai: -2 }, rel: { [npc]: -7 } },
    ],
  };
}

/* ---------- 後日談 → 終了 ---------- */
function mochikenPost() {
  window.__mochikenNext = finalizeMochiken;
  bgmPlay("everyday");
  showAdv({
    bg: BGS.classroom, badge: "🎒 持ち検・放課後", title: "今日のうわさ",
    lines: parseLines(
      "昼休みの教室は、持ち検の話題で持ちきりだった。\n" +
      "「誰々が没収されたらしい」「先生、今日は本気だった」……\n\n" +
      "一日経てば、きっとこれも笑い話になる。年に一度の朝の関門は、こうして過ぎていった。"
    ),
    onDone: () => showResultOverlay(null, null, 0, "いつもの日常へ", "mochikenProceed"),
  });
}

function finalizeMochiken() {
  S.checkDone = true;
  if (!S.log.some(l => l.includes("持ち物検査"))) {
    S.log.push(`${WEEK_LABELS[S.week]}: 抜き打ち持ち物検査`);
  }
  save();
  showMain();
}
