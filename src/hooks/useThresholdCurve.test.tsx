/**
 * Component-level guard for AUDIT.md §4.B.
 *
 * Renders the real useThresholdCurve hook against the real zustand store and a
 * mocked backend. Proves two things the fabricated chart could never do:
 *   1. The curve the pages plot equals what the backend returns for the current
 *      FN/FP costs (cost === fn*cost_fn + fp*cost_fp), not a local sigmoid ramp.
 *   2. Calling the store's setCosts() re-fetches and the plotted curve changes.
 *
 * If someone reverts either page to a client-side ramp, or unwires setCosts from
 * the fetch, these assertions fail.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useThresholdCurve } from "./useThresholdCurve";
import { usePipelineStore } from "../stores/pipelineStore";
import type { PipelineResults } from "../services/api";

/** Backend curve where every cost is exactly fn*cost_fn + fp*cost_fp. */
function backendCurve(costFn: number, costFp: number) {
  const pts = [
    { threshold: 0.1, precision: 0.4, recall: 0.9, f1: 0.55, tp: 90, fp: 135, fn: 10, tn: 65 },
    { threshold: 0.3, precision: 0.55, recall: 0.75, f1: 0.63, tp: 75, fp: 61, fn: 25, tn: 139 },
    { threshold: 0.5, precision: 0.7, recall: 0.5, f1: 0.58, tp: 50, fp: 21, fn: 50, tn: 179 },
    { threshold: 0.9, precision: 0.9, recall: 0.1, f1: 0.18, tp: 10, fp: 1, fn: 90, tn: 199 },
  ];
  const curve = pts.map((p) => ({ ...p, cost: p.fn * costFn + p.fp * costFp }));
  return {
    source: "validation_oof" as const,
    model: "CatBoost",
    cost_fn: costFn,
    cost_fp: costFp,
    curve,
    optimal: curve.reduce((a, b) => (a.cost <= b.cost ? a : b)),
    locked_threshold: 0.07,
  };
}

/** Mock the network layer: /threshold-curve echoes the requested costs. */
function mockBackend() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
    const url = String(input);
    const params = new URL(url, "http://localhost").searchParams;
    const costFn = Number(params.get("cost_fn") ?? 10000);
    const costFp = Number(params.get("cost_fp") ?? 500);
    return { ok: true, json: async () => backendCurve(costFn, costFp) } as Response;
  });
}

function seedCompletedRun() {
  const results = { threshold_curve: undefined } as unknown as PipelineResults;
  usePipelineStore.setState({
    phase: "complete",
    results,
    fnCost: 10000,
    fpCost: 500,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  usePipelineStore.setState({ phase: "idle", results: null, fnCost: 10000, fpCost: 500 });
});

describe("useThresholdCurve", () => {
  it("plots the backend curve for the current costs (not a local ramp)", async () => {
    mockBackend();
    seedCompletedRun();

    const { result } = renderHook(() => useThresholdCurve());

    await waitFor(() => expect(result.current.data).not.toBeNull());

    const curve = result.current.data!.curve;
    // Every point must satisfy the backend's exact arithmetic.
    for (const p of curve) {
      expect(p.cost).toBe(p.fn * 10000 + p.fp * 500);
    }
    expect(result.current.data!.source).toBe("validation_oof");
  });

  it("re-fetches and changes the curve when setCosts() runs", async () => {
    mockBackend();
    seedCompletedRun();

    const { result } = renderHook(() => useThresholdCurve());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    const before = result.current.data!.curve.map((p) => p.cost);
    expect(result.current.data!.cost_fn).toBe(10000);

    // The Settings page action — must trigger a re-fetch, not just a store write.
    act(() => {
      usePipelineStore.getState().setCosts(60000, 500);
    });

    await waitFor(() => expect(result.current.data?.cost_fn).toBe(60000));
    const after = result.current.data!.curve.map((p) => p.cost);

    expect(after).not.toEqual(before);
    // Still exact for the new costs — proves it's backend data, not a ramp.
    for (const p of result.current.data!.curve) {
      expect(p.cost).toBe(p.fn * 60000 + p.fp * 500);
    }
  });

  it("surfaces an error instead of fabricating when the backend is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    seedCompletedRun();

    const { result } = renderHook(() => useThresholdCurve());

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.data).toBeNull();
  });
});
