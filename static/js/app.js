/* ══════════════════════════════════════════════════
   ShieldWise — Frontend JS
   Talks to Flask API at /api/*
   JWT stored in localStorage
══════════════════════════════════════════════════ */

var TOKEN    = localStorage.getItem("sw_token") || "";
var USER     = JSON.parse(localStorage.getItem("sw_user") || "null");
var STATE    = { balance:0, spentToday:0, spentMonth:0, monthlyLimit:8000, dailyLimit:2000, txnLimit:5000, notifPct:80, goals:[], catSpent:{food:0,shopping:0,travel:0,other:0}, catLimits:{food:3000,shopping:2000,travel:1500,other:2500} };
var SEL_ICON = null;
var PAGES    = ["home","check","limits","goals","profile","alerts"];
var PAGE_TITLES = {home:"Home",check:"Fraud Check",limits:"Spend Limits",goals:"Save Goals",profile:"Profile",alerts:"Alerts"};
var LOCAL_ALERTS = [];

var ICONS = [
  {k:"travel",  ti:"ti-plane",           lbl:"Travel",   bg:"#eff6ff",fg:"#3b82f6"},
  {k:"phone",   ti:"ti-device-mobile",   lbl:"Phone",    bg:"#f5f3ff",fg:"#8b5cf6"},
  {k:"home2",   ti:"ti-home",            lbl:"Home",     bg:"#fdf2f8",fg:"#ec4899"},
  {k:"car",     ti:"ti-car",             lbl:"Vehicle",  bg:"#fefce8",fg:"#ca8a04"},
  {k:"edu",     ti:"ti-book",            lbl:"Education",bg:"#f0fdf4",fg:"#16a34a"},
  {k:"health",  ti:"ti-heart",           lbl:"Health",   bg:"#fff1f2",fg:"#e11d48"},
  {k:"gift",    ti:"ti-gift",            lbl:"Gift",     bg:"#fefce8",fg:"#d97706"},
  {k:"emerg",   ti:"ti-shield",          lbl:"Emergency",bg:"#eff6ff",fg:"#2563eb"},
  {k:"camera",  ti:"ti-camera",          lbl:"Camera",   bg:"#faf5ff",fg:"#9333ea"},
  {k:"ring",    ti:"ti-diamond",         lbl:"Wedding",  bg:"#fdf2f8",fg:"#be185d"},
  {k:"laptop",  ti:"ti-device-laptop",   lbl:"Laptop",   bg:"#ecfdf5",fg:"#047857"},
  {k:"baby",    ti:"ti-baby-carriage",   lbl:"Baby",     bg:"#fff7ed",fg:"#ea580c"},
  {k:"run",     ti:"ti-run",             lbl:"Fitness",  bg:"#f0fdf4",fg:"#16a34a"},
  {k:"food",    ti:"ti-tools-kitchen-2", lbl:"Food",     bg:"#fff1f2",fg:"#e11d48"},
  {k:"game",    ti:"ti-device-gamepad-2",lbl:"Gaming",   bg:"#faf5ff",fg:"#9333ea"},
  {k:"coin",    ti:"ti-coin",            lbl:"Savings",  bg:"#fefce8",fg:"#a16207"}
];
SEL_ICON = ICONS[0];

/* ══ API HELPER ════════════════════════════════════════ */
async function api(method, path, body) {
  var opts = {
    method: method,
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + TOKEN }
  };
  if (body) opts.body = JSON.stringify(body);
  var res = await fetch(path, opts);
  var data = await res.json();
  if (!res.ok) throw data;
  return data;
}

/* ══ AUTH ══════════════════════════════════════════════ */
function authTab(t) {
  ["login","register"].forEach(function(x) {
    document.getElementById("tab-"+x).classList.toggle("active", x===t);
    document.getElementById("form-"+x).style.display = x===t ? "" : "none";
  });
}

function fillDemoLogin() {
  document.getElementById("l-email").value = "test@shieldwise.com";
  document.getElementById("l-pass").value = "test1234";
  doLogin();
}

