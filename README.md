# 💎 FinançaPro — Gestão Financeira Pessoal

Site completo de gestão financeira com tela de login, banco de dados e painel.

- **Front end:** HTML, CSS e JavaScript puro (pasta `static/`)
- **Back end:** Python com Flask (`app.py`)
- **Banco de dados:** SQLite (arquivo `finance.db`, criado sozinho na primeira execução)


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
