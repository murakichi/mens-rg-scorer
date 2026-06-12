import { useState } from "react";
import { IndividualScorer } from "./components/IndividualScorer";
import { TeamScorer } from "./components/TeamScorer";

type Mode = "individual" | "team";

export default function App() {
  const [mode, setMode] = useState<Mode>("individual");

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

      {mode === "individual" ? <IndividualScorer /> : <TeamScorer />}
    </div>
  );
}
