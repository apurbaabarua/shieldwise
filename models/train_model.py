"""
ShieldWise — XGBoost Fraud Model Trainer
Run this once to generate fraud_model.pkl
Usage: python models/train_model.py
"""
import numpy as np
import pandas as pd
import pickle, os
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report, roc_auc_score
import xgboost as xgb

print("=" * 55)
print("  ShieldWise — XGBoost Fraud Model Trainer")
print("=" * 55)

# ── 1. Synthetic dataset (mirrors Kaggle PaySim schema) ────────
np.random.seed(42)
N = 20000

def make_dataset(n):
    fraud_mask = np.random.rand(n) < 0.06   # 6 % fraud rate

    # Amounts: fraud skews larger
    amount = np.where(fraud_mask,
        np.random.choice([4999,9999,24999,49999,99999], size=n),
        np.abs(np.random.exponential(800, n)).clip(10, 5000))

    txn_types  = ["p2p","merchant","recharge","collect","unknown"]
    txn_type   = np.where(fraud_mask,
        np.random.choice(["collect","unknown"], n),
        np.random.choice(txn_types, n, p=[0.5,0.25,0.15,0.07,0.03]))

    hour_buckets = ["day","eve","night"]
    hour_bucket  = np.where(fraud_mask,
        np.random.choice(["night","eve"], n, p=[0.6,0.4]),
        np.random.choice(hour_buckets, n, p=[0.6,0.25,0.15]))

    acct_ages  = ["old","mid","new","fresh"]
    acct_age   = np.where(fraud_mask,
        np.random.choice(["new","fresh"], n, p=[0.4,0.6]),
        np.random.choice(acct_ages, n, p=[0.5,0.3,0.15,0.05]))

    # VPA suspicious score 0–1
    vpa_risk   = np.where(fraud_mask,
        np.random.beta(8,2,n),
        np.random.beta(1,8,n))

    # Message keyword hit count
    msg_hits   = np.where(fraud_mask,
        np.random.randint(2,6,n),
        np.random.randint(0,2,n))

    label      = fraud_mask.astype(int)

    return pd.DataFrame({
        "amount":      amount,
        "txn_type":    txn_type,
        "hour_bucket": hour_bucket,
        "acct_age":    acct_age,
        "vpa_risk":    vpa_risk.round(3),
        "msg_hits":    msg_hits,
        "label":       label
    })

df = make_dataset(N)
print(f"\nDataset: {len(df):,} rows  |  Fraud: {df.label.sum():,} ({df.label.mean()*100:.1f}%)")

# ── 2. Encode categoricals ─────────────────────────────────────
le_txn  = LabelEncoder().fit(["p2p","merchant","recharge","collect","unknown"])
le_hour = LabelEncoder().fit(["day","eve","night"])
le_age  = LabelEncoder().fit(["old","mid","new","fresh"])

df["txn_enc"]  = le_txn.transform(df["txn_type"])
df["hour_enc"] = le_hour.transform(df["hour_bucket"])
df["age_enc"]  = le_age.transform(df["acct_age"])

FEATURES = ["amount","txn_enc","hour_enc","age_enc","vpa_risk","msg_hits"]
X = df[FEATURES].values
y = df["label"].values

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

# ── 3. Train XGBoost ───────────────────────────────────────────
model = xgb.XGBClassifier(
    n_estimators      = 150,
    max_depth         = 5,
    learning_rate     = 0.1,
    scale_pos_weight  = int((y==0).sum() / (y==1).sum()),
    use_label_encoder = False,
    eval_metric       = "logloss",
    random_state      = 42
)
model.fit(X_train, y_train,
          eval_set=[(X_test, y_test)],
          verbose=False)

# ── 4. Evaluate ────────────────────────────────────────────────
y_prob = model.predict_proba(X_test)[:,1]
y_pred = (y_prob >= 0.5).astype(int)
print("\nClassification report:")
print(classification_report(y_test, y_pred, target_names=["Safe","Fraud"]))
print(f"ROC-AUC: {roc_auc_score(y_test, y_prob):.4f}")

# ── 5. Save model + encoders ───────────────────────────────────
os.makedirs("models", exist_ok=True)
bundle = {
    "model":    model,
    "le_txn":   le_txn,
    "le_hour":  le_hour,
    "le_age":   le_age,
    "features": FEATURES
}
with open("models/fraud_model.pkl","wb") as f:
    pickle.dump(bundle, f)
print("\n✅  Model saved to models/fraud_model.pkl")
print("    Restart app.py to load the trained model.")
