import { describe, it } from "vitest";
import { Encoder } from "@colyseus/schema";
import { resolveSnapshotBufferBytes } from "/Users/Takuro/GGD/apps/game-server/src/net/snapshot";
describe("dbg", () => {
  it("prints", () => {
    console.log("BUFFER_SIZE=", Encoder.BUFFER_SIZE, "poolSize=", Buffer.poolSize, "resolve=", resolveSnapshotBufferBytes({}));
  });
});
