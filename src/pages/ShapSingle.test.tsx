/**
 * Roadmap Q14 / finding N6. The what-if page must show the risk the API decided with the
 * threshold the deployed model uses (`prediction`, `threshold_used`), not re-decide it
 * against whatever threshold happens to be sitting in the browser store.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ShapSingle from "./ShapSingle";
import { usePipelineStore } from "../stores/pipelineStore";

const predictChurn = vi.hoisted(() => vi.fn());

// jsdom has no ResizeObserver, which the chart container and the select controls need.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return { ...actual, predictChurn };
});

function apiAnswer(over: Record<string, unknown>) {
  return { probability: 0.1, prediction: 0, risk_level: "Low", threshold_used: 0.5, shap_values: {}, ...over };
}

afterEach(() => {
  vi.clearAllMocks();
  usePipelineStore.setState({ currentThreshold: 0.13 });
});

describe("ShapSingle risk decision", () => {
  it("shows HIGH RISK when the API flagged the customer, even if the store threshold is higher", async () => {
    // Probability 0.10 is below the store default of 0.13 but above the deployed 0.07.
    usePipelineStore.setState({ currentThreshold: 0.13 });
    predictChurn.mockResolvedValue(apiAnswer({ probability: 0.1, prediction: 1, risk_level: "High", threshold_used: 0.07 }));

    render(<ShapSingle />);

    expect(await screen.findByText(/HIGH RISK/)).toBeTruthy();
    expect(screen.queryByText(/LOW RISK/)).toBeNull();
  });

  it("shows LOW RISK when the API did not flag the customer, even if the store threshold is lower", async () => {
    usePipelineStore.setState({ currentThreshold: 0.05 });
    predictChurn.mockResolvedValue(apiAnswer({ probability: 0.1, prediction: 0, risk_level: "Low", threshold_used: 0.5 }));

    render(<ShapSingle />);

    expect(await screen.findByText(/LOW RISK/)).toBeTruthy();
    expect(screen.queryByText(/HIGH RISK/)).toBeNull();
  });

  it("prints the threshold the API used", async () => {
    usePipelineStore.setState({ currentThreshold: 0.13 });
    predictChurn.mockResolvedValue(apiAnswer({ prediction: 1, threshold_used: 0.07 }));

    render(<ShapSingle />);

    expect(await screen.findByText(/Threshold: 0\.07/)).toBeTruthy();
  });
});
