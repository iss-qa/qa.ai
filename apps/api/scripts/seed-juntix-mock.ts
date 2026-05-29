// =====================================================
// Seed mock para o projeto Juntix.
//
// Cria um demo completo da Jornada do QA:
//   - 6 jornadas com cobertura variada (de 0% a ~90%)
//   - ~24 sub-fluxos (mix automated / partial / manual / none)
//   - ~60 casos com prioridade e last_run_status
//   - 6 bug reports mockados
//   - 9 semanas de snapshots historicos (mostra evolucao no timeline)
//   - Copia sheet_configs do Foxbit (se existirem) apontando para Juntix
//   - Vincula automation_status='automated' subflows aos test_cases existentes
//
// Idempotente: deleta o estado anterior do mock antes de re-criar.
// Pre-condicao: projeto "Juntix" cadastrado em /dashboard/projects.
//
// Como rodar:
//   cd apps/api && pnpm seed:juntix
//   ou
//   cd apps/api && npx tsx scripts/seed-juntix-mock.ts
// =====================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obrigatorios em apps/api/.env');
    process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const JUNTIX_NAME = 'Juntix';
const FOXBIT_NAME = 'Foxbit Mobile';
const MOCK_BUG_PREFIX = '[MOCK]';

// =====================================================
// Estrutura do mock (deterministica para screenshots estaveis)
// =====================================================

type Status = 'automated' | 'partial' | 'manual' | 'none';
type Priority = 'low' | 'medium' | 'high' | 'critical';

interface MockSubflow {
    title: string;
    status: Status;
    description?: string;
    cases: { title: string; priority: Priority; lastRun: 'pass' | 'fail' | 'skipped' | null }[];
}

interface MockJourney {
    slug: string;
    title: string;
    description: string;
    icon: string;
    color: string;
    sequence: number;
    subflows: MockSubflow[];
}

