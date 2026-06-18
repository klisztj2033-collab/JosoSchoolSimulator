/* =========================================================
 * 常総学院シミュレーター - 恋愛・進路の重大分岐システム
 *
 *   恋愛を「好感度の数字」で終わらせず、選択によって学校生活の未来が
 *   変わる重大イベントとして扱う（仕様書「基本方針」「目的」）。
 *
 *   ※ 登場人物は中等部1年生。妊娠等の性的シナリオは扱わない。
 *     重大イベントの引き金は「将来を考える大きな出来事」＝
 *     交際相手の家庭の事情（遠方への引っ越し・転校）とし、
 *     仕様書の分岐ロジック（A/B/C → 総合判定 → 継続/進路変更/離脱）を踏襲する。
 *
 *   フロー:
 *     恋愛成立イベント → （交際中・低確率）将来を考える大きな出来事
 *       → A 向き合う / B 逃げる / C 相談する（即時効果・対応を記録）
 *       → 後日、学校との話し合い ＝ 総合判定
 *         （学校評価・問題行動値・メンタル・出席・対応で算出）
 *       → 継続ルート / 進路変更ルート / 離脱ルート
 *
 *   依存: game.js（S / showEvent / showAdv / showResultOverlay / applyFx /
 *         applyStress / parseLines / render / esc / save / clearSave /
 *         showTitle / npcName / BGS / WEEK_LABELS / bgmPlay）
 * ========================================================= */

/* ---------- 状態の初期化（旧セーブ互換） ---------- */
function ensureLifeState(S) {
  if (S.schoolEval == null)        S.schoolEval = 70;   // 学校評価
  if (S.trouble == null)           S.trouble = 0;       // 問題行動値
  if (S.attendance == null)        S.attendance = 100;  // 出席状況
  if (S.partner === undefined)     S.partner = null;    // 主交際相手（進路イベント用）
  if (S.partners === undefined)    S.partners = S.partner ? [S.partner] : []; // 恋人一覧（複数可）
  if (S.romanceDeclined === undefined) S.romanceDeclined = []; // 告白を見送った相手（再勧誘しない）
  if (S.romanceStart === undefined)S.romanceStart = null;
  if (S.lifeEvent === undefined)   S.lifeEvent = null;  // 進行中の重大イベント
  if (S.route === undefined)       S.route = null;      // 確定ルート
}

function normalizeLife() {
  S.schoolEval = Math.max(0, Math.min(100, S.schoolEval));
  S.trouble    = Math.max(0, Math.min(100, S.trouble));
  S.attendance = Math.max(0, Math.min(100, S.attendance));
}

/* 恋人になれる好感度のしきい値（親友・特別な関係の域）。
 *   これを満たした相手は条件達成で即「恋人」になれる（恋人は複数可）。 */
const LOVER_REL_THRESHOLD = 80;

/* ---------- まだ恋人でない、恋人成立条件を満たす相手を1人返す ----------
 *   条件: 好感度 >= LOVER_REL_THRESHOLD（先生・3年の先輩は対象外）。
 *   複数いれば最も好感度の高い相手から順に成立していく。 */
function pickNewLoverCandidate() {
  const lovers = S.partners || [];
  const declined = S.romanceDeclined || [];
  let best = null, bestRel = LOVER_REL_THRESHOLD - 1;
  for (const n of NPCS) {
    if (n.group !== "男子" && n.group !== "女子") continue;
    if (n.id === "damaki") continue;        // 3年の先輩は対象外
    if (lovers.includes(n.id)) continue;    // すでに恋人
    if (declined.includes(n.id)) continue;  // 一度見送った相手は再勧誘しない
    const r = S.rel[n.id] || 0;
    if (r > bestRel) { bestRel = r; best = n; }
  }
  return best;
}

function romanceDuration() {
  if (S.romanceStart == null) return 0;
  return S.week - S.romanceStart;
}

/* 重大イベントの発生判定（交際中・条件を満たしたら低〜中確率） */
function shouldTriggerLifeEvent() {
  if (!S.partner || S.week < 8) return false;     // 交際中・終盤
  if (romanceDuration() < 2) return false;        // ある程度長く続いた関係
  let p = 0.30;                                   // 基本確率
  if (S.stats.mental < 350) p += 0.12;            // メンタルが低いと起こりやすい（0〜1000）
  return Math.random() < p;
}

