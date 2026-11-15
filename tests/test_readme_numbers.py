"""Roadmap Q5: the README's headline result numbers must match the shipped artifact.

The README once quoted results priced at the old fixed 10,000/500 costs while the deployed
model used the derived 730/39 costs, and nothing noticed. This test reads the artifact's own
recorded final evaluation and fails when the README disagrees (or quotes a known-stale figure).
"""
import os

from churn_intel import artifacts

README = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "README.md")

# Figures that were correct only under the old fixed 10,000/500 cost basis.
STALE_FIGURES = ("1,025,500", "606,000", "1,618,500")


def readme_problems(text: str, final_evaluation: dict) -> list[str]:
    """Human-readable list of README/artifact disagreements (empty means consistent)."""
    problems = []
    expected = {
        "test cost at the locked threshold": f"{final_evaluation['test_cost_at_threshold']:,}",
        "test cost at threshold 0.5": f"{final_evaluation['test_cost_at_default_0_5']:,}",
        "test ROC-AUC": f"{final_evaluation['test_roc_auc']}",
    }
    for label, figure in expected.items():
        if figure not in text:
            problems.append(f"README does not state the {label} ({figure})")
    for stale in STALE_FIGURES:
        if stale in text:
            problems.append(f"README still quotes the stale figure {stale}")
    return problems


def test_readme_numbers_match_the_shipped_artifact():
    _, _, metadata = artifacts.load_artifact()
    with open(README, encoding="utf-8") as fh:
        text = fh.read()
    assert readme_problems(text, metadata["final_evaluation"]) == []


def test_checker_catches_stale_and_missing_numbers():
    evaluation = {"test_cost_at_threshold": 32321, "test_cost_at_default_0_5": 75439, "test_roc_auc": 0.8408}
    stale_readme = "test cost 419,500 vs 1,025,500 at the default threshold, ROC-AUC 0.8408"
    problems = readme_problems(stale_readme, evaluation)
    assert any("32,321" in p for p in problems)
    assert any("1,025,500" in p for p in problems)
    assert readme_problems("32,321 and 75,439 and 0.8408", evaluation) == []
