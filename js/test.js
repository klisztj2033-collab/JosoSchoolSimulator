/* =========================================================
 * 常総学院シミュレーター - 定期テストシステム
 *   中間／期末テスト。5教科・各100点・合計500点満点。
 *   学年119人（プレイヤー + ネームド生徒 + 一般生徒）でランキング。
 *
 *   設計方針（仕様書 15）:
 *     「才能が高い人が必ず勝つ」のではなく
 *     「努力・生活・精神状態によって結果が変わる」リアルなテストを再現する。
 *     学力が同じでも、勉強量・メンタル・体調・教科相性・ランダムで毎回ブレる。
 *
 *   依存: data.js（SUBJECTS / NPC_TEST_STATS / TEST_PREP_OPTIONS など）
 *         game.js（S / applyFx / save / showEvent / showAdv / pick / esc など）
 * ========================================================= */

const TEST_WEEK = 6;          // 中間テスト本番（5月3週）
const TEST_RESULT_WEEK = 7;   // 結果発表（5月4週）

function tClamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function tRand(range) { return (Math.random() * 2 - 1) * range; } // ±range

/* =========================================================
 * 1教科ぶんの点数（0〜100）を計算する
 *   p: {
 *     gaku       学力（理解力・勉強能力）
 *     mental     メンタル（実力発揮率に影響）
 *     prepBonus  勉強量補正（テスト前行動・勉強習慣）
 *     condMult   体調補正の倍率
 *     good/bad   得意/苦手教科
 *     randomRange 当日のブレ幅
 *   }
 * ========================================================= */
function calcSubjectScore(p, subject) {
  // ① 基礎能力（学力ベース）: 学力100→96, 80→80, 50→56, 0→16
  let s = p.gaku * 0.8 + 16;

  // ② 勉強量補正（テスト前の取り組み）
  s += p.prepBonus;

  // ⑤ 教科相性
  if (p.good && subject === p.good) s += 7;
  if (p.bad && subject === p.bad)  s -= 11;

  // ③ メンタル補正（実力発揮率）: mental100→×1.06, 50→×0.97, 0→×0.88
  const mentalRate = 0.88 + (tClamp(p.mental, 0, 100) / 100) * 0.18;
  s *= mentalRate;

  // ④ 体調補正
  s *= p.condMult;

  // ⑥ ランダム補正（現実のブレ）
  s += tRand(p.randomRange);

  return Math.round(tClamp(s, 0, 100));
}

/* =========================================================
 * NPCの「今回のテストのコンディション」
 *   毎回ロールし、一時的にメンタル・体調を上下させる。
 *   → 学力100の小沼あいでも、不調イベントが出れば300点台に落ちうる。
 *   （仕様書 6・7: 固定順位の禁止 / メンタルによる成績変動）
 * ========================================================= */
function npcTestCondition(npc) {
  let mental = npc.mental;
  let condMult = 1.0;
  let note = null;
  const r = Math.random();
  // 元のメンタルが低いほど不調になりやすい（6%〜16%）
  const slumpChance = 0.06 + (100 - npc.mental) / 100 * 0.10;
  // 伝説の男（伊藤）は不調も好調も極端
  const isChaotic = npc.special === "chaotic";

  if (r < (isChaotic ? slumpChance + 0.10 : slumpChance)) {
    // 不調: 人間関係・プレッシャー・寝不足など（メンタル低下→集中力低下）
    mental -= 28 + Math.random() * 24;
    condMult = 0.70;
    note = "slump";
  } else if (r > (isChaotic ? 0.86 : 0.94)) {
    // 好調: 成功体験・励まし・絶好調
    mental += 10;
    condMult = 1.06;
    note = "good";
  }
  return { mental: tClamp(mental, 0, 100), condMult, note };
}

/* NPCの勉強量補正（勉強習慣ベース + その回の取り組みのブレ） */
function npcPrepBonus(npc) {
  const base = (npc.habit - 50) * 0.16;        // 習慣95→+7.2, 20→-4.8
  return base + tRand(npc.special === "chaotic" ? 7 : 4);
}

