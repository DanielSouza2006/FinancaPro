/* =========================================================
   app.js — lógica do painel (depois do login)
   ========================================================= */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Estado da aplicação (dados carregados do servidor)
const state = {
  user: null,
  month: todayISO().slice(0, 7), // "AAAA-MM"
  categories: [],
  transactions: [],
  view: "dashboard",
  charts: {},
};

const TITLES = {
  dashboard: "Painel", transactions: "Lançamentos", budgets: "Orçamentos",
  goals: "Metas", categories: "Categorias", settings: "Configurações",
};

// =========================================================
// Inicialização
// =========================================================
async function init() {
  $("#themeBtn").innerHTML = ICONS.moon;
  $("#themeBtn").addEventListener("click", toggleTheme);
  document.addEventListener("themechange", () => state.view === "dashboard" && loadDashboard());

  state.user = await api("/api/me");
  renderUser();
  await loadCategories();

  bindEvents();
  window.addEventListener("hashchange", route);
  route();
}

function renderUser() {
  const u = state.user;
  $("#userName").textContent = u.name;
  $("#userEmail").textContent = u.email;
  $("#avatar").textContent = u.name.trim().charAt(0).toUpperCase();
  const h = new Date().getHours();
  const hello = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  $("#greet").textContent = `${hello}, ${u.name.split(" ")[0]}!`;
}

