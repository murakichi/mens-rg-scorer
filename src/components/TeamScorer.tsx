import { useState, useMemo } from "react";
import { Plus, X, Trash2 } from "lucide-react";
import { SKILL_LIST, HAND_MOTIONS } from "../scoring/constants";
import {
  computeTeamScore,
  initialTeamState,
  emptySeries,
  emptyCell,
  emptyLane,
  NUM_PLAYERS,
  type CellType,
  type TeamSeries,
  type TeamState,
} from "../scoring/team";

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `g${Date.now()}${Math.random()}`;

type GroupKind = "cross" | "union";

export function TeamScorer() {
  const [team, setTeam] = useState<TeamState>(initialTeamState);
  // グループ編集中の対象 { シリーズ, グループid, 種別 }。アクティブ時はセルクリックで所属を切替。
  const [pick, setPick] = useState<{ sIdx: number; gid: string; kind: GroupKind } | null>(null);

  const updateCell = (sIdx: number, lane: number, slot: number, patch: Record<string, unknown>) =>
    setTeam((p) => {
      const n = structuredClone(p);
      n.series[sIdx].lanes[lane][slot] = { ...n.series[sIdx].lanes[lane][slot], ...patch };
      return n;
    });
  const setCellType = (sIdx: number, lane: number, slot: number, type: CellType) => {
    if (type === "skill") updateCell(sIdx, lane, slot, { type: "skill", skillId: "" });
    else if (type === "motion") updateCell(sIdx, lane, slot, { type: "motion", motionId: "" });
    else {
      // 空にするセルは交差・組運動グループから外す
      setTeam((p) => {
        const n = structuredClone(p);
        n.series[sIdx].lanes[lane][slot] = { type: "empty" };
        [...n.series[sIdx].crossGroups, ...n.series[sIdx].unionGroups].forEach((g) => {
          g.cells = g.cells.filter((c) => !(c.lane === lane && c.slot === slot));
        });
        return n;
      });
    }
  };
  const toggleStuck = (sIdx: number, lane: number, slot: number) =>
    setTeam((p) => {
      const n = structuredClone(p);
      const cell = n.series[sIdx].lanes[lane][slot];
      cell.stuck = !cell.stuck;
      return n;
    });
  const addSlot = (sIdx: number) =>
    setTeam((p) => {
      const n = structuredClone(p);
      n.series[sIdx].slots += 1;
      n.series[sIdx].lanes.forEach((lane) => lane.push(emptyCell()));
      return n;
    });
  const removeSlot = (sIdx: number, slot: number) =>
    setTeam((p) => {
      const n = structuredClone(p);
      if (n.series[sIdx].slots > 1) {
        n.series[sIdx].slots -= 1;
        n.series[sIdx].lanes.forEach((lane) => lane.splice(slot, 1));
        // 交差・組運動参照のスロット番号を詰める
        [...n.series[sIdx].crossGroups, ...n.series[sIdx].unionGroups].forEach((g) => {
          g.cells = g.cells
            .filter((c) => c.slot !== slot)
            .map((c) => (c.slot > slot ? { ...c, slot: c.slot - 1 } : c));
        });
      }
      return n;
    });
  const addSeries = () =>
    setTeam((p) => {
      const n = structuredClone(p);
      n.series.push(emptySeries(3));
      return n;
    });
  const removeSeries = (sIdx: number) =>
    setTeam((p) => {
      if (p.series.length <= 1) return p;
      const n = structuredClone(p);
      n.series.splice(sIdx, 1);
      return n;
    });

  const toggleAllTogether = (sIdx: number) =>
    setTeam((p) => {
      const n = structuredClone(p);
      const cur = n.series[sIdx];
      // レーン構成が変わるので交差・組運動グループはクリア
      if (cur.mode === "allTogether") {
        const firstLane = cur.lanes[0] || emptyLane(cur.slots);
        n.series[sIdx] = {
          mode: "normal",
          slots: cur.slots,
          lanes: [firstLane, ...Array.from({ length: NUM_PLAYERS - 1 }, () => emptyLane(cur.slots))],
          crossGroups: [],
          unionGroups: [],
        };
      } else {
        n.series[sIdx] = {
          mode: "allTogether",
          slots: cur.slots,
          lanes: [cur.lanes[0] || emptyLane(cur.slots)],
          crossGroups: [],
          unionGroups: [],
        };
      }
      return n;
    });

  // ---- 交差／組運動グループ（共通） ----
  const groupsOf = (s: TeamSeries, kind: GroupKind) => (kind === "cross" ? s.crossGroups : s.unionGroups);
  const addGroup = (sIdx: number, kind: GroupKind) => {
    const gid = newId();
    setTeam((p) => {
      const n = structuredClone(p);
      groupsOf(n.series[sIdx], kind).push({ id: gid, cells: [] });
      return n;
    });
    setPick({ sIdx, gid, kind });
  };
  const removeGroup = (sIdx: number, kind: GroupKind, gid: string) => {
    setTeam((p) => {
      const n = structuredClone(p);
      if (kind === "cross") n.series[sIdx].crossGroups = n.series[sIdx].crossGroups.filter((g) => g.id !== gid);
      else n.series[sIdx].unionGroups = n.series[sIdx].unionGroups.filter((g) => g.id !== gid);
      return n;
    });
    setPick((cur) => (cur && cur.gid === gid ? null : cur));
  };
  const toggleGroupMember = (sIdx: number, kind: GroupKind, gid: string, lane: number, slot: number) =>
    setTeam((p) => {
      const n = structuredClone(p);
      const g = groupsOf(n.series[sIdx], kind).find((x) => x.id === gid);
      if (!g) return p;
      const i = g.cells.findIndex((c) => c.lane === lane && c.slot === slot);
      if (i >= 0) g.cells.splice(i, 1);
      else g.cells.push({ lane, slot });
      return n;
    });

  const result = useMemo(() => computeTeamScore(team), [team]);
  const {
    analysis,
    emptyColumnWarnings,
    required,
    missing,
    seriesDiffScore,
    bonus,
    dScore,
    aDeduction,
    aScore,
    executionDeduction,
    eScore,
    grandTotal,
  } = result;

  return (
    <>
      <p className="note">
        5人×3シリーズの構成です。各セルにタンブリング技列か徒手動作を入れます。縦に並ぶセルは同時実施として扱われます。
      </p>

      {team.series.map((ser, sIdx) => {
        const a = analysis[sIdx];
        return (
          <section key={sIdx} className="card">
            <div className="line-head">
              <span>
                シリーズ {sIdx + 1}
                {ser.mode === "allTogether" ? "（同時実施）" : ""}
              </span>
              <span className="line-head-right">
                <span className="diff-badge">{a.seriesDiff ? `シリーズ難度 ${a.seriesDiff}` : "難度 —"}</span>
                {team.series.length > 1 && (
                  <button className="remove-btn-sm" onClick={() => removeSeries(sIdx)}>
                    <Trash2 size={13} /> 削除
                  </button>
                )}
              </span>
            </div>
            <div className="opts-row">
              <button
                className={ser.mode === "allTogether" ? "app-btn is-active" : "app-btn"}
                onClick={() => toggleAllTogether(sIdx)}
              >
                {ser.mode === "allTogether" ? "同時実施シリーズ ✓" : "同時実施シリーズに切替"}
              </button>
            </div>

            <div className="team-grid-wrap">
              <table className="team-grid">
                <thead>
                  <tr>
                    <th className="th-lane">選手</th>
                    {Array.from({ length: ser.slots }, (_, slot) => (
                      <th key={slot} className="th-slot">
                        スロット {slot + 1}
                        {ser.slots > 1 && (
                          <button className="remove-btn-xs" onClick={() => removeSlot(sIdx, slot)}>
                            <X size={11} />
                          </button>
                        )}
                      </th>
                    ))}
                    <th className="th-slot">
                      <button className="add-btn-sm" onClick={() => addSlot(sIdx)}>
                        <Plus size={12} />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ser.lanes.map((lane, laneIdx) => (
                    <tr key={laneIdx}>
                      <td className="td-lane">選手 {laneIdx + 1}</td>
                      {lane.map((cell, slot) => {
                        const key = `${laneIdx}-${slot}`;
                        const chunkInfo = a.cellToChunk[key];
                        const isChunkEnd = chunkInfo && chunkInfo.endSlot === slot;
                        const crossNums = a.cellToCross[key];
                        const unionNums = a.cellToUnion[key];
                        const isLastSkill = a.chunkLastSkill[key];
                        const picking = pick?.sIdx === sIdx;
                        const activeGroup = picking
                          ? (pick!.kind === "cross" ? ser.crossGroups : ser.unionGroups).find((g) => g.id === pick!.gid)
                          : undefined;
                        const inActiveGroup = activeGroup?.cells.some((c) => c.lane === laneIdx && c.slot === slot);
                        return (
                          <td
                            key={slot}
                            className={`td-cell${chunkInfo ? " in-chunk" : ""}${crossNums ? " in-cross" : ""}${unionNums ? " in-union" : ""}`}
                          >
                            {cell.type === "empty" && (
                              <div className="empty-cell">
                                <button className="cell-btn" onClick={() => setCellType(sIdx, laneIdx, slot, "skill")}>
                                  技
                                </button>
                                <button
                                  className="cell-btn"
                                  onClick={() => setCellType(sIdx, laneIdx, slot, "motion")}
                                >
                                  徒手
                                </button>
                              </div>
                            )}
                            {cell.type === "skill" && (
                              <div className="cell-edit">
                                <select
                                  className="select"
                                  value={cell.skillId || ""}
                                  onChange={(e) => updateCell(sIdx, laneIdx, slot, { skillId: e.target.value })}
                                >
                                  <option value="">技</option>
                                  {SKILL_LIST.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  className="remove-btn-xs"
                                  onClick={() => setCellType(sIdx, laneIdx, slot, "empty")}
                                >
                                  <X size={10} />
                                </button>
                              </div>
                            )}
                            {cell.type === "motion" && (
                              <div className="cell-edit">
                                <select
                                  className="select"
                                  value={cell.motionId || ""}
                                  onChange={(e) => updateCell(sIdx, laneIdx, slot, { motionId: e.target.value })}
                                >
                                  <option value="">徒手</option>
                                  {HAND_MOTIONS.map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.name}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  className="remove-btn-xs"
                                  onClick={() => setCellType(sIdx, laneIdx, slot, "empty")}
                                >
                                  <X size={10} />
                                </button>
                              </div>
                            )}
                            {cell.type === "skill" && isLastSkill && cell.skillId && (
                              <label className="stuck-check">
                                <input
                                  type="checkbox"
                                  checked={!!cell.stuck}
                                  onChange={() => toggleStuck(sIdx, laneIdx, slot)}
                                />
                                着ピタ
                              </label>
                            )}
                            {isChunkEnd && chunkInfo.adjDiff && (
                              <div className="cell-diff">
                                塊難度 {chunkInfo.adjDiff}
                                {chunkInfo.bumped && <span className="bump-tag"> 同時+1</span>}
                              </div>
                            )}
                            {(crossNums || unionNums) && (
                              <div className="cross-tag">
                                {crossNums && <>交差{crossNums.join("・")}</>}
                                {crossNums && unionNums && " / "}
                                {unionNums && <span className="union-ink">組{unionNums.join("・")}</span>}
                              </div>
                            )}
                            {picking && cell.type !== "empty" && (
                              <button
                                className={`cross-pick${pick!.kind === "union" ? " union" : ""}${inActiveGroup ? " is-on" : ""}`}
                                onClick={() => toggleGroupMember(sIdx, pick!.kind, pick!.gid, laneIdx, slot)}
                              >
                                {inActiveGroup
                                  ? `✓ ${pick!.kind === "cross" ? "交差" : "組"}から外す`
                                  : `＋ ${pick!.kind === "cross" ? "交差" : "組"}に追加`}
                              </button>
                            )}
                          </td>
                        );
                      })}
                      <td className="td-cell"></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="diff-breakdown">
              <span>3人以上が到達：{a.threePersonDiff ?? "—"}</span>
              <span>交差最高：{a.crossMaxValue > 0 ? a.crosses.reduce((b, c) => (c.diffValue >= b.diffValue ? c : b)).diff : "—"}</span>
              <span>組運動最高：{a.unionMaxValue > 0 ? a.unions.reduce((b, u) => (u.diffValue >= b.diffValue ? u : b)).diff : "—"}</span>
              <span className="diff-breakdown-final">採用：{a.seriesDiff ?? "—"}</span>
            </div>

            {(["cross", "union"] as GroupKind[]).map((kind) => {
              const groups = kind === "cross" ? ser.crossGroups : ser.unionGroups;
              const infos = kind === "cross" ? a.crosses : a.unions;
              const isCross = kind === "cross";
              return (
                <div key={kind} className={`cross-section${isCross ? "" : " union-section"}`}>
                  <div className="cross-section-head">
                    <span>{isCross ? "交差グループ" : "組運動グループ"}</span>
                    <button className="add-btn-sm" onClick={() => addGroup(sIdx, kind)}>
                      <Plus size={12} /> 追加
                    </button>
                  </div>
                  {groups.length === 0 && (
                    <p className="hint">
                      {isCross
                        ? "グリッドのセルを選んで交差を作成します。選択した技の難度を連続加算（合計 −(段数−1)、上限E）した値が交差難度です。"
                        : "グリッドのセルを選んで組運動を作成します。選択した宙返り技の難度（最大C）が組運動難度です。転回を伴わない場合は難度なし。"}
                    </p>
                  )}
                  {groups.map((g, gi) => {
                    const info = infos[gi];
                    const editing = pick?.sIdx === sIdx && pick?.gid === g.id;
                    return (
                      <div key={g.id} className={`cross-row${editing ? " is-editing" : ""}`}>
                        <span className="cross-row-name">
                          {isCross ? "交差" : "組"}
                          {gi + 1}
                        </span>
                        <span className="cross-row-members">
                          {info.members.length === 0
                            ? "（セル未選択）"
                            : info.members.map((m) => `選手${m.lane + 1}・S${m.slot + 1} ${m.label}`).join(" ＋ ")}
                        </span>
                        <span className="cross-row-diff">{info.diff ? `難度 ${info.diff}` : "難度 —"}</span>
                        <button
                          className={editing ? "app-btn is-active" : "app-btn"}
                          onClick={() => setPick(editing ? null : { sIdx, gid: g.id, kind })}
                        >
                          {editing ? "選択を終了" : "セルを選択"}
                        </button>
                        <button className="remove-btn-sm" onClick={() => removeGroup(sIdx, kind, g.id)}>
                          <Trash2 size={13} /> 削除
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {emptyColumnWarnings[sIdx].length > 0 && (
              <div className="warn-box">
                全員が空のスロット：{emptyColumnWarnings[sIdx].map((s) => s + 1).join(", ")}
              </div>
            )}
          </section>
        );
      })}

      <button className="add-btn" onClick={addSeries}>
        <Plus size={14} /> シリーズを追加
      </button>

      <section className="card">
        <div className="line-head">必須要素チェック</div>
        <ul className="check-list">
          {required.map((r) => (
            <li key={r.key} className="check-item">
              <span className={`mark ${r.passed ? "ok" : "ng"}`}>{r.passed ? "✓" : "×"}</span>
              <span className={r.passed ? "ok-text" : "ng-text"}>{r.label}</span>
            </li>
          ))}
        </ul>
        {missing.length > 0 && <div className="missing-box">不足要素 {missing.length} 件</div>}
      </section>

      <section className="card card-total">
        <div className="line-head">点数集計</div>
        <div className="category-head">D（難度）— 加点</div>
        <div className="total-row">
          <span>シリーズ難度点（各シリーズ）</span>
          <span>{seriesDiffScore.toFixed(1)} 点</span>
        </div>
        <div className="total-row">
          <span>同じ転回技の加点（最大0.3）</span>
          <span>+{bonus.rotation.toFixed(1)} 点</span>
        </div>
        <div className="total-row">
          <span>着地の加点（最大0.2）</span>
          <span>+{bonus.landing.toFixed(1)} 点</span>
        </div>
        <div className="total-row">
          <span>交差の加点（最大0.3）</span>
          <span>+{bonus.cross.toFixed(1)} 点</span>
        </div>
        <div className="total-row">
          <span>同一難度の加点（最大0.2）</span>
          <span>+{bonus.sameDiff.toFixed(1)} 点</span>
        </div>
        <div className="subtotal-row">
          <span>D 小計</span>
          <span>{dScore.toFixed(1)} 点</span>
        </div>

        <div className="category-head">A（芸術と多様性）— 10点満点から減点（暫定）</div>
        <div className="total-row">
          <span>必須要素不足（{missing.length}件）</span>
          <span>-{aDeduction.toFixed(1)} 点</span>
        </div>
        <div className="subtotal-row">
          <span>A 残点</span>
          <span>{aScore.toFixed(1)} 点</span>
        </div>

        <div className="category-head">E（実施）— 10点満点から減点</div>
        <div className="total-row">
          <span>実施減点合計（未実装）</span>
          <span>-{executionDeduction.toFixed(1)} 点</span>
        </div>
        <div className="subtotal-row">
          <span>E 残点</span>
          <span>{eScore.toFixed(1)} 点</span>
        </div>

        <div className="grand-row">
          <span>合計（D + A残点 + E残点）</span>
          <span className="grand-score">{grandTotal.toFixed(1)}</span>
        </div>
        <p className="hint">
          ※ シリーズ難度 = max(3人以上が到達した難度, 各交差の合計難度)。5人同時の同技は格上げ済み。組技難度（空中転回・最大C）とA/E実施減点の入力は今後対応。
        </p>
      </section>
    </>
  );
}
