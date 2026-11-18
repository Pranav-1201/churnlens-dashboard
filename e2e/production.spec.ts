import { expect, test, type Page } from "@playwright/test";

// Roadmap C9 / Phase 1. A visitor to a production deployment cannot run the pipeline
// (the API is read-only), so every page must show the committed results on its own.
// Before this test existed, "Try Demo" failed and 12 of 23 routes said "Run the pipeline".

const MODEL_ROUTES = [
  "logistic",
  "decision-tree",
  "random-forest",
  "xgboost",
  "lightgbm",
  "catboost",
  "stacking",
].map((m) => `/dashboard/models/${m}`);

const PAGE_ROUTES = [
  "",
  "system-check",
  "data-overview",
  "eda",
  "cleaning",
  "features",
  "encoding",
  "split",
  "comparison",
  "threshold",
  "cv-check",
  "optuna",
  "tuned-model",
  "shap-global",
  "shap-single",
  "ann-training",
  "ann-eval",
  "business",
  "final-summary",
  "model-saving",
  "settings",
].map((p) => (p ? `/dashboard/${p}` : "/dashboard"));

const ROUTES = [...PAGE_ROUTES, ...MODEL_ROUTES];

/** Collects uncaught page errors and console errors so a route cannot "pass" while broken. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return errors;
}

async function expectShowsData(page: Page, route: string) {
  await page.goto(route);
  await page.waitForLoadState("networkidle");
  // The two empty-state / failure sentences a visitor used to see in production.
  await expect(page.getByText("Run the pipeline")).toHaveCount(0);
  await expect(page.getByText("Pipeline failed")).toHaveCount(0);
  // Positive proof the results arrived (set by the store once results are loaded).
  await expect(page.locator("html")).toHaveAttribute("data-results", /snapshot|run/);
}

test.describe("production mode shows the product", () => {
  test("the sweep covers every route in the app", () => {
    expect(ROUTES.length).toBe(28);
  });

  for (const route of ROUTES) {
    test(`${route} shows data from a cold load`, async ({ page }) => {
      const errors = watchErrors(page);
      await expectShowsData(page, route);
      expect(errors).toEqual([]);
    });
  }

  test("a results page survives a reload", async ({ page }) => {
    await expectShowsData(page, "/dashboard/comparison");
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Run the pipeline")).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("data-results", /snapshot|run/);
  });

  test("the landing page does not offer to run what the server forbids", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: /demo/i })).toHaveCount(0);
    await expect(page.getByText(/upload/i)).toHaveCount(0);
  });

  test("visiting the landing page does not bounce away from it", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/$/);
  });
});