/* =========================================================
 * 毎週の人生イベント・チェック（game.js の afterFixedEvent から呼ばれる）
 *   成立したら true を返し、内部で続き(next)を呼ぶ責任を持つ。
 * ========================================================= */
function maybeLifeEvents(next) {
  ensureLifeState(S);
  normalizeLife();

  // 重大イベント後の「学校との話し合い」＝総合判定（翌週以降）
  if (S.lifeEvent && S.lifeEvent.stage === "await_judgment" && S.week > S.lifeEvent.week) {
    runLifeJudgment(next);
    return true;
  }

  if (S.route) return false;       // ルート確定（継続）後は再発火しない
  if (S.lifeEvent) return false;   // 同じ週に進行中なら何もしない

  // 恋人成立イベント（複数可・条件達成で即発生）。
  //   条件: 恋愛力 >= 150 かつ 好感度 >= LOVER_REL_THRESHOLD の相手がいる。
  //   ランダムゲートは無く、達成した週にすぐ発生する。複数人と順次成立できる。
  if (S.week >= 3 && S.stats.renai >= 150) {
    const cand = pickNewLoverCandidate();
    if (cand) {
      showRomanceStart(cand, next);
      return true;
    }
  }

  // 交際中（主相手） → 将来を考える大きな出来事
  if (shouldTriggerLifeEvent()) {
    startLifeEvent(next);
    return true;
  }
  return false;
}

/* =========================================================
 * 恋愛成立イベント
 * ========================================================= */
function showRomanceStart(cand, next) {
  const nm = cand.name;
  const already = (S.partners || []).length; // すでにいる恋人の人数
  const intro = already === 0
    ? `放課後の教室。${nm}と二人きりになった。\n窓の外はオレンジ色で、なんだか落ち着かない空気が流れている。\n\n` +
      `ここ最近、自然と一緒にいる時間が増えていた。これは——たぶん、そういうことなんだと思う。`
    : `放課後、${nm}に呼び止められた。まっすぐな目で、こちらを見ている。\n\n` +
      `気づけば、${nm}とも特別な時間を重ねていた。心は、もう答えを出している気がする。`;
  const ev = {
    id: "romance_start", place: "放課後の教室", bgm: "moving",
    title: already === 0 ? "放課後、二人きり" : "もうひとつの放課後",
    text: intro,
    choices: [
      {
        label: `${nm}に気持ちを伝える`, nextLabel: "これからの日々へ",
        text: `勇気を出して気持ちを伝えた。${nm}は驚いた顔をして、それから小さく笑って「……うん。こちらこそ」と言った。\n` +
          `世界が少しだけ違って見える。放課後の教室が、特別な場所になった。`,
        fx: { renai: 5, omoide: 6, mental: 3 }, rel: { [cand.id]: 8 },
        fn: (S) => {
          if (!S.partners) S.partners = [];
          if (!S.partners.includes(cand.id)) S.partners.push(cand.id);
          if (!S.partner) { S.partner = cand.id; S.romanceStart = S.week; } // 主相手は初回のみ
        },
      },
      {
        label: "今はまだ友達のままでいる", nextLabel: "教室を出る",
        text: `言いかけて、やめた。「……なんでもない。また明日」。今の心地よい関係を、まだ壊したくなかった。\n` +
          `これはこれで、悪くない距離感だ。たぶん。`,
        fx: { omoide: 3, mental: 1 }, rel: { [cand.id]: 2 },
        fn: (S) => { if (!S.romanceDeclined) S.romanceDeclined = []; if (!S.romanceDeclined.includes(cand.id)) S.romanceDeclined.push(cand.id); },
      },
    ],
  };
  showEvent(ev, next, true);
}

/* =========================================================
 * 将来を考える大きな出来事（重大イベント本体）
 *   A 責任を持って向き合う / B 現実から逃げる / C 周囲へ相談する
 *   各選択は即時効果を適用し、対応を記録 → 翌週に総合判定。
 * ========================================================= */
