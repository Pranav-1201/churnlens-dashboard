

# ChurnLens Frontend Stabilization Plan

## Problem Summary

The frontend has several critical issues:
1. **Model slug mismatch**: Sidebar has 7 model links (logistic, decision-tree, random-forest, xgboost, lightgbm, catboost, stacking) but backend only returns 4 models ("Logistic Regression", "Tuned Logistic", "Random Forest", "Stacked Model"). The slug conversion in `ModelPage.tsx` produces "logistic-regression" but sidebar links to "logistic" — causing "Model not found".
2. **Network error on load**: `checkHealth()` and `predictChurn()` fail because Lovable preview can't reach `localhost:8000`. No error handling means unhandled promise rejection crashes.
3. **No pipeline execution UI**: The current `PipelineOverlay` is minimal — no step-by-step sections list like the original screenshots show.
4. **Missing optional chaining**: Several pages access `results.eda.total_customers` etc. without `?.` guards, causing crashes if data shape differs.
5. **mockData.ts still exists** but is unused — should be cleaned up.

## What Will NOT Change
- No UI redesign
- No component removal
- No library additions
- No routing changes
- All pages remain visually identical

---

## File Changes

### 1. `src/pages/ModelPage.tsx` — Fix slug matching

**Problem**: Sidebar uses `/dashboard/models/logistic` but model name "Logistic Regression" converts to "logistic-regression". Also backend returns only 4 models but sidebar shows 7.

**Fix**: Add a slug-to-name mapping table that handles all sidebar paths. Show "Model not available in this pipeline run" instead of generic "Model not found" for models the backend didn't train (XGBoost, LightGBM, CatBoost, Decision Tree). Add ROC/PR curve charts and model header with params/status badges to match the original screenshots.

### 2. `src/components/AppSidebar.tsx` — Dynamic model list

**Problem**: Sidebar hardcodes 7 model links. When backend only returns 4, clicking missing models shows errors.

**Fix**: Keep all 7 sidebar links (preserving UI) but add a subtle indicator (dimmed text or small dot) for models that exist in results vs those that don't. This way the sidebar looks the same but users know which models ran.

### 3. `src/pages/Landing.tsx` — Restore pipeline execution UI

**Problem**: Current overlay is a simple progress bar. Original screenshots show a two-panel layout: left panel with section checklist (checkmarks), right panel with execution log messages.

**Fix**: Restore the full pipeline execution screen matching the screenshots — section list on left with progressive checkmarks, scrolling log panel on right with emoji-prefixed messages. Use the `logs` array from the store. Add proper error handling for `checkHealth()` failure (catch and set `backendConnected: false` silently).

### 4. `src/services/api.ts` — Graceful error handling

**Problem**: `checkHealth()` throws unhandled promise rejection when backend unreachable. `setApiBaseUrl` in Settings doesn't actually change the axios base URL.

**Fix**: Wrap `checkHealth` in try/catch returning `{status: "error"}` on failure. Make `BASE_URL` reactive by reading from store or allowing runtime override via a module-level setter function.

### 5. `src/pages/DashboardHome.tsx` — Safe data access

**Problem**: `results.eda.total_customers` and `results.shap_global.slice(0, 5)` crash if those fields are missing/undefined.

**Fix**: Add optional chaining: `results?.eda?.total_customers`, `results?.shap_global?.slice(0, 5) ?? []`.

### 6. `src/pages/ModelComparison.tsx` — Add ROC curves overlay chart

**Problem**: Missing the "All ROC Curves" multi-line chart shown in the original screenshot. Current version only has bar charts.

**Fix**: Add a LineChart section showing ROC curves for all models (generated from confusion matrix data points). Keep existing leaderboard and bar charts unchanged.

### 7. `src/pages/ThresholdOptimization.tsx` — Safe optional chaining

**Fix**: Add `?.` guards on `best.threshold`, `best.confusion_matrix`. Already mostly correct but needs `best?.threshold ?? results.best_threshold` fallback.

### 8. `src/pages/BusinessAnalysis.tsx` — Same safe access pattern

**Fix**: Add `?.` on `best.threshold`, `best.confusion_matrix`.

### 9. `src/pages/FinalSummary.tsx` — Safe access

**Fix**: Add `?.` on `best.cv_scores`, `best.cv_std`, `best.cv_mean`.

### 10. `src/pages/FinalCVCheck.tsx` — Safe access

**Fix**: Guard `m.cv_scores` with `(m.cv_scores || [])`.

### 11. `src/pages/TunedModel.tsx` — Safe access

**Fix**: Guard against `runnerUp` being undefined (if backend returns < 2 models).

### 12. `src/pages/ShapSingle.tsx` — Handle prediction errors gracefully

**Fix**: Wrap initial `runPrediction` in useEffect with catch. Show toast on error instead of crashing.

### 13. `src/pages/EDA.tsx` — Safe data access

**Fix**: Already mostly correct. Add `?.` on `eda.by_contract`.

### 14. `src/pages/DataOverview.tsx` — Safe access

**Fix**: Already mostly correct, verify optional chaining.

### 15. `src/stores/pipelineStore.ts` — Fix Settings URL update

**Problem**: `setApiBaseUrl` updates store but the axios instance in `api.ts` still uses the old URL.

**Fix**: Export a `setBaseUrl` function from `api.ts` that updates the axios instance's `baseURL`. Call it from `setApiBaseUrl` in the store.

### 16. `src/pages/Settings.tsx` — Fix test connection

**Problem**: `testConnection` calls `setApiBaseUrl` but the API layer doesn't pick up the new URL.

**Fix**: Import and call `setBaseUrl` from api.ts when URL changes.

### 17. `src/data/mockData.ts` — Keep but mark as legacy

The file is no longer imported anywhere. Keep it as a reference/fallback file but add a comment at top. No pages import from it.

---

## Technical Details

### Model Slug Mapping (ModelPage.tsx)
```text
Sidebar slug → Backend model name
"logistic"        → "Logistic Regression"
"decision-tree"   → "Decision Tree"
"random-forest"   → "Random Forest"
"xgboost"         → "XGBoost" / "XGBoost (Calibrated)"
"lightgbm"        → "LightGBM"
"catboost"        → "CatBoost"
"stacking"        → "Stacked Model" / "Stacking Model"
```
The mapping tries multiple name variants. If no match found, shows a friendly "This model was not included in the current pipeline run" message.

### Pipeline Execution UI (Landing.tsx)
Restore the two-panel layout from screenshots:
- Left: Section checklist derived from `SECTION_NAMES` in mockData (these are pipeline step names, not mock data — they're UI labels)
- Right: Log messages from `logs` array, displayed progressively
- Progress bar at top
- Auto-navigate to dashboard on completion

### Error Boundary Pattern
All pages follow:
```typescript
if (noData) return <NoData />;
if (isRunning) return <Running />;
if (!results?.models) return <NoData />;
// safe access with ?. everywhere
```

