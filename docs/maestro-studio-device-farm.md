# Maestro Studio / Daemon remoto — proposta de "device farm" interna

> **Status:** proposta para discussão com a Segurança da Informação (InfoSec).
> **Autor:** QA / Engenharia — QAMind.
> **Objetivo:** permitir usar o Maestro Studio e a execução de testes em
> `https://qamind.issqa.com.br` **sem que cada QA precise clonar o projeto e
> rodar o daemon na própria máquina** — centralizando os dispositivos em um
> ponto controlado pela empresa.

---

## 1. Contexto: como funciona hoje

O QAMind tem três processos (ver [README.md](../README.md)):

| Processo | Onde roda hoje | Função |
|----------|----------------|--------|
| `apps/web` (Next.js) | VPS / produção (HTTPS) | Dashboard |
| `apps/api` (Fastify) | VPS / produção (HTTPS) | Integrações, cron, credenciais cifradas |
| `apps/daemon` (Python) | **Máquina local do QA** | Controla o Android via ADB/Maestro |

O **daemon nunca foi para a nuvem**: ele precisa de um dispositivo Android
físico conectado (USB/ADB). Por isso o fluxo atual exige:

1. QA clona o repositório.
2. Roda `./start.sh` (daemon na porta `8001`).
3. Conecta o celular via USB.
4. Usa o Studio pelo navegador (produção) — que fala com `http://localhost:8001`.

Isso funciona porque o navegador trata `http://localhost` como *secure context*
(não bloqueia mixed-content vindo de uma página HTTPS), e o CORS do daemon já
libera a origem de produção.

**Limitação:** cada QA precisa de máquina configurada + celular plugado. Não
escala e atrita o onboarding.

---

## 2. Proposta: daemon centralizado ("device farm")

Um (ou mais) **PC da empresa**, sempre ligado, com **celular(es) conectado(s)**,
rodando o daemon. As máquinas dos QAs apenas abrem `qamind.issqa.com.br` no
navegador e se conectam a esse daemon central **via rede/IP**, sem precisar
clonar nada nem ter celular próprio.

```
                          rede interna / VPN
   [ Navegador do QA ] ───────────────────────────▶ [ PC-farm Foxbit ]
   qamind.issqa.com.br                                 daemon :8001
   (HTTPS, produção)                                    │
                                                        ├─ ADB ─▶ 📱 Android #1
                                                        └─ ADB ─▶ 📱 Android #2
```

### É viável? **Sim, tecnicamente.** Mas depende de três coisas:

1. **Re-patch do bundle do Studio** (engenharia) — hoje o frontend do Studio tem
   `http://localhost:8001` *hardcoded*. Para apontar a um daemon remoto, o bundle
   precisa ler o endpoint em runtime (query param `?api=` / `window`). Já existe
   o mecanismo `getDaemonUrl()` no web, mas ele **não alcança** o bundle do Studio
   ainda. Esforço: médio (artefato minificado, ~22 pontos a patchar).
2. **Exposição de rede segura do daemon** (InfoSec) — é o ponto central deste
   documento (seção 4).
3. **HTTPS/TLS no daemon ou via túnel** — uma página HTTPS **não** consegue
   chamar um `http://<ip-interno>:8001` (isso é *mixed content* e o navegador
   bloqueia; a exceção do `localhost` **não** vale para IP remoto). O daemon
   remoto teria que ser servido sobre **TLS** (HTTPS) ou atrás de um túnel que
   termine TLS.

---

## 3. Superfície de exposição do daemon (o que a InfoSec precisa saber)

O daemon **não é** um servidor read-only inofensivo. Ele expõe, sem
autenticação hoje (apenas CORS, que **não** é controle de segurança — CORS só
governa navegador; um cliente fora do navegador ignora):

