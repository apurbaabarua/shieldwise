# 🛡️ ShieldWise — UPI Scam Detector

Full-stack UPI fraud detection app with:
- **Flask** backend (Python)
- **MongoDB** database (user profiles + fraud logs)
- **XGBoost** fraud scoring model
- **Responsive UI** (mobile + desktop)
- **JWT auth** (login / register)

---

## 📁 Project Structure

```
shieldwise_full/
├── app.py                  ← Flask server (all API routes)
├── .env                    ← MongoDB URI + secrets (edit this)
├── requirements.txt        ← Python dependencies
├── README.md
├── models/
│   └── train_model.py      ← Train & save XGBoost model
├── templates/
│   └── index.html          ← Main HTML page (served by Flask)
└── static/
    ├── css/
    │   └── style.css       ← All styles
    └── js/
        └── app.js          ← Frontend JS (calls Flask API)
```

---

## ⚡ Quick Start (5 steps)

### Step 1 — Install Python dependencies
```bash
pip install -r requirements.txt
```

### Step 2 — Set up MongoDB

**Option A — MongoDB Atlas (free cloud)**
1. Go to https://www.mongodb.com/atlas
2. Create a free cluster
3. Click Connect → Drivers → copy the connection string
4. Paste it into `.env` as `MONGO_URI=...`

**Option B — Local MongoDB**
```bash
# Install MongoDB locally, then in .env use:
MONGO_URI=mongodb://localhost:27017/shieldwise
```

### Step 3 — Configure .env
```
MONGO_URI=mongodb+srv://youruser:yourpass@cluster0.xxxxx.mongodb.net/shieldwise
SECRET_KEY=any-random-string-here
JWT_SECRET_KEY=another-random-string-here
```

### Step 4 — (Optional) Train XGBoost model
```bash
python models/train_model.py
```
> If skipped, the app uses built-in rule-based scoring (same logic, no .pkl needed).

### Step 5 — Run the app
```bash
python app.py
```
Open http://localhost:5000 in your browser.

---

## 🗄️ MongoDB Collections

| Collection | What it stores |
|---|---|
| `users` | Profile, balance, limits, goals, settings |
| `fraud_logs` | Every fraud check with score + breakdown |
| `transaction_logs` | Every simulated payment |

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/profile` | Get full profile |
| PUT | `/api/profile` | Update profile / limits |
| POST | `/api/fraud/check` | Run fraud check (saved to DB) |
| GET | `/api/fraud/history` | Get past fraud checks |
| GET | `/api/stats` | Fraud check stats |
| GET | `/api/goals` | Get savings goals |
| POST | `/api/goals` | Add a goal |
| POST | `/api/goals/<id>/deposit` | Add money to a goal |
| POST | `/api/transactions` | Simulate a payment |
| GET | `/api/transactions` | Get transaction history |

---

## 🧪 Demo Account
Register any account, or use the demo shown on the login screen.

---

## 🚀 VS Code Tips

1. Install **Python** extension
2. Install **Live Server** extension (for static preview)
3. Open terminal → `python app.py`
4. Use **Thunder Client** extension to test API endpoints

---

## 📱 Responsive Breakpoints

| Screen | Layout |
|---|---|
| < 768px | Mobile: bottom nav + full-width |
| ≥ 768px | Desktop: left sidebar + 2-col grid |
| ≥ 1200px | Wide desktop: bigger sidebar + padding |