/* 1人ぶんのテスト結果エントリを作る（NPC共通） */
function buildNpcEntry(npc) {
  const cond = npcTestCondition(npc);
  const p = {
    gaku: npc.gaku,
    mental: cond.mental,
    prepBonus: npcPrepBonus(npc),
    condMult: cond.condMult,
    good: npc.good,
    bad: npc.bad,
    randomRange: npc.special === "chaotic" ? 14 : 6,
  };
  const subs = SUBJECTS.map(s => calcSubjectScore(p, s));
  return {
    key: npc.key, name: npc.name, named: npc.named,
    total: subs.reduce((a, b) => a + b, 0), subs, note: cond.note,
  };
}

/* =========================================================
 * プレイヤーのテスト用パラメータ
 * ========================================================= */
function playerTestCondMult() {
  // 体調（ストレス）→ 倍率。テスト用にやや穏やかな設定。
  if (S.stress < 35)  return 1.06; // 絶好調
  if (S.stress < 70)  return 1.0;  // ふつう
  if (S.stress < 100) return 0.82; // 不調（夜更かし・疲労でミス増）
  return 0.70;                     // 限界
}

function buildPlayerEntry() {
  const prep = TEST_PREP_OPTIONS.find(o => o.id === S.testPrep);
  const p = {
    gaku: S.stats.gaku,
    mental: S.stats.mental,
    prepBonus: prep ? prep.studyMod : 0,
    condMult: playerTestCondMult(),
    good: null, bad: null, // プレイヤーは固定の得意/苦手なし
    randomRange: 6,
  };
  const subs = SUBJECTS.map(s => calcSubjectScore(p, s));
  return {
    key: "__player", name: S.name, named: true, isPlayer: true,
    total: subs.reduce((a, b) => a + b, 0), subs,
  };
}

/* =========================================================
 * 学年名簿の生成（一般生徒94人 + ネームド生徒）
 *   一度だけ生成して S.gradeRoster に保存（順位の前回比較のため永続化）。
 *   能力分布（仕様書 9）:
 *     上位層 少数 / 中間層 多数 / 下位層 一部
 * ========================================================= */
function makeGenericStudent(key, name) {
  const r = Math.random();
  let gaku;
  if (r < 0.12)      gaku = 80 + Math.floor(Math.random() * 21); // 上位 80-100（少数）
  else if (r < 0.75) gaku = 40 + Math.floor(Math.random() * 31); // 中間 40-70（多数）
  else               gaku = 10 + Math.floor(Math.random() * 31); // 下位 10-40（一部）

  const habit  = Math.round(tClamp(gaku + (Math.random() * 40 - 20), 5, 100));
  const mental = 35 + Math.floor(Math.random() * 51); // 35-85
  const undo   = 20 + Math.floor(Math.random() * 71); // 20-90
  const good   = Math.random() < 0.5 ? pick(SUBJECTS) : null;
  let bad      = Math.random() < 0.45 ? pick(SUBJECTS) : null;
  if (bad === good) bad = null;
  return { key, name, named: false, gaku: Math.round(gaku), undo, mental, habit, good, bad };
}

function generateGradeRoster() {
  const roster = [];
  // ネームド生徒（1年生のみ）
  for (const id in NPC_TEST_STATS) {
    const st = NPC_TEST_STATS[id];
    roster.push({
      key: id, name: npcName(id), named: true,
      gaku: st.gaku, undo: st.undo, mental: st.mental,
      habit: st.habit, good: st.good, bad: st.bad, special: st.special || null,
    });
  }
  // 一般生徒で 119 人（プレイヤー1 + 名簿）に満たす
  const need = GRADE_SIZE - 1 - roster.length;
  for (let i = 0; i < need; i++) {
    roster.push(makeGenericStudent("g" + i, genericLabel(i)));
  }
  return roster;
}

/* =========================================================
 * 採点とランキング
 * ========================================================= */
function computeTestResults() {
  if (!S.gradeRoster) S.gradeRoster = generateGradeRoster();

  const entries = S.gradeRoster.map(buildNpcEntry);
  entries.push(buildPlayerEntry());

  // 合計点の降順。同点は名前で安定ソート。
  entries.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "ja"));

  const prev = S.lastTestRanks || {};
  entries.forEach((e, i) => {
    e.rank = i + 1;
    e.prevRank = prev[e.key] || null;
  });

  // 次回テスト用に今回の順位を記録
  const nextPrev = {};
  entries.forEach(e => { nextPrev[e.key] = e.rank; });
  S.lastTestRanks = nextPrev;

  const me = entries.find(e => e.isPlayer);
  S.testResult = {
    entries,
    count: entries.length,
    playerRank: me.rank,
    playerTotal: me.total,
    playerSubs: me.subs,
    prevPlayerRank: me.prevRank,
    shown: false,
    effectApplied: false,
  };
  save();
}

