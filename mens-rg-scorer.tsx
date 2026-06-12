import { useState, useMemo, useRef } from "react";
import { Plus, Trash2, X, Download, Upload } from "lucide-react";

// =====================================================================
// 定義テーブル
// =====================================================================

const CATEGORY = {
  FORWARD: "前方系",
  SIDE: "側方系",
  BACKWARD: "後方系",
  OTHER: "その他",
};

const APPARATUS = {
  stick: { name: "スティック", throws: ["左手投げ"] },
  clubs: { name: "クラブ", throws: ["二つ投げ"] },
  ring: { name: "リング", throws: ["二つ投げ"] },
  rope: { name: "ロープ", throws: [] },
};

const THROW_OPTIONS_COMMON = [
  { id: "noview", name: "視野外の投げ" },
  { id: "nonhand", name: "手以外の投げ" },
  { id: "other", name: "その他の投げ" },
];
const THROW_OPTIONS_APPARATUS = [{ id: "useapp", name: "手具を使った投げ" }];
const CATCH_OPTIONS_COMMON = [
  { id: "noview", name: "視野外のキャッチ" },
  { id: "nonhand", name: "手以外のキャッチ" },
  { id: "other", name: "その他のキャッチ" },
];
const CATCH_OPTIONS_APPARATUS = [{ id: "useapp", name: "手具を使ったキャッチ" }];
const APPARATUS_USE = { stick: false, clubs: true, ring: true, rope: false };
const APPARATUS_COUNT = { stick: 1, clubs: 2, ring: 2, rope: 1 };

const REQUIRED_THROW_OPTIONS = {
  stick: [{ id: "lefthand", name: "左手投げ" }],
  clubs: [{ id: "twothrow", name: "二つ投げ" }],
  ring: [{ id: "twothrow", name: "二つ投げ" }],
  rope: [],
};

const DIFF_VALUE = { A: 1, B: 2, C: 3, D: 4, E: 5 };
const VALUE_DIFF = { 1: "A", 2: "B", 3: "C", 4: "D", 5: "E" };
const MAX_DIFF = 5;
const DIFF_SCORE = { A: 0.1, B: 0.2, C: 0.3, D: 0.5, E: 0.7 };
const E_BONUS = 0.1;
const SERIES_BONUS = 0.1;
const TECHNIQUE_BONUS = 0.1;
const APPARATUS_OP_BONUS = 0.1;
const TWOTHROW_MOTION_BONUS = 0.1;
const NO_APPARATUS_DEDUCTION = 0.1; // 旧定数（互換維持）。実際は下記2つを使用
const NO_APP_SALTO_DEDUCTION = 0.1; // 宙返り系すべてに手具操作なし
const NO_APP_ALL_DEDUCTION = 0.2; // シリーズ全体に手具操作なし
const NO_APP_CAP = 0.4; // 演技全体での上限
const DIRECTION_DEDUCTION = 0.3;
const THROW_COUNT_DEDUCTION = 0.3;
const CONNECT_NO_APP_DEDUCTION = 0.1;
const SALTO_CHAIN_2_DEDUCTION = 0.1;
const SALTO_CHAIN_LOW_DEDUCTION = 0.2;
const VARIETY_REQUIRED = 3; // 投げ方・受け方それぞれ必要種類数
const VARIETY_DEDUCTION_PER = 0.1; // 不足1種類につき
const VARIETY_CAP = 0.5; // 投げ方+受け方の合算上限
const ADOPT_COUNT = 3;
const AE_FULL = 10;

const HAND_MOTIONS = [
  { id: "m1", name: "1動作", motions: 1 },
  { id: "m2", name: "2動作", motions: 2 },
  { id: "m3", name: "3動作", motions: 3 },
  { id: "m4", name: "4動作", motions: 4 },
  { id: "mv3", name: "縦3動作", motions: 3, verticalThree: true },
];

const SKILL_LIST = [
  { id: "a_cartwheel", name: "側転", category: CATEGORY.SIDE, difficulty: "A", isSalto: false, isConnectA: true },
  { id: "a_roundoff", name: "ロンダート", category: CATEGORY.SIDE, difficulty: "A", isSalto: false, isConnectA: true },
  { id: "a_flicflac", name: "バク転", category: CATEGORY.BACKWARD, difficulty: "A", isSalto: false, isConnectA: true },
  { id: "a_handspring", name: "ハンドスプリング", category: CATEGORY.FORWARD, difficulty: "A", isSalto: false, isConnectA: true },
  { id: "a_frontroll", name: "とび前転", category: CATEGORY.FORWARD, difficulty: "A", isSalto: false, isConnectA: true },
  { id: "b_sidesalto", name: "側宙", category: CATEGORY.SIDE, difficulty: "B", isSalto: true },
  { id: "b_backsalto", name: "後方宙返り", category: CATEGORY.BACKWARD, difficulty: "B", isSalto: true },
  { id: "b_backtuck", name: "後方屈伸宙返り", category: CATEGORY.BACKWARD, difficulty: "B", isSalto: true },
  { id: "b_backlayout", name: "後方伸身宙返り", category: CATEGORY.BACKWARD, difficulty: "B", isSalto: true },
  { id: "b_backhalf", name: "後方宙返り半ひねり", category: CATEGORY.BACKWARD, difficulty: "B", isSalto: true },
  { id: "b_backlayhalf", name: "後方伸身宙返り半ひねり", category: CATEGORY.BACKWARD, difficulty: "B", isSalto: true },
  { id: "b_tempo", name: "テンポ宙返り", category: CATEGORY.BACKWARD, difficulty: "B", isSalto: true },
  { id: "b_divefront", name: "ダイビング前宙", category: CATEGORY.BACKWARD, difficulty: "B", isSalto: true },
  { id: "b_front", name: "前宙", category: CATEGORY.FORWARD, difficulty: "B", isSalto: true },
  { id: "b_fronthalf", name: "前宙半ひねり", category: CATEGORY.FORWARD, difficulty: "B", isSalto: true },
  { id: "b_kirimomi", name: "きりもみ", category: CATEGORY.FORWARD, difficulty: "B", isSalto: true },
  { id: "c_front1full", name: "前方宙返り一回ひねり", category: CATEGORY.FORWARD, difficulty: "C", isSalto: true },
  { id: "c_kirimomiten", name: "きりもみ転回", category: CATEGORY.FORWARD, difficulty: "C", isSalto: true },
  { id: "c_back15", name: "後方1回半ひねり", category: CATEGORY.BACKWARD, difficulty: "C", isSalto: true },
  { id: "c_back1full", name: "後方宙返り一回ひねり", category: CATEGORY.BACKWARD, difficulty: "C", isSalto: true },
  { id: "c_backtuck1full", name: "後方屈伸宙返り一回ひねり", category: CATEGORY.BACKWARD, difficulty: "C", isSalto: true },
  { id: "c_backlay1full", name: "後方伸身宙返り一回ひねり", category: CATEGORY.BACKWARD, difficulty: "C", isSalto: true },
  { id: "c_tempotwist", name: "テンポひねり", category: CATEGORY.BACKWARD, difficulty: "C", isSalto: true },
  { id: "d_frontlay1", name: "伸身前宙一回ひねり", category: CATEGORY.FORWARD, difficulty: "D", isSalto: true },
  { id: "d_back2twist", name: "後方宙返り二回ひねり", category: CATEGORY.BACKWARD, difficulty: "D", isSalto: true },
  { id: "d_backlay25", name: "後方伸身宙返り二回半ひねり", category: CATEGORY.BACKWARD, difficulty: "D", isSalto: true },
  { id: "d_doubleback", name: "後方二回宙返り", category: CATEGORY.BACKWARD, difficulty: "D", isSalto: true },
  { id: "e_back3twist", name: "後方宙返り三回ひねり", category: CATEGORY.BACKWARD, difficulty: "E", isSalto: true },
  { id: "e_backlay3twist", name: "後方伸身宙返り3回ひねり", category: CATEGORY.BACKWARD, difficulty: "E", isSalto: true },
  { id: "e_backlay35twist", name: "後方伸身宙返り3回半ひねり", category: CATEGORY.BACKWARD, difficulty: "E", isSalto: true },
  { id: "e_doublelay", name: "後方伸身二回宙返り", category: CATEGORY.BACKWARD, difficulty: "E", isSalto: true },
  { id: "e_moonsault", name: "後方2回宙返り1回ひねり（ムーンサルト）", category: CATEGORY.BACKWARD, difficulty: "E", isSalto: true },
  { id: "e_frontlay2", name: "伸身前宙二回ひねり", category: CATEGORY.FORWARD, difficulty: "E", isSalto: true },
  { id: "e_divedouble", name: "ダイビングダブル", category: CATEGORY.BACKWARD, difficulty: "E", isSalto: true },
  { id: "e_rudolph", name: "ルドルフ", category: CATEGORY.BACKWARD, difficulty: "E", isSalto: true },
  { id: "e_swandouble", name: "スワンダブル", category: CATEGORY.BACKWARD, difficulty: "E", isSalto: true },
];

