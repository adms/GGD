import { withVitestWatchdog } from "../../vitest.shared";
import viteConfig from "./vite.config";

// ⏲️ GH#1257 —— 這一份只做一件事：把 `vite.config.ts` 整份吃進來，再掛上 vitest 看門狗。
// ⛔ 看門狗不寫進 `vite.config.ts` 的理由（docker 正式 build）在 `vitest.shared.ts` 的 `withVitestWatchdog`。
export default withVitestWatchdog(viteConfig);
