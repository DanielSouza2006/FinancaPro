# 💎 FinançaPro — Gestão Financeira Pessoal

Site completo de gestão financeira com tela de login, banco de dados e painel.

- **Front end:** HTML, CSS e JavaScript puro (pasta `static/`)
- **Back end:** Python com Flask (`app.py`)
- **Banco de dados:** SQLite (arquivo `finance.db`, criado sozinho na primeira execução)

---

## ▶️ Como rodar (passo a passo)

1. **Instale o Python** (versão 3.10 ou mais nova): https://www.python.org/downloads/
   No Windows, marque a opção **"Add Python to PATH"** durante a instalação.

2. **Descompacte** esta pasta e abra um terminal dentro dela
   (no Windows: abra a pasta, clique na barra de endereço, digite `cmd` e aperte Enter).

3. **Instale o Flask:**
   ```
   pip install -r requirements.txt
   ```

4. **Inicie o servidor:**
   ```
   python app.py
   ```

5. Abra o navegador em **http://127.0.0.1:5000**, clique em **Criar conta** e pronto!

Para desligar o servidor, volte ao terminal e aperte `Ctrl + C`.

> Os gráficos usam a biblioteca Chart.js carregada da internet, então o computador precisa estar conectado.

---

## ✨ Funcionalidades

**Login e segurança**
- Cadastro e login com validação em tempo real e medidor de força da senha
- Senhas guardadas criptografadas (hash) — nunca em texto puro
- Bloqueio de 5 minutos após 5 senhas erradas (proteção contra força bruta)
- Opção "Lembrar de mim" (sessão de 30 dias)
- Cada usuário só vê os próprios dados

**Painel**
- Saldo acumulado, receitas, despesas e resultado do mês (com animação)
- Taxa de economia do mês
- Gráfico de barras: receitas × despesas dos últimos 6 meses
- Gráfico de rosca: gastos por categoria
- Últimos lançamentos e contas pendentes/atrasadas (com botão "Pagar")

**Lançamentos**
- Adicionar, editar e excluir receitas e despesas
- Parcelamento / contas fixas (repete por até 60 meses)
- Status pago/pendente (clique no selo para alternar)
- Busca e filtros por tipo, categoria e status
- Exportação para CSV (abre no Excel)

**Orçamentos** — limite mensal por categoria, com barra de progresso e alertas (Atenção / Estourado)

**Metas** — objetivos de economia com anel de progresso, prazo e quanto guardar por mês

**Categorias** — 13 categorias prontas + criar as suas com emoji e cor

**Configurações** — editar nome, trocar senha, exportar tudo, excluir conta

**Extras** — tema claro/escuro, layout responsivo (celular), atalho **N** para novo lançamento e **Esc** para fechar janelas

---

## 📁 Estrutura

```
finance-app/
├── app.py              ← servidor Python (rotas da API)
├── database.py         ← criação das tabelas do banco
├── requirements.txt    ← bibliotecas necessárias
├── finance.db          ← banco de dados (criado automaticamente)
└── static/
    ├── index.html      ← tela de login / cadastro
    ├── app.html        ← painel (depois do login)
    ├── css/style.css   ← visual de todo o site
    └── js/
        ├── common.js   ← funções compartilhadas (API, tema, avisos)
        ├── login.js    ← interatividade do login
        └── app.js      ← lógica do painel
```

## 🔌 Como o front end conversa com o back end

O JavaScript chama endereços que começam com `/api/`. O Python recebe, consulta o banco
e devolve os dados em JSON. Exemplos:

| Método | Endereço | O que faz |
|---|---|---|
| POST | `/api/register` | Cria conta |
| POST | `/api/login` | Faz login |
| GET | `/api/summary?month=2026-09` | Números do painel |
| GET/POST | `/api/transactions` | Lista / cria lançamentos |
| PUT/DELETE | `/api/transactions/<id>` | Edita / exclui |
| GET/POST | `/api/budgets` | Orçamentos |
| GET/POST | `/api/goals` | Metas |
| GET | `/api/export.csv` | Baixa planilha |

## 🚀 Para colocar na internet (futuro)

- Defina uma variável de ambiente `SECRET_KEY` com um valor aleatório e secreto
  (sem ela, todos precisam fazer login de novo sempre que o servidor reinicia).
- Use um servidor de produção (ex.: `gunicorn app:app`) em vez de `python app.py`.
- Serviços como Render ou PythonAnywhere hospedam apps Flask.
