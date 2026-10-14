// 「○○は生成される？」を一度に確かめる。使い方は `npm run probe -- --help`。
// 新しい依存は足さず、入っている vite の ssrLoadModule で TypeScript をそのまま読む。
import { createServer } from "vite";

const HELP = `使い方: npm run probe -- "<技名 or 連鎖>" [オプション]

  例  npm run probe -- きりもみ転回
      npm run probe -- "前宙→きりもみ転回" --apparatus clubs --max 3.5,none
      npm run probe -- "前宙(投げ)" --min 4 --max none -n 30
      npm run probe -- twothrow --apparatus ring,clubs

  検索語   画面の名前の部分一致。→ ／ -> ／ > で区切ると隣り合う順の連鎖。
           シリーズごと探すなら全部並べて --exact（シェネの回数は「シェネ×3」）。
           「*」は任意のアイテム1つ（例: "投げ→*→前転→キャッチ" --exact）。
           「(投げ)」「(受)」「(操作)」と、タグ・必須投げの id（[noview] 等）も検索対象。
  --apparatus stick,clubs,ring,rope   手具（既定: 4つすべて）
  --max 2.5,3.5,4.5,none              Dスコアの上限（既定: none）。並べると行が増える
  --min 4.2                           Dスコアの下限（既定: なし）
  --rarity 0,50,100                   珍しさ（既定: 50）
  -n 12                               1行あたりに生成する構成の数（既定: 12）
  --exact                             検索語をシリーズ全体として探す（始まりも終わりも一致）
  --junior                            ジュニア
  --future F|G                        十年後モード
  --seed 1                            乱数の種（同じ値なら結果を再現できる）
`;

const argv = process.argv.slice(2);
if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
  console.log(HELP);
  process.exit(argv.length === 0 ? 1 : 0);
}

const flags = new Set(["--junior", "--exact"]);
const named = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (flags.has(a)) named[a] = true;
  else if (a.startsWith("-") && a.length > 1 && Number.isNaN(Number(a))) named[a] = argv[++i];
  else positional.push(a);
}
const list = (v, fallback) => (v == null ? fallback : String(v).split(",").map((s) => s.trim()).filter(Boolean));
const num = (s) => (s === "none" || s === "なし" ? null : Number(s));

const query = positional.join(" ").trim();
if (!query) {
  console.error("検索語がありません。--help を見てください。");
  process.exit(1);
}
const APPARATUSES = ["stick", "clubs", "ring", "rope"];
const apparatuses = list(named["--apparatus"], APPARATUSES);
const bad = apparatuses.filter((a) => !APPARATUSES.includes(a));
if (bad.length > 0) {
  console.error(`手具が不明です: ${bad.join(", ")}（${APPARATUSES.join(" / ")}）`);
  process.exit(1);
}
const maxScores = list(named["--max"], ["none"]).map(num);
const rarities = list(named["--rarity"], ["50"]).map(Number);
if ([...maxScores.filter((m) => m !== null), ...rarities].some(Number.isNaN)) {
  console.error("--max / --rarity は数字（--max は none も可）で指定してください。");
  process.exit(1);
}
const runs = Number(named["-n"] ?? 12);
const future = named["--future"] ?? null;
if (future !== null && future !== "F" && future !== "G") {
  console.error("--future は F か G です。");
  process.exit(1);
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
  optimizeDeps: { noDiscovery: true },
});
try {
  const mod = await server.ssrLoadModule("/src/scoring/probe.ts");
  const opts = {
    query,
    apparatuses,
    maxScores,
    minScore: named["--min"] != null ? Number(named["--min"]) : null,
    rarities,
    runs,
    junior: !!named["--junior"],
    exact: !!named["--exact"],
    future,
    seed: named["--seed"] != null ? Number(named["--seed"]) : 1,
  };
  const terms = mod.parseQuery(query);
  console.log(`検索: ${terms.join(" → ")}${opts.exact ? "（シリーズ全体）" : terms.length > 1 ? "（連鎖）" : ""}  / 1行 ${runs} 構成${opts.junior ? " / ジュニア" : ""}${future ? ` / 十年後${future}` : ""}`);

  const skills = mod.diagnoseSkills(opts);
  if (skills.length > 0) {
    console.log("\n[技の条件]");
    for (const s of skills) {
      const at = s.usableAt.map((u) => `${u.maxScore ?? "上限なし"}:${u.usable ? "○" : "×"}`).join(" ");
      const notes = [s.blocked && `使えない: ${s.blocked}`, s.noAuto && "自動生成では組み立てない"].filter(Boolean);
      console.log(`  ${s.name}  候補に入れる上限 ${at}${notes.length ? `  ※${notes.join(" / ")}` : ""}`);
    }
  } else {
    console.log("\n[技の条件] 検索語に名前が当たる技はありません（投げ・キャッチ・徒手・タグでの検索として扱います）");
  }

  const t0 = Date.now();
  const rows = mod.probe(opts);
  console.log("\n[結果]  候補＝自動生成の候補（宙返りの本数違いを含む）に当たる数 / 構成＝生成した構成のうち当たった数");
  const label = (r) =>
    `${r.apparatus.padEnd(5)} 上限${String(r.maxScore ?? "なし").padEnd(4)} 珍${String(r.rarity).padStart(3)}`;
  for (const r of rows) {
    console.log(
      `  ${label(r)}  候補 ${String(r.candidateHits).padStart(3)}/${String(r.candidates).padEnd(3)}  構成 ${String(r.routineHits).padStart(2)}/${String(r.routines).padEnd(2)}（${r.seriesHits}本）  → ${mod.verdict(r)}`,
    );
  }
  const shown = new Set();
  console.log("\n[例]");
  for (const r of rows) {
    for (const e of r.examples.length > 0 ? r.examples : r.candidateExamples.map((x) => `（候補のみ）${x}`)) {
      if (shown.has(e)) continue;
      shown.add(e);
      console.log(`  ${r.apparatus}: ${e}`);
    }
  }
  if (shown.size === 0) console.log("  なし");
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
} finally {
  await server.close();
}
