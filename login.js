/* =========================================================
   login.js — interatividade da tela de login e cadastro
   ========================================================= */
const $ = (sel) => document.querySelector(sel);

// Coloca os ícones SVG nos lugares marcados com data-icon
document.querySelectorAll("[data-icon]").forEach((el) => (el.innerHTML = ICONS[el.dataset.icon]));
document.querySelectorAll(".toggle-pw").forEach((btn) => (btn.innerHTML = ICONS.eye));
$("#themeBtn").innerHTML = ICONS.moon;
$("#themeBtn").addEventListener("click", toggleTheme);

// ---------- Mostrar / esconder senha ----------
document.querySelectorAll(".toggle-pw").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = btn.parentElement.querySelector("input");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.innerHTML = show ? ICONS.eyeOff : ICONS.eye;
    btn.setAttribute("aria-label", show ? "Esconder senha" : "Mostrar senha");
  });
});

// ---------- Troca de abas (Entrar / Criar conta) ----------
const TEXTS = {
  login: ["Bem-vindo de volta 👋", "Entre para acessar seu painel financeiro."],
  register: ["Crie sua conta ✨", "Leva menos de um minuto. É grátis."],
};

function switchTab(tab) {
  $("#tabs").dataset.active = tab;
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $("#loginForm").classList.toggle("hidden", tab !== "login");
  $("#registerForm").classList.toggle("hidden", tab !== "register");
  $("#title").textContent = TEXTS[tab][0];
  $("#subtitle").textContent = TEXTS[tab][1];
  hideAlert();
  (tab === "login" ? $("#loginEmail") : $("#regName")).focus();
}
document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

// ---------- Mensagens ----------
function showAlert(msg, ok = false) {
  const el = $("#alert");
  el.textContent = (ok ? "✓ " : "⚠ ") + msg;
  el.classList.toggle("ok", ok);
  el.classList.remove("hidden");
}
function hideAlert() { $("#alert").classList.add("hidden"); }

function shake(el) {
  el.classList.remove("shake");
  void el.offsetWidth; // reinicia a animação
  el.classList.add("shake");
}

function setLoading(form, loading, label) {
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = loading;
  btn.innerHTML = loading ? '<span class="spinner"></span> Aguarde...' : label;
}

function fieldError(id, msg) {
  const input = $("#" + id);
  const span = document.querySelector(`.field-error[data-for="${id}"]`);
  input.classList.toggle("invalid", !!msg);
  if (span) span.textContent = msg || "";
  return !msg;
}

// ---------- Medidor de força da senha ----------
function passwordScore(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) score++;
  return score;
}
$("#regPassword").addEventListener("input", (e) => {
  const score = e.target.value ? passwordScore(e.target.value) : 0;
  const colors = ["#ef4444", "#f97316", "#eab308", "#22c55e"];
  const labels = ["Muito fraca", "Fraca", "Boa", "Forte"];
  document.querySelectorAll("#strength i").forEach((bar, i) => {
    bar.style.background = i < score ? colors[score - 1] : "";
  });
  $("#strengthLabel").textContent = e.target.value ? `Força: ${labels[Math.max(score - 1, 0)]}` : "Força da senha";
});

// ---------- Enviar LOGIN ----------
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAlert();
  const email = $("#loginEmail").value.trim();
  const password = $("#loginPassword").value;
  if (!email || !password) {
    showAlert("Preencha e-mail e senha.");
    return shake(e.target);
  }
  setLoading(e.target, true);
  try {
    await api("/api/login", {
      method: "POST",
      body: { email, password, remember: $("#remember").checked },
    });
    showAlert("Login realizado! Redirecionando...", true);
    setTimeout(() => (window.location.href = "/app"), 500);
  } catch (err) {
    showAlert(err.message);
    shake(e.target);
    setLoading(e.target, false, "Entrar");
  }
});

// ---------- Enviar CADASTRO ----------
$("#registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAlert();
  const name = $("#regName").value.trim();
  const email = $("#regEmail").value.trim();
  const password = $("#regPassword").value;
  const confirm = $("#regConfirm").value;

  let ok = true;
  ok &= fieldError("regName", name.length < 2 ? "Informe seu nome." : "");
  ok &= fieldError("regEmail", /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? "" : "E-mail inválido.");
  ok &= fieldError("regConfirm", password && password === confirm ? "" : "As senhas não conferem.");
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    showAlert("A senha deve ter pelo menos 8 caracteres, com letras e números.");
    ok = false;
  }
  if (ok && !$("#terms").checked) {
    showAlert("Aceite os termos de uso para continuar.");
    ok = false;
  }
  if (!ok) return shake(e.target);

  setLoading(e.target, true);
  try {
    await api("/api/register", { method: "POST", body: { name, email, password, remember: true } });
    showAlert("Conta criada com sucesso! Entrando...", true);
    setTimeout(() => (window.location.href = "/app"), 600);
  } catch (err) {
    showAlert(err.message);
    shake(e.target);
    setLoading(e.target, false, "Criar minha conta");
  }
});

// Limpa o erro do campo enquanto a pessoa digita
["regName", "regEmail", "regConfirm"].forEach((id) =>
  $("#" + id).addEventListener("input", () => fieldError(id, ""))
);

$("#forgot").addEventListener("click", (e) => {
  e.preventDefault();
  showAlert("Recuperação por e-mail não está disponível nesta versão local. Crie uma nova conta ou peça ao administrador.", false);
});
