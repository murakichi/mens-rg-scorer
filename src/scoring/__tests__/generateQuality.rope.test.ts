import { describe } from "vitest";
import { qualitySuite } from "./qualitySuite";

// 生成の質（重い。`npm run test:slow` だけで走る）。基準値は quality-baseline.json、比べ方は quality.ts
describe("生成の質：rope", () => qualitySuite("rope"));