const MOCK: MockJourney[] = [
    {
        slug: 'autenticacao', title: 'Autenticação',
        description: 'Fluxos de login, recuperação de senha e 2FA da carteira Juntix.',
        icon: 'Lock', color: '#7c3aed', sequence: 0,
        subflows: [
            {
                title: 'Login com sucesso', status: 'automated',
                description: 'Autenticação via e-mail/senha com conta ativa.',
                cases: [
                    { title: 'Login com e-mail e senha válidos', priority: 'critical', lastRun: 'pass' },
                    { title: 'Login com sessão persistente (lembrar-me)', priority: 'high', lastRun: 'pass' },
                    { title: 'Login após reset de senha', priority: 'medium', lastRun: 'pass' },
                ],
            },
            {
                title: 'Login com falha', status: 'automated',
                description: 'Mensagens de erro e bloqueios após tentativas inválidas.',
                cases: [
                    { title: 'Senha incorreta — exibe mensagem genérica', priority: 'high', lastRun: 'pass' },
                    { title: 'Bloqueio após 5 tentativas em 10min', priority: 'critical', lastRun: 'fail' },
                ],
            },
            {
                title: 'Recuperar senha', status: 'manual',
                description: 'E-mail de redefinição + validação de token.',
                cases: [
                    { title: 'Solicita e-mail de recuperação', priority: 'high', lastRun: null },
                    { title: 'Link expira em 30 minutos', priority: 'medium', lastRun: null },
                    { title: 'Token inválido retorna 410', priority: 'medium', lastRun: null },
                ],
            },
            {
                title: '2FA (TOTP + SMS)', status: 'partial',
                description: 'Autenticação de segundo fator com app autenticador ou SMS.',
                cases: [
                    { title: '2FA via Google Authenticator', priority: 'critical', lastRun: 'pass' },
                    { title: '2FA via SMS — código de 6 dígitos', priority: 'high', lastRun: 'fail' },
                    { title: 'Desativar 2FA exige nova autenticação', priority: 'high', lastRun: null },
                ],
            },
        ],
    },
    {
        slug: 'cadastro', title: 'Cadastro',
        description: 'Criação de conta e validações iniciais — CPF, e-mail, termos.',
        icon: 'UserPlus', color: '#10b981', sequence: 1,
        subflows: [
            {
                title: 'Criar conta (e-mail/senha)', status: 'automated',
                cases: [
                    { title: 'Cadastro com dados válidos cria conta inativa', priority: 'critical', lastRun: 'pass' },
                    { title: 'E-mail duplicado retorna 409', priority: 'high', lastRun: 'pass' },
                ],
            },
            {
                title: 'Validação de campos', status: 'automated',
                cases: [
                    { title: 'Senha < 8 caracteres bloqueia submit', priority: 'high', lastRun: 'pass' },
                    { title: 'E-mail inválido sinaliza no blur', priority: 'medium', lastRun: 'pass' },
                ],
            },
            {
                title: 'CPF válido', status: 'manual',
                cases: [
                    { title: 'CPF com dígito verificador correto aceita', priority: 'high', lastRun: null },
                    { title: 'CPF "111.111.111-11" rejeita', priority: 'medium', lastRun: null },
                ],
            },
            {
                title: 'Aceite de termos', status: 'none',
                cases: [
                    { title: 'Aceite de Termos + Privacidade obrigatório', priority: 'medium', lastRun: null },
                ],
            },
        ],
    },
    {
        slug: 'kyc', title: 'KYC e Verificação',
        description: 'Upload de documentos, selfie e fluxo de aprovação/rejeição.',
        icon: 'Shield', color: '#f59e0b', sequence: 2,
        subflows: [
            {
                title: 'Upload de documento', status: 'manual',
                cases: [
                    { title: 'Upload de RG frente e verso (.jpg < 10MB)', priority: 'critical', lastRun: null },
                    { title: 'Upload de CNH (PDF) aceita', priority: 'high', lastRun: null },
                    { title: 'Arquivo > 10MB rejeita com mensagem clara', priority: 'medium', lastRun: null },
                ],
            },
            {
                title: 'Selfie biométrica', status: 'manual',
                cases: [
                    { title: 'Captura de selfie com prova de vida', priority: 'critical', lastRun: null },
                    { title: 'Retry após selfie de baixa qualidade', priority: 'medium', lastRun: null },
                ],
            },
            {
                title: 'Status aprovado', status: 'none',
                cases: [
                    { title: 'Notificação por push + e-mail ao aprovar', priority: 'high', lastRun: null },
                ],
            },
            {
                title: 'Status rejeitado', status: 'none',
                cases: [
                    { title: 'Motivos exibidos no app + reenvio permitido', priority: 'high', lastRun: null },
                ],
            },
        ],
    },
    {
        slug: 'pagamentos', title: 'Pagamentos',
        description: 'PIX, boleto, cartão de crédito. Núcleo do produto.',
        icon: 'CreditCard', color: '#3b82f6', sequence: 3,
        subflows: [
            {
                title: 'PIX — enviar', status: 'automated',
                cases: [
                    { title: 'PIX por chave aleatória — sucesso', priority: 'critical', lastRun: 'pass' },
                    { title: 'PIX por CPF — sucesso', priority: 'critical', lastRun: 'pass' },
                    { title: 'PIX acima do limite diário bloqueia', priority: 'critical', lastRun: 'pass' },
                    { title: 'PIX com chave inválida exibe erro', priority: 'high', lastRun: 'pass' },
                ],
            },
            {
                title: 'PIX — receber', status: 'automated',
                cases: [
                    { title: 'Receber PIX adiciona ao saldo em < 5s', priority: 'critical', lastRun: 'pass' },
                    { title: 'Notificação push ao receber', priority: 'high', lastRun: 'pass' },
                ],
            },
            {
                title: 'Boleto', status: 'automated',
                cases: [
                    { title: 'Geração de boleto com vencimento +3 dias', priority: 'high', lastRun: 'pass' },
                    { title: 'Pagamento de boleto via código de barras', priority: 'high', lastRun: 'pass' },
                ],
            },
            {
                title: 'Cartão de crédito', status: 'partial',
                cases: [
                    { title: 'Pagamento com Visa em até 12x', priority: 'high', lastRun: 'pass' },
                    { title: 'Pagamento com Mastercard recusado por antifraude', priority: 'medium', lastRun: 'fail' },
                    { title: 'Tokenização do cartão (PCI-DSS)', priority: 'critical', lastRun: null },
                ],
            },
        ],
    },
    {
        slug: 'carteira', title: 'Carteira',
        description: 'Saldo, histórico, filtros e exports.',
        icon: 'Wallet', color: '#ec4899', sequence: 4,
        subflows: [
            {
                title: 'Saldo em tempo real', status: 'automated',
                cases: [
                    { title: 'Saldo atualiza após transação em < 2s', priority: 'critical', lastRun: 'pass' },
                    { title: 'Saldo zero exibe CTA "Adicionar fundos"', priority: 'medium', lastRun: 'pass' },
                ],
            },
            {
                title: 'Histórico de transações', status: 'automated',
                cases: [
                    { title: 'Paginação infinita carrega +20 por scroll', priority: 'high', lastRun: 'pass' },
                    { title: 'Click em transação abre detalhe', priority: 'medium', lastRun: 'pass' },
                ],
            },
            {
                title: 'Filtros por tipo/período', status: 'manual',
                cases: [
                    { title: 'Filtro por PIX enviado nos últimos 30 dias', priority: 'medium', lastRun: null },
                    { title: 'Filtro combinado (tipo + valor + período)', priority: 'low', lastRun: null },
                ],
            },
            {
                title: 'Export CSV', status: 'none',
                cases: [
                    { title: 'Export de extrato mensal por e-mail', priority: 'low', lastRun: null },
                ],
            },
        ],
    },
    {
        slug: 'configuracoes', title: 'Configurações',
        description: 'Conta, segurança, notificações e exclusão.',
        icon: 'Settings', color: '#06b6d4', sequence: 5,
        subflows: [
            {
                title: 'Trocar senha', status: 'none',
                cases: [
                    { title: 'Trocar senha exige senha atual', priority: 'high', lastRun: null },
                    { title: 'Novas senhas devem ser diferentes', priority: 'medium', lastRun: null },
                ],
            },
            {
                title: 'Notificações push', status: 'none',
                cases: [
                    { title: 'Toggle por categoria (transações, marketing, segurança)', priority: 'medium', lastRun: null },
                ],
            },
            {
                title: 'Excluir conta', status: 'none',
                cases: [
                    { title: 'Excluir conta exige saldo zero + confirmação dupla', priority: 'high', lastRun: null },
                ],
            },
        ],
    },
];

