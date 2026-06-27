/* =========================================================
 * 常総学院シミュレーター - ゲームエンジン（ときメモ4スタイル）
 * コマンド選択画面 / ADV式イベント画面 / ストレス・体調システム
 * ========================================================= */

/* =========================================================
 * BGMシステム（クロスフェード付き）
 * ========================================================= */
const BGM_FILES = {
  opening:  "bgm/オープニング_入学時.mp3",
  everyday: "bgm/日常_のどか.mp3",
  heated:   "bgm/日常_白熱.mp3",
  comedy:   "bgm/日常_コメディ.mp3",
  sad:      "bgm/悲しみ.mp3",
  eerie:    "bgm/不気味.mp3",
  moving:   "bgm/感動.mp3",
};

/* 週ごとのBGM（固定イベント） */
const WEEKLY_BGM = [
  "opening",  // 0: 入学式・クラス発表
  "comedy",   // 1: 最初の休み時間・新入生歓迎会
  "everyday", // 2: 部活動勧誘
  "everyday", // 3: 荒川沖駅（帰りの電車）
  "everyday", // 4: GW前・グループ形成・JRC結団式
  "comedy",   // 5: GW明けの教室
  "eerie",    // 6: 1学期中間テスト
  "heated",   // 7: 中間テスト結果発表
  "everyday", // 8: 梅雨入り
  "heated",   // 9: 体育祭
  "everyday", // 10: パソコンサークル
  "moving",   // 11: 1学期中間評価
  "heated",   // 12: 野球応援
  "eerie",    // 13: 1学期期末テスト
  "moving",   // 14: 期末結果＆1学期終業式
  "everyday", // 15: 2学期スタート
  "heated",   // 16: マラソン大会（洞峰公園）＆お弁当
  "comedy",   // 17: ハロウィンパーティー
  "everyday", // 18: 常友祭（文化祭）準備
  "heated",   // 19: 常友祭 本番
  "moving",   // 20: スキースクール
  "everyday", // 21: 3学期スタート・冬の日常
  "heated",   // 22: クラスマッチ
  "moving",   // 23: 1年生 終了評価
];

/* ランダムイベントごとのBGM */
const RANDOM_BGM = {
  chinone_letter:          "moving",
  onuma_earphone:          "comedy",
  ishikawa_vs_nishiyama:   "comedy",
  kuno_voice:              "comedy",
  chinone_ghibli:          "everyday",
  kotan_gundam:            "everyday",
  sakakibara_anime:        "everyday",
  wada_intro:              "everyday",
  teacher_warning:         "sad",
  tsuchiura_detour:        "comedy",
  ito_random:              "eerie",
  toya_bigtalk:            "comedy",
  akagami_onuma:           "moving",
  yabuki_rumor:            "everyday",
  matsumura_azatoi:        "comedy",
};

/* アクションごとのBGM */
const ACTION_BGM = {
  study:   "heated",
  sport:   "heated",
  talk:    "everyday",
  club:    "everyday",
  explore: "everyday",
  station: "everyday",
  rest:    "everyday",
  chaos:   "comedy",
};

let _bgmAudio = null;
let _bgmKey   = null;
const BGM_VOL   = 0.25;
const FADE_MS   = 600; // フェード総時間(ms)
const FADE_STEP = 30;  // インターバル(ms)
const FADE_N    = Math.round(FADE_MS / FADE_STEP);

function bgmPlay(key) {
  if (!key || _bgmKey === key) return;
  const src = BGM_FILES[key];
  if (!src) return;
  _bgmKey = key;

  const startNew = () => {
    _bgmAudio = new Audio(src);
    _bgmAudio.loop = true;
    _bgmAudio.volume = 0;
    _bgmAudio.play().catch(() => {});
    let i = 0;
    const t = setInterval(() => {
      i++;
      if (_bgmAudio) _bgmAudio.volume = Math.min(BGM_VOL, BGM_VOL * i / FADE_N);
      if (i >= FADE_N) clearInterval(t);
    }, FADE_STEP);
  };

  if (_bgmAudio) {
    const old = _bgmAudio;
    _bgmAudio = null;
    let i = 0;
    const v0 = old.volume;
    const t = setInterval(() => {
      i++;
      old.volume = Math.max(0, v0 * (1 - i / FADE_N));
      if (i >= FADE_N) { clearInterval(t); old.pause(); startNew(); }
    }, FADE_STEP);
  } else {
    startNew();
  }
}

function bgmForEvent(ev, isRandom) {
  if (ev && ev.bgm) return ev.bgm;               // 動的イベントは個別指定を優先
  if (isRandom) return RANDOM_BGM[ev.id] || "everyday";
  return WEEKLY_BGM[S ? S.week : 0] || "everyday";
}

const SAVE_KEY = "joso_sim_save_v2"; // v2: 能力0〜1000・育成システム改修で旧セーブは非互換
const TOTAL_WEEKS = 24;   // 中等部1年生・1年間（4月〜翌3月）
const $app = document.getElementById("app");

let S = null; // ゲーム状態

