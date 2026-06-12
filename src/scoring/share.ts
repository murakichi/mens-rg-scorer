// =====================================================================
// 構成をURL（#ハッシュ）に保存するためのエンコード/デコード。
// lz-string で圧縮し、URLセーフな文字列にする。個人・団体共通。
// =====================================================================

import LZString from "lz-string";

const HASH_PREFIX = "#d=";

/** 任意の保存オブジェクトを圧縮済みURLセーフ文字列にする */
export function encodeShare(obj: unknown): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(obj));
}

/** 圧縮文字列を復元（失敗時 null） */
export function decodeShare(s: string): unknown | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(s);
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

/** 現在のページURL＋ハッシュで共有URLを組み立てる */
export function buildShareUrl(obj: unknown): string {
  return `${location.origin}${location.pathname}${location.search}${HASH_PREFIX}${encodeShare(obj)}`;
}

/**
 * 起動時に URL ハッシュから構成を読み取り、読めたらハッシュを除去して返す。
 * モードは payload から推定（kind:"team" もしくは team フィールドがあれば団体）。
 */
export function consumeShareHash(): { mode: "individual" | "team"; data: Record<string, unknown> } | null {
  const hash = location.hash;
  if (!hash.startsWith(HASH_PREFIX)) return null;
  const decoded = decodeShare(hash.slice(HASH_PREFIX.length));
  if (!decoded || typeof decoded !== "object") return null;
  // ハッシュを消してアドレスバーをきれいにする（再マウント時の二重適用も防止）
  history.replaceState(null, "", `${location.pathname}${location.search}`);
  const data = decoded as Record<string, unknown>;
  const mode = data.kind === "team" || "team" in data ? "team" : "individual";
  return { mode, data };
}
