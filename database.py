"""
database.py — Tudo que conversa com o banco de dados (PostgreSQL no Supabase).

O endereço do banco fica na variável de ambiente DATABASE_URL:
  - No seu computador: dentro do arquivo .env (que NÃO vai para o GitHub)
  - No Render: nas configurações "Environment" do serviço
"""
import os

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

# Lê o arquivo .env (se existir) e carrega as variáveis de ambiente
load_dotenv()
DATABASE_URL = os.environ.get("DATABASE_URL")

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
    id            SERIAL PRIMARY KEY,
    name          TEXT   NOT NULL,
    email         TEXT   NOT NULL UNIQUE,
    password_hash TEXT   NOT NULL,
    created_at    TEXT   NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS categories (
    id       SERIAL  PRIMARY KEY,
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name     TEXT    NOT NULL,
    type     TEXT    NOT NULL CHECK (type IN ('income', 'expense')),
    color    TEXT    NOT NULL DEFAULT '#64748b',
    icon     TEXT    NOT NULL DEFAULT '📦'
);

CREATE TABLE IF NOT EXISTS transactions (
    id           SERIAL  PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    type         TEXT    NOT NULL CHECK (type IN ('income', 'expense')),
    description  TEXT    NOT NULL,
    amount       DOUBLE PRECISION NOT NULL CHECK (amount > 0),
    date         TEXT    NOT NULL,           -- formato AAAA-MM-DD
    paid         INTEGER NOT NULL DEFAULT 1, -- 1 = pago/recebido, 0 = pendente
    notes        TEXT    DEFAULT '',
    created_at   TEXT    NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS budgets (
    id           SERIAL  PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id  INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    amount       DOUBLE PRECISION NOT NULL CHECK (amount > 0),
    UNIQUE (user_id, category_id)
);

CREATE TABLE IF NOT EXISTS goals (
    id        SERIAL  PRIMARY KEY,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name      TEXT    NOT NULL,
    target    DOUBLE PRECISION NOT NULL CHECK (target > 0),
    current   DOUBLE PRECISION NOT NULL DEFAULT 0,
    deadline  TEXT,
    color     TEXT    NOT NULL DEFAULT '#6366f1'
);

CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date);

-- Segurança do Supabase: bloqueia o acesso às tabelas pela API pública dele.
-- O nosso servidor Flask continua acessando normalmente.
ALTER TABLE users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals        ENABLE ROW LEVEL SECURITY;
"""


class Connection:
    """
    Pequeno "adaptador" para o resto do código continuar igual ao da
    versão com SQLite: aceita '?' nas consultas e devolve as linhas
    como dicionários. Usado sempre com:  with get_connection() as conn:
    """

    def __init__(self):
        if not DATABASE_URL:
            raise RuntimeError(
                "DATABASE_URL não configurada. Crie o arquivo .env com o endereço do Supabase."
            )
        self._conn = psycopg.connect(DATABASE_URL, row_factory=dict_row, prepare_threshold=None)

    def execute(self, sql, params=None):
        # O SQLite usa '?' para os valores; o PostgreSQL usa '%s'
        return self._conn.execute(sql.replace("?", "%s"), params)

    def executemany(self, sql, seq):
        with self._conn.cursor() as cur:
            cur.executemany(sql.replace("?", "%s"), seq)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        # Salva as alterações se deu tudo certo; desfaz se deu erro
        if exc_type is None:
            self._conn.commit()
        else:
            self._conn.rollback()
        self._conn.close()


def get_connection():
    """Abre uma conexão com o banco."""
    return Connection()


def init_db():
    """Cria as tabelas (se ainda não existirem)."""
    with get_connection() as conn:
        conn.execute(SCHEMA)


def seed_categories(conn, user_id):
    """Cria as categorias padrão para um usuário recém-cadastrado."""
    conn.executemany(
        "INSERT INTO categories (user_id, name, type, color, icon) VALUES (?, ?, ?, ?, ?)",
        [(user_id, *c) for c in DEFAULT_CATEGORIES],
    )
