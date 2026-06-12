import { useState, useMemo } from "react";
import { Plus, X } from "lucide-react";
import { SKILL_LIST, HAND_MOTIONS } from "../scoring/constants";
import {
  computeTeamScore,
  initialTeamState,
  emptyCell,
  emptyLane,
  NUM_PLAYERS,
  type CellType,
  type TeamSeries,
  type TeamState,
} from "../scoring/team";

export function TeamScorer() {
  const [team, setTeam] = useState<TeamState>(initialTeamState);

  const updateCell = (sIdx: number, lane: number, slot: number, patch: Record<string, unknown>) =>
    setTeam((p) => {
      const n = structuredClone(p);
      n.series[sIdx].lanes[lane][slot] = { ...n.series[sIdx].lanes[lane][slot], ...patch };
      return n;
    });
  const setCellType = (sIdx: number, lane: number, slot: number, type: CellType) => {
    if (type === "skill") updateCell(sIdx, lane, slot, { type: "skill", skillId: "" });
    else if (type === "motion") updateCell(sIdx, lane, slot, { type: "motion", motionId: "" });
    else updateCell(sIdx, lane, slot, { type: "empty" });
  };
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
      }
      return n;
    });
  const updateSeriesField = (sIdx: number, patch: Partial<TeamSeries>) =>
    setTeam((p) => {
      const n = structuredClone(p);
      n.series[sIdx] = { ...n.series[sIdx], ...patch };
      return n;
    });

  const toggleAllTogether = (sIdx: number) =>
    setTeam((p) => {
      const n = structuredClone(p);
      const cur = n.series[sIdx];
      if (cur.mode === "allTogether") {
        const firstLane = cur.lanes[0] || emptyLane(cur.slots);
        n.series[sIdx] = {
          mode: "normal",
          slots: cur.slots,
          lanes: [firstLane, ...Array.from({ length: NUM_PLAYERS - 1 }, () => emptyLane(cur.slots))],
          hasCross: cur.hasCross,
          crossGroups: cur.crossGroups,
          hasUnion: cur.hasUnion,
        };
      } else {
        n.series[sIdx] = {
          mode: "allTogether",
          slots: cur.slots,
          lanes: [cur.lanes[0] || emptyLane(cur.slots)],
          hasCross: cur.hasCross,
          crossGroups: cur.crossGroups,
          hasUnion: cur.hasUnion,
        };
      }
      return n;
    });

  const result = useMemo(() => computeTeamScore(team), [team]);
  const { analysis, emptyColumnWarnings, required, missing, dScore, aDeduction, aScore, executionDeduction, eScore, grandTotal } =
    result;

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
              <span className="diff-badge">{a.seriesDiff ? `最高難度 ${a.seriesDiff}` : "難度 —"}</span>
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
                        const chunkInfo = a.cellToChunk[`${laneIdx}-${slot}`];
                        const isChunkEnd = chunkInfo && chunkInfo.endSlot === slot;
                        return (
                          <td key={slot} className={`td-cell${chunkInfo ? " in-chunk" : ""}`}>
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
                            {isChunkEnd && chunkInfo.diff && <div className="cell-diff">塊難度 {chunkInfo.diff}</div>}
                          </td>
                        );
                      })}
                      <td className="td-cell"></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="opts-row">
              <label className="check">
                <input
                  type="checkbox"
                  checked={ser.hasUnion}
                  onChange={(e) => updateSeriesField(sIdx, { hasUnion: e.target.checked })}
                />
                組技を含む
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={ser.hasCross}
                  onChange={(e) => updateSeriesField(sIdx, { hasCross: e.target.checked })}
                />
                交差を含む（簡易・後で詳細化）
              </label>
            </div>
            {emptyColumnWarnings[sIdx].length > 0 && (
              <div className="warn-box">
                全員が空のスロット：{emptyColumnWarnings[sIdx].map((s) => s + 1).join(", ")}
              </div>
            )}
          </section>
        );
      })}

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
          <span>シリーズ難度点（3シリーズ）</span>
          <span>{dScore.toFixed(1)} 点</span>
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
        <p className="hint">※ 交差グループ詳細・組技難度・全員同時の転回加点・徒手仕様は今後対応</p>
      </section>
    </>
  );
}