| Endpoint | O que faz | Risco se exposto |
|----------|-----------|------------------|
| `/api/maestro-studio/file/{create,save,read,list,delete,rename}` | **CRUD de arquivos** no workspace do host | Leitura/escrita/exclusão de arquivos na máquina-farm |
| `/api/maestro-studio/pick-directory` | Abre seletor de pasta do SO | Enumeração do filesystem |
| `/mss/api/commands/*`, `/mss/api/flows/*` | **Executa flows Maestro** no device | Automação arbitrária do dispositivo |
| `/mss/api/device-screen/sse`, `/mss/api/devices/*` | Stream de tela + lista de devices | Vazamento de tela/estado do device |
| ADB subjacente | Acesso total ao Android conectado | Instalar/ler apps, dados, etc. |

> **Resumo para a InfoSec:** expor o daemon na rede **sem autenticação** equivale
> a dar, a qualquer host que alcance a porta, **leitura/escrita de arquivos no
> PC-farm e controle do dispositivo Android**. CORS não protege contra isso.

---

## 4. Controles recomendados (a validar com a InfoSec)

Nenhuma destas opções deve ir a produção sem o aval da Segurança da Informação.
Listadas da mais simples à mais robusta:

### Rede
- **Bind restrito + VPN:** daemon acessível **somente** pela VPN corporativa /
  rede interna; nunca exposto à internet pública. ACL/firewall liberando apenas
  as faixas de IP dos QAs.
- **Sem port-forward público.** Nada de abrir `:8001` no roteador/edge.

### Autenticação
- **Token/secret obrigatório** em todo request ao daemon (header
  `Authorization`), validado server-side — não confiar em CORS.
- Idealmente integrar com o SSO/identidade da empresa (sessão do QAMind →
  token de curta duração para o daemon).

### Transporte
- **TLS no daemon** (certificado interno) **ou** túnel gerenciado
  (Cloudflare Tunnel / ngrok corporativo) que termine HTTPS — requisito para a
  página HTTPS conseguir falar com o daemon.

### Host / hardening
- PC-farm dedicado, **não** estação de trabalho pessoal; usuário de SO de baixo
  privilégio; workspace do daemon isolado (chroot/diretório dedicado) para
  limitar o alcance do CRUD de arquivos.
- Logs de auditoria (quem executou qual flow / qual operação de arquivo).
- Atualização/patch do SO e do daemon sob gestão de TI.

### Alternativas a avaliar
- **Emulador em nuvem / device farm gerenciado** (ex.: Genymotion Cloud, AWS
  Device Farm, BrowserStack) — terceiriza a infra e parte dos controles, mas
  envolve **enviar app/credenciais a terceiros** → avaliar contra a política de
  dados Foxbit (provavelmente exige homologação prévia).
- **Túnel sob demanda por sessão** em vez de daemon 24/7 exposto — reduz a
  janela de exposição.

---

## 5. Decisão pedida à InfoSec

1. Podemos expor um daemon interno (com token + TLS + VPN) num PC-farm dedicado,
   restrito à rede corporativa? Sob quais condições?
2. Há preferência por túnel gerenciado (Cloudflare/ngrok corporativo) vs. TLS
   direto + ACL de firewall?
3. Soluções de **device farm em nuvem de terceiros** são aceitáveis para os apps
   em teste (que podem conter dados/builds internos), ou ficam vetadas?
4. Requisitos de auditoria/retenção de logs para esse acesso.

> Enquanto não houver definição, o modelo suportado continua sendo o
> **daemon local na máquina do QA** (seção 1), que não expõe nada na rede.

---

## 6. Anexo — esforço de engenharia (independe da InfoSec)

| Item | Esforço | Bloqueia o quê |
|------|---------|----------------|
| Re-patch do bundle do Studio para endpoint configurável (`?api=`/`window`) | Médio | Studio falar com daemon remoto |
| Propagar `getDaemonUrl()` até o iframe do Studio | Baixo | idem |
| TLS/token no daemon (`apps/daemon`) | Médio | Pré-requisito de segurança |

O **deploy do Studio em produção para o fluxo local já está resolvido** (bundle
versionado + servido na imagem do web). Esta proposta cobre apenas o passo
seguinte: **daemon remoto/centralizado**.