/* ---------- 状態管理 ---------- */
function newState(name, cls, typeId) {
  // 能力は0〜1000スケール。初期値は概ねランクE〜D。
  const stats = { gaku: 250, undo: 250, mental: 320, komyu: 250, ninki: 180, renai: 90, nori: 240, shinrai: 240, omoide: 0 };
  const type = PLAYER_TYPES.find(t => t.id === typeId);
  for (const k in type.fx) stats[k] = (stats[k] || 0) + type.fx[k] * 8; // タイプ補正も1000スケールへ
  for (const k in stats) if (k !== "omoide") stats[k] = Math.max(0, Math.min(STAT_MAX, stats[k]));
  return {
    name, cls, type: typeId,
    week: 0,
    stats,
    stress: 25,               // ときメモ式ストレス（0〜120）
    rel: {},                  // npcId -> 仲良し度 0〜100
    flags: {},
    seen: [],
    lastAction: null,
    log: [],
    weekDelta: {},
    weekRel: {},
    // --- 学校生活・恋愛/進路の重大分岐（life.js）---
    schoolEval: 70,    // 学校評価 0-100
    trouble: 0,        // 問題行動値 0-100
    attendance: 100,   // 出席状況 0-100
    partner: null,     // 交際相手のNPC id（初回の相手＝進路イベント/エンディング用の主相手）
    partners: [],      // 交際相手のNPC id一覧（恋人は複数可）
    romanceDeclined: [],// 告白を見送った相手（再勧誘しない）
    romanceStart: null,// 交際開始週
    lifeEvent: null,   // 進行中の重大イベント { stage, choice, week, theme }
    route: null,       // 確定した進路: continue / path_change / leave
  };
}

