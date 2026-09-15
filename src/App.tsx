import { useState } from "react";
import { IndividualScorer } from "./components/IndividualScorer";
import { TeamScorer } from "./components/TeamScorer";
import { consumeShareHash } from "./scoring/share";
import { loadDraftMode, saveDraftMode, type ScorerMode } from "./scoring/draft";

type Mode = ScorerMode;

export default function App() {
  // 起動時にURLハッシュから構成を復元（あれば）。一度だけ評価。
  const [shared] = useState(consumeShareHash);
  // 共有URL ＞ 前回のモード ＞ 個人
  const [mode, setMode] = useState<Mode>(() => shared?.mode ?? loadDraftMode() ?? "individual");

  // どちらのモードのドラフトを見せるか、次回の起動に引き継ぐ。
  // 保存するのは**ユーザーが切り替えたとき**だけ — 共有URLで開いただけで
  // 相手のモードが記憶され、自分が使っていたほうのドラフトが隠れるのを防ぐ。
  const changeMode = (m: Mode) => {
    setMode(m);
    saveDraftMode(m);
  };

  const individualInit = shared?.mode === "individual" ? shared.data : undefined;
  const teamInit = shared?.mode === "team" ? shared.data : undefined;

  return (
    <div className="page">
      <header className="header">
        <h1 className="title">男子新体操 採点計算</h1>
        <div className="mode-wrap">
          <button
            className={mode === "individual" ? "mode-active" : "mode-btn"}
            onClick={() => changeMode("individual")}
          >
            個人モード
          </button>
          <button className={mode === "team" ? "mode-active" : "mode-btn"} onClick={() => changeMode("team")}>
            団体モード（5人）
          </button>
        </div>
      </header>

      {mode === "individual" ? (
        <IndividualScorer initialData={individualInit} />
      ) : (
        <TeamScorer initialData={teamInit} />
      )}

      <footer className="site-footer">
        <p>
          不具合の報告・機能のご要望は、Instagram または X のDMでお気軽にお知らせください。
        </p>
        <div className="footer-links">
          <a
            className="footer-link"
            href="https://instagram.com/murakionfire"
            target="_blank"
            rel="noopener noreferrer"
          >
            Instagram @murakionfire
          </a>
          <a className="footer-link" href="https://x.com/rijsp" target="_blank" rel="noopener noreferrer">
            X @rijsp
          </a>
        </div>
      </footer>
    </div>
  );
}