async function doLogin() {
  var email = document.getElementById("l-email").value.trim();
  var pass  = document.getElementById("l-pass").value;
  document.getElementById("l-err").textContent = "";
  try {
    var res = await api("POST", "/api/auth/login", {email:email, password:pass});
    TOKEN = res.token; USER = res.user;
    localStorage.setItem("sw_token", TOKEN);
    localStorage.setItem("sw_user", JSON.stringify(USER));
    startApp();
  } catch(e) {
    document.getElementById("l-err").textContent = e.error || "Login failed";
  }
}

async function doRegister() {
  var name  = document.getElementById("r-name").value.trim();
  var email = document.getElementById("r-email").value.trim();
  var phone = document.getElementById("r-phone").value.trim();
  var pass  = document.getElementById("r-pass").value;
  document.getElementById("r-err").textContent = "";
  try {
    var res = await api("POST", "/api/auth/register", {name:name, email:email, phone:phone, password:pass});
    TOKEN = res.token; USER = res.user;
    localStorage.setItem("sw_token", TOKEN);
    localStorage.setItem("sw_user", JSON.stringify(USER));
    startApp();
  } catch(e) {
    document.getElementById("r-err").textContent = e.error || "Registration failed";
  }
}

function doLogout() {
  TOKEN = ""; USER = null;
  localStorage.removeItem("sw_token");
  localStorage.removeItem("sw_user");
  document.getElementById("shell").classList.remove("in");
  document.getElementById("splash").classList.remove("show","out");
  document.getElementById("wflip").classList.remove("in","out");
  document.getElementById("auth-overlay").classList.remove("hidden");
}

/* ══ BOOT ══════════════════════════════════════════════ */
window.onload = function() {
  if (TOKEN && USER) {
    startApp();
  } else {
    document.getElementById("auth-overlay").classList.remove("hidden");
  }
};

async function startApp() {
  document.getElementById("auth-overlay").classList.add("hidden");

  /* Splash */
  document.getElementById("splash").classList.add("show");
  setTimeout(function() { document.getElementById("splash").classList.add("out"); }, 2200);

  /* Wallet flip */
  setTimeout(function() { document.getElementById("wflip").classList.add("in"); }, 2700);

  /* Load data then show app */
  setTimeout(async function() {
    document.getElementById("wflip").classList.add("out");
    await loadProfile();
    await loadGoals();
    await loadFraudHistory();
    await loadStats();
    document.getElementById("shell").classList.add("in");
    animIn("ha1", 120);
    animIn("ha2", 280);
    animIn("ha3", 420);
  }, 4400);
}

function animIn(id, delay) {
  setTimeout(function() {
    var el = document.getElementById(id);
    if (el) el.classList.add("in");
  }, delay);
}

/* ══ PROFILE ══════════════════════════════════════════ */
async function loadProfile() {
  try {
    var p = await api("GET", "/api/profile");
    STATE.balance      = p.balance      || 0;
    STATE.spentToday   = p.spent_today  || 0;
    STATE.spentMonth   = p.spent_month  || 0;
    STATE.monthlyLimit = p.monthly_limit|| 8000;
    STATE.dailyLimit   = p.daily_limit  || 2000;
    STATE.txnLimit     = p.txn_limit    || 5000;
    STATE.notifPct     = p.notify_pct   || 80;
    STATE.catSpent     = p.cat_spent    || {food:0,shopping:0,travel:0,other:0};
    STATE.catLimits    = p.cat_limits   || {food:3000,shopping:2000,travel:1500,other:2500};
    STATE.goals        = p.goals        || [];
    USER = { name:p.name, email:p.email, avatar:p.avatar||"A", upi_id:p.upi_id||"", phone:p.phone||"" };
    localStorage.setItem("sw_user", JSON.stringify(USER));

    /* Card name & balance in wallet flip screen */
    setTxt("card-name", (p.name||"USER").toUpperCase());
    setTxt("card-bal",  "₹"+Math.round(p.balance||0).toLocaleString("en-IN"));

    updateUI();
    renderProfilePage(p);
    renderHomeGoals();
    renderGoals();
    renderPicker();
    renderCats();
  } catch(e) { console.error("Profile load failed", e); }
}

