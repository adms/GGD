/**
 * ⭐ GH#1270 —— 集合瀏覽器（文件清單 ＋ 編輯表單）獨立成一個**可以被丟掉的** chunk。
 *
 * 在此之前 `DocList` 與 `EditorView` 是 `App.tsx` 的**靜態** import ⇒ 它們一定在每一份
 * bundle 裡，包含玩家版。⛔ 而玩家版的定義就是「內容編輯器不在裡面」。
 * ⇒ 把它們包成一頁、改成動態載入，`PLAYER_ONLY` 折掉那一行之後 rollup 就不產這個 chunk。
 */
import type { CollectionName } from "@ggd/shared/content";
import { DocList } from "./Sidebar";
import { EditorView } from "./EditorView";

export function CollectionBrowser({ collection }: { collection: CollectionName | null }) {
  return (
    <>
      {collection ? <DocList key={collection} collection={collection} /> : null}
      <EditorView />
    </>
  );
}
