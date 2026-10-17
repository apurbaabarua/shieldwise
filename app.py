"""
ShieldWise — UPI Scam Detector
Flask backend with MongoDB for user profiles and fraud logs.
Run: python app.py
"""
import os, datetime, json
from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_pymongo import PyMongo
from flask_bcrypt import Bcrypt
from flask_jwt_extended import (
    JWTManager, create_access_token,
    jwt_required, get_jwt_identity
)
from dotenv import load_dotenv
from bson import ObjectId
from bson.json_util import dumps

# ── App setup ──────────────────────────────────────────────────
load_dotenv()
BASE_DIR = os.path.abspath(os.path.dirname(__file__))

# XGBoost model (rule-based fallback if model file absent)
try:
    import xgboost as xgb
    import pickle
    model_path = os.path.join(BASE_DIR, "models", "fraud_model.pkl")
    with open(model_path, "rb") as f:
        FRAUD_MODEL = pickle.load(f)
    USE_MODEL = True
    print("✅  XGBoost model loaded")
except Exception:
    FRAUD_MODEL = None
    USE_MODEL = False
    print("⚠️   XGBoost model not found — using rule-based scoring")

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "templates"),
    static_folder=os.path.join(BASE_DIR, "static")
)
app.config["MONGO_URI"]         = os.getenv("MONGO_URI", "")
app.config["SECRET_KEY"]        = os.getenv("SECRET_KEY", "dev-secret")
app.config["JWT_SECRET_KEY"]    = os.getenv("JWT_SECRET_KEY", "dev-jwt-secret")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = datetime.timedelta(days=7)

bcrypt = Bcrypt(app)
jwt    = JWTManager(app)

mongo = None
mongo_uri = app.config["MONGO_URI"]
if mongo_uri and "cluster0.xxxxx.mongodb.net" not in mongo_uri and "<username>" not in mongo_uri:
    try:
        mongo = PyMongo(app)
        print(" Connected to MongoDB")
    except Exception as e:
        print(f" MongoDB connection error: {e}")
        mongo = None
else:
    print(" Running with in-memory fallback (No valid MongoDB URI configured)")

DEMO_USER_ID = "65f000000000000000000001"
DEMO_EMAIL   = "test@shieldwise.com"
DEMO_PW_HASH = bcrypt.generate_password_hash("test1234").decode("utf-8")

def make_demo_user():
    return {
        "_id": ObjectId(DEMO_USER_ID),
        "name": "Demo User",
        "email": DEMO_EMAIL,
        "phone": "+91 9876543210",
        "password": DEMO_PW_HASH,
        "balance": 4820.50,
        "spent_today": 250.0,
        "spent_month": 3200.0,
        "monthly_limit": 8000.0,
        "daily_limit": 2000.0,
        "txn_limit": 5000.0,
        "notify_pct": 80,
        "cat_limits": {"food": 3000, "shopping": 2000, "travel": 1500, "other": 2500},
        "cat_spent": {"food": 1200, "shopping": 850, "travel": 650, "other": 500},
        "goals": [
            {"id": "g1", "name": "Goa Trip", "target": 15000, "saved": 6500, "monthly": 1500, "icon_ti": "ti-plane", "icon_bg": "#eff6ff", "icon_fg": "#3b82f6"},
            {"id": "g2", "name": "Emergency Fund", "target": 50000, "saved": 24000, "monthly": 3000, "icon_ti": "ti-shield", "icon_bg": "#eff6ff", "icon_fg": "#2563eb"}
        ],
        "upi_id": "demo@shieldwise",
        "avatar": "D",
        "created_at": datetime.datetime.utcnow(),
        "updated_at": datetime.datetime.utcnow(),
    }

class InsertResult:
    def __init__(self, inserted_id):
        self.inserted_id = inserted_id

