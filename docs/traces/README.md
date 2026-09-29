# Traces — one file per bug or feature, start to finish

Anyone (human or AI) should be able to read a trace cold and pick up exactly where it stopped. Copy the template below to `docs/traces/<YYYY-MM-DD>-<slug>.md` (for example `2026-09-29-metrics-204-body.md`). One trace per bug or feature; never mix two.

Do not put secrets or exploitable details in a trace: this repository is public. Describe security work neutrally and keep the specifics elsewhere.

## Index
_(none yet — add one line per trace: date, slug, status)_

## Template

```markdown
# <Bug|Feature>: <one-line title>
- Status: open | in progress | verified | rolled back
- Opened: YYYY-MM-DD by <person> with <model/version>
- Related: PR #, commit, DEC-xxx

## 1. How it was found / scoped
What was observed or requested, and the exact steps or command that show it (with the output).

## 2. Hypotheses
| # | Hypothesis | Evidence for/against | Verdict (confirmed / falsified / untested) |

## 3. What was tried
Chronological. Include what did NOT work and why — a plausible wrong cause must not be re-investigated.

## 4. The change
Files and functions touched (see docs/FLOW.md), and the reason for each.

## 5. Verification
Commands from docs/TEST_CHECKLIST.md run in that session, with quoted counts. For a bug: the failing test watched failing BEFORE the fix.

## 6. Rollback
The exact revert path (see docs/ROLLBACK.md) and anything to re-check afterwards.

## 7. Handoff note (5 lines)
What we did / what is left / what to watch out for.
```