function updateUI() {
  var b = "₹"+STATE.balance.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
  var s = "Spent today: ₹"+STATE.spentToday.toLocaleString("en-IN");
  setTxt("h-bal",          b);
  setTxt("d-bal",          b);
  setTxt("h-spent-label",  s+" · Safe to spend");
  setTxt("d-spent",        s);
  setTxt("h-month",        "₹"+STATE.spentMonth.toLocaleString("en-IN"));
  setTxt("h-limit",        "₹"+STATE.monthlyLimit.toLocaleString("en-IN"));
  setTxt("h-goals-count",  STATE.goals.length);
  var firstName = (USER && USER.name) ? USER.name.split(" ")[0] : "User";
  setTxt("h-greet-name",   firstName+" 👋");
  var av = (USER && USER.avatar) ? USER.avatar : "A";
  setTxt("d-avatar", av);
  setTxt("m-avatar", av);
}

function setTxt(id, v) {
  var el = document.getElementById(id);
  if (el) el.textContent = v;
}

function renderProfilePage(p) {
  setTxt("p-avatar", p.avatar || "A");
  setTxt("p-name",   p.name   || "");
  setTxt("p-email",  p.email  || "");
  setTxt("p-upi",    p.upi_id || "");
  var ni = document.getElementById("p-name-inp");  if (ni) ni.value = p.name    || "";
  var pi = document.getElementById("p-phone-inp"); if (pi) pi.value = p.phone   || "";
  var ui = document.getElementById("p-upi-inp");   if (ui) ui.value = p.upi_id  || "";
}

async function saveProfile() {
  var name  = document.getElementById("p-name-inp").value.trim();
  var phone = document.getElementById("p-phone-inp").value.trim();
  var upi   = document.getElementById("p-upi-inp").value.trim();
  try {
    await api("PUT", "/api/profile", {name:name, phone:phone, upi_id:upi});
    await loadProfile();
    toast("Profile saved!", "success");
  } catch(e) { toast("Failed to save profile", "danger"); }
}

/* ══ FRAUD CHECK ══════════════════════════════════════ */
async function doCheck() {
  var amt  = parseFloat(document.getElementById("f-amt").value)  || 0;
  var tt   = document.getElementById("f-type").value;
  var vpa  = document.getElementById("f-vpa").value.trim();
  var ag   = document.getElementById("f-age").value;
  var tm   = document.getElementById("f-time").value;
  var msg  = document.getElementById("f-msg").value.trim();
  var btn  = document.getElementById("fcheckBtn");
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin .8s linear infinite"></i> Checking…';
  injectSpin();
  try {
    var res = await api("POST", "/api/fraud/check", {
      amount: amt, txn_type: tt, vpa: vpa,
      acct_age: ag, hour_bucket: tm, message: msg
    });
    renderFraudResult(res, vpa);
    await loadFraudHistory();
    await loadStats();
    pushLocalAlert(res.verdict, "Fraud check complete",
      "VPA: "+(vpa||"—")+" → Score: "+res.score+"/100", res.verdict);
  } catch(e) {
    toast("Check failed — is the server running?", "danger");
  }
  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-shield-search"></i> Check again';
}

