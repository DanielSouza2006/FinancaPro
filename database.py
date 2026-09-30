"""
database.py — Tudo que conversa com o banco de dados (SQLite).

SQLite é um banco de dados que fica guardado em um único arquivo
(finance.db). Não precisa instalar nada: ele já vem com o Python.
"""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "finance.db"

# Categorias criadas automaticamente para cada novo usuário
DEFAULT_CATEGORIES = [
    # (nome, tipo, cor, ícone)
    ("Salário", "income", "#22c55e", "💼"),
    ("Freelance", "income", "#10b981", "🧑‍💻"),
    ("Investimentos", "income", "#06b6d4", "📈"),
    ("Outras receitas", "income", "#84cc16", "💰"),
    ("Moradia", "expense", "#6366f1", "🏠"),
    ("Alimentação", "expense", "#f97316", "🍽️"),
    ("Transporte", "expense", "#eab308", "🚗"),
    ("Saúde", "expense", "#ef4444", "🩺"),
    ("Educação", "expense", "#8b5cf6", "📚"),
    ("Lazer", "expense", "#ec4899", "🎉"),
    ("Assinaturas", "expense", "#14b8a6", "📺"),
    ("Compras", "expense", "#f43f5e", "🛍️"),
    ("Outras despesas", "expense", "#64748b", "📦"),
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name     TEXT    NOT NULL,
    type     TEXT    NOT NULL CHECK (type IN ('income', 'expense')),
    color    TEXT    NOT NULL DEFAULT '#64748b',
    icon     TEXT    NOT NULL DEFAULT '📦'
);

CREATE TABLE IF NOT EXISTS transactions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    type         TEXT    NOT NULL CHECK (type IN ('income', 'expense')),
    description  TEXT    NOT NULL,
    amount       REAL    NOT NULL CHECK (amount > 0),
    date         TEXT    NOT NULL,           -- formato AAAA-MM-DD
    paid         INTEGER NOT NULL DEFAULT 1, -- 1 = pago/recebido, 0 = pendente
    notes        TEXT    DEFAULT '',
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS budgets (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id  INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    amount       REAL    NOT NULL CHECK (amount > 0),
    UNIQUE (user_id, category_id)
);

CREATE TABLE IF NOT EXISTS goals (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name      TEXT    NOT NULL,
    target    REAL    NOT NULL CHECK (target > 0),
    current   REAL    NOT NULL DEFAULT 0,
    deadline  TEXT,
    color     TEXT    NOT NULL DEFAULT '#6366f1'
);

CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date);
"""


def get_connection():
    """Abre uma conexão com o banco. Cada linha volta como um dicionário."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """Cria as tabelas (se ainda não existirem)."""
    with get_connection() as conn:
        conn.executescript(SCHEMA)


def seed_categories(conn, user_id):
    """Cria as categorias padrão para um usuário recém-cadastrado."""
    conn.executemany(
        "INSERT INTO categories (user_id, name, type, color, icon) VALUES (?, ?, ?, ?, ?)",
        [(user_id, *c) for c in DEFAULT_CATEGORIES],
    )
