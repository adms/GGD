import { execFileSync } from "node:child_process";
import { arch, freemem, platform, totalmem } from "node:os";
import { LOCAL_AI_RELEASE_LIMITS, type LocalAiRuntimeTarget } from "./releaseGate";

const GIB = 1024 ** 3;

export interface LocalAiHardwareSnapshot {
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly systemMemoryBytes: number;
  readonly freeSystemMemoryBytes: number;
  readonly memoryPressure: "normal" | "warning" | "critical" | "unknown";
  readonly gpu: {
    readonly name: string;
    readonly totalMemoryBytes: number;
    readonly freeMemoryBytes: number;
    readonly driver: string;
  } | null;
  readonly signedRuntimeTargets: readonly LocalAiRuntimeTarget[];
}

export interface LocalAiBackendDecision {
  readonly backend: "metal" | "cuda" | "vulkan" | "cpu" | "none";
  readonly runtimeTarget: LocalAiRuntimeTarget | null;
  readonly reasonCode: string;
}

/**
 * Release evidence decides whether a backend exists; this policy only decides
 * whether the current machine has enough measured headroom to use it.
 */
export function selectLocalAiBackend(snapshot: LocalAiHardwareSnapshot, releasePassed: boolean, allowSlowCpu: boolean): LocalAiBackendDecision {
  if (!releasePassed) return { backend: "none", runtimeTarget: null, reasonCode: "LOCAL_AI_E8_GATE_PENDING" };
  if (snapshot.memoryPressure === "critical" || snapshot.freeSystemMemoryBytes < 6 * GIB) {
    return { backend: "none", runtimeTarget: null, reasonCode: "LOCAL_AI_SYSTEM_MEMORY_RESERVE_LOW" };
  }
  const signed = new Set(snapshot.signedRuntimeTargets);
  if (snapshot.platform === "darwin" && snapshot.arch === "arm64") {
    if (snapshot.systemMemoryBytes < LOCAL_AI_RELEASE_LIMITS.minimumMacSystemMemoryBytes) return { backend: "none", runtimeTarget: null, reasonCode: "LOCAL_AI_MAC_REQUIRES_24GIB" };
    if (!signed.has("darwin-arm64-metal")) return { backend: "none", runtimeTarget: null, reasonCode: "LOCAL_AI_SIGNED_METAL_RUNTIME_MISSING" };
    return { backend: "metal", runtimeTarget: "darwin-arm64-metal", reasonCode: "LOCAL_AI_BACKEND_READY" };
  }
  if (snapshot.platform === "win32" && snapshot.arch === "x64") {
    const gpu = snapshot.gpu;
    const enoughGpu = gpu && /nvidia/i.test(gpu.name)
      && gpu.totalMemoryBytes >= LOCAL_AI_RELEASE_LIMITS.minimumWindowsGpuMemoryBytes
      && gpu.freeMemoryBytes >= LOCAL_AI_RELEASE_LIMITS.maximumWindowsPeakVramBytes;
    if (enoughGpu && signed.has("win32-x64-cuda")) return { backend: "cuda", runtimeTarget: "win32-x64-cuda", reasonCode: "LOCAL_AI_BACKEND_READY" };
    if (enoughGpu && signed.has("win32-x64-vulkan")) return { backend: "vulkan", runtimeTarget: "win32-x64-vulkan", reasonCode: "LOCAL_AI_BACKEND_READY" };
    if (allowSlowCpu && snapshot.systemMemoryBytes >= LOCAL_AI_RELEASE_LIMITS.minimumMacSystemMemoryBytes && signed.has("win32-x64-cpu")) return { backend: "cpu", runtimeTarget: "win32-x64-cpu", reasonCode: "LOCAL_AI_SLOW_CPU_OPT_IN" };
    return { backend: "none", runtimeTarget: null, reasonCode: gpu && gpu.totalMemoryBytes < LOCAL_AI_RELEASE_LIMITS.minimumWindowsGpuMemoryBytes ? "LOCAL_AI_GPU_MEMORY_BELOW_16GB_CLASS" : "LOCAL_AI_GPU_OR_SIGNED_RUNTIME_UNAVAILABLE" };
  }
  if (snapshot.platform === "darwin" && snapshot.arch === "x64" && allowSlowCpu && snapshot.systemMemoryBytes >= LOCAL_AI_RELEASE_LIMITS.minimumMacSystemMemoryBytes && signed.has("darwin-x64-cpu")) {
    return { backend: "cpu", runtimeTarget: "darwin-x64-cpu", reasonCode: "LOCAL_AI_SLOW_CPU_OPT_IN" };
  }
  return { backend: "none", runtimeTarget: null, reasonCode: "LOCAL_AI_PLATFORM_UNSUPPORTED" };
}

function nvidiaGpu(): LocalAiHardwareSnapshot["gpu"] {
  if (platform() !== "win32") return null;
  try {
    const line = execFileSync("nvidia-smi", [
      "--query-gpu=name,memory.total,memory.free,driver_version",
      "--format=csv,noheader,nounits",
    ], { encoding: "utf8", timeout: 2_000, windowsHide: true }).trim().split(/\r?\n/, 1)[0];
    if (!line) return null;
    const [name, totalMiB, freeMiB, driver] = line.split(",").map((part) => part.trim());
    const total = Number(totalMiB);
    const free = Number(freeMiB);
    if (!name || !driver || !Number.isFinite(total) || !Number.isFinite(free)) return null;
    return { name, totalMemoryBytes: total * 1024 ** 2, freeMemoryBytes: free * 1024 ** 2, driver };
  } catch {
    return null;
  }
}

/** Fixed-command probe; renderer input never reaches process execution. */
export function probeLocalAiHardware(signedRuntimeTargets: readonly LocalAiRuntimeTarget[]): LocalAiHardwareSnapshot {
  return {
    platform: platform(),
    arch: arch(),
    systemMemoryBytes: totalmem(),
    freeSystemMemoryBytes: freemem(),
    memoryPressure: "unknown",
    gpu: nvidiaGpu(),
    signedRuntimeTargets: [...signedRuntimeTargets],
  };
}