function renderFraudResult(s, vpa) {
  var o = s.score, cls = s.verdict;
  var TI  = {safe:"Looks safe to pay", warn:"Verify before sending", danger:"Do not pay — likely a scam"};
  var BDR = {safe:"#d1fae5", warn:"#fde68a", danger:"#fecaca"};
  var BG  = {safe:"#f0fdf4", warn:"#fffbeb", danger:"#fef2f2"};
  var BC  = {safe:"#10b981", warn:"#f59e0b", danger:"#ef4444"};
  var IC  = {safe:"ti-shield-check", warn:"ti-alert-triangle", danger:"ti-shield-off"};
  var ICC = {safe:"#059669", warn:"#d97706", danger:"#dc2626"};
  var bd  = s.breakdown || {};
  var rows = [
    {n:"Message keywords", v:bd.message_keywords||0},
    {n:"UPI ID pattern",   v:bd.vpa_pattern||0},
    {n:"Account age",      v:bd.account_age||0},
    {n:"Amount",           v:bd.amount||0},
    {n:"Time of day",      v:bd.time_of_day||0},
    {n:"Txn type",         v:bd.txn_type||0}
  ];
  var sh = rows.map(function(r) {
    var dc = r.v>=60 ? "#ef4444" : r.v>=35 ? "#f59e0b" : "#10b981";
    return '<div style="display:flex;align-items:center;gap:8px;padding:7px 14px;border-bottom:.5px solid #e2e8f0">'
      +'<span style="width:7px;height:7px;border-radius:50%;background:'+dc+';flex-shrink:0;display:inline-block"></span>'
      +'<span style="font-size:12px;flex:1;color:#0f172a">'+r.n+'</span>'
      +'<div style="width:70px;height:4px;background:#f1f5f9;border-radius:2px;overflow:hidden"><div style="width:'+r.v+'%;height:100%;background:'+dc+'"></div></div>'
      +'<span style="font-size:12px;font-weight:500;min-width:24px;text-align:right">'+r.v+'</span></div>';
  }).join("");

  document.getElementById("f-result").innerHTML =
    '<div style="border:1px solid '+BDR[cls]+';background:'+BG[cls]+';border-radius:12px;overflow:hidden;margin-bottom:12px">'
    +'<div style="padding:14px 16px;display:flex;align-items:center;gap:12px">'
    +'<div style="width:46px;height:46px;border-radius:12px;background:'+BDR[cls]+';display:flex;align-items:center;justify-content:center;flex-shrink:0">'
    +'<i class="ti '+IC[cls]+'" style="font-size:22px;color:'+ICC[cls]+'"></i></div>'
    +'<div style="flex:1"><div style="font-size:15px;font-weight:600;color:#0f172a;margin-bottom:2px">'+TI[cls]+'</div>'
    +'<div style="font-size:12px;color:#64748b">'+(vpa||"No UPI ID entered")+'</div></div>'
    +'<div style="padding:5px 12px;border-radius:999px;background:'+BDR[cls]+';font-size:13px;font-weight:600;color:'+ICC[cls]+'">'+o+'/100</div></div>'
    +'<div style="padding:0 16px 14px"><div style="height:8px;background:rgba(0,0,0,.08);border-radius:4px;overflow:hidden">'
    +'<div style="width:'+o+'%;height:100%;background:'+BC[cls]+';border-radius:4px"></div></div></div></div>'
    +'<div class="card"><div style="padding:10px 14px;border-bottom:.5px solid #e2e8f0;font-size:12px;font-weight:600;color:#0f172a">Risk breakdown</div>'+sh+'</div>';
}

async function loadFraudHistory() {
  try {
    var hist = await api("GET", "/api/fraud/history?limit=5");
    var html = hist.length ? hist.map(function(h) {
      var dt = h.checked_at
        ? new Date(h.checked_at.$date || h.checked_at).toLocaleString("en-IN",{hour12:true,hour:"2-digit",minute:"2-digit",day:"numeric",month:"short"})
        : "—";
      return '<div class="fraud-hist-row">'
        +'<span class="fhr-badge '+h.verdict+'">'+h.score+'/100</span>'
        +'<span style="flex:1;font-size:12px;color:#0f172a;margin:0 10px">'+(h.vpa||"No VPA")+'</span>'
        +'<span style="font-size:11px;color:#94a3b8">'+dt+'</span></div>';
    }).join("")
    : '<div class="empty-state" style="padding:18px"><i class="ti ti-shield"></i><p>No checks yet</p></div>';

    ["fraud-history-list","home-fraud-history","profile-fraud-log"].forEach(function(id) {
      var el = document.getElementById(id); if (el) el.innerHTML = html;
    });
  } catch(e) { console.error("Fraud history load failed", e); }
}

/* ══ STATS ════════════════════════════════════════════ */
async function loadStats() {
  try {
    var s = await api("GET", "/api/stats");
    setTxt("st-total",  s.total_checks);
    setTxt("st-frauds", s.frauds_caught);
    setTxt("st-safe",   s.safe_passed);
  } catch(e) {}
}

