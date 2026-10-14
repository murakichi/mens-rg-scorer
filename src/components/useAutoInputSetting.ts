import { useState } from "react";

const KEY = "mens-rg-scorer:auto-input:v1";

/** 自動入力（おすすめ表示）のON/OFF。端末ごとに覚える（既定はON）。 */
export function useAutoInputSetting(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY) !== "off";
    } catch {
      return true;
    }
  });
  const set = (v: boolean) => {
    setOn(v);
    try {
      localStorage.setItem(KEY, v ? "on" : "off");
    } catch {
      // 保存できなくても表示は切り替わる
    }
  };
  return [on, set];
}