// =========================================================
// Navegação entre telas (#dashboard, #transactions ...)
// =========================================================
function route() {
  const view = (location.hash || "#dashboard").slice(1);
  state.view = TITLES[view] ? view : "dashboard";
  $$("[data-page]").forEach((s) => s.classList.toggle("hidden", s.dataset.page !== state.view));
  $$("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.view === state.view));
  $("#viewTitle").textContent = TITLES[state.view];
  $("#monthPicker").classList.toggle("hidden", ["categories", "settings", "goals"].includes(state.view));
  closeMenu();
  renderMonth();
  refresh();
}

function refresh() {
  const loaders = {
    dashboard: loadDashboard, transactions: loadTransactions, budgets: loadBudgets,
    goals: loadGoals, categories: renderCategories, settings: renderSettings,
  };
  loaders[state.view]();
}

// ---------- Seletor de mês ----------
function renderMonth() {
  const [y, m] = state.month.split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  $("#monthLabel").textContent = label.charAt(0).toUpperCase() + label.slice(1);
}
function shiftMonth(delta) {
  const [y, m] = state.month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  state.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  renderMonth();
  refresh();
}

// ---------- Menu no celular ----------
function openMenu() { $("#sidebar").classList.add("open"); $("#overlay").classList.remove("hidden"); }
function closeMenu() { $("#sidebar").classList.remove("open"); $("#overlay").classList.add("hidden"); }

// =========================================================
// Categorias
// =========================================================
async function loadCategories() {
  state.categories = await api("/api/categories");
  const sel = $("#fCategory");
  const current = sel.value;
  sel.innerHTML = '<option value="">Todas as categorias</option>' +
    state.categories.map((c) => `<option value="${c.id}">${c.icon} ${escapeHtml(c.name)}</option>`).join("");
  sel.value = current;
}

function renderCategories() {
  const chip = (c) => `
    <span class="chip">
      <span class="dot" style="background:${c.color}"></span>${c.icon} ${escapeHtml(c.name)}
      <button data-del-cat="${c.id}" title="Excluir" aria-label="Excluir categoria">×</button>
    </span>`;
  $("#expenseCats").innerHTML = state.categories.filter((c) => c.type === "expense").map(chip).join("") || '<p class="empty">Nenhuma categoria.</p>';
  $("#incomeCats").innerHTML = state.categories.filter((c) => c.type === "income").map(chip).join("") || '<p class="empty">Nenhuma categoria.</p>';
}

function catStyle(color) {
  return `background:${color || "#94a3b8"}22;color:${color || "#94a3b8"}`;
}

// =========================================================
// Painel
// =========================================================
async function loadDashboard() {
  const [s, recent] = await Promise.all([
    api(`/api/summary?month=${state.month}`),
    api(`/api/transactions?month=${state.month}`),
  ]);

  animateValue($("#kBalance"), s.balance);
  animateValue($("#kIncome"), s.income);
  animateValue($("#kExpense"), s.expense);
  animateValue($("#kResult"), s.result);
  $("#kResult").className = "value " + (s.result >= 0 ? "txt-green" : "txt-red");
  $("#kRate").textContent = s.income ? `Você guardou ${s.savings_rate.toLocaleString("pt-BR")}% da renda no mês` : "Sem receitas neste mês";
  $("#kPendIncome").textContent = s.pending_income ? `+ ${money(s.pending_income)} a receber` : "Nada pendente";
  $("#kPendExpense").textContent = s.pending_expense ? `+ ${money(s.pending_expense)} a pagar` : "Nada pendente";

  renderHistoryChart(s.history);
  renderCategoryChart(s.by_category);

  $("#recentList").innerHTML = recent.slice(0, 6).map(txListItem).join("") ||
    emptyState("🧾", "Nenhum lançamento neste mês.");

  $("#upcomingList").innerHTML = s.upcoming.map((t) => {
    const late = t.date < todayISO();
    return `
      <div class="list-item">
        <div class="cat-ico" style="${catStyle(late ? "#dc2626" : "#d97706")}">${t.category_icon || "📌"}</div>
        <div class="meta"><b>${escapeHtml(t.description)}</b>
          <small class="${late ? "txt-red" : ""}">${late ? "Atrasado · " : "Vence "}${formatDate(t.date)}</small></div>
        <span class="amount ${t.type === "income" ? "txt-green" : "txt-red"}">${money(t.amount)}</span>
        <button class="badge pending" data-toggle="${t.id}" title="Marcar como pago">✓ Pagar</button>
      </div>`;
  }).join("") || emptyState("🎉", "Nenhuma conta pendente!");
}

function txListItem(t) {
  const sign = t.type === "income" ? "+" : "−";
  return `
    <div class="list-item">
      <div class="cat-ico" style="${catStyle(t.category_color)}">${t.category_icon || "📦"}</div>
      <div class="meta"><b>${escapeHtml(t.description)}</b>
        <small>${escapeHtml(t.category_name || "Sem categoria")} · ${formatDate(t.date)}</small></div>
      <span class="amount ${t.type === "income" ? "txt-green" : "txt-red"}">${sign} ${money(t.amount)}</span>
    </div>`;
}

function emptyState(icon, text) {
  return `<div class="empty"><span class="big">${icon}</span>${text}</div>`;
}

// Anima o número subindo até o valor final
function animateValue(el, target) {
  const start = performance.now();
  const duration = 600;
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    el.textContent = money(target * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ---------- Gráficos (Chart.js) ----------
function chartColors() {
  const css = getComputedStyle(document.documentElement);
  return {
    text: css.getPropertyValue("--muted").trim(),
    grid: css.getPropertyValue("--border").trim(),
    green: css.getPropertyValue("--success").trim(),
    red: css.getPropertyValue("--danger").trim(),
  };
}

function chartUnavailable(canvasId) {
  const box = document.getElementById(canvasId).parentElement;
  box.innerHTML = emptyState("📡", "Gráfico indisponível: verifique sua conexão com a internet.");
}

function renderHistoryChart(history) {
  if (!window.Chart) return document.getElementById("historyChart") && chartUnavailable("historyChart");
  const c = chartColors();
  state.charts.history?.destroy();
  state.charts.history = new Chart($("#historyChart"), {
    type: "bar",
    data: {
      labels: history.map((h) => {
        const [y, m] = h.month.split("-").map(Number);
        return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
      }),
      datasets: [
        { label: "Receitas", data: history.map((h) => h.income), backgroundColor: c.green, borderRadius: 6, maxBarThickness: 26 },
        { label: "Despesas", data: history.map((h) => h.expense), backgroundColor: c.red, borderRadius: 6, maxBarThickness: 26 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: c.text, usePointStyle: true, boxWidth: 8 } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${money(ctx.raw)}` } },
      },
      scales: {
        x: { ticks: { color: c.text }, grid: { display: false } },
        y: { ticks: { color: c.text, callback: (v) => money(v).replace(",00", "") }, grid: { color: c.grid }, beginAtZero: true },
      },
    },
  });
}

function renderCategoryChart(data) {
  if (!window.Chart) return document.getElementById("categoryChart") && chartUnavailable("categoryChart");
  const total = data.reduce((s, d) => s + d.total, 0);
  $("#catTotal").textContent = total ? money(total) : "";
  state.charts.category?.destroy();
  const box = $("#catChartBox");
  if (!data.length) {
    box.innerHTML = emptyState("🍩", "Sem despesas neste mês.");
    return;
  }
  if (!box.querySelector("canvas")) box.innerHTML = '<canvas id="categoryChart"></canvas>';
  const c = chartColors();
  state.charts.category = new Chart($("#categoryChart"), {
    type: "doughnut",
    data: {
      labels: data.map((d) => `${d.icon} ${d.name}`),
      datasets: [{ data: data.map((d) => d.total), backgroundColor: data.map((d) => d.color), borderWidth: 0, hoverOffset: 8 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "68%",
      plugins: {
        legend: { position: "bottom", labels: { color: c.text, usePointStyle: true, boxWidth: 8, padding: 12 } },
        tooltip: { callbacks: { label: (ctx) => ` ${money(ctx.raw)} (${((ctx.raw / total) * 100).toFixed(1)}%)` } },
      },
    },
  });
}

// =========================================================
// Lançamentos
// =========================================================
async function loadTransactions() {
  const params = new URLSearchParams({ month: state.month });
  if ($("#fType").value) params.set("type", $("#fType").value);
  if ($("#fCategory").value) params.set("category", $("#fCategory").value);
  if ($("#fStatus").value) params.set("status", $("#fStatus").value);
  if ($("#fSearch").value.trim()) params.set("q", $("#fSearch").value.trim());

  state.transactions = await api(`/api/transactions?${params}`);
  const rows = state.transactions;

  $("#txBody").innerHTML = rows.map((t) => `
    <tr>
      <td><div class="td-desc">
        <div class="cat-ico" style="${catStyle(t.category_color)}">${t.category_icon || "📦"}</div>
        <div><b>${escapeHtml(t.description)}</b>${t.notes ? `<br><small style="color:var(--muted)">${escapeHtml(t.notes)}</small>` : ""}</div>
      </div></td>
      <td class="hide-mobile">${escapeHtml(t.category_name || "—")}</td>
      <td>${formatDate(t.date)}</td>
      <td class="hide-mobile"><button class="badge ${t.paid ? "paid" : "pending"}" data-toggle="${t.id}" title="Clique para alterar">
        ${t.paid ? "✓ Pago" : "⏳ Pendente"}</button></td>
      <td style="text-align:right" class="amount ${t.type === "income" ? "txt-green" : "txt-red"}">
        ${t.type === "income" ? "+" : "−"} ${money(t.amount)}</td>
      <td><div class="actions">
        <button data-edit="${t.id}" title="Editar" aria-label="Editar">${ICONS.edit}</button>
        <button class="del" data-del="${t.id}" title="Excluir" aria-label="Excluir">${ICONS.trash}</button>
      </div></td>
    </tr>`).join("") ||
    `<tr><td colspan="6">${emptyState("🔎", "Nenhum lançamento encontrado. Clique em “+ Novo lançamento”.")}</td></tr>`;

  const inc = rows.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const exp = rows.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  $("#txFoot").innerHTML = `
    <span>${rows.length} lançamento(s)</span>
    <span>Receitas: <b class="txt-green">${money(inc)}</b> · Despesas: <b class="txt-red">${money(exp)}</b> · Saldo: <b>${money(inc - exp)}</b></span>`;
}

function openTransactionModal(tx = null) {
  const isEdit = !!tx;
  const t = tx || { type: "expense", description: "", amount: "", date: todayISO(), paid: 1, notes: "", category_id: "" };
  openModal(isEdit ? "Editar lançamento" : "Novo lançamento", `
    <form id="txForm">
      <div class="segment" id="txType">
        <button type="button" data-value="expense">− Despesa</button>
        <button type="button" data-value="income">+ Receita</button>
      </div>
      <div class="field"><label>Descrição</label>
        <input class="input" name="description" required maxlength="120" placeholder="Ex.: Supermercado" value="${escapeHtml(t.description)}"></div>
      <div class="row">
        <div class="field"><label>Valor (R$)</label>
          <input class="input" name="amount" type="number" step="0.01" min="0.01" required placeholder="0,00" value="${t.amount}"></div>
        <div class="field"><label>Data</label>
          <input class="input" name="date" type="date" required value="${t.date}"></div>
      </div>
      <div class="field"><label>Categoria</label><select class="input" name="category_id" id="txCat"></select></div>
      ${isEdit ? "" : `
      <div class="field"><label>Repetir por quantos meses? (parcelas / conta fixa)</label>
        <input class="input" name="repeat" type="number" min="1" max="60" value="1"></div>`}
      <div class="field"><label>Observações</label>
        <textarea class="input" name="notes" rows="2" maxlength="500" placeholder="Opcional">${escapeHtml(t.notes || "")}</textarea></div>
      <label class="check" style="margin-bottom:16px"><input type="checkbox" name="paid" ${t.paid ? "checked" : ""}> Já foi pago / recebido</label>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
        <button class="btn btn-primary">${isEdit ? "Salvar alterações" : "Adicionar"}</button>
      </div>
    </form>`);

  let type = t.type;
  const fillCats = () => {
    $$("#txType button").forEach((b) => b.classList.toggle("active", b.dataset.value === type));
    $("#txCat").innerHTML = '<option value="">Sem categoria</option>' + state.categories
      .filter((c) => c.type === type)
      .map((c) => `<option value="${c.id}" ${c.id === t.category_id ? "selected" : ""}>${c.icon} ${escapeHtml(c.name)}</option>`).join("");
  };
  fillCats();
  $$("#txType button").forEach((b) => b.addEventListener("click", () => { type = b.dataset.value; fillCats(); }));

  $("#txForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = {
      type,
      description: f.description.value.trim(),
      amount: f.amount.value,
      date: f.date.value,
      category_id: f.category_id.value ? Number(f.category_id.value) : null,
      notes: f.notes.value.trim(),
      paid: f.paid.checked,
      repeat: f.repeat ? Number(f.repeat.value) : 1,
    };
    try {
      if (isEdit) await api(`/api/transactions/${tx.id}`, { method: "PUT", body });
      else await api("/api/transactions", { method: "POST", body });
      closeModal();
      toast(isEdit ? "Lançamento atualizado." : body.repeat > 1 ? `${body.repeat} lançamentos criados.` : "Lançamento adicionado.", "success");
      refresh();
    } catch (err) { toast(err.message, "error"); }
  });
  setTimeout(() => $("#txForm [name=description]").focus(), 50);
}

// =========================================================
// Orçamentos
// =========================================================
async function loadBudgets() {
  const budgets = await api(`/api/budgets?month=${state.month}`);
  $("#budgetGrid").innerHTML = budgets.map((b) => {
    const pct = Math.round((b.spent / b.amount) * 100);
    const color = pct >= 100 ? "var(--danger)" : pct >= 80 ? "var(--warning)" : "var(--success)";
    const pill = pct >= 100 ? ["bg-red", "Estourado"] : pct >= 80 ? ["bg-amber", "Atenção"] : ["bg-green", "No limite"];
    return `
      <div class="card">
        <div class="budget-top">
          <div class="cat-ico" style="${catStyle(b.color)}">${b.icon}</div>
          <div class="meta"><b>${escapeHtml(b.name)}</b><br><span class="pill ${pill[0]}">${pill[1]}</span></div>
          <div class="actions"><button class="del" data-del-budget="${b.id}" title="Excluir">${ICONS.trash}</button></div>
        </div>
        <div class="progress"><i style="width:${Math.min(pct, 100)}%;background:${color}"></i></div>
        <div class="budget-nums">
          <span><b style="color:var(--text)">${money(b.spent)}</b> de ${money(b.amount)}</span>
          <span>${pct}%</span>
        </div>
        <div class="budget-nums"><span>${b.amount - b.spent >= 0 ? `Restam ${money(b.amount - b.spent)}` : `Passou ${money(b.spent - b.amount)}`}</span></div>
      </div>`;
  }).join("") || `<div class="card">${emptyState("🧾", "Nenhum orçamento ainda. Crie o primeiro!")}</div>`;
}

function openBudgetModal() {
  const cats = state.categories.filter((c) => c.type === "expense");
  openModal("Novo orçamento", `
    <form id="budgetForm">
      <div class="field"><label>Categoria de despesa</label>
        <select class="input" name="category_id" required>
          ${cats.map((c) => `<option value="${c.id}">${c.icon} ${escapeHtml(c.name)}</option>`).join("")}
        </select></div>
      <div class="field"><label>Limite mensal (R$)</label>
        <input class="input" name="amount" type="number" step="0.01" min="0.01" required placeholder="Ex.: 800"></div>
      <p style="color:var(--muted);font-size:13px;margin-bottom:12px">Se a categoria já tiver orçamento, o valor será atualizado.</p>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
        <button class="btn btn-primary">Salvar</button>
      </div>
    </form>`);
  $("#budgetForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/api/budgets", { method: "POST", body: { category_id: Number(e.target.category_id.value), amount: e.target.amount.value } });
      closeModal(); toast("Orçamento salvo.", "success"); loadBudgets();
    } catch (err) { toast(err.message, "error"); }
  });
}

// =========================================================
// Metas
// =========================================================
async function loadGoals() {
  const goals = await api("/api/goals");
  const R = 26, C = 2 * Math.PI * R;
  $("#goalGrid").innerHTML = goals.map((g) => {
    const pct = Math.min(Math.round((g.current / g.target) * 100), 100);
    let deadlineInfo = "Sem prazo definido";
    if (g.deadline) {
      const days = Math.ceil((new Date(g.deadline + "T00:00") - new Date()) / 86400000);
      const months = Math.max(Math.ceil(days / 30), 1);
      const missing = g.target - g.current;
      deadlineInfo = pct >= 100 ? "Meta concluída! 🎉"
        : days < 0 ? `Prazo vencido em ${formatDate(g.deadline)}`
        : `Até ${formatDate(g.deadline)} · guarde ${money(missing / months)}/mês`;
    }
    return `
      <div class="card">
        <div class="goal-top">
          <svg class="ring" viewBox="0 0 64 64">
            <circle class="bg" cx="32" cy="32" r="${R}"/>
            <circle class="fg" cx="32" cy="32" r="${R}" stroke="${g.color}"
              stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}"/>
            <text x="32" y="37" text-anchor="middle">${pct}%</text>
          </svg>
          <div class="meta"><b>${escapeHtml(g.name)}</b>
            <small style="color:var(--muted);display:block">${money(g.current)} de ${money(g.target)}</small>
            <small style="color:var(--muted);display:block">${deadlineInfo}</small></div>
          <div class="actions"><button class="del" data-del-goal="${g.id}" title="Excluir">${ICONS.trash}</button></div>
        </div>
        <form class="goal-actions" data-goal-form="${g.id}">
          <input class="input" name="amount" type="number" step="0.01" placeholder="Valor (R$)" required>
          <button class="btn btn-ghost" name="op" value="add" title="Depositar">+ Depositar</button>
          <button class="btn btn-ghost" name="op" value="sub" title="Retirar">−</button>
        </form>
      </div>`;
  }).join("") || `<div class="card">${emptyState("🎯", "Nenhuma meta ainda. Que tal criar uma reserva de emergência?")}</div>`;
}

function openGoalModal() {
  openModal("Nova meta", `
    <form id="goalForm">
      <div class="field"><label>Nome da meta</label>
        <input class="input" name="name" required maxlength="80" placeholder="Ex.: Reserva de emergência"></div>
      <div class="row">
        <div class="field"><label>Valor alvo (R$)</label>
          <input class="input" name="target" type="number" step="0.01" min="0.01" required></div>
        <div class="field"><label>Já guardado (R$)</label>
          <input class="input" name="current" type="number" step="0.01" min="0" value="0"></div>
      </div>
      <div class="row">
        <div class="field"><label>Prazo (opcional)</label><input class="input" name="deadline" type="date"></div>
        <div class="field"><label>Cor</label><input class="input" name="color" type="color" value="#6366f1" style="height:44px;padding:4px"></div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
        <button class="btn btn-primary">Criar meta</button>
      </div>
    </form>`);
  $("#goalForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api("/api/goals", { method: "POST", body: {
        name: f.name.value.trim(), target: f.target.value, current: f.current.value,
        deadline: f.deadline.value || null, color: f.color.value,
      } });
      closeModal(); toast("Meta criada!", "success"); loadGoals();
    } catch (err) { toast(err.message, "error"); }
  });
}

// =========================================================
// Configurações
// =========================================================
function renderSettings() {
  $("#pName").value = state.user.name;
  $("#pEmail").value = state.user.email;
  $("#pSince").value = new Date(state.user.created_at.replace(" ", "T") + "Z").toLocaleDateString("pt-BR");
}

// =========================================================
// Modal e confirmação
// =========================================================
function openModal(title, html) {
  $("#modalTitle").textContent = title;
  $("#modalBody").innerHTML = html;
  $("#modal").classList.remove("hidden");
}
function closeModal() { $("#modal").classList.add("hidden"); $("#modalBody").innerHTML = ""; }

function confirmDialog(message, { okLabel = "Excluir", withPassword = false } = {}) {
  return new Promise((resolve) => {
    openModal("Tem certeza?", `
      <p style="color:var(--muted);margin-bottom:16px">${message}</p>
      ${withPassword ? '<div class="field"><label>Digite sua senha para confirmar</label><input class="input" type="password" id="confirmPw"></div>' : ""}
      <div class="modal-foot">
        <button class="btn btn-ghost" id="cNo">Cancelar</button>
        <button class="btn btn-danger" id="cYes">${okLabel}</button>
      </div>`);
    $("#cNo").onclick = () => { closeModal(); resolve(false); };
    $("#cYes").onclick = () => {
      const pw = withPassword ? $("#confirmPw").value : true;
      closeModal(); resolve(pw);
    };
  });
}

function exportCsv(month) {
  window.location.href = `/api/export.csv?month=${month}`;
}

// =========================================================
// Eventos (cliques, formulários, atalhos)
// =========================================================
function bindEvents() {
  $("#prevMonth").onclick = () => shiftMonth(-1);
  $("#nextMonth").onclick = () => shiftMonth(1);
  $("#menuBtn").onclick = openMenu;
  $("#overlay").onclick = closeMenu;
  $("#newTxBtn").onclick = () => openTransactionModal();
  $("#fab").onclick = () => openTransactionModal();
  $("#newBudgetBtn").onclick = openBudgetModal;
  $("#newGoalBtn").onclick = openGoalModal;
  $("#exportBtn").onclick = () => exportCsv(state.month);
  $("#exportAllBtn").onclick = () => exportCsv("all");

  $("#logoutBtn").onclick = async () => {
    await api("/api/logout", { method: "POST" });
    window.location.href = "/";
  };

  // Filtros de lançamentos (a busca espera você parar de digitar)
  let timer;
  $("#fSearch").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(loadTransactions, 300); });
  ["#fType", "#fCategory", "#fStatus"].forEach((s) => $(s).addEventListener("change", loadTransactions));

  // Fechar modal
  $("#modal").addEventListener("click", (e) => {
    if (e.target.id === "modal" || e.target.hasAttribute("data-close")) closeModal();
  });

  // Atalhos de teclado: N = novo lançamento, Esc = fechar
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName);
    if (!typing && e.key.toLowerCase() === "n" && $("#modal").classList.contains("hidden")) {
      e.preventDefault(); openTransactionModal();
    }
  });

  // Cliques em botões dentro das listas (delegação de eventos)
  document.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-toggle],[data-edit],[data-del],[data-del-budget],[data-del-goal],[data-del-cat]");
    if (!el) return;
    try {
      if (el.dataset.toggle) {
        await api(`/api/transactions/${el.dataset.toggle}/toggle`, { method: "PATCH" });
        toast("Status atualizado.", "success"); refresh();
      } else if (el.dataset.edit) {
        const tx = state.transactions.find((t) => t.id === Number(el.dataset.edit));
        if (tx) openTransactionModal(tx);
      } else if (el.dataset.del) {
        if (!(await confirmDialog("Este lançamento será excluído permanentemente."))) return;
        await api(`/api/transactions/${el.dataset.del}`, { method: "DELETE" });
        toast("Lançamento excluído.", "success"); refresh();
      } else if (el.dataset.delBudget) {
        if (!(await confirmDialog("Remover este orçamento?"))) return;
        await api(`/api/budgets/${el.dataset.delBudget}`, { method: "DELETE" });
        toast("Orçamento removido.", "success"); loadBudgets();
      } else if (el.dataset.delGoal) {
        if (!(await confirmDialog("Excluir esta meta?"))) return;
        await api(`/api/goals/${el.dataset.delGoal}`, { method: "DELETE" });
        toast("Meta excluída.", "success"); loadGoals();
      } else if (el.dataset.delCat) {
        if (!(await confirmDialog("Os lançamentos desta categoria ficarão “Sem categoria”."))) return;
        await api(`/api/categories/${el.dataset.delCat}`, { method: "DELETE" });
        await loadCategories(); renderCategories(); toast("Categoria excluída.", "success");
      }
    } catch (err) { toast(err.message, "error"); }
  });

  // Depósito / retirada em meta
  document.addEventListener("submit", async (e) => {
    const form = e.target.closest("[data-goal-form]");
    if (!form) return;
    e.preventDefault();
    const sign = e.submitter && e.submitter.value === "sub" ? -1 : 1;
    const amount = Number(form.amount.value) * sign;
    try {
      await api(`/api/goals/${form.dataset.goalForm}/deposit`, { method: "POST", body: { amount } });
      toast(sign > 0 ? "Depósito registrado! 💪" : "Retirada registrada.", "success");
      loadGoals();
    } catch (err) { toast(err.message, "error"); }
  });

  // Nova categoria
  $("#catForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/api/categories", { method: "POST", body: {
        name: $("#catName").value.trim(), type: $("#catType").value,
        color: $("#catColor").value, icon: $("#catIcon").value.trim() || "📦",
      } });
      e.target.reset(); $("#catColor").value = "#6366f1";
      await loadCategories(); renderCategories(); toast("Categoria criada.", "success");
    } catch (err) { toast(err.message, "error"); }
  });

  // Perfil
  $("#profileForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/api/me", { method: "PUT", body: { name: $("#pName").value.trim() } });
      state.user.name = $("#pName").value.trim(); renderUser(); toast("Perfil salvo.", "success");
    } catch (err) { toast(err.message, "error"); }
  });

  // Senha
  $("#passwordForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if ($("#pwNew").value !== $("#pwConfirm").value) return toast("As senhas não conferem.", "error");
    try {
      await api("/api/me/password", { method: "PUT", body: { current: $("#pwCurrent").value, new: $("#pwNew").value } });
      e.target.reset(); toast("Senha alterada com sucesso.", "success");
    } catch (err) { toast(err.message, "error"); }
  });

  // Excluir conta
  $("#deleteAccountBtn").onclick = async () => {
    const pw = await confirmDialog("Todos os seus lançamentos, metas e orçamentos serão apagados. Isso não pode ser desfeito.",
      { okLabel: "Excluir conta", withPassword: true });
    if (!pw) return;
    try {
      await api("/api/me", { method: "DELETE", body: { password: pw } });
      window.location.href = "/";
    } catch (err) { toast(err.message, "error"); }
  };
}

init().catch((err) => toast(err.message, "error"));