/* ══ GOALS ════════════════════════════════════════════ */
async function loadGoals() {
  try {
    STATE.goals = await api("GET", "/api/goals");
    renderGoals();
    renderPicker();
    renderHomeGoals();
    setTxt("h-goals-count", STATE.goals.length);
  } catch(e) { console.error("Goals load failed", e); }
}

function renderGoals() {
  var el = document.getElementById("goalsContainer");
  if (!el) return;
  if (!STATE.goals.length) {
    el.innerHTML = '<div class="empty-state"><i class="ti ti-target"></i><p>No goals yet — add your first one below.</p></div>';
    return;
  }
  el.innerHTML = STATE.goals.map(function(g) {
    var pct    = Math.min(Math.round((g.saved||0) / g.target * 100), 100);
    var rem    = Math.max(g.target - (g.saved||0), 0);
    var months = rem > 0 ? Math.ceil(rem / (g.monthly||1)) : 0;
    var done   = pct >= 100;
    return '<div class="goal-card"><div class="goal-inner">'
      +'<div class="goal-top">'
      +'<div class="goal-ico" style="background:'+(g.icon_bg||"#fefce8")+'"><i class="ti '+(g.icon_ti||"ti-coin")+'" style="color:'+(g.icon_fg||"#a16207")+'"></i></div>'
      +'<div style="flex:1"><div class="goal-name">'+g.name+'</div><div class="goal-tgt">Target ₹'+g.target.toLocaleString("en-IN")+'</div></div>'
      +'<div style="text-align:right"><div class="goal-saved">₹'+(g.saved||0).toLocaleString("en-IN")+'</div>'
      +'<div class="goal-pct'+(done?" done":"")+'">'+pct+'% saved</div></div></div>'
      +'<div class="goal-bar-bg"><div class="goal-bar-fill" style="width:'+pct+'%;background:'+(done?"#10b981":"#7c3aed")+'"></div></div>'
      +'<div class="goal-range"><span>₹0</span><span>₹'+g.target.toLocaleString("en-IN")+'</span></div></div>'
      +'<div class="goal-stats">'
      +'<div class="goal-stat"><div class="goal-stat-v">₹'+(g.saved||0).toLocaleString("en-IN")+'</div><div class="goal-stat-l">Saved</div></div>'
      +'<div class="goal-stat"><div class="goal-stat-v">₹'+rem.toLocaleString("en-IN")+'</div><div class="goal-stat-l">Remaining</div></div>'
      +'<div class="goal-stat"><div class="goal-stat-v">'+(done?"Done!":months+" mo")+'</div><div class="goal-stat-l">'+(done?"Achieved":"To go")+'</div></div>'
      +'</div></div>';
  }).join("");
}

function renderHomeGoals() {
  var el = document.getElementById("home-goals");
  if (!el) return;
  if (!STATE.goals.length) {
    el.innerHTML = '<div class="empty-state"><i class="ti ti-target"></i><p>No goals yet</p></div>';
    return;
  }
  el.innerHTML = STATE.goals.slice(0, 4).map(function(g) {
    var pct = Math.min(Math.round((g.saved||0) / g.target * 100), 100);
    return '<div class="gm">'
      +'<div class="gm-ico" style="background:'+(g.icon_bg||"#fefce8")+'">'
      +'<i class="ti '+(g.icon_ti||"ti-coin")+'" style="color:'+(g.icon_fg||"#a16207")+'"></i></div>'
      +'<div class="gm-name">'+g.name+'</div>'
      +'<div class="gm-pct">'+pct+'% saved</div>'
      +'<div class="gm-bar"><div class="gm-fill" style="width:'+pct+'%"></div></div></div>';
  }).join("");
}

function renderPicker() {
  var el = document.getElementById("g-pick");
  if (!el) return;
  el.innerHTML = STATE.goals.map(function(g) {
    return '<option value="'+g.id+'">'+g.name+'</option>';
  }).join("");
}