function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} }
function loadSave() {
  try {
    const d = localStorage.getItem(SAVE_KEY);
    if (!d) return null;
    const s = JSON.parse(d);
    if (s.stress == null) s.stress = 30; // 旧データ互換
    return s;
  } catch (e) { return null; }
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

/* ---------- 体調（ときメモ式コンディション） ---------- */
function condition() {
  if (S.stress < 35)  return { label: "絶好調", face: "😄", mult: 1.2, cls: "good" };
  if (S.stress < 70)  return { label: "ふつう", face: "🙂", mult: 1.0, cls: "mid" };
  if (S.stress < 100) return { label: "不調",   face: "😵", mult: 0.8, cls: "bad" };
  return { label: "限界", face: "🤒", mult: 0.7, cls: "sick" };
}
function applyStress(n) {
  if (!n) return;
  S.stress = Math.max(0, Math.min(120, S.stress + n));
}

/* ---------- 効果適用 ---------- */
function applyFx(fx) {
  if (!fx) return;
  for (const k in fx) {
    S.stats[k] = (S.stats[k] || 0) + fx[k];
    // omoide以外は上限クランプ。上振れても核能力は1000には届かない（STAT_SOFT_MAXで頭打ち）。
    if (k !== "omoide") S.stats[k] = Math.max(0, Math.min(STAT_SOFT_MAX, S.stats[k]));
    S.weekDelta[k] = (S.weekDelta[k] || 0) + fx[k];
  }
}

/* イベント等の物語フローによる小さな効果は STORY_SCALE 倍して1000スケールに乗せる
 *   （例: 選択肢の renai+5 → +20）。omoide(ポイント)はそのまま。 */
const STORY_SCALE = 4;
function scaleStoryFx(fx) {
  if (!fx) return fx;
  const out = {};
  for (const k in fx) out[k] = (k === "omoide") ? fx[k] : fx[k] * STORY_SCALE;
  return out;
}

/* 練習による成長は能力が高いほど伸びにくくなる（収穫逓減）。
 *   低〜中ランクはほぼ等倍、高ランク（S付近）に近づくほど大きく鈍る。
 *   到達上限の保証は applyFx の STAT_SOFT_MAX クランプ側で行う。omoideは対象外。 */
function taperedGain(k, g) {
  if (g <= 0 || k === "omoide") return g;
  const v = S.stats[k] || 0;
  const factor = 1 - Math.pow(v / STAT_MAX, 2) * 0.78; // v=250→0.95, 600→0.72, 800→0.50, 900→0.37
  return g * Math.max(0.1, factor);
}
function applyRel(rel) {
  if (!rel) return;
  for (const id in rel) {
    S.rel[id] = Math.max(0, Math.min(100, (S.rel[id] || 0) + rel[id]));
    S.weekRel[id] = (S.weekRel[id] || 0) + rel[id];
  }
}

/* テスト順位計算（結果発表イベントの本文で使用）
 * 採点済みなら実際の順位を返す。未採点時は学力からの概算をフォールバック。 */
window.calcTestRank = function (state) {
  if (state.testResult && state.testResult.playerRank) return state.testResult.playerRank;
  const g = state.stats.gaku / 10; // 0〜1000 → 0〜100換算
  return Math.max(2, Math.min(GRADE_SIZE - 1, Math.round(GRADE_SIZE - g * 1.0)));
};

/* ---------- ユーティリティ ---------- */
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function resolveText(t) { return typeof t === "function" ? t(S) : t; }
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function deltaChips(fx, rel, stress) {
  let chips = "";
  if (fx) for (const k in fx) {
    if (!fx[k]) continue;
    const up = fx[k] > 0;
    chips += `<span class="chip ${up ? "up" : "down"}">${STAT_LABELS[k]} ${up ? "+" : ""}${fx[k]}</span>`;
  }
  if (stress) {
    chips += `<span class="chip ${stress > 0 ? "down" : "up"}">ストレス ${stress > 0 ? "+" : ""}${stress}</span>`;
  }
  if (rel) for (const id in rel) {
    if (!rel[id]) continue;
    const up = rel[id] > 0;
    chips += `<span class="chip rel ${up ? "up" : "down"}">${esc(npcName(id))} ${up ? "♥+" : "♥"}${rel[id]}</span>`;
  }
  return chips ? `<div class="chips">${chips}</div>` : "";
}

function render(html) { $app.innerHTML = html; window.scrollTo(0, 0); }

/* =========================================================
 * ADVエンジン（game02スタイル: 背景全面＋セリフウィンドウ）
 * ========================================================= */
let ADV = null;

/* テキストを「地の文」と「会話」のセリフ単位に分割する（ギャルゲー風）。
 * 会話「」を見つけたら直前テキストから話者を推定し、立ち絵付きのセリフにする。
 * 例: 「自分も…、戸谷君に「あー、俺も…」と上から被せられた。」
 *   → [地の文]自分も…、戸谷君に / [戸谷]「あー、俺も…」 / [地の文]と上から被せられた。 */
const HONORIFIC_TAIL = /^[君くんさん様ちゃん先輩先生はがもをにへとで、。・…!！?？\s]*$/;

function parseLines(text) {
  const out = [];
  const push = (name, t) => { t = (t || "").trim(); if (t) out.push({ name, text: t }); };

  resolveText(text).split("\n").map(s => s.trim()).filter(Boolean).forEach(line => {
    let i = 0;
    while (i < line.length) {
      const open = line.indexOf("「", i);
      if (open === -1) { push("", line.slice(i)); break; }      // 残りは地の文
      const close = line.indexOf("」", open + 1);
      if (close === -1) { push("", line.slice(i)); break; }      // 閉じ無し→地の文

      const pre = line.slice(i, open);          // 会話の前の文
      const quote = line.slice(open, close + 1); // 「…」
      const det = detectSpeaker(pre);
      let speaker = "";

      if (det) {
        const head = pre.slice(0, det.idx).trim();                // 名前より前の文
        const tail = pre.slice(det.idx + det.token.length);       // 名前の後（敬称・助詞）
        // 名前が文/節の主語として登場（文頭、または 、。」等の直後）
        const clauseStart = head === "" || /[、。！？!?」』]$/.test(head);
        const closeEnough = tail.length <= 8 && HONORIFIC_TAIL.test(tail);
        if (clauseStart || closeEnough) {
          speaker = det.display;
          const isPureName = head === "" && HONORIFIC_TAIL.test(tail) && tail.length <= 8;
          if (!isPureName) push("", pre);   // 説明的な地の文があれば先に表示
        } else {
          push("", pre);                    // 名前が会話から遠い→地の文・話者なし
        }
      } else {
        push("", pre);
      }
      push(speaker, quote);
      i = close + 1;
    }
  });

  return out.length ? out : [{ name: "", text: "" }];
}

/* opts: { bg, badge, title, lines, onDone } */
function showAdv(opts) {
  ADV = Object.assign({ idx: 0, timer: null, typing: false }, opts);
  render(`
    <div class="adv" style="background-image:url('${ADV.bg}')">
      <div class="adv-head">
        <span class="adv-badge">${ADV.badge || ""}</span>
        <span class="adv-week">${WEEK_LABELS[S.week] || ""}</span>
      </div>
      ${ADV.title ? `<div class="adv-title">${esc(ADV.title)}</div>` : ""}
      <img id="advPortrait" class="adv-portrait adv-portrait-hidden" src="" alt="">
      <div class="adv-box" onclick="advClick()">
        <div class="adv-name" id="advName"></div>
        <div class="adv-text" id="advText"></div>
        <div class="adv-cursor" id="advCursor">▼</div>
      </div>
      <div class="adv-overlay" id="advOverlay"></div>
    </div>
  `);
  advRenderLine();
}

function advRenderLine() {
  const line = ADV.lines[ADV.idx];
  const $name = document.getElementById("advName");
  const $text = document.getElementById("advText");
  const $cur = document.getElementById("advCursor");
  const $portrait = document.getElementById("advPortrait");
  $name.textContent = line.name;
  $name.style.display = line.name ? "inline-block" : "none";
  // 話者のいる行だけ立ち絵を更新。地の文（name無し）は直前の立ち絵を維持する
  if ($portrait && line.name) {
    const src = portraitFor(line.name);
    if (src) {
      const changed = $portrait.dataset.src !== src;
      $portrait.dataset.src = src;
      $portrait.src = src;
      $portrait.classList.remove("adv-portrait-hidden");
      if (changed) { // 話者が変わったら登場アニメを再生
        $portrait.style.animation = "none";
        void $portrait.offsetWidth;
        $portrait.style.animation = "";
      }
    } else { // 立ち絵のない話者が喋ったら立ち絵を隠す
      $portrait.dataset.src = "";
      $portrait.classList.add("adv-portrait-hidden");
    }
  }
  $text.textContent = "";
  $cur.style.visibility = "hidden";
  ADV.typing = true;
  let i = 0;
  clearInterval(ADV.timer);
  ADV.timer = setInterval(() => {
    i += 2;
    $text.textContent = line.text.slice(0, i);
    if (i >= line.text.length) {
      clearInterval(ADV.timer);
      ADV.typing = false;
      $cur.style.visibility = "visible";
    }
  }, 18);
}

function advClick() {
  if (!ADV) return;
  if (ADV.typing) { // 表示中クリック→全文表示
    clearInterval(ADV.timer);
    const line = ADV.lines[ADV.idx];
    document.getElementById("advText").textContent = line.text;
    document.getElementById("advCursor").style.visibility = "visible";
    ADV.typing = false;
    return;
  }
  if (ADV.idx < ADV.lines.length - 1) {
    ADV.idx++;
    advRenderLine();
  } else if (ADV.onDone) {
    const fn = ADV.onDone;
    ADV.onDone = null; // 二重発火防止
    fn();
  }
}

/* 選択肢オーバーレイ（ときメモ風・中央表示） */
function advShowOverlay(html) {
  document.getElementById("advOverlay").innerHTML = html;
}

/* 結果チップ＋ボタンのオーバーレイ */
function showResultOverlay(fx, rel, stress, btnLabel, nextFnName) {
  advShowOverlay(`
    <div class="adv-result">
      ${deltaChips(fx, rel, stress) || `<p class="adv-result-none">大きな変化はなかった。</p>`}
      <button class="btn primary" onclick="${nextFnName}()">${btnLabel}</button>
    </div>
  `);
}

/* =========================================================
 * 画面: タイトル
 * ========================================================= */
function showTitle() {
  ADV = null;
  bgmPlay("opening");
  const hasSave = !!loadSave();
  render(`
    <div class="screen title-screen">
      <div class="title-logo">
        <div class="title-sub">週単位進行・学園生活シミュレーション</div>
        <h1>常総学院<br>シミュレーター</h1>
        <div class="title-sub2">〜 4月、荒川沖から物語は始まる 〜</div>
      </div>
      <div class="title-menu">
        <button class="btn primary" onclick="startNew()">はじめから</button>
        ${hasSave ? `<button class="btn" onclick="continueGame()">つづきから</button>` : ""}
        <button class="btn ghost" onclick="showNpcList(showTitle)">登場人物名鑑</button>
      </div>
      <div class="title-note">第1部「中等部1年生」（4月〜翌3月・1年間）収録</div>
    </div>
  `);
}

function startNew() {
  if (loadSave() && !confirm("セーブデータがあります。最初からはじめると消えますが、いいですか？")) return;
  clearSave();
  showCreate();
}
function continueGame() {
  S = loadSave();
  if (!S) return showTitle();
  if (S.week >= TOTAL_WEEKS) return showEnding();
  showMain();
}

/* =========================================================
 * 画面: キャラクター作成
 * ========================================================= */
function showCreate() {
  bgmPlay("opening");
  const typeCards = PLAYER_TYPES.map((t, i) => `
    <label class="type-card">
      <input type="radio" name="ptype" value="${t.id}" ${i === 0 ? "checked" : ""}>
      <div class="type-body">
        <div class="type-name">${t.label}</div>
        <div class="type-desc">${t.desc}</div>
        <div class="type-fx">${Object.keys(t.fx).map(k => `${STAT_LABELS[k]}+${t.fx[k]}`).join(" / ")}</div>
      </div>
    </label>`).join("");

  const classOpts = [1, 2, 3, 4].map(c =>
    `<option value="${c}">${c}組（担任: ${CLASS_TEACHERS[c].name}・${CLASS_TEACHERS[c].subject}）</option>`).join("");

  render(`
    <div class="screen create-screen">
      <h2>新入生 登録</h2>
      <div class="form-row">
        <label>名前</label>
        <input id="pname" type="text" maxlength="12" placeholder="例: 田中たろう" value="">
      </div>
      <div class="form-row">
        <label>クラス</label>
        <select id="pclass">${classOpts}</select>
      </div>
      <div class="form-row">
        <label>タイプ</label>
        <div class="type-grid">${typeCards}</div>
      </div>
      <button class="btn primary" onclick="createDone()">入学する</button>
      <button class="btn ghost" onclick="showTitle()">もどる</button>
    </div>
  `);
}

function createDone() {
  const name = document.getElementById("pname").value.trim() || "名無しの常総生";
  const cls = parseInt(document.getElementById("pclass").value, 10);
  const type = document.querySelector('input[name="ptype"]:checked').value;
  S = newState(name, cls, type);
  save();
  startOpening();
}

/* 新規開始時の導入: 入学式・クラス発表を先に再生してから最初の週のコマンドへ */
function startOpening() {
  ADV = null;
  if (typeof ensureLifeState === "function") ensureLifeState(S);
  showEvent(WEEKLY_EVENTS[0], () => {
    S.flags.openingDone = true;
    save();
    showMain();
  });
}

/* =========================================================
 * 画面: コマンド選択（game01スタイル）
 * ========================================================= */
function cmdInfo(text) {
  const el = document.getElementById("cmdInfo");
  if (el) el.textContent = text;
}

function showMain() {
  ADV = null;
  bgmPlay("everyday");
  if (typeof ensureLifeState === "function") ensureLifeState(S);
  // 終端ルート（離脱・進路変更）に入っている途中で再開した場合はその結末へ
  if ((S.route === "leave" || S.route === "path_change") && typeof showLifeRouteEnding === "function") {
    return showLifeRouteEnding(S.route);
  }
  // 持ち物検査（持ち検）の朝イベント（前週予告・当日）
  if (typeof mochikenMorning === "function" && mochikenMorning()) return;
  S.weekDelta = {};
  S.weekRel = {};

  // ストレス限界 → 風邪イベント
  if (S.stress >= 100) return showSickWeek();

  const ev = WEEKLY_EVENTS[S.week];
  const cond = condition();
  const [month, weekNo] = WEEK_LABELS[S.week].split(" ");
  // 週0は入学式を導入で再生済みなので「予定」表示を入学後の日常に差し替える
  const planLabel = (S.week === 0 && S.flags.openingDone) ? "入学後、最初の一週間" : ev.title;

  const cmdBtn = (a) => `
    <button class="cmd-btn c-${a.color}" onclick="doAction('${a.id}')"
      onmouseover="cmdInfo('${esc(a.desc)}')" onmouseout="cmdInfo('コマンドを選ぼう')">
      <span class="cmd-icon">${a.icon}</span><span>${a.label}</span>
    </button>`;
  const A = Object.fromEntries(ACTIONS.map(a => [a.id, a]));

  const statRows = Object.keys(STAT_LABELS).map(k => {
    if (k === "omoide")
      return `<div class="stat"><span class="stat-name">${STAT_LABELS[k]}</span><span class="stat-val">${S.stats[k]}</span></div>`;
    const r = statRank(S.stats[k]);
    return `<div class="stat"><span class="stat-name">${STAT_LABELS[k]}</span>` +
      `<span class="stat-val"><span class="rank-badge rank-${r}">${r}</span>${S.stats[k]}</span></div>`;
  }).join("");

  render(`
    <div class="screen cmd-screen">
      <div class="cmd-top">
        <div class="cmd-date"><span class="cmd-month">${month}</span><span class="cmd-week">${weekNo}</span></div>
        <div class="cmd-plan">今週の予定：${esc(planLabel)}</div>
      </div>
      <div class="cmd-body">
        <div class="cmd-grid">
          ${cmdBtn(A.study)}${cmdBtn(A.sport)}${cmdBtn(A.talk)}
          ${cmdBtn(A.club)}
          <div class="cmd-center"><img class="cmd-chibi-img" src="picture/character/ちびキャラ02.png" alt="キャラ"><span class="cmd-chibi-name">${esc(S.name)}</span></div>
          ${cmdBtn(A.explore)}
          ${cmdBtn(A.station)}${cmdBtn(A.rest)}${cmdBtn(A.chaos)}
          <button class="cmd-btn c-gray" onclick="showSystem()"
            onmouseover="cmdInfo('セーブ確認・名鑑・記録・タイトルへ')" onmouseout="cmdInfo('コマンドを選ぼう')">
            <span class="cmd-icon">⚙️</span><span>システム</span>
          </button>
        </div>
        <div class="cmd-side">
          <div class="cond-box cond-${cond.cls}">
            <span class="cond-face">${cond.face}</span>
            <div><div class="cond-label">体調：${cond.label}</div>
            <div class="stress-bar"><div class="stress-fill" style="width:${Math.min(100, S.stress / 1.2)}%"></div></div>
            <div class="stress-num">ストレス ${S.stress}</div></div>
          </div>
          <div class="stats">${statRows}</div>
          <div class="cmd-class">${S.cls}組 ／ 担任: ${CLASS_TEACHERS[S.cls].name}</div>
        </div>
      </div>
      <div class="cmd-info" id="cmdInfo">コマンドを選ぼう</div>
    </div>
  `);
  save();
}

function showSystem() {
  cmdInfo("セーブ確認・名鑑・記録・タイトルへ");
  const grid = document.querySelector(".cmd-body");
  if (!grid) return;
  const old = document.getElementById("sysMenu");
  if (old) { old.remove(); return; }
  const div = document.createElement("div");
  div.id = "sysMenu";
  div.className = "sys-menu";
  div.innerHTML = `
    <div class="sys-panel">
      <div class="sys-title">システム</div>
      <button class="btn" onclick="showNpcList(showMain)">登場人物名鑑</button>
      <button class="btn" onclick="showLog()">これまでの記録</button>
      <button class="btn" onclick="save(); cmdInfo('セーブしました'); document.getElementById('sysMenu').remove()">セーブする</button>
      <button class="btn ghost" onclick="if(confirm('タイトルに戻る？（進行は自動保存済み）')) showTitle()">タイトルへ</button>
      <button class="btn ghost" onclick="document.getElementById('sysMenu').remove()">もどる</button>
    </div>`;
  grid.appendChild(div);
}

/* ---------- 風邪（ストレス限界）イベント ---------- */
function showSickWeek() {
  bgmPlay("sad");
  S.lastAction = "rest";
  applyStress(-55);
  applyFx({ mental: -2 });
  S.log.push(`${WEEK_LABELS[S.week]}: 風邪で寝込んだ`);
  showAdv({
    bg: BGS.home,
    badge: "🤒 体調不良",
    title: "無理がたたった……",
    lines: parseLines(
      "月曜の朝、体が重い。熱を測ると38.2度。ここ最近、明らかに無理をしすぎた。\n" +
      "今週は大人しく寝て過ごすことになった。布団の中で天井を見つめる。\n" +
      "……たっぷり寝たおかげで、週末にはすっかり回復した。ストレスも抜けた気がする。"
    ),
    onDone: () => showResultOverlay({ mental: -2 }, null, -55, "そして週末——", "startFixedEvent"),
  });
}

/* =========================================================
 * 週の流れ: 行動 → 固定イベント → ランダムイベント → 週末まとめ
 * ========================================================= */
function doAction(actionId) {
  const act = ACTIONS.find(a => a.id === actionId);
  bgmPlay(ACTION_BGM[actionId] || "everyday");
  S.lastAction = actionId;

  // 体調補正（プラス効果のみ倍率がかかる）＋ 高ランクほど伸びにくい収穫逓減
  // ※上限付近では床(+1)を設けない＝1000直前は伸びが0になり、上振れても届かない
  const cond = condition();
  const fx = {};
  for (const k in act.fx) {
    fx[k] = act.fx[k] > 0 ? Math.round(taperedGain(k, act.fx[k] * cond.mult)) : act.fx[k];
  }

  // --- 友情コンボ: ステータスを伸ばすコマンドで、得意な友達がランダム出現（複数同時もあり） ---
  const combo = act.trainStats ? rollFriendshipCombo(act.trainStats, cond) : null;
  let comboText = "";
  const relGain = {};
  if (combo) {
    for (const k in combo.fx) fx[k] = (fx[k] || 0) + combo.fx[k];
    combo.ids.forEach(id => relGain[id] = (relGain[id] || 0) + 3); // 一緒に頑張ると少し仲良くなる
    comboText = "\n" + combo.text;
  }

  applyFx(fx);
  applyStress(act.stress);

  let text;
  if (actionId === "talk") {
    const target = pick(NPCS.filter(n => n.group !== "先生"));
    relGain[target.id] = (relGain[target.id] || 0) + 3;
    text = `休み時間や放課後、${target.name}とよく話した。\n${target.name}${target.quote}\n——今週もこの調子だった。少し仲良くなった気がする。`;
  } else if (actionId === "club") {
    if (S.flags.pcclub) {
      ["damaki", "kotan", "sakakibara"].forEach(id => relGain[id] = (relGain[id] || 0) + 2);
      text = "パソコンサークルの部室で過ごした。\nだまき部長の謎プログラム、小丹君のガンダム話、榊原君のアニメ分析。今日も平常運転だ。";
    } else {
      text = "いろんな部活を見て回った。\nグラウンドの熱気、体育館の掛け声、そしてパソコンサークル部室の静かなキーボード音。\nそろそろどこかに腰を据えたい。";
    }
  } else {
    text = pick(act.texts);
  }
  text += comboText;

  const hasRel = Object.keys(relGain).length ? relGain : null;
  if (hasRel) applyRel(relGain);

  window.__pendingResult = { fx, rel: hasRel, stress: act.stress };
  showAdv({
    bg: BGS[act.bg],
    badge: `${act.icon} 今週の行動：${act.label}`,
    title: null,
    lines: parseLines(text),
    onDone: () => {
      const r = window.__pendingResult;
      showResultOverlay(r.fx, r.rel, r.stress, "そして週末——", "startFixedEvent");
    },
  });
}

/* =========================================================
 * 友情コンボ（得意な友達がランダム出現して成長を後押し）
 *   1) そのコマンドが鍛える能力(stats: 配列)のいずれかが得意な友達それぞれについて、
 *      現れるかどうかを個別に抽選する
 *   2) 知り合い未満(<31)は対象外。発生確率は好感度で友達ごとに変動
 *   3) 条件を満たす友達が複数いれば、友情コンボは同時に複数発生することがあり、
 *      その場合はそれぞれの成長ボーナスがすべて上乗せされる（スタックする）
 *   4) 発生した友達ごとに、好感度ランク倍率×コンボ×体調ぶんの成長を上乗せ
 *   返り値: { ids:[...], fx:{合計追加成長}, text } または null
 * ========================================================= */
const MAX_COMBO_FRIENDS = 5; // 同時に現れる友達の上限（演出・バランス用）

function rollFriendshipCombo(stats, cond) {
  const wanted = Array.isArray(stats) ? stats : [stats];
  const cands = Object.keys(NPC_SPECIALTY).filter(id =>
    wanted.some(st => (NPC_SPECIALTY[id].stats[st] || 0) > 0));

  // 候補それぞれについて「現れるか」を個別抽選 → 複数人同時に現れることもある。
  // 好感度0でも低確率で発動（誰かしら≒5回に1回）。恋人は対象コマンドで約2回に1回。
  const lovers = S.partners || (S.partner ? [S.partner] : []);
  let joined = cands.filter(id => {
    const rel = S.rel[id] || 0;
    let chance = friendshipComboChance(rel);                     // 発生確率は好感度依存（友達ごとに独立）
    if (lovers.includes(id)) chance = Math.max(chance, 0.5);     // 恋人は対象コマンドで最低50%に底上げ
    return Math.random() < chance;
  });
  if (!joined.length) return null;

  // 多すぎると演出も成長も過剰になるので、好感度の高い順に上限まで絞る
  if (joined.length > MAX_COMBO_FRIENDS) {
    joined.sort((a, b) => (S.rel[b] || 0) - (S.rel[a] || 0));
    joined = joined.slice(0, MAX_COMBO_FRIENDS);
  }

  const fx = {};
  const lines = [];
  for (const id of joined) {
    const sp = NPC_SPECIALTY[id];
    const rel = S.rel[id] || 0;
    const tier = affinityTier(rel);
    const combo = activeComboFor(id, S.rel);
    const comboMult = 1 + (combo ? combo.bonus : 0);

    // 上乗せ成長 = 基礎 ×(好感度倍率-1)× コンボ × 体調（各能力の重みぶん）× 収穫逓減
    for (const k in sp.stats) {
      const g = SPECIALTY_BASE * sp.stats[k] * (tier.mult - 1) * comboMult * (cond ? cond.mult : 1);
      const add = Math.round(taperedGain(k, g));
      if (add > 0) fx[k] = (fx[k] || 0) + add;
    }

    // 特殊効果（学力ボーナスも収穫逓減を通す＝上限付近では伸びない）
    let special = "";
    if (sp.special === "efficient" && Math.random() < 0.5) {
      const add = Math.round(taperedGain("gaku", 18));
      if (add > 0) fx.gaku = (fx.gaku || 0) + add;
      special = "得意の効率的な勉強法で、理解がぐっと深まった！";
    } else if (sp.special === "testboost" && isTestSoon()) {
      const add = Math.round(taperedGain("gaku", 16));
      if (add > 0) fx.gaku = (fx.gaku || 0) + add;
      special = "テスト直前、要点まとめが冴えわたる！";
    } else if (sp.special === "lucky") {
      applyStress(-8); special = "話していると心が軽くなり、ストレスも少し抜けた。";
    }

    let line = `${npcName(id)}（${sp.label}が得意・${tier.label}）が加わった！`;
    if (combo) line += `さらに${combo.label}発動！${npcName(combo.other)}も合流して効率が跳ね上がる。`;
    if (special) line += special;
    lines.push(line);
  }

  let text = joined.length > 1
    ? "——そこへ、友達が次々と加わった！友情コンボ発生！\n" + lines.map(l => "・" + l).join("\n")
    : "——そこへ、" + lines[0];
  const summary = Object.keys(fx).map(k => `${STAT_LABELS[k]}+${fx[k]}`).join("・");
  if (summary) text += `\n友情コンボで、いつもより大きく伸びた（${summary}）。`;

  return { ids: joined, fx, text };
}

/* テストが近い週か（飯泉の特殊効果用）: 今週か来週がテスト週 */
function isTestSoon() {
  return (typeof isTestWeek === "function") && (isTestWeek(S.week) || isTestWeek(S.week + 1));
}

/* 固定イベント後の共通処理: 人生分岐イベント → ランダムイベント → 週末まとめ */
function afterFixedEvent() {
  // 恋愛・進路の重大イベント／総合判定を優先チェック（成立すれば内部で続きを呼ぶ）
  if (typeof maybeLifeEvents === "function" && maybeLifeEvents(continueToRandom)) return;
  continueToRandom();
}

function continueToRandom() {
  const rnd = pickRandomEvent();
  if (rnd) {
    S.seen.push(rnd.id);
    showEvent(rnd, showWeekend, true);
  } else {
    showWeekend();
  }
}

function startFixedEvent() {
  // 入学式は開始時に導入として再生済みなので、週0ではアクション後の再生をスキップ
  if (S.week === 0 && S.flags.openingDone) return afterFixedEvent();
  // テスト週（中間・期末）: 作戦選択 → テスト本番 → 採点（順位は結果発表週まで伏せる）
  if (isTestWeek(S.week) && S.testPrepWeek !== S.week) return startTestSequence();
  // 結果発表週: 廊下の掲示板で学年順位を発表
  if (isTestResultWeek(S.week) && !(S.testResult && S.testResult.shown && S.testResult.week === S.week)) return showTestBoard();
  showEvent(WEEKLY_EVENTS[S.week], afterFixedEvent);
}

function pickRandomEvent() {
  const pool = RANDOM_EVENTS.filter(e =>
    !(e.once && S.seen.includes(e.id)) && (!e.cond || e.cond(S))
  );
  if (!pool.length) return null;
  const priority = pool.filter(e => e.priority);
  if (priority.length && Math.random() < 0.85) return pick(priority);
  if (Math.random() < 0.6) {
    const normal = pool.filter(e => !e.priority);
    return pick(normal.length ? normal : pool);
  }
  return null;
}

/* イベント表示（固定・ランダム共通／ADV形式） */
function showEvent(ev, onDone, isRandom) {
  bgmPlay(bgmForEvent(ev, isRandom));
  window.__currentEvent = ev;
  window.__onEventDone = onDone;
  showAdv({
    bg: bgForPlace(ev.place),
    badge: `${isRandom ? "❗ 突発イベント" : "📌 今週のイベント"}　${esc(ev.place || "")}`,
    title: ev.title,
    lines: parseLines(ev.text),
    onDone: showEventChoices,
  });
}

function showEventChoices() {
  const ev = window.__currentEvent;
  const html = ev.choices.map((c, i) =>
    `<button class="choice-btn" onclick="chooseEvent(${i})">${esc(c.label)}</button>`).join("");
  advShowOverlay(`<div class="adv-choices">${html}</div>`);
}

function chooseEvent(idx) {
  const ev = window.__currentEvent;
  const c = ev.choices[idx];
  const sfx = scaleStoryFx(c.fx);             // 物語効果は1000スケールへ
  applyFx(sfx);
  applyRel(c.rel);
  if (c.flag) S.flags[c.flag] = true;
  if (c.stress) applyStress(c.stress);
  if (typeof c.fn === "function") c.fn(S);     // 任意の追加処理（人生分岐などで使用）
  window.__pendingResult = { fx: sfx, rel: c.rel, stress: c.stress || 0 };

  let lines = parseLines(resolveText(c.text));
  if (ev.after) lines = lines.concat(parseLines(ev.after));

  showAdv({
    bg: bgForPlace(ev.place),
    badge: `📖 ${esc(ev.title)}`,
    title: null,
    lines,
    onDone: () => {
      const r = window.__pendingResult;
      showResultOverlay(r.fx, r.rel, r.stress, c.nextLabel || "つづく", "finishEvent");
    },
  });
}

function finishEvent() {
  window.__onEventDone();
}

/* =========================================================
 * 画面: 週末まとめ
 * ========================================================= */
function showWeekend() {
  ADV = null;
  bgmPlay("everyday");
  const ev = WEEKLY_EVENTS[S.week];
  if (!S.log.some(l => l.startsWith(WEEK_LABELS[S.week]))) {
    S.log.push(`${WEEK_LABELS[S.week]}: ${ev.title}`);
  }
  const cond = condition();
  const deltas = deltaChips(S.weekDelta, S.weekRel) || `<p class="hint">今週は大きな変化はなかった。</p>`;
  const isLast = S.week >= TOTAL_WEEKS - 1;

  render(`
    <div class="screen weekend-screen">
      <div class="panel">
        <div class="panel-title">📒 ${WEEK_LABELS[S.week]} のまとめ</div>
        <p>今週のできごと: <b>${esc(ev.title)}</b></p>
        <div class="weekend-deltas">${deltas}</div>
        <p class="weekend-cond">体調: ${cond.face} ${cond.label}（ストレス ${S.stress}）</p>
        <button class="btn primary" onclick="nextWeek()">${isLast ? "1年間の結果を見る" : "次の週へ"}</button>
      </div>
    </div>
  `);
  save();
}

function nextWeek() {
  S.week++;
  save();
  if (S.week >= TOTAL_WEEKS) showEnding();
  else showMain();
}

/* =========================================================
 * 画面: エンディング（1年間の総合評価）
 * ========================================================= */
function showEnding() {
  ADV = null;
  bgmPlay("moving");
  const titles = ENDING_TITLES.filter(t => t.cond(S)).slice(0, 4);
  const titleHtml = titles.length
    ? titles.map(t => `<div class="ending-title"><b>${t.label}</b><span>${t.desc}</span></div>`).join("")
    : `<div class="ending-title"><b>静かなる観測者</b><span>目立ちはしなかったが、この学年の全てを見ていた。それも才能だ。</span></div>`;

  const sorted = Object.entries(S.rel).sort((a, b) => b[1] - a[1]).slice(0, 3).filter(([, v]) => v > 0);
  const friends = sorted.length
    ? sorted.map(([id, v]) => {
        const comment = ENDING_FRIEND_COMMENTS[id] || `${npcName(id)}「2年生になっても、よろしくな」`;
        return `<div class="friend-row"><span class="friend-name">${esc(npcName(id))}</span><span class="friend-hearts">${"♥".repeat(Math.max(1, Math.min(5, Math.round(v / 20))))}</span><div class="friend-comment">${esc(comment)}</div></div>`;
      }).join("")
    : `<p class="hint">特別仲の良い友達はまだいない。2年生では、もっと踏み込んでみよう。</p>`;

  // 1年生の総合評価タイプ（友情型／学力型／運動型／孤高型）
  const yearType = endingYearType();

  // 総合ランクは基本6能力の平均で判定（0〜1000）
  const avg = CORE_STATS.reduce((a, k) => a + S.stats[k], 0) / CORE_STATS.length;
  let rank, rankMsg;
  if (avg >= 700)      { rank = "S"; rankMsg = "伝説の1年。全能力が高水準。卒業アルバムの主役級だ。"; }
  else if (avg >= 560) { rank = "A"; rankMsg = "充実の1年。常総での土台は完璧に固まった。2年生が楽しみだ。"; }
  else if (avg >= 450) { rank = "B"; rankMsg = "なかなかの1年。良い出会いと経験を重ねた。ここから伸びる。"; }
  else if (avg >= 340) { rank = "C"; rankMsg = "平凡だが着実な1年。やりたいことの輪郭が見えてきた。"; }
  else                 { rank = "D"; rankMsg = "静かな1年。だが常総の本番はこれから。土台はできた、焦るな。"; }

  const statRows = Object.keys(STAT_LABELS).map(k => {
    if (k === "omoide")
      return `<div class="stat"><span class="stat-name">${STAT_LABELS[k]}</span><span class="stat-val">${S.stats[k]}</span></div>`;
    const r = statRank(S.stats[k]);
    return `<div class="stat"><span class="stat-name">${STAT_LABELS[k]}</span>` +
      `<span class="stat-val"><span class="rank-badge rank-${r}">${r}</span>${S.stats[k]}</span></div>`;
  }).join("");

  render(`
    <div class="screen ending-screen">
      <div class="panel">
        <div class="ending-head">
          <div class="ending-label">中等部1年生 修了</div>
          <h2>${esc(S.name)} の1年間</h2>
          <div class="ending-rank rank-${rank}">${rank}</div>
          <p class="ending-rankmsg">${rankMsg}</p>
        </div>
        <h3>1年生の歩み</h3>
        <div class="ending-title"><b>${yearType.label}</b><span>${yearType.desc}</span></div>
        <h3>獲得した称号</h3>
        ${titleHtml}
        <h3>仲良くなった人たち</h3>
        ${friends}
        ${typeof lifeEndingSection === "function" ? lifeEndingSection() : ""}
        <h3>最終ステータス</h3>
        <div class="stats">${statRows}</div>
        <h3>1年間の記録</h3>
        <div class="ending-log">${S.log.map(l => `<div>・${esc(l)}</div>`).join("")}</div>
        <div class="ending-next">つづき（中等部2年生〜）は次回アップデートで実装予定——</div>
        <button class="btn primary" onclick="clearSave(); showTitle()">タイトルへ戻る</button>
      </div>
    </div>
  `);
}

/* 1年生の総合判定タイプ（仕様書「1年生終了評価」: 友情型／学力型／運動型／孤高型） */
function endingYearType() {
  const s = S.stats;
  const friendScore = s.komyu + s.ninki + Object.values(S.rel || {}).filter(v => v > 0).length * 8;
  const studyScore  = s.gaku * 1.6;
  const sportScore  = s.undo * 1.6;
  const soloScore   = (s.gaku + s.undo + s.mental) - (s.komyu + s.ninki);
  const scores = [
    { key: "friend", v: friendScore, label: "クラスの中心人物", desc: "友情型。気づけば、いつも周りに人がいた。このクラスに欠かせない存在だった。" },
    { key: "study",  v: studyScore,  label: "期待の新入生",     desc: "学力型。勉強で頭角を現した1年。先生たちの期待を一身に背負っている。" },
    { key: "sport",  v: sportScore,  label: "運動スター候補",   desc: "運動型。体育祭やマラソンでの活躍は学年中の語り草。次の主役は君だ。" },
    { key: "solo",   v: soloScore,   label: "謎の実力者",       desc: "孤高型。群れず、しかし着実に力をつけた。その背中を、皆が密かに追っている。" },
  ];
  scores.sort((a, b) => b.v - a.v);
  return scores[0];
}

/* =========================================================
 * 画面: NPC名鑑 / 記録
 * ========================================================= */
function showNpcList(backFn) {
  ADV = null;
  window.__npcBack = backFn;
  const groups = ["先生", "男子", "女子"];
  const sections = groups.map(g => {
    const rows = NPCS.filter(n => n.group === g).map(n => {
      const rel = S ? (S.rel[n.id] || 0) : 0;
      const hearts = S ? `<span class="npc-hearts">${rel > 0 ? "♥".repeat(Math.max(1, Math.min(5, Math.round(rel / 20)))) : "—"}</span>` : "";
      return `<div class="npc-card">
        <div class="npc-top"><span class="npc-name">${esc(n.name)}</span>${hearts}</div>
        <div class="npc-tags">${esc(n.tags)}</div>
        <div class="npc-quote">${esc(n.quote)}</div>
      </div>`;
    }).join("");
    return `<h3>${g}</h3><div class="npc-grid">${rows}</div>`;
  }).join("");

  render(`
    <div class="screen npc-screen">
      <div class="panel">
        <div class="panel-title">登場人物名鑑</div>
        ${sections}
        <button class="btn primary" onclick="window.__npcBack()">もどる</button>
      </div>
    </div>
  `);
}

function showLog() {
  ADV = null;
  const logs = S.log.length ? S.log.map(l => `<div>・${esc(l)}</div>`).join("") : `<p class="hint">まだ記録はない。</p>`;
  render(`
    <div class="screen log-screen">
      <div class="panel">
        <div class="panel-title">これまでの記録</div>
        <div class="ending-log">${logs}</div>
        <button class="btn primary" onclick="showMain()">もどる</button>
      </div>
    </div>
  `);
}

/* ---------- 起動 ---------- */
showTitle();