function skillDef(id) { return SKILL_LIST.find((x) => x.id === id); }

// =====================================================================
// 計算ロジック
// =====================================================================

function calcTumblingDifficulty(skillIds, hasThrow) {
  const diffs = skillIds.map((id) => skillDef(id)?.difficulty).filter((d) => d && d !== "A");
  if (diffs.length === 0) return null;
  let v = DIFF_VALUE[diffs[0]];
  for (let i = 1; i < diffs.length; i++) v += DIFF_VALUE[diffs[i]] - 1;
  if (hasThrow) v += 1;
  return VALUE_DIFF[Math.min(v, MAX_DIFF)];
}

function calcHandDifficulty(motionCount, verticalThree) {
  if (verticalThree) return "E";
  return VALUE_DIFF[Math.min(DIFF_VALUE.A + motionCount, MAX_DIFF)];
}

function maxSaltoChain(skillIds) {
  let max = 0, run = 0;
  skillIds.forEach((id) => {
    if (skillDef(id)?.isSalto) { run += 1; max = Math.max(max, run); }
    else run = 0;
  });
  return max;
}

function hasConnect(skills) {
  for (let i = 1; i < skills.length - 1; i++) {
    const prev = skillDef(skills[i - 1].skillId);
    const cur = skillDef(skills[i].skillId);
    const next = skillDef(skills[i + 1].skillId);
    if (prev?.isSalto && cur?.isConnectA && next?.isSalto) return true;
  }
  return false;
}

function hasConnectWithoutApparatus(skills) {
  for (let i = 1; i < skills.length - 1; i++) {
    const prev = skillDef(skills[i - 1].skillId);
    const cur = skillDef(skills[i].skillId);
    const next = skillDef(skills[i + 1].skillId);
    if (prev?.isSalto && cur?.isConnectA && next?.isSalto && !skills[i].hasApparatus) return true;
  }
  return false;
}

function finalizeUnit(buf) {
  const hasSkill = buf.skills.length > 0;
  const skillThrow = buf.skills.some((s) => s.isThrow);
  const isThrow = buf.throwItems > 0 || skillThrow;
  const hasApparatus = buf.skills.some((s) => s.hasApparatus);

  const tumblingDiff = hasSkill ? calcTumblingDifficulty(buf.skills.map((s) => s.skillId), isThrow) : null;
  const handDiff = isThrow ? calcHandDifficulty(buf.motionCount, buf.verticalThree) : null;

  if (!isThrow) {
    return { type: "tumbling", isThrow: false, skillThrow: false, skills: buf.skills, finalDiff: tumblingDiff, hasApparatus, hasDPlus: false };
  }
  const handV = handDiff ? DIFF_VALUE[handDiff] : 0;
  const tumbV = tumblingDiff ? DIFF_VALUE[tumblingDiff] : 0;
  const finalDiff = handV >= tumbV ? handDiff : tumblingDiff;
  const diffFromHand = handV >= tumbV;
  const hasDPlus = DIFF_VALUE[finalDiff] >= DIFF_VALUE.D && (buf.motionCount >= 3 || buf.verticalThree || hasSkill);
  return {
    type: "throw", isThrow: true, skillThrow, isThrowTumbling: hasSkill, skills: buf.skills,
    handDiff, tumblingDiff, finalDiff, diffFromHand, hasApparatus, hasDPlus,
  };
}

function analyzeSeries(series) {
  const units = [];
  let throwCount = 0;
  let buf = null;
  const newBuf = () => ({ skills: [], motionCount: 0, verticalThree: false, throwItems: 0 });
  const flush = () => {
    if (buf && (buf.skills.length || buf.motionCount > 0 || buf.throwItems > 0)) {
      const u = finalizeUnit(buf);
      if (u.finalDiff) units.push(u);
      const skillThrows = buf.skills.filter((s) => s.isThrow).length;
      throwCount += buf.throwItems + skillThrows;
    }
    buf = null;
  };
  series.items.forEach((item) => {
    if (item.kind === "catch") flush();
    else if (item.kind === "throw") { if (!buf) buf = newBuf(); buf.throwItems += 1; }
    else if (item.kind === "skill") {
      if (!item.skillId) return;
      if (!buf) buf = newBuf();
      buf.skills.push({ skillId: item.skillId, hasApparatus: !!item.hasApparatus, isThrow: !!item.isThrow });
    } else if (item.kind === "motion") {
      if (!buf) buf = newBuf();
      const m = HAND_MOTIONS.find((x) => x.id === item.motionId);
      if (m) { buf.motionCount += m.motions; if (m.verticalThree) buf.verticalThree = true; }
    }
  });
  flush();
  return { units, throwCount };
}