// Mock de bugs - referencia (jornada slug, subflow title) para link semantico no log
const MOCK_BUGS: { severity: 'critical' | 'high' | 'medium' | 'low'; title: string; description: string }[] = [
    { severity: 'critical', title: `${MOCK_BUG_PREFIX} PIX retorna erro 500 ao enviar acima de R$ 5000`, description: 'Bug crítico em produção. Reprodutível 8 de cada 10 tentativas com valores entre R$5K e R$10K.' },
    { severity: 'high', title: `${MOCK_BUG_PREFIX} Login falha intermitente em redes 3G fracas`, description: 'Em conexões instáveis, o token JWT chega vazio e o usuário fica em loop de login.' },
    { severity: 'high', title: `${MOCK_BUG_PREFIX} KYC trava ao fazer upload de PDF > 10MB`, description: 'O backend aceita mas o app trava sem mensagem. Bloqueia conclusão de cadastro.' },
    { severity: 'medium', title: `${MOCK_BUG_PREFIX} Validação de CPF aceita 11 zeros como válido`, description: 'Edge case raro mas viola compliance.' },
    { severity: 'medium', title: `${MOCK_BUG_PREFIX} Cartão de crédito Mastercard timeout após 30s`, description: 'Adquirente está rejeitando 12% das transações com Mastercard. Investigação em andamento.' },
    { severity: 'low', title: `${MOCK_BUG_PREFIX} Tipografia do botão "Esqueci a Senha" quebra em iPhone SE`, description: 'Visual only — não bloqueia o fluxo.' },
];

// =====================================================
// Helpers
// =====================================================

async function findProjectByName(name: string): Promise<string | null> {
    const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .ilike('name', name)
        .maybeSingle();
    if (error) { console.error(`Erro buscando ${name}:`, error.message); return null; }
    return data?.id || null;
}

// =====================================================
// Main
// =====================================================

