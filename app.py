"""
app.py — Servidor (back end) do FinançaPro, feito em Python com Flask.

Como rodar:
    pip install -r requirements.txt
    python app.py
Depois abra http://127.0.0.1:5000 no navegador.

O servidor faz duas coisas:
  1. Entrega as páginas HTML/CSS/JS (pasta "static").
  2. Oferece uma API em /api/... que o JavaScript chama para ler e
     gravar dados no banco (login, lançamentos, metas etc.).
"""
import csv
import io
import os
import re
import secrets
import time
from datetime import date, timedelta
from functools import wraps

from flask import Flask, Response, jsonify, redirect, request, send_from_directory, session
from werkzeug.security import check_password_hash, generate_password_hash

from database import get_connection, init_db, seed_categories

app = Flask(__name__, static_folder="static", static_url_path="")

# Chave secreta usada para assinar o cookie de sessão (login).
# Em produção, defina a variável de ambiente SECRET_KEY.
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=30)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# ---------------------------------------------------------------------------
# Proteção contra força bruta: bloqueia 5 minutos após 5 senhas erradas
# ---------------------------------------------------------------------------
FAILED_LOGINS = {}  # email -> [tentativas, horário do bloqueio]
MAX_ATTEMPTS = 5
LOCK_SECONDS = 300


def is_locked(email):
    attempts, locked_at = FAILED_LOGINS.get(email, (0, 0))
    if attempts >= MAX_ATTEMPTS and time.time() - locked_at < LOCK_SECONDS:
        return int(LOCK_SECONDS - (time.time() - locked_at))
    if attempts >= MAX_ATTEMPTS:
        FAILED_LOGINS.pop(email, None)
    return 0


def register_failure(email):
    attempts, _ = FAILED_LOGINS.get(email, (0, 0))
    FAILED_LOGINS[email] = (attempts + 1, time.time())


# ---------------------------------------------------------------------------
# Funções auxiliares
# ---------------------------------------------------------------------------
def error(message, status=400):
    return jsonify({"error": message}), status


def login_required(view):
    """Decorador: só deixa acessar a rota quem estiver logado."""
    @wraps(view)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return error("Faça login para continuar.", 401)
        return view(*args, **kwargs)
    return wrapper


def uid():
    return session["user_id"]


def password_problem(pw):
    """Retorna uma mensagem se a senha for fraca, ou None se estiver ok."""
    if len(pw) < 8:
        return "A senha deve ter pelo menos 8 caracteres."
    if not re.search(r"[A-Za-z]", pw) or not re.search(r"\d", pw):
        return "A senha deve ter letras e números."
    return None


def parse_amount(value):
    try:
        amount = round(float(str(value).replace(",", ".")), 2)
    except (TypeError, ValueError):
        return None
    return amount if amount > 0 else None


def valid_date(value):
    try:
        date.fromisoformat(value)
        return True
    except (TypeError, ValueError):
        return False


def month_bounds(month):
    """'2026-09' -> ('2026-09-01', '2026-10-01')"""
    y, m = map(int, month.split("-"))
    start = date(y, m, 1)
    end = date(y + (m == 12), m % 12 + 1, 1)
    return start.isoformat(), end.isoformat()


def current_month():
    return date.today().strftime("%Y-%m")


def get_month_arg():
    month = request.args.get("month") or current_month()
    if not re.fullmatch(r"\d{4}-\d{2}", month):
        month = current_month()
    return month


# ---------------------------------------------------------------------------
# Páginas
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    if "user_id" in session:
        return redirect("/app")
    return send_from_directory(app.static_folder, "index.html")


@app.route("/app")
def dashboard_page():
    if "user_id" not in session:
        return redirect("/")
    return send_from_directory(app.static_folder, "app.html")