function checkApparatusFlow(series, apparatusKey) {
  const total = APPARATUS_COUNT[apparatusKey];
  let inHand = total, inAir = 0;
  const errors = [];
  series.items.forEach((item, idx) => {
    if (item.kind === "throw") {
      const num = (item.reqTypes || []).includes("twothrow") ? 2 : 1;
      if (inHand < num) errors.push(`${idx + 1}番目の投げ：手元の手具が足りません`);
      const t = Math.min(num, inHand);
      inHand -= t; inAir += t;
    } else if (item.kind === "skill" && item.isThrow) {
      if (inHand < 1) errors.push(`${idx + 1}番目の技の最中の投げ：手元の手具が足りません`);
      else { inHand -= 1; inAir += 1; }
    } else if (item.kind === "catch") {
      const num = item.catchTwo ? 2 : 1;
      if (inAir < num) errors.push(`${idx + 1}番目のキャッチ：空中に手具がありません`);
      const c = Math.min(num, inAir);
      inAir -= c; inHand += c;
    }
  });
  if (inAir > 0) errors.push("シリーズ終了時に空中の手具が残っています（キャッチ不足）");
  return errors;
}

function seriesSignature(series) {
  return JSON.stringify(series.items.map((item) => {
    if (item.kind === "throw") return { k: "throw", req: [...(item.reqTypes || [])].sort(), types: [...(item.throwTypes || [])].sort() };
    if (item.kind === "catch") return { k: "catch", types: [...(item.catchTypes || [])].sort(), two: !!item.catchTwo };
    if (item.kind === "skill") return { k: "skill", id: item.skillId, thr: !!item.isThrow };
    if (item.kind === "motion") return { k: "motion", id: item.motionId };
    return { k: "?" };
  }));
}

// =====================================================================

const emptySeries = () => ({ executionDeduction: 0, items: [{ kind: "skill", skillId: "", hasApparatus: false, isThrow: false }] });

