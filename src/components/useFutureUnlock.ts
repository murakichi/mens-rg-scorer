import { useState } from "react";
import {
  FUTURE_UNLOCK_TOGGLES,
  loadFutureUnlock,
  saveFutureUnlock,
  type FutureUnlockState,
} from "../scoring/draft";

/**
 * 十年後モードの解放（隠し機能）。
 * 既定では切り替え自体を表示せず、**ジュニアモードを `FUTURE_UNLOCK_TOGGLES` 回
 * 切り替える**と表示する。解放したことは端末に覚える（localStorage）ので、
 * 一度出したら次回以降も出したまま。個人・団体で同じ状態を共有する。
 */
export function useFutureUnlock() {
  const [state, setState] = useState<FutureUnlockState>(() => loadFutureUnlock());
  // このセッションで解放したか（「解放しました」の案内を出すため）
  const [justUnlocked, setJustUnlocked] = useState(false);

  /** ジュニアモードを切り替えたときに呼ぶ */
  const countJuniorToggle = () => {
    setState((prev) => {
      if (prev.unlocked) return prev;
      const toggles = prev.toggles + 1;
      const next: FutureUnlockState = { toggles, unlocked: toggles >= FUTURE_UNLOCK_TOGGLES };
      saveFutureUnlock(next);
      if (next.unlocked) setJustUnlocked(true);
      return next;
    });
  };

  return { unlocked: state.unlocked, justUnlocked, countJuniorToggle };
}