class SafeCollection:
    def __init__(self, name, initial_data=None):
        self.name = name
        self._data = list(initial_data) if initial_data else []

    def find_one(self, filter=None, projection=None, *args, **kwargs):
        if not filter:
            return dict(self._data[0]) if self._data else None
        for item in self._data:
            match = True
            for k, v in filter.items():
                if k == "_id":
                    if str(item.get("_id")) != str(v) and item.get("_id") != v:
                        match = False
                        break
                elif item.get(k) != v:
                    match = False
                    break
            if match:
                return dict(item)
        return None

    def find(self, filter=None, *args, **kwargs):
        matching = []
        for item in self._data:
            if not filter:
                matching.append(dict(item))
                continue
            match = True
            for k, v in filter.items():
                if k == "_id":
                    if str(item.get("_id")) != str(v) and item.get("_id") != v:
                        match = False
                        break
                elif item.get(k) != v:
                    match = False
                    break
            if match:
                matching.append(dict(item))

        class Cursor:
            def __init__(self, items):
                self._items = items
            def sort(self, *a, **k): return self
            def limit(self, *a, **k): return self
            def __iter__(self): return iter(self._items)
        return Cursor(matching)

    def insert_one(self, doc):
        if "_id" not in doc:
            doc["_id"] = ObjectId()
        self._data.append(doc)
        return InsertResult(doc["_id"])

    def update_one(self, filter, update, *args, **kwargs):
        doc = self.find_one(filter)
        if not doc:
            return
        for item in self._data:
            if str(item.get("_id")) == str(doc.get("_id")):
                if "$set" in update:
                    item.update(update["$set"])
                if "$push" in update:
                    for k, v in update["$push"].items():
                        if k not in item:
                            item[k] = []
                        item[k].append(v)
                break

    def count_documents(self, filter=None, *args, **kwargs):
        if not filter:
            return len(self._data)
        count = 0
        for item in self._data:
            match = True
            for k, v in filter.items():
                if k == "_id":
                    if str(item.get("_id")) != str(v) and item.get("_id") != v:
                        match = False
                        break
                elif item.get(k) != v:
                    match = False
                    break
            if match:
                count += 1
        return count

_safe_users = SafeCollection("users", [make_demo_user()])
_safe_fraud = SafeCollection("fraud_logs")
_safe_txn   = SafeCollection("transaction_logs")

# Shorthand collections
def users():
    if mongo and getattr(mongo, "db", None) is not None:
        try:
            return mongo.db.users
        except Exception:
            pass
    return _safe_users

def fraud_logs():
    if mongo and getattr(mongo, "db", None) is not None:
        try:
            return mongo.db.fraud_logs
        except Exception:
            pass
    return _safe_fraud

def txn_logs():
    if mongo and getattr(mongo, "db", None) is not None:
        try:
            return mongo.db.transaction_logs
        except Exception:
            pass
    return _safe_txn

# ── Helpers ────────────────────────────────────────────────────
def obj_to_dict(doc):
    """Convert MongoDB doc to JSON-safe dict."""
    if doc is None:
        return None
    doc = dict(doc)
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc

def rule_fraud_score(amt, txn_type, vpa, acct_age, hour_bucket, message):
    """
    Rule-based XGBoost-inspired scoring (6 risk dimensions).
    Replace with real model predictions when model file is present.
    """
    amt_r  = 82 if amt > 50000 else (52 if amt > 10000 else (26 if amt > 2000 else 10))
    time_r = 74 if hour_bucket == "night" else (32 if hour_bucket == "eve" else 12)
    acc_r  = 92 if acct_age == "fresh" else (62 if acct_age == "new" else (26 if acct_age == "mid" else 8))

    scam_vpa = ["lottery","prize","lucky","win","kyc","update","verify","refund","helpline","reward"]
    vpa_r = 10
    if any(w in vpa.lower() for w in scam_vpa): vpa_r += 56
    if len([c for c in vpa if c.isdigit()]) > 5: vpa_r += 22
    trusted = ["okaxis","oksbi","okhdfcbank","okicici","ybl","apl","upi","paytm","gpay","phonepe","bhim"]
    if vpa and not any(t in vpa.lower() for t in trusted): vpa_r += 18
    vpa_r = min(vpa_r, 98)

    scam_words = ["lottery","prize","won","kyc","otp","verify","refund","reward","bonus",
                  "urgent","arrested","police","block","suspended","invest","double","guaranteed"]
    hits  = sum(1 for w in scam_words if w in message.lower())
    msg_r = min(10 + hits * 23, 98)

    type_r = {"collect": 72, "unknown": 86, "merchant": 14}.get(txn_type, 18)

    overall = round(
        amt_r * 0.14 + time_r * 0.10 + acc_r * 0.18 +
        vpa_r * 0.22 + msg_r * 0.28 + type_r * 0.08
    )
    return {
        "overall": overall,
        "breakdown": {
            "message_keywords": msg_r,
            "vpa_pattern":      vpa_r,
            "account_age":      acc_r,
            "amount":           amt_r,
            "time_of_day":      time_r,
            "txn_type":         type_r,
        }
    }

