/**
 * Guards the §4.B wiring: the FN/FP cost inputs must actually reach the backend,
 * and whatever the backend returns must be handed back untouched.
 *
 * The old dashboard computed its curve locally from one confusion matrix and
 * never sent the costs anywhere. A regression to that would fail these tests:
 * `getThresholdCurve` would stop issuing a request carrying cost_fn/cost_fp.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { getThresholdCurve, type ThresholdCurveResponse } from "./api";

/** Minimal but realistic backend payload: cost === fn*cost_fn + fp*cost_fp. */
function fakeCurve(costFn: number, costFp: number): ThresholdCurveResponse {
  const points = [
    { threshold: 0.1, precision: 0.4, recall: 0.9, f1: 0.55, tp: 90, fp: 135, fn: 10, tn: 65 },
    { threshold: 0.5, precision: 0.7, recall: 0.5, f1: 0.58, tp: 50, fp: 21, fn: 50, tn: 179 },
    { threshold: 0.9, precision: 0.9, recall: 0.1, f1: 0.18, tp: 10, fp: 1, fn: 90, tn: 199 },
  ];
  const curve = points.map((p) => ({ ...p, cost: p.fn * costFn + p.fp * costFp }));
  return {
    source: "validation_oof",
    model: "CatBoost",
    cost_fn: costFn,
    cost_fp: costFp,
    curve,
    optimal: curve.reduce((a, b) => (a.cost <= b.cost ? a : b)),
    locked_threshold: 0.07,
  };
}

function mockFetchCapturingUrl() {
  const urls: string[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
    const url = String(input);
    urls.push(url);
    const params = new URL(url, "http://localhost").searchParams;
    const costFn = Number(params.get("cost_fn") ?? 10000);
    const costFp = Number(params.get("cost_fp") ?? 500);
    return {
      ok: true,
      json: async () => fakeCurve(costFn, costFp),
    } as Response;
  });
  return { urls, spy };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getThresholdCurve", () => {
  it("sends the FN/FP costs to the backend", async () => {
    const { urls } = mockFetchCapturingUrl();

    await getThresholdCurve(25000, 750);

    expect(urls).toHaveLength(1);
    const params = new URL(urls[0], "http://localhost").searchParams;
    expect(params.get("cost_fn")).toBe("25000");
    expect(params.get("cost_fp")).toBe("750");
    expect(urls[0]).toContain("/threshold-curve");
  });

  it("returns the backend's curve verbatim (no client-side synthesis)", async () => {
    mockFetchCapturingUrl();

    const res = await getThresholdCurve(10000, 500);

    // Every plotted cost must equal the backend's own fn/fp arithmetic.
    for (const p of res.curve) {
      expect(p.cost).toBe(p.fn * res.cost_fn + p.fp * res.cost_fp);
    }
    expect(res.source).toBe("validation_oof");
    expect(res.optimal.cost).toBe(Math.min(...res.curve.map((p) => p.cost)));
  });

  it("produces a different curve when the cost inputs change", async () => {
    mockFetchCapturingUrl();

    const cheap = await getThresholdCurve(10000, 500);
    const fnHeavy = await getThresholdCurve(50000, 500);

    const cheapCosts = cheap.curve.map((p) => p.cost);
    const heavyCosts = fnHeavy.curve.map((p) => p.cost);
    expect(heavyCosts).not.toEqual(cheapCosts);

    // Penalising misses harder must not push the optimal threshold upward.
    expect(fnHeavy.optimal.threshold).toBeLessThanOrEqual(cheap.optimal.threshold);
  });

  it("omits cost params when none are supplied", async () => {
    const { urls } = mockFetchCapturingUrl();

    await getThresholdCurve();

    expect(urls[0]).not.toContain("cost_fn");
  });
});