function buildIconGrid() {
  var el = document.getElementById("iconGrid");
  if (!el) return;
  el.innerHTML = ICONS.map(function(ic) {
    var sel = ic.k === SEL_ICON.k;
    return '<div class="icon-opt'+(sel?" sel":"")+'" onclick="pickIcon(\''+ic.k+'\')"'
      +' style="background:'+ic.bg+';border-color:'+(sel?"#7c3aed":"#e2e8f0")+'">'
      +'<i class="ti '+ic.ti+'" style="color:'+ic.fg+'"></i>'
      +'<span class="icon-opt-l">'+ic.lbl+'</span></div>';
  }).join("");
}

function pickIcon(k) {
  SEL_ICON = ICONS.find(function(i) { return i.k === k; }) || ICONS[0];
  buildIconGrid();
}

function toggleGoalForm() {
  var f = document.getElementById("goalForm");
  f.classList.toggle("open");
  if (f.classList.contains("open")) buildIconGrid();
}

async function addGoal() {
  var name    = document.getElementById("g-name").value.trim();
  var target  = parseFloat(document.getElementById("g-target").value)  || 0;
  var monthly = parseFloat(document.getElementById("g-monthly").value) || 500;
  if (!name || !target) { toast("Enter goal name and target.", "warn"); return; }
  try {
    await api("POST", "/api/goals", {
      name:name, target:target, monthly:monthly,
      icon_key:SEL_ICON.k, icon_ti:SEL_ICON.ti,
      icon_bg:SEL_ICON.bg, icon_fg:SEL_ICON.fg
    });
    await loadGoals();
    document.getElementById("g-name").value    = "";
    document.getElementById("g-target").value  = "";
    document.getElementById("g-monthly").value = "";
    document.getElementById("goalForm").classList.remove("open");
    toast('"'+name+'" added!', "success");
    pushLocalAlert("info", "ti-target", "New goal", '"'+name+'" — ₹'+target.toLocaleString("en-IN")+" target.");
  } catch(e) { toast("Failed to add goal", "danger"); }
}

async function addToGoal() {
  var goalId = document.getElementById("g-pick").value;
  var amt    = parseFloat(document.getElementById("g-add").value) || 0;
  if (!amt)    { toast("Enter an amount.", "warn"); return; }
  if (!goalId) { toast("Select a goal.", "warn"); return; }
  try {
    var res = await api("POST", "/api/goals/"+goalId+"/deposit", {amount:amt});
    STATE.goals   = res.goals;
    STATE.balance = res.balance;
    updateUI(); renderGoals(); renderHomeGoals(); renderPicker();
    document.getElementById("g-add").value = "";
    var g   = STATE.goals.find(function(x) { return x.id === goalId; });
    var pct = g ? Math.round((g.saved||0) / g.target * 100) : 0;
    if (pct >= 100) {
      toast("Goal completed! 🎉", "success");
      pushLocalAlert("success", "ti-trophy", "Goal completed!", "You reached your target!");
    } else {
      toast("₹"+amt.toLocaleString("en-IN")+" added. "+pct+"% reached!", "success");
    }
  } catch(e) { toast(e.error || "Failed", "danger"); }
}