# ══════════════════════════════════════════════════════════════════
# FRONTEND ROUTES
# ══════════════════════════════════════════════════════════════════

@app.route("/")
def index():
    return render_template("index.html")

# ══════════════════════════════════════════════════════════════════
# AUTH API
# ══════════════════════════════════════════════════════════════════

@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.json or {}
    name  = data.get("name", "").strip()
    email = data.get("email", "").strip().lower()
    phone = data.get("phone", "").strip()
    password = data.get("password", "")

    if not all([name, email, phone, password]):
        return jsonify({"error": "All fields required"}), 400
    if users().find_one({"email": email}):
        return jsonify({"error": "Email already registered"}), 409

    hashed_pw = bcrypt.generate_password_hash(password).decode("utf-8")
    new_user = {
        "name":           name,
        "email":          email,
        "phone":          phone,
        "password":       hashed_pw,
        "balance":        4820.50,
        "spent_today":    0.0,
        "spent_month":    0.0,
        "monthly_limit":  8000.0,
        "daily_limit":    2000.0,
        "txn_limit":      5000.0,
        "notify_pct":     80,
        "cat_limits":     {"food": 3000, "shopping": 2000, "travel": 1500, "other": 2500},
        "cat_spent":      {"food": 0, "shopping": 0, "travel": 0, "other": 0},
        "goals":          [],
        "upi_id":         f"{name.lower().replace(' ', '')}@shieldwise",
        "avatar":         name[0].upper(),
        "created_at":     datetime.datetime.utcnow(),
        "updated_at":     datetime.datetime.utcnow(),
    }
    result = users().insert_one(new_user)
    token  = create_access_token(identity=str(result.inserted_id))
    return jsonify({"token": token, "user": {"name": name, "email": email}}), 201


@app.route("/api/auth/login", methods=["POST"])
def login():
    data  = request.json or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    # Seamless Demo Account Login
    if email == DEMO_EMAIL and (password == "test1234" or not password):
        demo_user = users().find_one({"email": DEMO_EMAIL})
        if not demo_user:
            demo_user = make_demo_user()
            users().insert_one(demo_user)
        token = create_access_token(identity=str(demo_user["_id"]))
        return jsonify({
            "token": token,
            "user":  {"name": demo_user["name"], "email": demo_user["email"], "avatar": demo_user.get("avatar", "D")}
        }), 200

    user = users().find_one({"email": email})
    if not user or not bcrypt.check_password_hash(user["password"], password):
        return jsonify({"error": "Invalid email or password. Use test@shieldwise.com / test1234 for demo"}), 401

    token = create_access_token(identity=str(user["_id"]))
    return jsonify({
        "token": token,
        "user":  {"name": user["name"], "email": user["email"], "avatar": user.get("avatar", "A")}
    }), 200

# ══════════════════════════════════════════════════════════════════
# PROFILE API
# ══════════════════════════════════════════════════════════════════

@app.route("/api/profile", methods=["GET"])
@jwt_required()
def get_profile():
    uid  = get_jwt_identity()
    user = users().find_one({"_id": ObjectId(uid)})
    if not user:
        if uid == DEMO_USER_ID:
            user = make_demo_user()
            users().insert_one(user)
        else:
            return jsonify({"error": "User not found"}), 404
    user.pop("password", None)
    return jsonify(obj_to_dict(user)), 200


@app.route("/api/profile", methods=["PUT"])
@jwt_required()
def update_profile():
    uid  = get_jwt_identity()
    data = request.json or {}

    allowed = ["name", "phone", "upi_id", "monthly_limit", "daily_limit",
               "txn_limit", "notify_pct", "cat_limits"]
    update = {k: v for k, v in data.items() if k in allowed}
    update["updated_at"] = datetime.datetime.utcnow()

    if "name" in update:
        update["avatar"] = update["name"][0].upper()

    users().update_one({"_id": ObjectId(uid)}, {"$set": update})
    return jsonify({"message": "Profile updated"}), 200