export default function App() {
  const [apparatus, setApparatus] = useState("stick");
  const [series, setSeries] = useState([emptySeries()]);
  const fileInputRef = useRef(null);
  const [jsonModalMode, setJsonModalMode] = useState(null); // "export" | "import" | null
  const [jsonText, setJsonText] = useState("");

  const handleExport = () => {
    const data = { version: 1, apparatus, series };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.download = `routine-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.apparatus && APPARATUS[data.apparatus]) setApparatus(data.apparatus);
        if (Array.isArray(data.series) && data.series.length > 0) setSeries(data.series);
        else alert("シリーズ構成が見つかりませんでした");
      } catch {
        alert("ファイルの読み込みに失敗しました");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // テキスト方式：JSONをモーダルで表示・貼り付け
  const openExportText = () => {
    const data = { version: 1, apparatus, series };
    setJsonText(JSON.stringify(data, null, 2));
    setJsonModalMode("export");
  };
  const openImportText = () => {
    setJsonText("");
    setJsonModalMode("import");
  };
  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      alert("コピーしました");
    } catch {
      alert("コピーに失敗しました。手動で選択してコピーしてください");
    }
  };
  const handleImportText = () => {
    try {
      const data = JSON.parse(jsonText);
      if (data.apparatus && APPARATUS[data.apparatus]) setApparatus(data.apparatus);
      if (Array.isArray(data.series) && data.series.length > 0) {
        setSeries(data.series);
        setJsonModalMode(null);
      } else {
        alert("シリーズ構成が見つかりませんでした");
      }
    } catch {
      alert("JSONの読み込みに失敗しました（形式を確認してください）");
    }
  };

  const addItem = (sIdx, kind) =>
    setSeries((p) => {
      const n = structuredClone(p);
      let item;
      if (kind === "throw") item = { kind: "throw", throwTypes: [], reqTypes: [] };
      else if (kind === "catch") item = { kind: "catch", catchTypes: [], catchTwo: false };
      else if (kind === "skill") item = { kind: "skill", skillId: "", hasApparatus: false, isThrow: false };
      else item = { kind: "motion", motionId: "" };

      // 初期状態（空のskill1つだけ）の場合は置き換える
      const items = n[sIdx].items;
      if (
        items.length === 1 &&
        items[0].kind === "skill" &&
        !items[0].skillId &&
        !items[0].hasApparatus &&
        !items[0].isThrow
      ) {
        n[sIdx].items = [item];
      } else {
        n[sIdx].items.push(item);
      }
      return n;
    });
  const updateItem = (sIdx, iIdx, patch) =>
    setSeries((p) => { const n = structuredClone(p); n[sIdx].items[iIdx] = { ...n[sIdx].items[iIdx], ...patch }; return n; });
  const removeItem = (sIdx, iIdx) =>
    setSeries((p) => {
      const n = structuredClone(p);
      n[sIdx].items.splice(iIdx, 1);
      if (n[sIdx].items.length === 0) n[sIdx].items.push({ kind: "skill", skillId: "", hasApparatus: false, isThrow: false });
      return n;
    });
  const addSeries = () => setSeries((p) => [...p, emptySeries()]);
  const removeSeries = (sIdx) => setSeries((p) => (p.length > 1 ? p.filter((_, i) => i !== sIdx) : p));
  const updateSeriesField = (sIdx, patch) =>
    setSeries((p) => { const n = structuredClone(p); n[sIdx] = { ...n[sIdx], ...patch }; return n; });

  const analysis = useMemo(() => series.map(analyzeSeries), [series]);
  const allUnits = analysis.flatMap((a) => a.units);

  const dupFlags = useMemo(() => {
    const seen = new Set();
    return series.map((ser) => {
      const sig = seriesSignature(ser);
      if (seen.has(sig)) return true;
      seen.add(sig);
      return false;
    });
  }, [series]);

  const totalThrowCount = analysis.reduce((s, a, i) => s + (dupFlags[i] ? 0 : a.throwCount), 0);

  const tumblingUnits = allUnits.filter((u) => u.type === "tumbling" || (u.type === "throw" && u.isThrowTumbling));
  const handUnits = allUnits.filter((u) => u.type === "throw" && !u.isThrowTumbling);

  const nonDupTumblingCount = analysis.reduce((s, a, i) => {
    if (dupFlags[i]) return s;
    return s + a.units.filter((u) => u.type === "tumbling" || (u.type === "throw" && u.isThrowTumbling)).length;
  }, 0);

  const sortByDiff = (arr) => [...arr].sort((a, b) => DIFF_VALUE[b.finalDiff] - DIFF_VALUE[a.finalDiff]);
  const topTumbling = sortByDiff(tumblingUnits).slice(0, ADOPT_COUNT);
  const topHand = sortByDiff(handUnits).slice(0, ADOPT_COUNT);

  const tumblingScore = topTumbling.reduce((s, u) => {
    const base = DIFF_SCORE[u.finalDiff];
    const eB = u.finalDiff === "E" && u.skillThrow ? E_BONUS : 0;
    return s + base + eB;
  }, 0);
  const handScore = topHand.reduce((s, u) => s + DIFF_SCORE[u.finalDiff], 0);
  const seriesBonus = analysis.some((a) => a.throwCount >= 2 && a.units.some((u) => u.type === "throw" && u.hasDPlus)) ? SERIES_BONUS : 0;

  let techniqueCount = 0;
  series.forEach((ser) => ser.items.forEach((item) => {
    if (item.kind === "throw") techniqueCount += (item.throwTypes || []).length;
    else if (item.kind === "catch") techniqueCount += (item.catchTypes || []).length;
  }));
  const techniqueBonus = techniqueCount * TECHNIQUE_BONUS;

  let apparatusOpBonus = 0;
  series.forEach((ser, i) => {
    if (dupFlags[i]) return;
    const ops = ser.items.filter((item) => item.kind === "skill" && item.hasApparatus).length;
    if (ops < 2) return;
    const seriesMaxDiff = analysis[i].units.reduce((m, u) => Math.max(m, DIFF_VALUE[u.finalDiff] || 0), 0);
    if (seriesMaxDiff === DIFF_VALUE.E) apparatusOpBonus += APPARATUS_OP_BONUS;
  });

  let twoThrowMotionBonus = 0;
  series.forEach((ser, i) => {
    if (dupFlags[i]) return;
    let inTwo = false, motSum = 0, added = false;
    const fin = () => {
      if (inTwo && motSum >= 4 && !added) { twoThrowMotionBonus += TWOTHROW_MOTION_BONUS; added = true; }
      inTwo = false; motSum = 0; added = false;
    };
    ser.items.forEach((item) => {
      if (item.kind === "throw") { fin(); if ((item.reqTypes || []).includes("twothrow")) inTwo = true; }
      else if (item.kind === "catch") fin();
      else if (item.kind === "motion" && inTwo) {
        const m = HAND_MOTIONS.find((x) => x.id === item.motionId);
        if (m) motSum += m.motions;
      }
    });
    fin();
  });

  // 手具操作不足減点：投げタンを含まないタンブリングシリーズについて
  //   - シリーズ全体に手具操作が無い → -0.2
  //   - 宙返り系の技すべてに手具操作が無い（ただしシリーズ全体ではどこかに手具操作あり） → -0.1
  // つなぎ技のA難度に手具操作なしが演技内に1つでもあれば -0.1（演技全体で一律）
  // 合計は上限 0.4
  let noApparatusDeduction = 0;
  analysis.forEach((a, i) => {
    if (dupFlags[i]) return;
    if (a.throwCount > 0) return;
    const hasTumbling = a.units.some((u) => u.type === "tumbling");
    if (!hasTumbling) return;
    const skills = series[i].items.filter((item) => item.kind === "skill" && item.skillId);
    if (skills.length === 0) return;
    const anyApparatus = skills.some((s) => s.hasApparatus);
    if (!anyApparatus) {
      noApparatusDeduction += NO_APP_ALL_DEDUCTION;
    } else {
      const saltoSkills = skills.filter((s) => skillDef(s.skillId)?.isSalto);
      if (saltoSkills.length > 0 && !saltoSkills.some((s) => s.hasApparatus)) {
        noApparatusDeduction += NO_APP_SALTO_DEDUCTION;
      }
    }
  });
  // つなぎ技A難度の手具操作なしを統合
  const connectNoApparatus = allUnits.some((u) => hasConnectWithoutApparatus(u.skills || []));
  if (connectNoApparatus) noApparatusDeduction += CONNECT_NO_APP_DEDUCTION;
  noApparatusDeduction = Math.min(noApparatusDeduction, NO_APP_CAP);

  const allTumblingSkills = tumblingUnits.flatMap((u) => u.skills);
  const cats = new Set(allTumblingSkills.map((s) => skillDef(s.skillId)?.category).filter(Boolean));
  const missingDirCount =
    (cats.has(CATEGORY.FORWARD) ? 0 : 1) +
    (cats.has(CATEGORY.SIDE) ? 0 : 1) +
    (cats.has(CATEGORY.BACKWARD) ? 0 : 1);
  const directionDeduction = missingDirCount * DIRECTION_DEDUCTION;
  const throwCountDeduction = totalThrowCount < 3 ? THROW_COUNT_DEDUCTION : 0;

  // 警告表示用（実減点は手具操作不足減点に統合）
  const connectNoAppDeduction = 0;

  const maxChainAll = tumblingUnits.reduce((m, u) => Math.max(m, maxSaltoChain(u.skills.map((s) => s.skillId))), 0);
  const saltoChainDeduction = maxChainAll >= 3 ? 0 : maxChainAll === 2 ? SALTO_CHAIN_2_DEDUCTION : SALTO_CHAIN_LOW_DEDUCTION;

  // 投げ方・受け方の種類カウント
  // 重複シリーズは（その他以外を）対象から除外
  const throwKinds = new Set();
  const catchKinds = new Set();
  let throwOtherCount = 0;
  let catchOtherCount = 0;
  series.forEach((ser, i) => {
    const isDup = dupFlags[i];
    ser.items.forEach((item) => {
      if (item.kind === "throw") {
        const types = item.throwTypes || [];
        const reqs = item.reqTypes || [];
        // その他は重複も毎回カウント（dupFlagsの影響を受けない）
        if (types.includes("other")) throwOtherCount += 1;
        if (isDup) return;
        // 通常の投げ：オプション系チェックが何も付いていない
        const hasOpt = types.length > 0;
        if (!hasOpt) throwKinds.add("normal");
        if (types.includes("noview")) throwKinds.add("noview");
        if (types.includes("nonhand")) throwKinds.add("nonhand");
        if (types.includes("useapp")) throwKinds.add("useapp");
        if (reqs.includes("lefthand")) {
          throwKinds.add("lefthand");
          catchKinds.add("lefthand"); // 左手投げは左手キャッチも同時カウント
        }
      } else if (item.kind === "skill" && item.isThrow) {
        if (isDup) return;
        throwKinds.add("tumthrow");
      } else if (item.kind === "catch") {
        const types = item.catchTypes || [];
        if (types.includes("other")) catchOtherCount += 1;
        if (isDup) return;
        const hasOpt = types.length > 0;
        if (!hasOpt) catchKinds.add("normal");
        if (types.includes("noview")) catchKinds.add("noview");
        if (types.includes("nonhand")) catchKinds.add("nonhand");
        if (types.includes("useapp")) catchKinds.add("useapp");
      }
    });
  });

  const throwKindCount = throwKinds.size + throwOtherCount;
  const catchKindCount = catchKinds.size + catchOtherCount;
  const throwShortage = Math.max(0, VARIETY_REQUIRED - throwKindCount);
  const catchShortage = Math.max(0, VARIETY_REQUIRED - catchKindCount);
  const varietyDeduction = Math.min(VARIETY_CAP, (throwShortage + catchShortage) * VARIETY_DEDUCTION_PER);

  const hasTriple = tumblingUnits.some((u) => maxSaltoChain(u.skills.map((s) => s.skillId)) >= 3);
  const hasConn = allUnits.some((u) => hasConnect(u.skills || []));
  const hasThrowTumbling = allUnits.some((u) => u.type === "throw" && u.isThrowTumbling);

  const requiredThrowIds = REQUIRED_THROW_OPTIONS[apparatus].map((o) => o.id);
  const performedThrowTypes = new Set();
  series.forEach((ser) => ser.items.forEach((item) => {
    if (item.kind === "throw") (item.reqTypes || []).forEach((t) => performedThrowTypes.add(t));
  }));
  const requiredThrowPassed = requiredThrowIds.length === 0 || requiredThrowIds.every((id) => performedThrowTypes.has(id));

  const required = [
    { key: "dir", label: "前方系・側方系・後方系をすべて含む", passed: cats.has(CATEGORY.FORWARD) && cats.has(CATEGORY.SIDE) && cats.has(CATEGORY.BACKWARD) },
    { key: "throwTum", label: "1本以上が投げタン", passed: hasThrowTumbling },
    { key: "triple", label: "1本以上が宙返り3回以上連続", passed: hasTriple },
    { key: "connect", label: "1本以上がつなぎ技（宙返り間にA難度を挟む）", passed: hasConn },
    { key: "count3", label: "投げを3回以上実施", passed: totalThrowCount >= 3 },
    { key: "tumCount", label: "タンブリング3本以上", passed: nonDupTumblingCount >= 3 },
    { key: "appThrow", label: `${APPARATUS[apparatus].name}の必須投げ方${APPARATUS[apparatus].throws.length ? "：" + APPARATUS[apparatus].throws.join("・") : "（なし）"}`, passed: requiredThrowPassed },
  ];
  const missing = required.filter((r) => r.passed === false);

  const executionDeduction = series.reduce((s, ser) => s + (Number(ser.executionDeduction) || 0), 0);
  const dScore = tumblingScore + handScore + seriesBonus + techniqueBonus + apparatusOpBonus + twoThrowMotionBonus;
  const aDeduction = noApparatusDeduction + directionDeduction + throwCountDeduction + saltoChainDeduction + varietyDeduction;
  const aScore = Math.max(0, AE_FULL - aDeduction);
  const eScore = Math.max(0, AE_FULL - executionDeduction);
  const grandTotal = dScore + aScore + eScore;

  // シリーズ内訳
  const seriesBreakdowns = series.map((ser, i) => {
    const a = analysis[i];
    const isDup = dupFlags[i];
    const tumU = a.units.filter((u) => u.type === "tumbling" || (u.type === "throw" && u.isThrowTumbling));
    const tumDiff = tumU.reduce((s, u) => s + DIFF_SCORE[u.finalDiff] + (u.finalDiff === "E" && u.skillThrow ? E_BONUS : 0), 0);
    const hU = a.units.filter((u) => u.type === "throw" && !u.isThrowTumbling);
    const handDiff = hU.reduce((s, u) => s + DIFF_SCORE[u.finalDiff], 0);
    const sBonus = a.throwCount >= 2 && a.units.some((u) => u.type === "throw" && u.hasDPlus) ? SERIES_BONUS : 0;
    let techCount = 0;
    ser.items.forEach((item) => {
      if (item.kind === "throw") techCount += (item.throwTypes || []).length;
      else if (item.kind === "catch") techCount += (item.catchTypes || []).length;
    });
    const tech = techCount * TECHNIQUE_BONUS;
    let appOp = 0;
    if (!isDup) {
      const ops = ser.items.filter((item) => item.kind === "skill" && item.hasApparatus).length;
      if (ops >= 2) {
        const maxD = a.units.reduce((m, u) => Math.max(m, DIFF_VALUE[u.finalDiff] || 0), 0);
        if (maxD === DIFF_VALUE.E) appOp = APPARATUS_OP_BONUS;
      }
    }
    let twoMot = 0;
    if (!isDup) {
      let inTwo = false, motSum = 0, added = false;
      const fin = () => {
        if (inTwo && motSum >= 4 && !added) { twoMot += TWOTHROW_MOTION_BONUS; added = true; }
        inTwo = false; motSum = 0; added = false;
      };
      ser.items.forEach((item) => {
        if (item.kind === "throw") { fin(); if ((item.reqTypes || []).includes("twothrow")) inTwo = true; }
        else if (item.kind === "catch") fin();
        else if (item.kind === "motion" && inTwo) {
          const m = HAND_MOTIONS.find((x) => x.id === item.motionId);
          if (m) motSum += m.motions;
        }
      });
      fin();
    }
    let noApp = 0;
    if (!isDup && a.throwCount === 0) {
      const skills = ser.items.filter((item) => item.kind === "skill" && item.skillId);
      const hasT = a.units.some((u) => u.type === "tumbling");
      if (hasT && skills.length > 0) {
        const anyApp = skills.some((s) => s.hasApparatus);
        if (!anyApp) noApp = NO_APP_ALL_DEDUCTION;
        else {
          const saltos = skills.filter((s) => skillDef(s.skillId)?.isSalto);
          if (saltos.length > 0 && !saltos.some((s) => s.hasApparatus)) noApp = NO_APP_SALTO_DEDUCTION;
        }
      }
    }
    const exec = Number(ser.executionDeduction) || 0;
    const dPart = tumDiff + handDiff + sBonus + tech + appOp + twoMot;
    const aPart = noApp;
    return { tumDiff, handDiff, sBonus, tech, appOp, twoMot, noApp, exec, dPart, aPart };
  });

  return (
    <div style={S.page}>
      {jsonModalMode && (
        <div style={S.modalOverlay} onClick={() => setJsonModalMode(null)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span>{jsonModalMode === "export" ? "テキスト出力（JSON）" : "テキスト読込（JSON）"}</span>
              <button style={S.removeBtnXs} onClick={() => setJsonModalMode(null)}><X size={16} /></button>
            </div>
            <textarea
              style={S.modalTextarea}
              value={jsonText}
              readOnly={jsonModalMode === "export"}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder={jsonModalMode === "import" ? "JSONを貼り付けてください" : ""}
            />
            <div style={S.modalActions}>
              {jsonModalMode === "export" ? (
                <button style={S.ioBtn} onClick={handleCopyJson}>クリップボードにコピー</button>
              ) : (
                <button style={S.ioBtn} onClick={handleImportText}>読み込む</button>
              )}
              <button style={S.ioBtn} onClick={() => setJsonModalMode(null)}>閉じる</button>
            </div>
          </div>
        </div>
      )}
      <header style={S.header}>
        <h1 style={S.h1}>男子新体操 採点計算</h1>
        <div style={S.modeWrap}>
          <span style={S.modeActive}>個人モード</span>
          <span style={S.modeDisabled}>団体モード（準備中・5人）</span>
        </div>
        <div style={S.ioWrap}>
          <button style={S.ioBtn} onClick={handleExport}><Download size={14} /> エクスポート</button>
          <button style={S.ioBtn} onClick={() => fileInputRef.current?.click()}><Upload size={14} /> インポート</button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleImport} style={{ display: "none" }} />
        </div>
      </header>

      <section style={S.card}>
        <div style={S.lineHead}>手具</div>
        <div style={S.appWrap}>
          {Object.entries(APPARATUS).map(([k, v]) => (
            <button key={k} style={k === apparatus ? S.appActive : S.appBtn} onClick={() => setApparatus(k)}>{v.name}</button>
          ))}
        </div>
        <p style={S.hint}>必須投げ方：{APPARATUS[apparatus].throws.length ? APPARATUS[apparatus].throws.join("・") : "なし"}</p>
      </section>

      <p style={S.note}>
        演技をシリーズ単位で入力します。「投げ」〜「キャッチ」が1つの投げ、投げを挟まない連続したタンブリング技が1本のタンブリングとして自動分類されます。
      </p>

      {series.map((ser, sIdx) => {
        const a = analyzeSeries(ser);
        const seriesQualifies = a.throwCount >= 2 && a.units.some((u) => u.type === "throw" && u.hasDPlus);
        const b = seriesBreakdowns[sIdx];
        return (
          <section key={sIdx} style={S.card}>
            <div style={S.lineHead}>
              <span>シリーズ {sIdx + 1}{dupFlags[sIdx] ? "（重複：本数・投げ回数に不算入）" : ""}</span>
              {series.length > 1 && (
                <button style={S.removeBtnSm} onClick={() => removeSeries(sIdx)}><Trash2 size={13} /> 削除</button>
              )}
            </div>
            <label style={S.execLabel}>
              実施減点(E)：
              <input
                type="number" step="0.1" min="0"
                value={ser.executionDeduction || 0}
                onChange={(e) => updateSeriesField(sIdx, { executionDeduction: parseFloat(e.target.value) || 0 })}
                style={S.execInput}
              />
              点
            </label>
            <div style={S.skillRow}>
              {ser.items.map((item, iIdx) => (
                <div key={iIdx} style={S.skillBlock}>
                  {item.kind === "throw" && (
                    <>
                      <div style={S.throwTag}>投げ</div>
                      {[...THROW_OPTIONS_COMMON, ...(APPARATUS_USE[apparatus] ? THROW_OPTIONS_APPARATUS : [])].map((opt) => (
                        <label key={opt.id} style={S.check}>
                          <input type="checkbox" checked={(item.throwTypes || []).includes(opt.id)}
                            onChange={(e) => {
                              const cur = item.throwTypes || [];
                              const next = e.target.checked ? [...cur, opt.id] : cur.filter((x) => x !== opt.id);
                              updateItem(sIdx, iIdx, { throwTypes: next });
                            }} />
                          {opt.name}
                        </label>
                      ))}
                      {REQUIRED_THROW_OPTIONS[apparatus].map((opt) => (
                        <label key={opt.id} style={S.checkReq}>
                          <input type="checkbox" checked={(item.reqTypes || []).includes(opt.id)}
                            onChange={(e) => {
                              const cur = item.reqTypes || [];
                              const next = e.target.checked ? [...cur, opt.id] : cur.filter((x) => x !== opt.id);
                              updateItem(sIdx, iIdx, { reqTypes: next });
                            }} />
                          {opt.name}
                        </label>
                      ))}
                    </>
                  )}
                  {item.kind === "catch" && (
                    <>
                      <div style={S.catchTag}>キャッチ</div>
                      {[...CATCH_OPTIONS_COMMON, ...(APPARATUS_USE[apparatus] ? CATCH_OPTIONS_APPARATUS : [])].map((opt) => (
                        <label key={opt.id} style={S.check}>
                          <input type="checkbox" checked={(item.catchTypes || []).includes(opt.id)}
                            onChange={(e) => {
                              const cur = item.catchTypes || [];
                              const next = e.target.checked ? [...cur, opt.id] : cur.filter((x) => x !== opt.id);
                              updateItem(sIdx, iIdx, { catchTypes: next });
                            }} />
                          {opt.name}
                        </label>
                      ))}
                      {APPARATUS_USE[apparatus] && (
                        <label style={S.checkReq}>
                          <input type="checkbox" checked={item.catchTwo || false}
                            onChange={(e) => updateItem(sIdx, iIdx, { catchTwo: e.target.checked })} />
                          2つ同時キャッチ
                        </label>
                      )}
                    </>
                  )}
                  {item.kind === "skill" && (
                    <>
                      <div style={S.selWrap}>
                        <select value={item.skillId} onChange={(e) => updateItem(sIdx, iIdx, { skillId: e.target.value })} style={S.select}>
                          <option value="">タンブリング技</option>
                          {SKILL_LIST.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      <label style={S.check}>
                        <input type="checkbox" checked={item.hasApparatus || false} onChange={(e) => updateItem(sIdx, iIdx, { hasApparatus: e.target.checked })} />
                        手具操作
                      </label>
                      <label style={S.check}>
                        <input type="checkbox" checked={item.isThrow || false} onChange={(e) => updateItem(sIdx, iIdx, { isThrow: e.target.checked })} />
                        この技の最中に投げ
                      </label>
                    </>
                  )}
                  {item.kind === "motion" && (
                    <select value={item.motionId} onChange={(e) => updateItem(sIdx, iIdx, { motionId: e.target.value })} style={S.select}>
                      <option value="">徒手動作</option>
                      {HAND_MOTIONS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  )}
                  <button style={S.removeBtnXs} onClick={() => removeItem(sIdx, iIdx)} aria-label="削除"><X size={12} /></button>
                  {iIdx < ser.items.length - 1 && <div style={S.arrow}>→</div>}
                </div>
              ))}
            </div>
            <div style={S.addRow}>
              <button style={S.addBtnSm} onClick={() => addItem(sIdx, "throw")}>+ 投げ</button>
              <button style={S.addBtnSm} onClick={() => addItem(sIdx, "skill")}>+ タンブリング技</button>
              <button style={S.addBtnSm} onClick={() => addItem(sIdx, "motion")}>+ 徒手動作</button>
              <button style={S.addBtnSm} onClick={() => addItem(sIdx, "catch")}>+ キャッチ</button>
            </div>
            {a.units.map((u, ui) => (
              <div key={ui} style={S.unitResult}>
                {u.type === "tumbling"
                  ? `タンブリング塊：難度 ${u.finalDiff}`
                  : `投げ：難度 ${u.finalDiff}（${u.isThrowTumbling ? "転回系としてカウント・投げタン" : "徒手系としてカウント"}｜難度は${u.diffFromHand ? "徒手系" : "転回系"}由来｜徒手${u.handDiff}/転回${u.tumblingDiff ?? "—"}）`}
                {`　／ 最大連続宙返り ${maxSaltoChain(u.skills.map((s) => s.skillId))} 回`}
              </div>
            ))}
            {seriesQualifies && <div style={S.bonusNote}>連続投げ加点の対象（投げ2回以上＋D難度以上）</div>}
            {checkApparatusFlow(ser, apparatus).map((err, ei) => (
              <div key={ei} style={S.flowError}>⚠ {err}</div>
            ))}
            <div style={S.seriesBreakdown}>
              <div style={S.breakdownTitle}>シリーズの加点・減点</div>
              <div style={S.breakdownRow}><span>D：タンブリング難度点</span><span>{b.tumDiff.toFixed(1)}</span></div>
              <div style={S.breakdownRow}><span>D：徒手難度点</span><span>{b.handDiff.toFixed(1)}</span></div>
              <div style={S.breakdownRow}><span>D：連続投げ加点</span><span>{b.sBonus.toFixed(1)}</span></div>
              <div style={S.breakdownRow}><span>D：技術加点</span><span>{b.tech.toFixed(1)}</span></div>
              <div style={S.breakdownRow}><span>D：手具操作加点</span><span>{b.appOp.toFixed(1)}</span></div>
              <div style={S.breakdownRow}><span>D：二つ投げ4動作加点</span><span>{b.twoMot.toFixed(1)}</span></div>
              <div style={S.breakdownRow}><span>A：手具操作不足減点</span><span>-{b.noApp.toFixed(1)}</span></div>
              <div style={S.breakdownRow}><span>E：実施減点</span><span>-{b.exec.toFixed(1)}</span></div>
              <div style={S.breakdownTotal}><span>D寄与</span><span>{b.dPart.toFixed(1)} 点</span></div>
              {dupFlags[sIdx] && <p style={S.hint}>※重複シリーズのため、難度点は採用候補に含まれますが、本数・投げ回数・一部加点には不算入</p>}
            </div>
          </section>
        );
      })}
      <button style={S.addBtn} onClick={addSeries}><Plus size={14} /> シリーズを追加</button>

      <section style={{ ...S.card, marginTop: 14 }}>
        <div style={S.lineHead}>必須要素チェック</div>
        <ul style={S.checkList}>
          {required.map((r) => (
            <li key={r.key} style={S.checkItem}>
              <span style={r.passed === false ? S.ng : r.passed === null ? S.pending : S.ok}>
                {r.passed === false ? "×" : r.passed === null ? "?" : "✓"}
              </span>
              <span style={r.passed === false ? S.ngText : S.okText}>{r.label}</span>
            </li>
          ))}
        </ul>
        {missing.length > 0 && <div style={S.missingBox}>不足要素 {missing.length} 件</div>}
        {connectNoApparatus && <div style={S.warnBox}>つなぎ技のA難度に手具操作がありません（減点対象）</div>}
      </section>

      <section style={S.cardTotal}>
        <div style={S.lineHead}>点数集計</div>

        <div style={S.categoryHead}>D（難度）— 加点</div>
        <div style={S.totalRow}><span>タンブリング難度点（上位3本）</span><span>{tumblingScore.toFixed(1)} 点</span></div>
        <div style={S.totalRow}><span>徒手難度点（上位3つ）</span><span>{handScore.toFixed(1)} 点</span></div>
        <div style={S.totalRow}><span>連続投げ加点</span><span>{seriesBonus.toFixed(1)} 点</span></div>
        <div style={S.totalRow}><span>技術加点（視野外・手以外・手具｜{techniqueCount}件）</span><span>{techniqueBonus.toFixed(1)} 点</span></div>
        <div style={S.totalRow}><span>手具操作加点（シリーズ最終難度E＋手具操作2回以上）</span><span>{apparatusOpBonus.toFixed(1)} 点</span></div>
        <div style={S.totalRow}><span>二つ投げ4動作加点</span><span>{twoThrowMotionBonus.toFixed(1)} 点</span></div>
        <div style={S.subtotalRow}><span>D 小計</span><span>{dScore.toFixed(1)} 点</span></div>

        <div style={S.categoryHead}>A（芸術と多様性）— 10点満点から減点</div>
        <div style={S.totalRow}><span>手具操作不足減点（投げなしタンブリング＋つなぎ技不足｜上限0.4）</span><span>-{noApparatusDeduction.toFixed(1)} 点</span></div>
        <div style={S.totalRow}><span>方向系不足減点（不足 {missingDirCount} 系統）</span><span>-{directionDeduction.toFixed(1)} 点</span></div>
        <div style={S.totalRow}><span>投げ回数不足減点（投げ {totalThrowCount} 回）</span><span>-{throwCountDeduction.toFixed(1)} 点</span></div>
        <div style={S.totalRow}><span>連続宙返り減点（最大 {maxChainAll} 回連続）</span><span>-{saltoChainDeduction.toFixed(1)} 点</span></div>
        <div style={S.totalRow}><span>投げ方・受け方の種類不足減点（投げ{throwKindCount}/3・受け{catchKindCount}/3｜上限0.5）</span><span>-{varietyDeduction.toFixed(1)} 点</span></div>
        <div style={S.subtotalRow}><span>A 残点（10 − {aDeduction.toFixed(1)}）</span><span>{aScore.toFixed(1)} 点</span></div>

        <div style={S.categoryHead}>E（実施）— 10点満点から減点</div>
        <div style={S.totalRow}><span>各シリーズの実施減点合計</span><span>-{executionDeduction.toFixed(1)} 点</span></div>
        <div style={S.subtotalRow}><span>E 残点（10 − {executionDeduction.toFixed(1)}）</span><span>{eScore.toFixed(1)} 点</span></div>

        <div style={S.totalRow}><span>投げ回数</span><span>{totalThrowCount} 回</span></div>
        <div style={S.grandRow}><span>合計（D + A残点 + E残点）</span><span>{grandTotal.toFixed(1)} 点</span></div>
      </section>
    </div>
  );
}

const S = {
  page: { fontFamily: "system-ui, sans-serif", maxWidth: 880, margin: "0 auto", padding: 16, color: "#1a1a1a" },
  header: { marginBottom: 16 },
  h1: { fontSize: 22, fontWeight: 600, margin: "0 0 10px" },
  modeWrap: { display: "flex", gap: 8 },
  modeActive: { background: "#185FA5", color: "#fff", padding: "5px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500 },
  modeDisabled: { background: "#F1EFE8", color: "#888780", padding: "5px 14px", borderRadius: 8, fontSize: 13 },
  ioWrap: { display: "flex", gap: 8, marginTop: 10 },
  ioBtn: { display: "flex", alignItems: "center", gap: 5, background: "#fff", border: "1px solid #d3d1c7", color: "#444441", padding: "7px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer" },
  note: { fontSize: 13, color: "#5F5E5A", lineHeight: 1.7, marginBottom: 14 },
  card: { background: "#fff", border: "1px solid #e5e3da", borderRadius: 12, padding: 16, marginBottom: 14 },
  cardTotal: { background: "#F1EFE8", border: "1px solid #d3d1c7", borderRadius: 12, padding: 16, marginBottom: 14, marginTop: 14 },
  lineHead: { fontSize: 15, fontWeight: 600, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" },
  appWrap: { display: "flex", gap: 8, flexWrap: "wrap" },
  appBtn: { background: "#fff", border: "1px solid #d3d1c7", color: "#444441", padding: "7px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer" },
  appActive: { background: "#185FA5", border: "1px solid #185FA5", color: "#fff", padding: "7px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 500 },
  skillRow: { display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 10 },
  skillBlock: { display: "flex", flexDirection: "column", gap: 6, position: "relative", paddingRight: 18 },
  selWrap: { display: "flex", alignItems: "center", gap: 4 },
  select: { padding: "7px 8px", borderRadius: 8, border: "1px solid #d3d1c7", fontSize: 13, minWidth: 130 },
  removeBtnSm: { border: "none", background: "#FCEBEB", color: "#A32D2D", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 3 },
  removeBtnXs: { border: "none", background: "transparent", color: "#A32D2D", cursor: "pointer", padding: 0, alignSelf: "center" },
  check: { fontSize: 12, color: "#444441", display: "flex", alignItems: "center", gap: 4 },
  checkReq: { fontSize: 12, color: "#185FA5", display: "flex", alignItems: "center", gap: 4 },
  arrow: { position: "absolute", right: -2, top: 8, color: "#888780", fontSize: 16 },
  addBtn: { display: "flex", alignItems: "center", gap: 4, border: "1px dashed #b4b2a9", background: "transparent", color: "#5F5E5A", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 13 },
  addBtnSm: { border: "1px dashed #b4b2a9", background: "transparent", color: "#5F5E5A", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 12 },
  addRow: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 },
  unitResult: { fontSize: 12, color: "#5F5E5A", marginTop: 8, paddingTop: 8, borderTop: "1px dashed #e5e3da" },
  bonusNote: { fontSize: 12, color: "#0F6E56", marginTop: 8, fontWeight: 500 },
  flowError: { fontSize: 12, color: "#A32D2D", marginTop: 6, fontWeight: 500 },
  seriesBreakdown: { marginTop: 12, padding: 10, background: "#FAFAF8", borderRadius: 8, border: "1px solid #e5e3da" },
  breakdownTitle: { fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#444441" },
  breakdownRow: { display: "flex", justifyContent: "space-between", fontSize: 12, color: "#5F5E5A", padding: "2px 0" },
  breakdownTotal: { display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600, padding: "6px 0 0", marginTop: 6, borderTop: "1px solid #d3d1c7", color: "#1a1a1a" },
  throwTag: { background: "#E1F5EE", color: "#0F6E56", padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 500 },
  catchTag: { background: "#FAECE7", color: "#993C1D", padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 500 },
  checkList: { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 },
  checkItem: { display: "flex", alignItems: "center", gap: 10, fontSize: 14 },
  ok: { color: "#0F6E56", fontWeight: 700 },
  ng: { color: "#A32D2D", fontWeight: 700 },
  pending: { color: "#BA7517", fontWeight: 700 },
  okText: { color: "#1a1a1a" },
  ngText: { color: "#A32D2D" },
  missingBox: { marginTop: 12, background: "#FCEBEB", color: "#A32D2D", padding: "8px 12px", borderRadius: 8, fontSize: 13 },
  warnBox: { marginTop: 8, background: "#FAEEDA", color: "#854F0B", padding: "8px 12px", borderRadius: 8, fontSize: 13 },
  totalRow: { display: "flex", justifyContent: "space-between", fontSize: 14, padding: "6px 0", color: "#444441" },
  subtotalRow: { display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600, padding: "6px 0", marginTop: 4, borderTop: "1px dashed #d3d1c7", color: "#1a1a1a" },
  categoryHead: { fontSize: 13, fontWeight: 600, marginTop: 12, marginBottom: 4, color: "#185FA5" },
  grandRow: { display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 600, padding: "10px 0 0", marginTop: 6, borderTop: "1px solid #d3d1c7" },
  hint: { fontSize: 12, color: "#888780", marginTop: 10 },
  execLabel: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#5F5E5A", marginBottom: 10 },
  execInput: { width: 70, padding: "5px 8px", borderRadius: 6, border: "1px solid #d3d1c7", fontSize: 13 },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 },
  modal: { background: "#fff", borderRadius: 12, padding: 16, maxWidth: 720, width: "100%", maxHeight: "80vh", display: "flex", flexDirection: "column", gap: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.15)" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15, fontWeight: 600 },
  modalTextarea: { flex: 1, minHeight: 320, padding: 10, fontFamily: "monospace", fontSize: 12, border: "1px solid #d3d1c7", borderRadius: 8, resize: "vertical" },
  modalActions: { display: "flex", gap: 8, justifyContent: "flex-end" },
};