function startLifeEvent(next) {
  const pid = S.partner;
  const nm = npcName(pid);
  S.lifeEvent = { stage: "choosing", choice: null, week: S.week, theme: "relocation" };

  const ev = {
    id: "life_crossroads", place: "放課後の校舎裏", bgm: "sad",
    title: "将来を考える大きな出来事",
    text: `${nm}に呼び出された。いつになく真剣な顔だ。\n\n` +
      `「実は……親の仕事で、再来月、遠くに引っ越すことになるかもしれない」\n\n` +
      `突然の話に、頭がついていかない。転校。離れ離れ。これからのこと。\n` +
      `楽しいだけだった毎日に、初めて「将来をどうするか」という重たい問いが突きつけられた。\n` +
      `どう向き合う——？`,
    choices: [
      {
        label: "A：責任を持って真剣に向き合う", nextLabel: "その後の日々へ",
        text: `「ちゃんと考えよう。二人のことも、自分の進路も」。逃げずに、現実的な話をした。\n` +
          `簡単な答えは出ない。それでも目をそらさなかったことだけは確かだ。担任にも進路相談を申し込んだ。`,
        fx: { mental: -1, shinrai: 3, omoide: 3 }, rel: { [pid]: 4 },
        fn: (S) => { S.schoolEval += 4; S.lifeEvent.choice = "A"; S.lifeEvent.stage = "await_judgment"; },
      },
      {
        label: "B：現実から逃げる", nextLabel: "その後の日々へ",
        text: `考えるのが怖くて、向き合うのをやめた。学校もなんとなく休みがちになり、気持ちは沈んでいく。\n` +
          `${nm}との関係もぎくしゃくし始めた。問題は、逃げても消えてはくれない。`,
        fx: { mental: -6, ninki: -2, omoide: 1 }, stress: 20, rel: { [pid]: -4 },
        fn: (S) => { S.schoolEval -= 12; S.trouble += 16; S.attendance -= 18; S.lifeEvent.choice = "B"; S.lifeEvent.stage = "await_judgment"; },
      },
      {
        label: "C：先生や友達に相談する", nextLabel: "その後の日々へ",
        text: `一人で抱えきれず、担任と親友に打ち明けた。「よく話してくれたな」。\n` +
          `大人と仲間が、現実的な選択肢を一緒に考えてくれた。心が、少しだけ軽くなる。`,
        fx: { mental: 3, shinrai: 3, omoide: 3 }, rel: { [pid]: 2 },
        fn: (S) => { S.schoolEval += 8; S.lifeEvent.choice = "C"; S.lifeEvent.stage = "await_judgment"; },
      },
    ],
    after: `——数日後、家族と学校を交えて、これからのことを話し合う場が設けられることになった。`,
  };
  showEvent(ev, next, true);
}

/* =========================================================
 * 総合判定（仕様書「退学判定への影響」）
 *   学校評価・問題行動値・メンタル・出席・対応を総合。
 *   即退学ではなく、スコアでルートを決める。
 * ========================================================= */
function lifeJudgeScore(choice) {
  let score = S.schoolEval
    - S.trouble
    + (S.stats.mental / 10) * 0.4   // 能力は0〜1000なので0〜100換算
    + (S.attendance - 50) * 0.3
    + (S.stats.shinrai / 10) * 0.2;
  if (choice === "C")      score += 30; // 相談＝最も安定
  else if (choice === "A") score += 18; // 向き合う＝前向き
  else if (choice === "B") score -= 25; // 逃げる＝悪化
  return score;
}

function lifeRouteFor(choice) {
  const s = lifeJudgeScore(choice);
  if (s >= 66) return "continue";      // 継続ルート
  if (s >= 40) return "path_change";   // 進路変更ルート（転校・休学・別の道）
  return "leave";                      // 離脱ルート（学校生活から離れる）
}

function runLifeJudgment(next) {
  normalizeLife();
  const choice = S.lifeEvent ? S.lifeEvent.choice : "A";
  const route = lifeRouteFor(choice);
  S.route = route;
  if (S.lifeEvent) S.lifeEvent.stage = "done";
  save();

  if (route === "continue") {
    const fx = { mental: 3, shinrai: 2, omoide: 3 };
    applyFx(fx);
    S.log.push(`${WEEK_LABELS[S.week]}: 将来の岐路を乗り越え、学校生活を続けた`);
    save();
    bgmPlay("moving");
    window.__lifeNext = next;
    showAdv({
      bg: BGS.front,
      badge: "🌅 その後 — 学校との話し合い",
      title: "乗り越えて、続く日常",
      lines: parseLines(continueRouteText(choice)),
      onDone: () => showResultOverlay(fx, null, 0, "日常へ戻る", "lifeJudgeProceed"),
    });
  } else {
    showLifeRouteEnding(route);
  }
}

function lifeJudgeProceed() {
  const fn = window.__lifeNext;
  window.__lifeNext = null;
  if (fn) fn();
}