# ---------------------------------------------------------------------------
# Autenticação
# ---------------------------------------------------------------------------
@app.post("/api/register")
def register():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if len(name) < 2:
        return error("Informe seu nome.")
    if not EMAIL_RE.match(email):
        return error("E-mail inválido.")
    problem = password_problem(password)
    if problem:
        return error(problem)

    with get_connection() as conn:
        if conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
            return error("Já existe uma conta com este e-mail.", 409)
        cur = conn.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            (name, email, generate_password_hash(password)),
        )
        seed_categories(conn, cur.lastrowid)
        user_id = cur.lastrowid

    session.clear()
    session["user_id"] = user_id
    session.permanent = bool(data.get("remember"))
    return jsonify({"ok": True, "user": {"id": user_id, "name": name, "email": email}}), 201


@app.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    wait = is_locked(email)
    if wait:
        return error(f"Muitas tentativas. Tente novamente em {wait // 60 + 1} min.", 429)

    with get_connection() as conn:
        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()

    if not user or not check_password_hash(user["password_hash"], password):
        register_failure(email)
        return error("E-mail ou senha incorretos.", 401)

    FAILED_LOGINS.pop(email, None)
    session.clear()
    session["user_id"] = user["id"]
    session.permanent = bool(data.get("remember"))
    return jsonify({"ok": True, "user": {"id": user["id"], "name": user["name"], "email": user["email"]}})


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.get("/api/me")
@login_required
def me():
    with get_connection() as conn:
        user = conn.execute(
            "SELECT id, name, email, created_at FROM users WHERE id = ?", (uid(),)
        ).fetchone()
    if not user:
        session.clear()
        return error("Sessão inválida.", 401)
    return jsonify(dict(user))


@app.put("/api/me")
@login_required
def update_me():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if len(name) < 2:
        return error("Informe seu nome.")
    with get_connection() as conn:
        conn.execute("UPDATE users SET name = ? WHERE id = ?", (name, uid()))
    return jsonify({"ok": True})


@app.put("/api/me/password")
@login_required
def change_password():
    data = request.get_json(silent=True) or {}
    current = data.get("current") or ""
    new = data.get("new") or ""
    with get_connection() as conn:
        user = conn.execute("SELECT password_hash FROM users WHERE id = ?", (uid(),)).fetchone()
        if not check_password_hash(user["password_hash"], current):
            return error("Senha atual incorreta.", 403)
        problem = password_problem(new)
        if problem:
            return error(problem)
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (generate_password_hash(new), uid()),
        )
    return jsonify({"ok": True})


@app.delete("/api/me")
@login_required
def delete_account():
    data = request.get_json(silent=True) or {}
    with get_connection() as conn:
        user = conn.execute("SELECT password_hash FROM users WHERE id = ?", (uid(),)).fetchone()
        if not check_password_hash(user["password_hash"], data.get("password") or ""):
            return error("Senha incorreta.", 403)
        conn.execute("DELETE FROM users WHERE id = ?", (uid(),))
    session.clear()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Categorias
# ---------------------------------------------------------------------------
@app.get("/api/categories")
@login_required
def list_categories():
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM categories WHERE user_id = ? ORDER BY type, name", (uid(),)
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.post("/api/categories")
@login_required
def create_category():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    ctype = data.get("type")
    if not name or ctype not in ("income", "expense"):
        return error("Informe nome e tipo da categoria.")
    color = data.get("color") or "#64748b"
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
        color = "#64748b"
    icon = (data.get("icon") or "📦")[:4]
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO categories (user_id, name, type, color, icon) VALUES (?, ?, ?, ?, ?)",
            (uid(), name, ctype, color, icon),
        )
    return jsonify({"id": cur.lastrowid}), 201


