import type { Job, SourceState } from "./types";

type RuntimeCache = { jobs?: Job[]; sources?: SourceState[] };
const runtime = globalThis as typeof globalThis & { relayRuntime?: RuntimeCache };

export function getRuntime() { return runtime.relayRuntime; }

export function setRuntime(next: RuntimeCache) {
  runtime.relayRuntime = { ...runtime.relayRuntime, ...next };
}