# ══════════════════════════════════════════════════════════════════
# FRAUD CHECK API
# ══════════════════════════════════════════════════════════════════

@app.route("/api/fraud/check", methods=["POST"])
@jwt_required()
def fraud_check():
    uid  = get_jwt_identity()
    data = request.json or {}

    amt         = float(data.get("amount", 0))
    txn_type    = data.get("txn_type", "p2p")
    vpa         = data.get("vpa", "")
    acct_age    = data.get("acct_age", "old")
    hour_bucket = data.get("hour_bucket", "day")
    message     = data.get("message", "")

    if USE_MODEL:
        try:
            import numpy as np
            features = np.array([[amt, txn_type, vpa, acct_age, hour_bucket, message]])
            score = int(FRAUD_MODEL.predict_proba(features)[0][1] * 100)
            breakdown = {}
        except Exception:
            result = rule_fraud_score(amt, txn_type, vpa, acct_age, hour_bucket, message)
            score = result["overall"]
            breakdown = result["breakdown"]
    else:
        result    = rule_fraud_score(amt, txn_type, vpa, acct_age, hour_bucket, message)
        score     = result["overall"]
        breakdown = result["breakdown"]

    verdict = "danger" if score >= 60 else ("warn" if score >= 35 else "safe")

    # Persist to MongoDB if available
    try:
        log_entry = {
            "user_id":      uid,
            "amount":       amt,
            "txn_type":     txn_type,
            "vpa":          vpa,
            "acct_age":     acct_age,
            "hour_bucket":  hour_bucket,
            "message":      message,
            "score":        score,
            "verdict":      verdict,
            "breakdown":    breakdown,
            "checked_at":   datetime.datetime.utcnow(),
        }
        fraud_logs().insert_one(log_entry)
    except Exception as e:
        print(f"MongoDB log warning: {e}")

    return jsonify({
        "score":     score,
        "verdict":   verdict,
        "breakdown": breakdown
    }), 200


@app.route("/api/fraud/history", methods=["GET"])
@jwt_required()
def fraud_history():
    uid    = get_jwt_identity()
    limit  = int(request.args.get("limit", 20))
    cursor = fraud_logs().find(
        {"user_id": uid},
        {"_id": 0, "user_id": 0}
    ).sort("checked_at", -1).limit(limit)
    return jsonify(json.loads(dumps(list(cursor)))), 200

# ══════════════════════════════════════════════════════════════════
# TRANSACTIONS API
# ══════════════════════════════════════════════════════════════════

@app.route("/api/transactions", methods=["POST"])
@jwt_required()
def add_transaction():
    uid  = get_jwt_identity()
    data = request.json or {}
    amt  = float(data.get("amount", 0))
    cat  = data.get("category", "other")
    note = data.get("note", "")

    user = users().find_one({"_id": ObjectId(uid)})
    if not user:
        return jsonify({"error": "User not found"}), 404

    # Limit checks
    txn_limit    = user.get("txn_limit", 5000)
    daily_limit  = user.get("daily_limit", 2000)
    monthly_limit= user.get("monthly_limit", 8000)
    notify_pct   = user.get("notify_pct", 80)

    if amt > txn_limit:
        return jsonify({"error": "blocked", "reason": "Exceeds per-transaction limit"}), 400

    new_spent_today  = user.get("spent_today", 0) + amt
    new_spent_month  = user.get("spent_month", 0) + amt
    new_cat_spent    = dict(user.get("cat_spent", {}))
    new_cat_spent[cat] = new_cat_spent.get(cat, 0) + amt
    new_balance      = user.get("balance", 0) - amt
    monthly_pct      = round(new_spent_month / monthly_limit * 100)

    users().update_one({"_id": ObjectId(uid)}, {"$set": {
        "balance":     new_balance,
        "spent_today": new_spent_today,
        "spent_month": new_spent_month,
        "cat_spent":   new_cat_spent,
        "updated_at":  datetime.datetime.utcnow(),
    }})

    txn = {
        "user_id":    uid,
        "amount":     amt,
        "category":   cat,
        "note":       note,
        "balance_after": new_balance,
        "created_at": datetime.datetime.utcnow(),
    }
    txn_logs().insert_one(txn)

    warnings = []
    if new_spent_today > daily_limit:
        warnings.append("daily_limit_exceeded")
    if monthly_pct >= 100:
        warnings.append("monthly_limit_reached")
    elif monthly_pct >= notify_pct:
        warnings.append(f"monthly_{monthly_pct}pct_used")

    return jsonify({
        "balance":       new_balance,
        "spent_today":   new_spent_today,
        "spent_month":   new_spent_month,
        "monthly_pct":   monthly_pct,
        "warnings":      warnings,
    }), 200


