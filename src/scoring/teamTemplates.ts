// =====================================================================
// 団体の構成テンプレート（よく使う演技構成の保存）
//
// 個人の `templates.ts` と同じ作り（localStorage、同名は上書き、壊れた項目は捨てる）。
// 団体には手具の概念が無いので、`splitByApparatus` や「共通」手具にあたるものは無い。
// 保存するのは**構成だけ** — 実施減点は採点のたびに入れるものなので落とす（個人と同じ）。
// シリーズ単位のテンプレートはグリッドの形（レーン数・スロット数・mode・content）が
// 絡むので、まずは構成まるごとだけ（#71）。
// =====================================================================

import { normalizeTeamState, type TeamState } from "./team";

export const TEAM_TEMPLATE_STORAGE_KEY = "mens-rg-scorer:team-templates:v1";

export interface TeamTemplate {
  id: string;
  name: string;
  updatedAt: number;
  team: TeamState;
}

export interface TeamTemplateStore {
  version: 1;
  routines: TeamTemplate[];
}

export const emptyTeamTemplateStore = (): TeamTemplateStore => ({ version: 1, routines: [] });

export const newTeamTemplateId = (): string =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `tt${Date.now()}${Math.random()}`;

/** 実施減点を落とした構成（テンプレートは構成だけを持つ） */
export function stripTeamExec(team: TeamState): TeamState {
  const copy = structuredClone(team);
  copy.executionDeduction = 0;
  copy.series = copy.series.map((s) => ({ ...s, executionDeduction: 0 }));
  return copy;
}

/** 保存データ（localStorage / インポート）を正規化する。読めない項目は捨てる。 */
export function normalizeTeamTemplateStore(data: unknown): TeamTemplateStore {
  const d = (data ?? {}) as { routines?: unknown };
  const routines: TeamTemplate[] = (Array.isArray(d.routines) ? d.routines : []).flatMap((raw, i) => {
    if (!raw || typeof raw !== "object") return [];
    const t = raw as Partial<TeamTemplate> & { team?: unknown };
    // 構成として読めないものは捨てる（normalizeTeamState が古い形も畳んでくれる）
    const team = normalizeTeamState(t.team);
    if (!team) return [];
    return [
      {
        id: typeof t.id === "string" && t.id ? t.id : newTeamTemplateId(),
        name: typeof t.name === "string" && t.name.trim() ? t.name.trim() : `構成${i + 1}`,
        updatedAt: Number(t.updatedAt) || Date.now(),
        team,
      },
    ];
  });
  return { version: 1, routines };
}

/** localStorage から読み込む（未保存・破損・アクセス不可なら空） */
export function loadTeamTemplates(): TeamTemplateStore {
  try {
    const raw = localStorage.getItem(TEAM_TEMPLATE_STORAGE_KEY);
    if (!raw) return emptyTeamTemplateStore();
    return normalizeTeamTemplateStore(JSON.parse(raw));
  } catch {
    return emptyTeamTemplateStore();
  }
}

/** localStorage に書き込む。保存できたかを返す（プライベートモード等では false）。 */
export function saveTeamTemplates(store: TeamTemplateStore): boolean {
  try {
    localStorage.setItem(TEAM_TEMPLATE_STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

/** 同名があれば上書き、なければ追加。新しいものが先頭に来るよう並べ替える。 */
export function addTeamTemplate(store: TeamTemplateStore, name: string, team: TeamState): TeamTemplateStore {
  const item: TeamTemplate = {
    id: newTeamTemplateId(),
    name: name.trim(),
    updatedAt: Date.now(),
    team: stripTeamExec(team),
  };
  const i = store.routines.findIndex((x) => x.name === item.name);
  const next =
    i >= 0 ? store.routines.map((x, k) => (k === i ? { ...item, id: x.id } : x)) : [...store.routines, item];
  return { version: 1, routines: [...next].sort((a, b) => b.updatedAt - a.updatedAt) };
}

export function removeTeamTemplate(store: TeamTemplateStore, id: string): TeamTemplateStore {
  return { version: 1, routines: store.routines.filter((t) => t.id !== id) };
}

export function renameTeamTemplate(store: TeamTemplateStore, id: string, name: string): TeamTemplateStore {
  const trimmed = name.trim();
  if (!trimmed) return store;
  return {
    version: 1,
    routines: store.routines.map((t) => (t.id === id ? { ...t, name: trimmed, updatedAt: Date.now() } : t)),
  };
}

/** カード表示用：構成の中身を「3シリーズ・技12」のように短くまとめる */
export function describeTeam(team: TeamState): string {
  const cells = team.series.reduce(
    (n, s) => n + s.lanes.reduce((m, lane) => m + lane.filter((c) => c.type !== "empty").length, 0),
    0,
  );
  const motions = team.series.filter((s) => s.content === "motion").length;
  const parts = [`${team.series.length}シリーズ`, `入力${cells}`];
  if (motions > 0) parts.push(`徒手${motions}`);
  if (team.junior) parts.push("ジュニア");
  return parts.join("・");
}