/* ══ LIMITS ══════════════════════════════════════════ */
function renderCats() {
  var el = document.getElementById("catGrid");
  if (!el) return;
  var icons  = {food:"ti-tools-kitchen-2", shopping:"ti-shopping-bag", travel:"ti-plane", other:"ti-dots-circle-horizontal"};
  var colors = {food:"#f97316", shopping:"#8b5cf6", travel:"#06b6d4", other:"#6b7280"};
  el.innerHTML = Object.keys(STATE.catLimits).map(function(k) {
    var lim   = STATE.catLimits[k]  || 1;
    var spent = STATE.catSpent[k]   || 0;
    var pct   = Math.min(Math.round(spent / lim * 100), 100);
    var c     = colors[k]  || "#94a3b8";
    var bar   = pct>=90 ? "#ef4444" : pct>=70 ? "#f59e0b" : c;
    return '<div class="ct"><div class="ct-top">'
      +'<div class="ct-ico" style="background:'+c+'22"><i class="ti '+icons[k]+'" style="color:'+c+'"></i></div>'
      +'<div><div style="font-size:12px;font-weight:600;color:#0f172a">'+cap(k)+'</div>'
      +'<div style="font-size:11px;color:#64748b">'+pct+'% used</div></div></div>'
      +'<div style="height:5px;background:#f1f5f9;border-radius:3px;overflow:hidden;margin-bottom:5px">'
      +'<div style="width:'+pct+'%;height:100%;border-radius:3px;background:'+bar+'"></div></div>'
      +'<div style="display:flex;justify-content:space-between;font-size:11px">'
      +'<span style="font-weight:500;color:#0f172a">₹'+spent.toLocaleString("en-IN")+'</span>'
      +'<span style="color:#94a3b8">/ ₹'+lim.toLocaleString("en-IN")+'</span></div></div>';
  }).join("");

  var mpct = STATE.monthlyLimit > 0 ? Math.round(STATE.spentMonth / STATE.monthlyLimit * 100) : 0;
  setTxt("lo-spent", "₹"+STATE.spentMonth.toLocaleString("en-IN"));
  setTxt("lo-of",    "of ₹"+STATE.monthlyLimit.toLocaleString("en-IN")+" monthly limit");
  setTxt("lo-limit", "₹"+STATE.monthlyLimit.toLocaleString("en-IN"));
  var bc = mpct>=90?"#fee2e2":mpct>=70?"#fef3c7":"#dcfce7";
  var tc = mpct>=90?"#991b1b":mpct>=70?"#92400e":"#166534";
  var fc = mpct>=90?"#ef4444":mpct>=70?"#f59e0b":"#10b981";
  var b  = document.getElementById("lo-badge");
  if (b) { b.style.background=bc; b.style.color=tc; b.textContent=mpct+"%"; }
  setTimeout(function() {
    var bar = document.getElementById("lo-bar");
    if (bar) { bar.style.width=Math.min(mpct,100)+"%"; bar.style.background=fc; }
  }, 50);
}

async function saveLimits() {
  var g = function(id) { return parseFloat(document.getElementById(id).value) || 0; };
  var body = {
    cat_limits: {
      food:     g("l-food")    || STATE.catLimits.food,
      shopping: g("l-shop")   || STATE.catLimits.shopping,
      travel:   g("l-travel") || STATE.catLimits.travel,
      other:    STATE.catLimits.other
    },
    notify_pct: parseInt(document.getElementById("l-notif").value) || 80
  };
  if (g("l-monthly")) body.monthly_limit = g("l-monthly");
  if (g("l-daily"))   body.daily_limit   = g("l-daily");
  if (g("l-txn"))     body.txn_limit     = g("l-txn");
  try {
    await api("PUT", "/api/profile", body);
    await loadProfile();
    toast("Limits saved!", "success");
  } catch(e) { toast("Save failed", "danger"); }
}

async function simSpend() {
  var amt = parseFloat(document.getElementById("s-amt").value) || 0;
  var cat = document.getElementById("s-cat").value;
  if (amt <= 0) { toast("Enter a valid amount.", "warn"); return; }
  try {
    var res = await api("POST", "/api/transactions", {amount:amt, category:cat, note:"Simulated"});
    STATE.balance    = res.balance;
    STATE.spentToday = res.spent_today;
    STATE.spentMonth = res.spent_month;
    STATE.catSpent[cat] = (STATE.catSpent[cat]||0) + amt;
    updateUI(); renderCats();
    var mpct = res.monthly_pct;
    var warns = res.warnings || [];
    if (warns.indexOf("monthly_limit_reached") >= 0) {
      toast("Monthly limit reached!", "danger");
      pushLocalAlert("danger","ti-gauge","Monthly limit reached","100% of monthly budget used.");
    } else if (warns.some(function(w){return w.indexOf("pct")>=0;})) {
      toast(mpct+"% monthly limit used!", "warn");
      pushLocalAlert("warn","ti-gauge","Spending alert "+mpct+"%","Watch your spending this month.");
    } else if (warns.indexOf("daily_limit_exceeded") >= 0) {
      toast("Daily limit exceeded!", "danger");
      pushLocalAlert("danger","ti-clock","Daily limit exceeded","₹"+STATE.spentToday.toLocaleString("en-IN")+" spent today.");
    } else {
      toast("₹"+amt.toLocaleString("en-IN")+" done. "+mpct+"% monthly.", "success");
    }
  } catch(e) { toast(e.error || "Blocked", "danger"); }
}

