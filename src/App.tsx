import { useState } from "react";
import { IndividualScorer } from "./components/IndividualScorer";
import { TeamScorer } from "./components/TeamScorer";
import { consumeShareHash } from "./scoring/share";

type Mode = "individual" | "team";

export default function App() {
  // 起動時にURLハッシュから構成を復元（あれば）。一度だけ評価。
  const [shared] = useState(consumeShareHash);
  const [mode, setMode] = useState<Mode>(shared?.mode ?? "individual");

  const individualInit = shared?.mode === "individual" ? shared.data : undefined;
  const teamInit = shared?.mode === "team" ? shared.data : undefined;

  return (
    <div className="page">
      <header className="header">
        <h1 className="title">男子新体操 採点計算</h1>
        <div className="mode-wrap">
          <button
            className={mode === "individual" ? "mode-active" : "mode-btn"}
            onClick={() => setMode("individual")}
          >
            個人モード
          </button>
          <button className={mode === "team" ? "mode-active" : "mode-btn"} onClick={() => setMode("team")}>
            団体モード（5人）
          </button>
        </div>
      </header>

      {mode === "individual" ? (
        <IndividualScorer initialData={individualInit} />
      ) : (
        <TeamScorer initialData={teamInit} />
      )}
    </div>
  );
}
