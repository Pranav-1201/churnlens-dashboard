/**
 * Roadmap F14 / finding N14. One page throwing while rendering must not blank the whole
 * app: the boundary shows a recovery action, and moving to another route clears it.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RouteErrorBoundary } from "./RouteErrorBoundary";

let shouldThrow = true;

function Bomb() {
  if (shouldThrow) throw new Error("render exploded");
  return <p>page content</p>;
}

beforeEach(() => {
  shouldThrow = true;
  // React logs every caught render error; keep the test output readable.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RouteErrorBoundary", () => {
  it("renders its children when nothing throws", () => {
    shouldThrow = false;
    render(
      <RouteErrorBoundary resetKey="/a">
        <Bomb />
      </RouteErrorBoundary>,
    );
    expect(screen.getByText("page content")).toBeTruthy();
  });

  it("shows a recovery message instead of a blank screen when a child throws", () => {
    render(
      <div>
        <p>sidebar stays</p>
        <RouteErrorBoundary resetKey="/a">
          <Bomb />
        </RouteErrorBoundary>
      </div>,
    );
    expect(screen.getByText("sidebar stays")).toBeTruthy();
    expect(screen.getByText(/this page hit a problem/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
  });

  it("re-renders the children when the visitor presses Try again", () => {
    render(
      <RouteErrorBoundary resetKey="/a">
        <Bomb />
      </RouteErrorBoundary>,
    );
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(screen.getByText("page content")).toBeTruthy();
  });

  it("clears the error when the route changes", () => {
    const { rerender } = render(
      <RouteErrorBoundary resetKey="/a">
        <Bomb />
      </RouteErrorBoundary>,
    );
    expect(screen.getByText(/this page hit a problem/i)).toBeTruthy();

    shouldThrow = false;
    rerender(
      <RouteErrorBoundary resetKey="/b">
        <Bomb />
      </RouteErrorBoundary>,
    );
    expect(screen.getByText("page content")).toBeTruthy();
  });
});
