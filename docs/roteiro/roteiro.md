Roteiro — QAMind Tech Talk (20 min)
[0:00 – 0:30] Slide 1 · Capa

"Bom dia/boa tarde a todos. Hoje vou apresentar o QAMind — 'na mente do QA' — um MVP que entrego hoje para vocês. Em 20 minutos vou mostrar o contexto, as funcionalidades, e no final uma demo ao vivo."

[0:30 – 2:00] Slide 2 · 3 anos sem ferramenta

"A história começa em Janeiro de 2023. Fizemos o primeiro levantamento de ferramentas de gestão de testes. Em Fevereiro, o resultado: nenhuma adotada. Planilhas continuaram sendo nossa realidade. Em março deste ano, um novo levantamento — desta vez com foco em IA — e chegamos ao mesmo obstáculo. Hoje, entrego a V1."

[2:00 – 3:30] Slide 3 · Ferramentas avaliadas

"Avaliamos Qase, TestQuality, Testim.io, Testsprit. Custo, rigidez de workflow, foco em web sem suporte real a mobile — sempre alguma coisa. A decisão foi: construir do zero, para o nosso fluxo."

[3:30 – 5:00] Slide 4 · O que é QAMind

"QAMind tem três pilares: visibilidade, organização visual e automação integrada. Não é uma ferramenta genérica adaptada — é construída para como o QA Foxbit trabalha."

[5:00 – 7:00] Slide 5 · Maestro Studio

"Primeira forma de criar um caso de teste mobile: integração nativa com o Maestro Studio. Você cria os passos no dispositivo, o resultado é um YAML limpo, versionável, reproduzível."

[7:00 – 8:30] Slide 6 · Gravador

"Segunda forma: o gravador. Zero código. O QA usa o app no celular como um usuário real. A ferramenta escreve o YAML. Iniciar, usar, parar, reproduzir."

[8:30 – 10:00] Slide 7 · Execução

"Todos os casos ficam na tela do projeto. Individual, em lote ou agendado via cron. Qualquer device conectado via ADB executa conforme o cronograma."

[10:00 – 11:00] Slide 8 · Jira

"Quando um teste falha: screenshot capturado, bug criado automaticamente no Jira. Hoje no projeto de testes QA. Trocar para o projeto da squad é alterar um ID."

[11:00 – 13:00] Slide 9 · Jornadas

"Este é o coração do produto. As jornadas substituem a planilha. Canvas visual gerado automaticamente, subfluxos aninhados, métricas de cobertura em tempo real — manuais e automatizados lado a lado."

[13:00 – 14:30] Slide 10 · Ciclo de automação


"Um detalhe importante: o alerta de automação. Crio um caso manual, configuro 15 dias. A feature é entregue e validada. Em 15 dias chega um alerta. O QA então automatiza — Playwright se for web, Maestro se for mobile. O caso é atualizado. O ciclo fecha."

[14:30 – 16:00] Slide 11 · Playwright

"Para projetos web: conexão com o GitHub da organização. Push dispara os testes via GitHub Actions. A plataforma organiza visualmente os resultados — mesma interface de jornadas. POC rodando com o BugBank."

[16:00 – 18:00] Slide 12 · DEMO ao vivo

"Agora vamos ver funcionando. [demo ao vivo]"

[18:00 – 20:00] Slide 13 · Próximos passos

"Para levar para produção: validação InfoSec, VPN, domínio Foxbit. Precisamos resolver o acesso remoto ao device — emulador, device farm ou tunnel. E uma vez em produção, evoluir com base no feedback real de vocês."