/* =========================================================
 * 順位によるプレイヤーへの効果（仕様書 12）
 *   上位: 人気・尊敬・自信アップ／大幅下降: 落ち込み・努力決意
 * ========================================================= */
function applyRankEffect() {
  const tr = S.testResult;
  if (tr.effectApplied) return null;
  tr.effectApplied = true;

  const rank = tr.playerRank;
  const n = tr.count;
  let fx, text;

  if (rank <= 3) {
    fx = { ninki: 4, mental: 3, shinrai: 2, omoide: 3 };
    text = "学年トップクラス！廊下で「すごいね」と次々声をかけられ、ちょっとした有名人になった。自信がみなぎる。";
  } else if (rank <= 15) {
    fx = { ninki: 2, mental: 2, omoide: 2 };
    text = "学年上位に食い込んだ。クラスでも一目置かれ、「勉強教えて」と頼まれるようになった。";
  } else if (rank <= Math.round(n * 0.4)) {
    fx = { mental: 2, omoide: 1 };
    text = "なかなかの順位。手応えを感じつつ、もっと上にいる連中の背中も見えた。次が楽しみだ。";
  } else if (rank <= Math.round(n * 0.75)) {
    fx = { mental: -1, gaku: 1, omoide: 1 };
    text = "平凡な結果に少し落ち込む。けれど「次こそは」と、その夜こっそり参考書を開いた。";
  } else {
    fx = { mental: -3, gaku: 2, omoide: 1 };
    text = "下位に沈んでしまい、正直ショックだった。だが悔しさをバネに、努力を誓う。ここからだ。";
  }

  // 前回より大きく上がった/下がったときの追加リアクション
  let diffText = "";
  if (tr.prevPlayerRank) {
    const up = tr.prevPlayerRank - rank; // 正で上昇
    if (up >= 20)      { fx.mental = (fx.mental || 0) + 2; diffText = `前回から${up}位ジャンプアップ！努力は裏切らなかった。`; }
    else if (up <= -20){ fx.mental = (fx.mental || 0) - 2; diffText = `前回から${-up}位ダウン……どこかで気が緩んでいたかもしれない。`; }
  }

  applyFx(fx);
  return { fx, text, diffText };
}

/* =========================================================
 * 画面: テスト前の作戦選択（中間テスト週）
 * ========================================================= */
function startTestSequence() {
  showTestPrepScreen(() => {
    // テスト本番（伊藤伝説イベント = WEEKLY_EVENTS[TEST_WEEK]）
    showEvent(WEEKLY_EVENTS[TEST_WEEK], () => {
      computeTestResults(); // 採点（順位は結果発表週まで伏せる）
      afterFixedEvent();
    });
  });
}

function showTestPrepScreen(onDone) {
  ADV = null;
  window.__testPrepDone = onDone;
  bgmPlay("heated");

  const cards = TEST_PREP_OPTIONS.map((o, i) => `
    <button class="prep-card c-${o.color}" onclick="chooseTestPrep(${i})">
      <span class="prep-icon">${o.icon}</span>
      <span class="prep-body">
        <span class="prep-label">${esc(o.label)}</span>
        <span class="prep-desc">${esc(o.desc)}</span>
        <span class="prep-fx">勉強量 ${o.studyMod > 0 ? "+" : ""}${o.studyMod}　/　ストレス ${o.stress > 0 ? "+" : ""}${o.stress}</span>
      </span>
    </button>`).join("");

  render(`
    <div class="screen prep-screen">
      <div class="panel">
        <div class="panel-title">📝 中間テスト直前 — 作戦会議</div>
        <p class="hint">いよいよ明日から中間テスト（5教科・500点満点）。テスト前の過ごし方で点数が変わる。<br>
          いまの学力 <b>${S.stats.gaku}</b> ／ メンタル <b>${S.stats.mental}</b> ／ ストレス <b>${S.stress}</b>（${condition().label}）</p>
        <div class="prep-grid">${cards}</div>
        <p class="hint" style="margin-top:14px">※ 学力が同じでも、勉強量・メンタル・体調・運で結果は毎回ブレる。本番までに体調も整えておこう。</p>
      </div>
    </div>
  `);
  save();
}

