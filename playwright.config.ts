import { defineConfig } from "@playwright/test";

// Phase 1 / roadmap C9: drive the app the way a visitor reaches it in production.
// The API runs with CHURNLENS_ENV=production (read-only: no training, no uploads) and the
// frontend is the real production build served by `vite preview`, so what these tests see
// is what a deployment would show. E2E_PYTHON points at the interpreter that has the
// backend dependencies installed (the project venv locally; plain `python` on CI).
const python = process.env.E2E_PYTHON ?? "python";
const API_PORT = 8000;
const WEB_PORT = 4173;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${WEB_PORT}` },
  webServer: [
    {
      command: `${python} -m uvicorn main:app --port ${API_PORT}`,
      cwd: "./backend",
      url: `http://localhost:${API_PORT}/livez`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        CHURNLENS_ENV: "production",
        CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
      },
    },
    {
      command: `npm run build && npx vite preview --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}/`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        VITE_API_BASE_URL: `http://localhost:${API_PORT}`,
        // The deployed API is read-only, so the build must not offer to run or upload.
        VITE_READ_ONLY: "true",
      },
    },
  ],
});
