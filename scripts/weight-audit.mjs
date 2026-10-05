// 生成の重みの棚卸し：1つずつ中立の値に戻して、同じ乱数の種で出力がどれだけ変わるかを測る。
//   node scripts/weight-audit.mjs [--runs 5] [--jobs 4] [--out FILE] [--only NAME,NAME]
// 結果は JSON（既定: weight-audit.json）。読み方は docs/weight-audit.md。
//
// 中立にする値（`neutral`）：
//  - generateWeights.ts の *_WEIGHT … 0（評価の項を消す）
//  - 段数・試行回数（*_ROUNDS / *_PASSES / *_ATTEMPTS / *_CANDIDATES / *_BUDGET）… 0（その段を飛ばす）
//  - tumblingWeights.ts / autoThrows.ts の *_WEIGHT / *_BOOST（引きの倍率）… 1（倍率を掛けない）
// 確率（*_CHANCE）は中立の値が決まらないので、ここでは動かさない。
import { createServer } from "vite";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};

// ---- 1つの条件で測る（子プロセス）------------------------------------
if (argv.includes("--worker")) {
  const ablate = process.env.ABLATE; // "NAME=value"
  const runs = Number(arg("--runs", 5));
  const [aName, aValue] = ablate ? ablate.split("=") : [null, null];
  const server = await createServer({
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
    optimizeDeps: { noDiscovery: true },
    plugins: [
      {
        name: "ablate",
        enforce: "pre",
        transform(code, id) {
          if (!aName || !/src\/scoring\/[^/]+\.ts$/.test(id)) return null;
          const re = new RegExp(`(export const ${aName}\\s*(?::[^=]+)?=\\s*)-?[0-9.]+`);
          return re.test(code) ? code.replace(re, `$1${aValue}`) : null;
        },
      },
    ],
  });
  try {
    const gen = await server.ssrLoadModule("/src/scoring/generate.ts");
    const probe = await server.ssrLoadModule("/src/scoring/probe.ts");
    const conds = [];
    for (const apparatus of ["stick", "clubs", "ring", "rope"]) {
      conds.push({ apparatus, maxScore: 2.5 }, { apparatus, maxScore: 4.5 }, { apparatus, maxScore: null });
      conds.push({ apparatus, minScore: 4.2, maxScore: null });
    }
    const out = [];
    let k = 0;
    for (const c of conds) {
      const rand = probe.seededRandom(1000 + k++);
      for (let i = 0; i < runs; i++) {
        const r = gen.generateRoutine([], { ...c, random: rand });
        out.push(
          r
            ? {
                fp: r.series.map(probe.describeText).join("|"),
                d: r.dScore,
                a: r.aScore,
                n: r.series.length,
                miss: r.missing.length,
              }
            : { fp: "", d: 0, a: 0, n: 0, miss: 0 },
        );
      }
    }
    process.stdout.write(JSON.stringify(out));
  } finally {
    await server.close();
  }
  process.exit(0);
}

// ---- 対象の洗い出しと実行 ------------------------------------------------
const dir = "src/scoring/";
const targets = [];
const scan = (file, rule) => {
  const src = readFileSync(dir + file, "utf8");
  for (const m of src.matchAll(/^export const ([A-Z0-9_]+)\s*(?::[^=]+)?=\s*(-?[0-9.]+);/gm)) {
    const [, name, value] = m;
    const neutral = rule(name, Number(value));
    if (neutral != null && neutral !== Number(value)) targets.push({ name, file, value: Number(value), neutral });
  }
};
const stage = (n) => /_(ROUNDS|PASSES|ATTEMPTS|CANDIDATES|BUDGET)$/.test(n);
scan("generateWeights.ts", (n) => (stage(n) || /_WEIGHT$/.test(n) ? 0 : null));
scan("tumblingWeights.ts", (n) => (/_(WEIGHT|BOOST)$/.test(n) ? 1 : null));
scan("autoThrows.ts", (n) => (/_WEIGHT$/.test(n) ? 1 : null));

const only = arg("--only", null)?.split(",");
const list = only ? targets.filter((t) => only.includes(t.name)) : targets;
const runs = Number(arg("--runs", 5));
const jobs = Number(arg("--jobs", 4));
const outFile = arg("--out", "weight-audit.json");

const measure = (ablate) =>
  new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [process.argv[1], "--worker", "--runs", String(runs)], {
      env: { ...process.env, ...(ablate ? { ABLATE: ablate } : {}) },
      stdio: ["ignore", "pipe", "inherit"],
    });
    let buf = "";
    p.stdout.on("data", (d) => (buf += d));
    p.on("close", (code) => (code === 0 ? resolve(JSON.parse(buf)) : reject(new Error(`worker ${ablate} exit ${code}`))));
  });

const t0 = Date.now();
console.error(`対象 ${list.length} 個 / 1個あたり ${16 * runs} 構成 / 並列 ${jobs}`);
const base = await measure(null);
const base2 = await measure(null);
const deterministic = base.every((b, i) => b.fp === base2[i].fp);
console.error(`基準を2回測って同じか: ${deterministic}`);
if (!deterministic) {
  console.error("乱数の種で再現できていません（Math.random が残っている）。中止します。");
  process.exit(1);
}
const mean = (xs, f) => xs.reduce((s, x) => s + f(x), 0) / Math.max(1, xs.length);
const results = [];
let next = 0;
const worker = async () => {
  while (next < list.length) {
    const t = list[next++];
    const r = await measure(`${t.name}=${t.neutral}`);
    const changed = r.filter((x, i) => x.fp !== base[i].fp).length;
    results.push({
      ...t,
      changed,
      total: r.length,
      dD: mean(r, (x) => x.d) - mean(base, (x) => x.d),
      dA: mean(r, (x) => x.a) - mean(base, (x) => x.a),
      dN: mean(r, (x) => x.n) - mean(base, (x) => x.n),
      dMiss: mean(r, (x) => x.miss) - mean(base, (x) => x.miss),
    });
    console.error(`${results.length}/${list.length} ${t.name}: 変化 ${changed}/${r.length}`);
  }
};
await Promise.all(Array.from({ length: jobs }, worker));
results.sort((a, b) => a.changed - b.changed || a.name.localeCompare(b.name));
writeFileSync(outFile, JSON.stringify({ runs, base: { d: mean(base, (x) => x.d), a: mean(base, (x) => x.a) }, results }, null, 1));
console.error(`完了 ${((Date.now() - t0) / 60000).toFixed(1)} 分 → ${outFile}`);