async function main() {
    console.log('🧪 Seed mock da Jornada do QA — projeto Juntix\n');

    // 1. Projeto Juntix
    const juntixId = await findProjectByName(JUNTIX_NAME);
    if (!juntixId) {
        console.error(`❌ Projeto "${JUNTIX_NAME}" nao encontrado.`);
        console.error('   Crie em /dashboard/projects e rode novamente.');
        process.exit(1);
    }
    console.log(`✔ Juntix: ${juntixId}`);

    // 2. Cleanup do mock anterior (idempotencia)
    console.log('\n🧹 Limpando mock anterior...');
    await supabase.from('qa_journey_snapshots').delete().eq('project_id', juntixId);
    await supabase.from('qa_journey_sheet_configs').delete().eq('project_id', juntixId);
    await supabase.from('bug_reports').delete().eq('project_id', juntixId).like('title', `${MOCK_BUG_PREFIX}%`);
    // qa_journeys cascateia para subflows + cases + jira_cache
    await supabase.from('qa_journeys').delete().eq('project_id', juntixId);
    console.log('  ok');

    // 3. Jornadas
    console.log('\n📚 Criando jornadas...');
    const journeyIdBySlug = new Map<string, string>();
    for (const j of MOCK) {
        const { data, error } = await supabase
            .from('qa_journeys')
            .insert({
                project_id: juntixId,
                slug: j.slug,
                title: j.title,
                description: j.description,
                icon: j.icon,
                color: j.color,
                sequence: j.sequence,
                is_published: true,
            })
            .select('id')
            .single();
        if (error) throw error;
        journeyIdBySlug.set(j.slug, data.id);
        console.log(`  ✔ ${j.title}`);
    }

    // 4. Sub-fluxos
    console.log('\n🔀 Criando sub-fluxos...');
    interface SubRef { id: string; journeySlug: string; status: Status; title: string }
    const subflowRefs: SubRef[] = [];
    for (const j of MOCK) {
        const journeyId = journeyIdBySlug.get(j.slug)!;
        for (let i = 0; i < j.subflows.length; i++) {
            const s = j.subflows[i];
            const { data, error } = await supabase
                .from('qa_journey_subflows')
                .insert({
                    journey_id: journeyId,
                    title: s.title,
                    description: s.description ?? null,
                    sequence: i,
                    automation_status: s.status,
                })
                .select('id')
                .single();
            if (error) throw error;
            subflowRefs.push({ id: data.id, journeySlug: j.slug, status: s.status, title: s.title });
        }
    }
    console.log(`  ✔ ${subflowRefs.length} sub-fluxos criados`);

    // 5. Linkar test_cases existentes aos sub-fluxos 'automated' (round-robin)
    console.log('\n🔗 Vinculando test cases Maestro...');
    const { data: testCases } = await supabase
        .from('test_cases')
        .select('id, name')
        .limit(20);
    const tcIds = (testCases || []).map(t => t.id);
    if (tcIds.length === 0) {
        console.log('  ⚠ Nenhum test_case encontrado no DB — pulando vinculacao');
    } else {
        const autoSubs = subflowRefs.filter(s => s.status === 'automated');
        let tcIdx = 0;
        let linked = 0;
        for (const sub of autoSubs) {
            if (tcIdx >= tcIds.length) tcIdx = 0; // recicla se ha mais subs que tcs
            const { error } = await supabase
                .from('qa_journey_subflows')
                .update({ test_case_id: tcIds[tcIdx++] })
                .eq('id', sub.id);
            if (!error) linked++;
        }
        console.log(`  ✔ ${linked} sub-fluxos vinculados (de ${autoSubs.length} automated)`);
    }

    // 6. Casos
    console.log('\n📋 Criando casos...');
    let extId = 1000;
    let caseCount = 0;
    const now = new Date();
    for (const j of MOCK) {
        for (const s of j.subflows) {
            const subRef = subflowRefs.find(r => r.journeySlug === j.slug && r.title === s.title)!;
            for (const c of s.cases) {
                await supabase.from('qa_journey_cases').insert({
                    subflow_id: subRef.id,
                    external_id: `JTX-${extId++}`,
                    title: c.title,
                    steps_summary: `Passos para "${c.title}". 1. Setup. 2. Executa. 3. Valida resultado.`,
                    expected_result: 'O sistema responde dentro do esperado, sem efeitos colaterais em outros fluxos.',
                    priority: c.priority,
                    last_run_status: c.lastRun,
                    last_run_at: c.lastRun ? now.toISOString() : null,
                });
                caseCount++;
            }
        }
    }
    console.log(`  ✔ ${caseCount} casos criados`);

    // 7. Sheet configs - copia de Foxbit se existirem
    console.log('\n📄 Sheet configs...');
    const foxbitId = await findProjectByName(FOXBIT_NAME);
    if (foxbitId) {
        const { data: foxbitConfigs } = await supabase
            .from('qa_journey_sheet_configs')
            .select('*')
            .eq('project_id', foxbitId);
        if (foxbitConfigs && foxbitConfigs.length > 0) {
            for (const cfg of foxbitConfigs) {
                await supabase.from('qa_journey_sheet_configs').insert({
                    project_id: juntixId,
                    spreadsheet_id: cfg.spreadsheet_id,
                    sheet_name: cfg.sheet_name,
                    header_row: cfg.header_row,
                    data_start_row: cfg.data_start_row,
                    column_map: cfg.column_map,
                    defaults: cfg.defaults,
                    transforms: cfg.transforms,
                    is_active: true,
                });
            }
            console.log(`  ✔ ${foxbitConfigs.length} sheet config(s) copiada(s) do Foxbit`);
        } else {
            console.log('  ⚠ Foxbit sem sheet configs — pulando');
        }
    } else {
        console.log(`  ⚠ Projeto "${FOXBIT_NAME}" nao encontrado — pulando copia de sheet configs`);
    }

    // 8. Bug reports
    console.log('\n🐞 Criando bug reports...');
    for (let i = 0; i < MOCK_BUGS.length; i++) {
        const b = MOCK_BUGS[i];
        await supabase.from('bug_reports').insert({
            project_id: juntixId,
            severity: b.severity,
            title: b.title,
            description: b.description,
            status: i % 3 === 0 ? 'in_progress' : 'open',
            source: 'manual',
        });
    }
    console.log(`  ✔ ${MOCK_BUGS.length} bugs criados`);

    // 9. Snapshots historicos (9 semanas, deterministico)
    // Mostra evolucao: % automacao sobe 30 → 50, bugs caem 8 → 4, casos sobem 40 → 60
    console.log('\n📸 Snapshots historicos (9 semanas)...');
    // Base date: domingo da semana atual
    const baseSunday = new Date();
    baseSunday.setDate(baseSunday.getDate() - baseSunday.getDay()); // volta pra domingo
    for (let weeksBack = 8; weeksBack >= 0; weeksBack--) {
        const d = new Date(baseSunday);
        d.setDate(baseSunday.getDate() - weeksBack * 7);
        const snapshotDate = d.toISOString().slice(0, 10);
        const progress = (8 - weeksBack) / 8; // 0..1
        const totalSubflows = 23;
        const automated = Math.round(7 + progress * 4);       // 7 → 11
        const partial = 2;
        const manual = 6;
        const noCover = totalSubflows - automated - partial - manual;
        const totalCases = Math.round(40 + progress * 20);    // 40 → 60
        const openBugs = Math.max(2, Math.round(8 - progress * 4));      // 8 → 4
        const passRate = Math.round((65 + progress * 25) * 100) / 100;   // 65 → 90
        await supabase.from('qa_journey_snapshots').upsert({
            project_id: juntixId,
            snapshot_date: snapshotDate,
            total_journeys: 6,
            total_subflows: totalSubflows,
            total_cases: totalCases,
            automated_subflows: automated,
            partial_subflows: partial,
            manual_subflows: manual,
            open_bugs_count: openBugs,
            open_tasks_count: Math.round(3 + progress * 2),
            pass_rate_7d: passRate,
        }, { onConflict: 'project_id,snapshot_date' });
    }
    console.log('  ✔ 9 snapshots inseridos (8 semanas de evolucao)');

    console.log('\n✅ Mock completo!');
    console.log('\nAbra:');
    console.log('  • /dashboard/qa-journey?project=' + juntixId + '         → mapa publico');
    console.log('  • /dashboard/qa-journey/insights?project=' + juntixId + ' → dashboard');
    console.log('  • /dashboard/qa-journey/admin?project=' + juntixId + '    → admin\n');
}

main().catch(err => {
    console.error('\n❌ Erro fatal:', err instanceof Error ? err.message : err);
    if (err instanceof Error && err.stack) console.error(err.stack);
    process.exit(1);
});
