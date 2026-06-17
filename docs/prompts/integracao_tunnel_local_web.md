# 🌐 Executar na Web com Dispositivo Local (Custo Zero)

Permite que a **plataforma web em produção** (`https://qamind.issqa.com.br`) detecte e controle o **device físico** plugado no SEU PC, falando com o **daemon local** (porta 8001) — sem Device Farms.

O `localhost` continua funcionando sem nenhum impacto: sem configuração extra, tudo se comporta como antes.

---

## 🧠 Como funciona

O daemon (Python) roda na SUA máquina, junto do device via USB. O **navegador** que abre o app deployado também está na sua máquina — então ele pode falar com o daemon de dois jeitos:

1. **Modo localhost (padrão, sem setup):** o navegador chama `http://localhost:8001` direto. Navegadores tratam `http://localhost` como origem segura, então funciona mesmo numa página HTTPS. Basta o daemon estar rodando e o CORS liberar a origem da web (já configurado).

2. **Modo túnel (fallback):** se o navegador bloquear `http://localhost` a partir do HTTPS (alguns navegadores/políticas), exponha o daemon por um túnel HTTPS (ngrok) e configure a URL na página de Dispositivos.

> O endpoint do daemon usado pela web é resolvido em runtime: `localStorage['qamind-daemon-url']` (override) → `NEXT_PUBLIC_DAEMON_URL` (build) → `http://localhost:8001`.

---

## 🛠️ Pré-requisitos na máquina local

1. **Android SDK & ADB** no PATH.
2. **Maestro CLI** (`curl -fsSL https://get.maestro.mobile.dev | bash`).
3. Daemon QAMind rodando (`porta 8001`).
4. Celular com **Depuração USB** ativa e autorizado (RSA).
5. (Só modo túnel) **ngrok** (`brew install ngrok` ou binário oficial).

---

## 🚀 Passo a passo

### 1. Verifique o device e suba o daemon
```bash
adb devices            # deve listar o aparelho como "device"
# suba o daemon QAMind (porta 8001) na sua máquina
```

### 2. Abra a web e detecte o device
- Acesse `https://qamind.issqa.com.br/dashboard/devices`.
- O painel **"Conexão com o daemon"** deve mostrar **Conectado** (endpoint `http://localhost:8001`).
- Clique em **Conectar Dispositivo → Escanear** — o aparelho aparece.

### 3. (Só se o localhost for bloqueado) Modo túnel
```bash
ngrok http 8001
# copie a URL https, ex: https://a1b2c3d4.ngrok-free.app
```
- Na página de Dispositivos → **Alterar endpoint** → cole a URL HTTPS do ngrok → **Salvar**.
- O status deve virar **Conectado**. Para voltar ao local, **Alterar endpoint → Padrão**.

---

## 🔒 CORS do daemon

O daemon libera, por padrão: `localhost`/`127.0.0.1` (qualquer porta) e `https://qamind.issqa.com.br`.
Origens extras (ex.: domínio próprio) via env:
```bash
DAEMON_ALLOWED_ORIGINS="https://meu-dominio.com,https://outro.com"
```
Reinicie o daemon após qualquer mudança de origem.

---

## ✅ Resumo
- **Mesma máquina (você):** modo localhost, zero setup.
- **Bloqueado pelo navegador:** modo túnel com ngrok + "Alterar endpoint".
- `localhost` puro (dev): inalterado.