@app.delete("/api/categories/<int:cat_id>")
@login_required
def delete_category(cat_id):
    with get_connection() as conn:
        conn.execute("DELETE FROM categories WHERE id = ? AND user_id = ?", (cat_id, uid()))
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Lançamentos (receitas e despesas)
# ---------------------------------------------------------------------------
def validate_transaction(data, conn):
    ttype = data.get("type")
    description = (data.get("description") or "").strip()
    amount = parse_amount(data.get("amount"))
    tdate = data.get("date") or date.today().isoformat()
    category_id = data.get("category_id") or None

    if ttype not in ("income", "expense"):
        return None, "Tipo inválido."
    if not description:
        return None, "Informe uma descrição."
    if amount is None:
        return None, "Informe um valor maior que zero."
    if not valid_date(tdate):
        return None, "Data inválida."
    if category_id is not None:
        ok = conn.execute(
            "SELECT 1 FROM categories WHERE id = ? AND user_id = ?", (category_id, uid())
        ).fetchone()
        if not ok:
            return None, "Categoria inválida."

    return {
        "type": ttype,
        "description": description[:120],
        "amount": amount,
        "date": tdate,
        "category_id": category_id,
        "paid": 1 if data.get("paid", True) else 0,
        "notes": (data.get("notes") or "")[:500],
    }, None


@app.get("/api/transactions")
@login_required
def list_transactions():
    sql = """
        SELECT t.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon
        FROM transactions t
        LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.user_id = ?
    """
    params = [uid()]

    if request.args.get("month") != "all":
        start, end = month_bounds(get_month_arg())
        sql += " AND t.date >= ? AND t.date < ?"
        params += [start, end]
    if request.args.get("type") in ("income", "expense"):
        sql += " AND t.type = ?"
        params.append(request.args["type"])
    if request.args.get("category"):
        sql += " AND t.category_id = ?"
        params.append(request.args["category"])
    if request.args.get("status") in ("paid", "pending"):
        sql += " AND t.paid = ?"
        params.append(1 if request.args["status"] == "paid" else 0)
    if request.args.get("q"):
        sql += " AND (t.description LIKE ? OR t.notes LIKE ?)"
        like = f"%{request.args['q']}%"
        params += [like, like]

    sql += " ORDER BY t.date DESC, t.id DESC"
    with get_connection() as conn:
        rows = conn.execute(sql, params).fetchall()
    return jsonify([dict(r) for r in rows])