@app.route("/api/transactions", methods=["GET"])
@jwt_required()
def get_transactions():
    uid   = get_jwt_identity()
    limit = int(request.args.get("limit", 10))
    cursor = txn_logs().find(
        {"user_id": uid},
        {"_id": 0, "user_id": 0}
    ).sort("created_at", -1).limit(limit)
    return jsonify(json.loads(dumps(list(cursor)))), 200

# ══════════════════════════════════════════════════════════════════
# GOALS API
# ══════════════════════════════════════════════════════════════════

@app.route("/api/goals", methods=["GET"])
@jwt_required()
def get_goals():
    uid  = get_jwt_identity()
    user = users().find_one({"_id": ObjectId(uid)}, {"goals": 1})
    return jsonify(user.get("goals", []) if user else []), 200


@app.route("/api/goals", methods=["POST"])
@jwt_required()
def add_goal():
    uid  = get_jwt_identity()
    data = request.json or {}
    goal = {
        "id":         str(ObjectId()),
        "name":       data.get("name", ""),
        "target":     float(data.get("target", 0)),
        "saved":      0.0,
        "monthly":    float(data.get("monthly", 500)),
        "icon_key":   data.get("icon_key", "savings"),
        "icon_ti":    data.get("icon_ti", "ti-coin"),
        "icon_bg":    data.get("icon_bg", "#fefce8"),
        "icon_fg":    data.get("icon_fg", "#a16207"),
        "created_at": datetime.datetime.utcnow().isoformat(),
    }
    users().update_one({"_id": ObjectId(uid)}, {"$push": {"goals": goal}})
    return jsonify(goal), 201


@app.route("/api/goals/<goal_id>/deposit", methods=["POST"])
@jwt_required()
def deposit_goal(goal_id):
    uid  = get_jwt_identity()
    data = request.json or {}
    amt  = float(data.get("amount", 0))

    user = users().find_one({"_id": ObjectId(uid)})
    if not user:
        return jsonify({"error": "User not found"}), 404
    if amt > user.get("balance", 0):
        return jsonify({"error": "Insufficient balance"}), 400

    goals = user.get("goals", [])
    for g in goals:
        if g["id"] == goal_id:
            g["saved"] = round(g["saved"] + amt, 2)
            break
    else:
        return jsonify({"error": "Goal not found"}), 404

    new_balance = round(user["balance"] - amt, 2)
    users().update_one({"_id": ObjectId(uid)}, {"$set": {
        "goals":   goals,
        "balance": new_balance,
    }})
    return jsonify({"balance": new_balance, "goals": goals}), 200

# ══════════════════════════════════════════════════════════════════
# DASHBOARD / STATS API
# ══════════════════════════════════════════════════════════════════

@app.route("/api/stats", methods=["GET"])
@jwt_required()
def get_stats():
    uid = get_jwt_identity()
    total_checks = fraud_logs().count_documents({"user_id": uid})
    frauds_caught = fraud_logs().count_documents({"user_id": uid, "verdict": "danger"})
    safe_passed   = fraud_logs().count_documents({"user_id": uid, "verdict": "safe"})
    return jsonify({
        "total_checks":  total_checks,
        "frauds_caught": frauds_caught,
        "safe_passed":   safe_passed,
    }), 200

# ══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("🛡️  ShieldWise server starting…")
    print("📦  MongoDB:", app.config["MONGO_URI"][:40] + "…")
    app.run(debug=os.getenv("FLASK_DEBUG", "True") == "True", port=5000)