/* ══ NAV ════════════════════════════════════════════ */
function nav(p) {
  PAGES.forEach(function(x) {
    document.getElementById("page-"+x).classList.remove("show");
    var bn  = document.getElementById("bn-"+x);  if (bn)  bn.classList.remove("act");
    var sbn = document.getElementById("sbn-"+x); if (sbn) sbn.classList.remove("act");
  });
  document.getElementById("page-"+p).classList.add("show");
  var bn  = document.getElementById("bn-"+p);  if (bn)  bn.classList.add("act");
  var sbn = document.getElementById("sbn-"+p); if (sbn) sbn.classList.add("act");
  var dt  = document.getElementById("d-title"); if (dt)  dt.textContent = PAGE_TITLES[p] || p;
  var ac  = document.getElementById("app-content"); if (ac) ac.scrollTop = 0;
  if (p === "limits")  { renderCats(); }
  if (p === "goals")   { renderGoals(); renderPicker(); buildIconGrid(); }
  if (p === "alerts")  { renderAlerts(); }
  if (p === "profile") { if (USER) renderProfilePage(USER); loadStats(); loadFraudHistory(); }
}

/* ══ ALERTS ═════════════════════════════════════════ */
function pushLocalAlert(type, icon, title, body) {
  LOCAL_ALERTS.unshift({type:type, icon:icon, title:title, body:body, time:"Just now"});
  var nb  = document.getElementById("d-nb");      if (nb)  { nb.textContent = LOCAL_ALERTS.length; nb.classList.add("show"); }
  var db  = document.getElementById("d-dbadge");  if (db)  db.style.display = "block";
  var mad = document.getElementById("m-adot");    if (mad) mad.style.display = "block";
  var mnd = document.getElementById("m-nd");      if (mnd) mnd.style.display = "block";
}

function renderAlerts() {
  var nb  = document.getElementById("d-nb");     if (nb)  nb.classList.remove("show");
  var db  = document.getElementById("d-dbadge"); if (db)  db.style.display = "none";
  var mad = document.getElementById("m-adot");   if (mad) mad.style.display = "none";
  var mnd = document.getElementById("m-nd");     if (mnd) mnd.style.display = "none";
  var el  = document.getElementById("alertsList");
  if (!el) return;
  if (!LOCAL_ALERTS.length) {
    el.innerHTML = '<div class="empty-state"><i class="ti ti-bell"></i><p>No notifications yet.</p></div>';
    return;
  }
  el.innerHTML = LOCAL_ALERTS.map(function(a) {
    return '<div class="notif-item '+a.type+'">'
      +'<div class="n-ico '+a.type+'"><i class="ti '+a.icon+'"></i></div>'
      +'<div><div style="font-size:13px;font-weight:600;color:#0f172a;margin-bottom:2px">'+a.title+'</div>'
      +'<div style="font-size:12px;color:#64748b;line-height:1.5">'+a.body+'</div>'
      +'<div style="font-size:10px;color:#94a3b8;margin-top:3px">'+a.time+'</div></div></div>';
  }).join("");
}

/* ══ UTILS ══════════════════════════════════════════ */
function toast(msg, type) {
  var t = document.getElementById("toast");
  t.className = "show " + (type==="danger"?"td":type==="warn"?"tw":"ts");
  document.getElementById("t-msg").textContent = msg;
  document.getElementById("t-ico").className   = "ti " + (type==="danger"?"ti-ban":type==="warn"?"ti-alert-triangle":"ti-check");
  clearTimeout(t._t);
  t._t = setTimeout(function() { t.className = ""; }, 3400);
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function injectSpin() {
  if (!document.getElementById("spin-s")) {
    var s = document.createElement("style");
    s.id = "spin-s";
    s.textContent = "@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}";
    document.head.appendChild(s);
  }
}