function chooseTestPrep(idx) {
  const o = TEST_PREP_OPTIONS[idx];
  S.testPrep = o.id;
  applyFx(o.fx);
  applyStress(o.stress);
  save();

  window.__pendingResult = { fx: o.fx, stress: o.stress };
  showAdv({
    bg: BGS.library,
    badge: `${o.icon} テスト前の作戦：${o.label}`,
    title: null,
    lines: parseLines(o.text),
    onDone: () => {
      const r = window.__pendingResult;
      showResultOverlay(r.fx, null, r.stress, "テスト本番へ——", "afterTestPrep");
    },
  });
}

function afterTestPrep() {
  const fn = window.__testPrepDone;
  window.__testPrepDone = null;
  if (fn) fn();
}

/* =========================================================
 * 画面: テスト順位発表（廊下の掲示板）
 * ========================================================= */
function showTestBoard() {
  ADV = null;
  bgmPlay("heated");
  if (!S.testResult) computeTestResults(); // 念のため（リロード対策）

  const tr = S.testResult;
  const effect = applyRankEffect();

  // --- プレイヤーの教科別内訳バー ---
  const subBars = SUBJECTS.map((name, i) => {
    const sc = tr.playerSubs[i];
    return `<div class="subj-row">
      <span class="subj-name">${name}</span>
      <span class="subj-bar"><span class="subj-fill" style="width:${sc}%"></span></span>
      <span class="subj-score">${sc}</span>
    </div>`;
  }).join("");

  // --- 前回比較バッジ ---
  const diffBadge = (e) => {
    if (!e.prevRank) return `<span class="diff new">NEW</span>`;
    const d = e.prevRank - e.rank; // 正で上昇
    if (d === 0) return `<span class="diff same">±0</span>`;
    if (d > 0)   return `<span class="diff up">▲${d}</span>`;
    return `<span class="diff down">▼${-d}</span>`;
  };

  // --- 119人の一覧 ---
  const rows = tr.entries.map(e => {
    const cls = e.isPlayer ? "me" : (e.named ? "named" : "");
    const medal = e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : e.rank === 3 ? "🥉" : "";
    return `<div class="board-row ${cls}" ${e.isPlayer ? 'id="boardMe"' : ""}>
      <span class="board-rank">${medal}${e.rank}</span>
      <span class="board-name">${esc(e.name)}${e.isPlayer ? "（あなた）" : ""}</span>
      <span class="board-score">${e.total}</span>
      ${diffBadge(e)}
    </div>`;
  }).join("");

  const reactionHtml = effect ? `
    <div class="board-reaction">
      <p>${esc(effect.text)}</p>
      ${effect.diffText ? `<p class="board-diff-text">${esc(effect.diffText)}</p>` : ""}
      ${deltaChips(effect.fx) || ""}
    </div>` : "";

  render(`
    <div class="screen board-screen">
      <div class="panel">
        <div class="panel-title">📋 テスト順位発表 — 廊下の掲示板</div>
        <p class="hint">中間テストの学年順位が貼り出された。掲示板の前は人だかりだ。（${tr.count}人中）</p>

        <div class="board-mecard">
          <div class="board-mecard-top">
            <div>
              <div class="mecard-label">あなたの順位</div>
              <div class="mecard-rank">${tr.playerRank}<span>位</span></div>
            </div>
            <div>
              <div class="mecard-label">合計点</div>
              <div class="mecard-total">${tr.playerTotal}<span> / ${TEST_MAX}</span></div>
            </div>
          </div>
          <div class="subj-list">${subBars}</div>
        </div>

        ${reactionHtml}

        <h3>学年順位（全${tr.count}人）</h3>
        <div class="board-list" id="boardList">${rows}</div>

        <button class="btn primary" onclick="finishTestBoard()" style="margin-top:16px">教室にもどる</button>
      </div>
    </div>
  `);

  // プレイヤーの行までスクロール
  requestAnimationFrame(() => {
    const me = document.getElementById("boardMe");
    if (me) me.scrollIntoView({ block: "center" });
  });
  save();
}

function finishTestBoard() {
  S.testResult.shown = true;
  save();
  // 続けて結果発表週の会話イベント（小沼に勉強法を聞く 等）へ
  showEvent(WEEKLY_EVENTS[TEST_RESULT_WEEK], afterFixedEvent);
}