@app.post("/api/transactions")
@login_required
def create_transaction():
    data = request.get_json(silent=True) or {}
    repeat = max(1, min(int(data.get("repeat") or 1), 60))  # parcelas/recorrência
    with get_connection() as conn:
        tx, problem = validate_transaction(data, conn)
        if problem:
            return error(problem)
        base = date.fromisoformat(tx["date"])
        for i in range(repeat):
            y = base.year + (base.month - 1 + i) // 12
            m = (base.month - 1 + i) % 12 + 1
            # evita dia 31 em meses menores
            day = min(base.day, [31, 29 if y % 4 == 0 and (y % 100 or y % 400 == 0) else 28,
                                 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1])
            desc = tx["description"] + (f" ({i + 1}/{repeat})" if repeat > 1 else "")
            conn.execute(
                """INSERT INTO transactions
                   (user_id, category_id, type, description, amount, date, paid, notes)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (uid(), tx["category_id"], tx["type"], desc, tx["amount"],
                 date(y, m, day).isoformat(), tx["paid"] if i == 0 else 0, tx["notes"]),
            )
    return jsonify({"ok": True, "created": repeat}), 201


@app.put("/api/transactions/<int:tx_id>")
@login_required
def update_transaction(tx_id):
    data = request.get_json(silent=True) or {}
    with get_connection() as conn:
        tx, problem = validate_transaction(data, conn)
        if problem:
            return error(problem)
        cur = conn.execute(
            """UPDATE transactions SET category_id=?, type=?, description=?, amount=?,
               date=?, paid=?, notes=? WHERE id=? AND user_id=?""",
            (tx["category_id"], tx["type"], tx["description"], tx["amount"], tx["date"],
             tx["paid"], tx["notes"], tx_id, uid()),
        )
    if cur.rowcount == 0:
        return error("Lançamento não encontrado.", 404)
    return jsonify({"ok": True})


@app.patch("/api/transactions/<int:tx_id>/toggle")
@login_required
def toggle_paid(tx_id):
    with get_connection() as conn:
        conn.execute(
            "UPDATE transactions SET paid = 1 - paid WHERE id = ? AND user_id = ?", (tx_id, uid())
        )
    return jsonify({"ok": True})


@app.delete("/api/transactions/<int:tx_id>")
@login_required
def delete_transaction(tx_id):
    with get_connection() as conn:
        conn.execute("DELETE FROM transactions WHERE id = ? AND user_id = ?", (tx_id, uid()))
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Resumo para o painel (dashboard)
# ---------------------------------------------------------------------------
@app.get("/api/summary")
@login_required
def summary():
    month = get_month_arg()
    start, end = month_bounds(month)
    with get_connection() as conn:
        def total(ttype, where="", params=()):
            row = conn.execute(
                f"SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_id=? AND type=? {where}",
                (uid(), ttype, *params),
            ).fetchone()
            return round(row[0], 2)

        month_filter = "AND date >= ? AND date < ?"
        income = total("income", month_filter + " AND paid=1", (start, end))
        expense = total("expense", month_filter + " AND paid=1", (start, end))
        pending_income = total("income", month_filter + " AND paid=0", (start, end))
        pending_expense = total("expense", month_filter + " AND paid=0", (start, end))
        # saldo acumulado até o fim do mês escolhido
        balance = total("income", "AND paid=1 AND date < ?", (end,)) - total(
            "expense", "AND paid=1 AND date < ?", (end,)
        )

        by_category = conn.execute(
            """SELECT COALESCE(c.name, 'Sem categoria') AS name,
                      COALESCE(c.color, '#94a3b8') AS color,
                      COALESCE(c.icon, '📦') AS icon,
                      SUM(t.amount) AS total
               FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
               WHERE t.user_id=? AND t.type='expense' AND t.date >= ? AND t.date < ?
               GROUP BY t.category_id ORDER BY total DESC""",
            (uid(), start, end),
        ).fetchall()

        # últimos 6 meses (receitas x despesas)
        y, m = map(int, month.split("-"))
        history = []
        for i in range(5, -1, -1):
            yy = y + (m - 1 - i) // 12
            mm = (m - 1 - i) % 12 + 1
            key = f"{yy:04d}-{mm:02d}"
            s, e = month_bounds(key)
            history.append({
                "month": key,
                "income": total("income", month_filter, (s, e)),
                "expense": total("expense", month_filter, (s, e)),
            })

        upcoming = conn.execute(
            """SELECT t.*, c.icon AS category_icon FROM transactions t
               LEFT JOIN categories c ON c.id = t.category_id
               WHERE t.user_id=? AND t.paid=0 ORDER BY t.date LIMIT 5""",
            (uid(),),
        ).fetchall()

    savings_rate = round((income - expense) / income * 100, 1) if income else 0
    return jsonify({
        "month": month,
        "income": income,
        "expense": expense,
        "result": round(income - expense, 2),
        "balance": round(balance, 2),
        "pending_income": pending_income,
        "pending_expense": pending_expense,
        "savings_rate": savings_rate,
        "by_category": [dict(r) for r in by_category],
        "history": history,
        "upcoming": [dict(r) for r in upcoming],
    })


# ---------------------------------------------------------------------------
# Orçamentos (limite mensal de gastos por categoria)
# ---------------------------------------------------------------------------
@app.get("/api/budgets")
@login_required
def list_budgets():
    start, end = month_bounds(get_month_arg())
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT b.id, b.amount, b.category_id, c.name, c.color, c.icon,
                      COALESCE((SELECT SUM(t.amount) FROM transactions t
                                WHERE t.user_id=b.user_id AND t.category_id=b.category_id
                                  AND t.type='expense' AND t.date>=? AND t.date<?), 0) AS spent
               FROM budgets b JOIN categories c ON c.id = b.category_id
               WHERE b.user_id=? ORDER BY c.name""",
            (start, end, uid()),
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.post("/api/budgets")
@login_required
def upsert_budget():
    data = request.get_json(silent=True) or {}
    amount = parse_amount(data.get("amount"))
    category_id = data.get("category_id")
    if amount is None or not category_id:
        return error("Escolha a categoria e o valor limite.")
    with get_connection() as conn:
        cat = conn.execute(
            "SELECT type FROM categories WHERE id=? AND user_id=?", (category_id, uid())
        ).fetchone()
        if not cat or cat["type"] != "expense":
            return error("Escolha uma categoria de despesa.")
        conn.execute(
            """INSERT INTO budgets (user_id, category_id, amount) VALUES (?, ?, ?)
               ON CONFLICT(user_id, category_id) DO UPDATE SET amount = excluded.amount""",
            (uid(), category_id, amount),
        )
    return jsonify({"ok": True}), 201


@app.delete("/api/budgets/<int:budget_id>")
@login_required
def delete_budget(budget_id):
    with get_connection() as conn:
        conn.execute("DELETE FROM budgets WHERE id=? AND user_id=?", (budget_id, uid()))
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Metas de economia
# ---------------------------------------------------------------------------
@app.get("/api/goals")
@login_required
def list_goals():
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM goals WHERE user_id=? ORDER BY deadline IS NULL, deadline", (uid(),)
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.post("/api/goals")
@login_required
def create_goal():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    target = parse_amount(data.get("target"))
    current = parse_amount(data.get("current")) or 0
    deadline = data.get("deadline") or None
    if not name or target is None:
        return error("Informe o nome e o valor da meta.")
    if deadline and not valid_date(deadline):
        return error("Data limite inválida.")
    color = data.get("color") if re.fullmatch(r"#[0-9a-fA-F]{6}", data.get("color") or "") else "#6366f1"
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO goals (user_id, name, target, current, deadline, color) VALUES (?,?,?,?,?,?)",
            (uid(), name[:80], target, current, deadline, color),
        )
    return jsonify({"id": cur.lastrowid}), 201


