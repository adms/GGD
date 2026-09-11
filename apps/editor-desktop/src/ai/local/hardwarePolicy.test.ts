import { describe, expect, it } from "vitest";
import { selectLocalAiBackend, type LocalAiHardwareSnapshot } from "./hardwarePolicy";

const GIB = 1024 ** 3;
const base: LocalAiHardwareSnapshot = {
  platform: "win32", arch: "x64", systemMemoryBytes: 32 * GIB, freeSystemMemoryBytes: 20 * GIB,
  memoryPressure: "normal", gpu: { name: "NVIDIA GeForce RTX 4060 Ti", totalMemoryBytes: 16 * GIB, freeMemoryBytes: 15 * GIB, driver: "test" },
  signedRuntimeTargets: ["win32-x64-cuda", "win32-x64-vulkan", "win32-x64-cpu"],
};

describe("local AI hardware policy", () => {
  it("uses a released CUDA runtime only with measured 16 GB-class headroom", () => {
    expect(selectLocalAiBackend(base, true, false)).toEqual({ backend: "cuda", runtimeTarget: "win32-x64-cuda", reasonCode: "LOCAL_AI_BACKEND_READY" });
    expect(selectLocalAiBackend({ ...base, gpu: { ...base.gpu!, totalMemoryBytes: 8 * GIB, freeMemoryBytes: 7 * GIB } }, true, false)).toMatchObject({ backend: "none", reasonCode: "LOCAL_AI_GPU_MEMORY_BELOW_16GB_CLASS" });
  });

  it("fails closed before E8 and keeps slow CPU an explicit opt-in", () => {
    expect(selectLocalAiBackend(base, false, true)).toMatchObject({ backend: "none", reasonCode: "LOCAL_AI_E8_GATE_PENDING" });
    const noGpu = { ...base, gpu: null };
    expect(selectLocalAiBackend(noGpu, true, false).backend).toBe("none");
    expect(selectLocalAiBackend(noGpu, true, true)).toMatchObject({ backend: "cpu", runtimeTarget: "win32-x64-cpu" });
  });

  it("requires at least 24 GiB and a signed Metal runtime on Apple Silicon", () => {
    const mac = { ...base, platform: "darwin" as const, arch: "arm64", gpu: null, signedRuntimeTargets: ["darwin-arm64-metal" as const] };
    expect(selectLocalAiBackend(mac, true, false).backend).toBe("metal");
    expect(selectLocalAiBackend({ ...mac, systemMemoryBytes: 16 * GIB }, true, false)).toMatchObject({ backend: "none", reasonCode: "LOCAL_AI_MAC_REQUIRES_24GIB" });
  });
});
