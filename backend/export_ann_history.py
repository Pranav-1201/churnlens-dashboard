"""
export_ann_history.py — record the REAL per-epoch ANN training history.

Reproduces the notebook's ANN (Section 24): same architecture, loss, optimiser,
early stopping, and seed, then writes the actual per-epoch train/val losses to
src/data/ann_history.json. The dashboard's ANN Training page plots that file
instead of the Math.exp curve it used to fabricate.

    python backend/export_ann_history.py
"""
import json
import os
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from features import engineer_features, make_encoder  # noqa: E402
from pipeline import RANDOM_STATE, clean_data  # noqa: E402

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV = os.path.join(BASE, "data", "telco_churn.csv")
OUT = os.path.join(BASE, "src", "data", "ann_history.json")

EPOCHS = 40
PATIENCE = 5
BATCH = 64
LR = 5e-4

ARCHITECTURE = [
    {"label": "Input", "units": None},
    {"label": "Dense", "units": 128}, {"label": "BatchNorm + ReLU", "units": 128},
    {"label": "Dropout 0.4", "units": None},
    {"label": "Dense", "units": 64}, {"label": "BatchNorm + ReLU", "units": 64},
    {"label": "Dropout 0.3", "units": None},
    {"label": "Output", "units": 1},
]


class ImprovedANN(nn.Module):
    def __init__(self, n):
        super().__init__()
        self.model = nn.Sequential(
            nn.Linear(n, 128), nn.BatchNorm1d(128), nn.ReLU(), nn.Dropout(0.4),
            nn.Linear(128, 64), nn.BatchNorm1d(64), nn.ReLU(), nn.Dropout(0.3),
            nn.Linear(64, 1),
        )

    def forward(self, x):
        return self.model(x)


def main():
    torch.manual_seed(RANDOM_STATE)
    np.random.seed(RANDOM_STATE)

    df = clean_data(pd.read_csv(CSV))
    y = df["Churn"].values.astype(np.float32)
    X = df.drop(columns=["Churn"])

    enc = make_encoder(scale_numeric=False)
    Xm = enc.fit_transform(engineer_features(X))
    Xs = StandardScaler().fit_transform(np.asarray(Xm, dtype=np.float64)).astype(np.float32)

    X_tr, X_te, y_tr, y_te = train_test_split(
        Xs, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y)
    X_t, X_v, y_t, y_v = train_test_split(
        X_tr, y_tr, test_size=0.2, random_state=RANDOM_STATE, stratify=y_tr)

    train_loader = DataLoader(
        TensorDataset(torch.tensor(X_t), torch.tensor(y_t)), batch_size=BATCH, shuffle=True)
    val_loader = DataLoader(
        TensorDataset(torch.tensor(X_v), torch.tensor(y_v)), batch_size=BATCH)

    model = ImprovedANN(X_t.shape[1])
    pos_weight = torch.tensor([(y_t == 0).sum() / (y_t == 1).sum()], dtype=torch.float32)
    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    optimizer = optim.Adam(model.parameters(), lr=LR)

    epochs, best_val, best_state, patience, stop_epoch = [], float("inf"), None, 0, EPOCHS
    for epoch in range(1, EPOCHS + 1):
        model.train()
        tl = 0.0
        for xb, yb in train_loader:
            optimizer.zero_grad()
            loss = criterion(model(xb).view(-1), yb)
            loss.backward(); optimizer.step()
            tl += loss.item()
        tl /= len(train_loader)

        model.eval()
        vl = 0.0
        with torch.no_grad():
            for xb, yb in val_loader:
                vl += criterion(model(xb).view(-1), yb).item()
        vl /= len(val_loader)

        epochs.append({"epoch": epoch, "trainLoss": round(tl, 4), "valLoss": round(vl, 4)})
        print(f"[ann] epoch {epoch:2d}  train {tl:.4f}  val {vl:.4f}")

        if vl < best_val:
            best_val, patience = vl, 0
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
            stop_epoch = epoch
        else:
            patience += 1
            if patience >= PATIENCE:
                print(f"[ann] early stop at epoch {epoch}")
                break

    model.load_state_dict(best_state)
    model.eval()
    with torch.no_grad():
        probs = torch.sigmoid(model(torch.tensor(X_te)).view(-1)).numpy()
    test_auc = float(roc_auc_score(y_te, probs))

    out = {
        "epochs": epochs,
        "early_stop_epoch": stop_epoch,
        "best_val_loss": round(best_val, 4),
        "test_auc": round(test_auc, 4),
        "architecture": ARCHITECTURE,
        "n_features": int(X_t.shape[1]),
        "hyperparams": {"optimizer": "Adam", "lr": LR, "batch_size": BATCH,
                        "max_epochs": EPOCHS, "patience": PATIENCE,
                        "loss": "BCEWithLogitsLoss(pos_weight)"},
        "seed": RANDOM_STATE,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "note": "Real per-epoch losses recorded from an actual PyTorch training "
                "run (backend/export_ann_history.py). NOT synthetic.",
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print(f"[ann] wrote {OUT}: {len(epochs)} epochs, best_val={best_val:.4f}, "
          f"test_auc={test_auc:.4f}, early_stop_epoch={stop_epoch}")


if __name__ == "__main__":
    main()