@app.post("/api/goals/<int:goal_id>/deposit")
@login_required
def deposit_goal(goal_id):
    data = request.get_json(silent=True) or {}
    try:
        value = round(float(str(data.get("amount")).replace(",", ".")), 2)
    except (TypeError, ValueError):
        return error("Valor inválido.")
    with get_connection() as conn:
        conn.execute(
            "UPDATE goals SET current = MAX(0, current + ?) WHERE id=? AND user_id=?",
            (value, goal_id, uid()),
        )
    return jsonify({"ok": True})


@app.delete("/api/goals/<int:goal_id>")
@login_required
def delete_goal(goal_id):
    with get_connection() as conn:
        conn.execute("DELETE FROM goals WHERE id=? AND user_id=?", (goal_id, uid()))
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Exportar lançamentos em CSV (abre no Excel)
# ---------------------------------------------------------------------------
@app.get("/api/export.csv")
@login_required
def export_csv():
    sql = """SELECT t.date, t.type, t.description, COALESCE(c.name,''), t.amount, t.paid, t.notes
             FROM transactions t LEFT JOIN categories c ON c.id=t.category_id
             WHERE t.user_id=?"""
    params = [uid()]
    month = request.args.get("month")
    if month and month != "all":
        start, end = month_bounds(get_month_arg())
        sql += " AND t.date >= ? AND t.date < ?"
        params += [start, end]
    sql += " ORDER BY t.date"
    with get_connection() as conn:
        rows = conn.execute(sql, params).fetchall()

    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";")
    writer.writerow(["Data", "Tipo", "Descrição", "Categoria", "Valor", "Status", "Observações"])
    for d, t, desc, cat, amount, paid, notes in rows:
        writer.writerow([
            d, "Receita" if t == "income" else "Despesa", desc, cat,
            f"{amount:.2f}".replace(".", ","), "Pago" if paid else "Pendente", notes,
        ])
    filename = f"lancamentos_{month or 'todos'}.csv"
    return Response(
        "\ufeff" + buf.getvalue(),  # BOM para o Excel reconhecer acentos
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ---------------------------------------------------------------------------
init_db()

if __name__ == "__main__":
    app.run(debug=True)
