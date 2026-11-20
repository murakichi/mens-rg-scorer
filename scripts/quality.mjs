// 自動生成の質を測って、基準値（src/scoring/__tests__/quality-baseline.json）と比べる。
// 使い方は `npm run quality -- --help`。probe.mjs と同じく vite の ssrLoadModule で TypeScript を読む。
import { createServer } from "vite";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const HELP = `使い方: npm run quality [-- オプション]

  手具 × Dスコアの要求（上限3.0／上限4.5／上限なし／下限4.2）ごとに固定の種で生成し、
  範囲内・D平均・A平均・必須充足・全部E／E不足（下限4.2）・加点重複 を基準値と並べて出す。
  生成（generate*.ts / autoThrows.ts / autoTumblings.ts / tumbling*.ts）を触ったら、
  変える前と後で走らせて比べる。

  --apparatus stick,clubs,ring,rope   測る手具（既定: 4つすべて）
  -n 25                               1場面あたりの構成数（既定: 25。下限4.2の場面はその2.4倍。基準値と同じ数で比べること）
  --update                            今の値で基準値を書き換える（意図して生成を変えたときだけ）
`;

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}
const named = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--update") named[a] = true;
  else if (a.startsWith("-")) named[a] = argv[++i];
}
const BASELINE = "src/scoring/__tests__/quality-baseline.json";

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
  optimizeDeps: { noDiscovery: true },
});
try {
  const mod = await server.ssrLoadModule("/src/scoring/quality.ts");
  const runs = named["-n"] ? Number(named["-n"]) : mod.QUALITY_DEFAULT_RUNS;
  const apps = named["--apparatus"] ? named["--apparatus"].split(",") : null;
  const scenarios = mod.QUALITY_SCENARIOS.filter((s) => !apps || apps.includes(s.apparatus));
  const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : null;
  if (base && base.runs !== runs) console.log(`※ 基準値は ${base.runs} 構成で測っている（今は ${runs}）。数をそろえて比べること`);

  const keys = Object.keys(mod.METRIC_RULES);
  const fmt = (k, v) => (k === "avgD" || k === "avgA" || k === "dupTech" || k === "eShort" ? v.toFixed(2) : `${Math.round(v * 100)}%`);
  console.log(`場面               ${keys.map((k) => mod.METRIC_RULES[k].label.padEnd(12)).join("")}`);
  const results = {};
  let bad = 0;
  for (const s of scenarios) {
    const t0 = Date.now();
    const m = mod.measureQuality(s, runs);
    results[s.id] = m;
    const b = base?.scenarios?.[s.id];
    const regs = mod.qualityRegressions(s, m, b);
    bad += regs.length;
    const used = mod.scenarioMetrics(s);
    const cells = keys.map((k) => {
      if (!used.includes(k)) return "-".padEnd(12);
      const cur = fmt(k, m[k]);
      const was = b && typeof b[k] === "number" ? `←${fmt(k, b[k])}` : "";
      const mark = regs.some((r) => r.key === k) ? "▼" : "";
      return `${mark}${cur}${was}`.padEnd(12);
    });
    console.log(`${s.id.padEnd(19)}${cells.join("")} (${m.n}本 ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  if (named["--update"]) {
    const merged = { runs, measuredAt: new Date().toISOString().slice(0, 10), scenarios: { ...(base?.scenarios ?? {}), ...results } };
    writeFileSync(BASELINE, JSON.stringify(merged, null, 2) + "\n");
    console.log(`\n基準値を書き換えた: ${BASELINE}`);
  } else if (bad > 0) {
    console.log(`\n▼ 基準値から許容幅を超えて悪くなった指標が ${bad} 個ある（許容幅は METRIC_RULES）`);
    process.exitCode = 1;
  } else if (base) {
    console.log("\n基準値から許容幅を超えて悪くなった指標は無い");
  }
} finally {
  await server.close();
}