function continueRouteText(choice) {
  const nm = S.partner ? npcName(S.partner) : "あの人";
  if (choice === "C") {
    return `相談を重ねた結果、家族も学校も「ここで頑張りたい」という気持ちを後押ししてくれた。\n` +
      `${nm}とは、距離が離れても連絡を取り合うと約束した。\n` +
      `見送りの日はまだ少し先。それまで自分は、この学校で、自分の毎日を続けていく。`;
  }
  return `逃げずに向き合った時間が、ちゃんと意味を持った。家族や先生との話し合いの末、\n` +
    `自分は今の学校生活を続けられることになった。${nm}との関係も、形を変えながら大切に続いていく。\n` +
    `大きな出来事を一つ越えて、少しだけ大人になった気がする。`;
}

/* =========================================================
 * ルート別エンディング（進路変更 / 離脱）
 *   退学＝罰ではなく「人生が形を変えた結果」として描く。
 * ========================================================= */
function showLifeRouteEnding(route) {
  ADV = null;
  S.route = route;
  bgmPlay(route === "leave" ? "sad" : "moving");
  const nm = S.partner ? npcName(S.partner) : "あの人";

  let label, head, body, note;
  if (route === "path_change") {
    label = "進路変更ルート";
    head = "新しい道を選ぶ";
    body = `話し合いの末、自分は「今のまま学校に留まり続ける」以外の道を選んだ。\n` +
      `${nm}の事情に寄り添って一緒に転校することを決めた——あるいは、一度立ち止まるために休学を選んだ。\n\n` +
      `クラスのみんなは驚き、そして最後には「お前らしいよ」と背中を押してくれた。\n` +
      `常総学院での日々は、ここで一区切り。でもこれは終わりじゃない。新しい道の、始まりだ。`;
    note = "進路変更 — 別の場所で、物語は続いていく。";
  } else {
    label = "離脱ルート";
    head = "学校生活から、離れる";
    body = `いろいろなことが重なって、今のかたちで学校生活を続けるのは難しくなった。\n` +
      `先生も家族も、何度も何度も話し合ってくれた。誰かが悪い、という話ではない。\n\n` +
      `これは罰ではなく、自分の人生が一つ、大きく形を変えたということ。\n` +
      `教室の窓から見た景色も、${nm}と過ごした放課後も、確かに本物だった。それは消えない。\n` +
      `——いつか、別のどこかで。きっとまた、歩き出せる。`;
    note = "学校生活から離れる — それでも、人生は続いていく。";
  }

  S.log.push(`${WEEK_LABELS[S.week]}: ${head}`);
  save();

  render(`
    <div class="screen ending-screen">
      <div class="panel">
        <div class="ending-head">
          <div class="ending-label">${label}</div>
          <h2>${esc(head)}</h2>
        </div>
        <p class="life-route-body">${esc(body)}</p>
        <div class="life-route-note">${esc(note)}</div>
        <h3>ここまでの記録</h3>
        <div class="ending-log">${S.log.map(l => `<div>・${esc(l)}</div>`).join("")}</div>
        <div class="ending-next">これも、ひとつの未来のかたち——</div>
        <button class="btn primary" onclick="clearSave(); showTitle()">タイトルへ戻る</button>
      </div>
    </div>
  `);
}

/* 通常エンディングに差し込む恋愛・進路サマリー（game.js から呼ばれる） */
function lifeEndingSection() {
  if (typeof S === "undefined" || !S) return "";
  let html = "";
  const lovers = (S.partners && S.partners.length) ? S.partners : (S.partner ? [S.partner] : []);
  if (lovers.length) {
    const names = lovers.map(id => npcName(id)).join("・");
    const surv = S.route === "continue";
    const multi = lovers.length >= 2;
    html += `<h3>恋愛</h3>` +
      `<div class="ending-title"><b>${esc(names)}と交際中${multi ? `（恋人${lovers.length}人）` : ""}</b>` +
      `<span>${multi ? "誰にも真似できない、にぎやかでまばゆい放課後だった。" : (surv ? "将来を考える大きな出来事を、二人で乗り越えた。" : "放課後が、少し特別になった1年。")}</span></div>`;
  }
  if (S.route === "continue") {
    html += `<div class="ending-title"><b>困難を越えて</b>` +
      `<span>進路と恋愛の岐路に、逃げずに向き合った。学校生活は続いていく。</span></div>`;
  }
  return html;
}
