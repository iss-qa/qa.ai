import type { TestStep, ScanSelectorGroup, ScanSelectorCommand, TestCase, TestFolder, TestTreeNode } from './project-types';

// Parse a Maestro YAML test file into the step shape used by test_cases.steps.
// Shared between the "Importar YAML" upload flow and "Salvar como Teste" from
// the Maestro Studio iframe so both produce identical row shapes.
//
// Each step's `maestro_command` preserves the FULL multi-line block (parent +
// indented children). The editor's "Executar Teste" rebuilds the YAML by
// joining these commands; if we only captured the parent line, multi-line
// commands like `- tapOn:\n    id: "btn"` would lose their selector and the
// run would fail with "no element specified".
export const extractAppIdFromYaml = (raw: string): string | null => {
    // YAML header: first `appId:` line before `---`. Quoted or unquoted.
    const headerEnd = raw.indexOf('---');
    const header = headerEnd >= 0 ? raw.slice(0, headerEnd) : raw;
    const m = header.match(/^\s*appId\s*:\s*["']?([^"'\n\r]+)["']?\s*$/m);
    return m ? m[1].trim() : null;
};

export const parseMaestroYamlToSteps = (rawContent: string): TestStep[] => {
    const content = rawContent
        .split('\n')
        .filter(line => !line.trimStart().startsWith('#'))
        .join('\n');
    if (!content.includes('---')) return [];
    const parts = content.split('---', 2);
    if (!parts[0].includes('appId')) return [];
    const lines = parts[1].split('\n');
    const steps: TestStep[] = [];
    let stepNum = 0;

    const trimQuotes = (s: string) => s.trim().replace(/^"|"$/g, '');

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        if (!line.startsWith('- ')) continue;

        // Accumulate any subsequent indented child lines (Maestro block form).
        const block: string[] = [raw];
        while (i + 1 < lines.length) {
            const nxt = lines[i + 1];
            if (nxt.trim() === '' || nxt.startsWith('- ') || !/^\s/.test(nxt)) break;
            if (nxt.trim().startsWith('#')) { i++; continue; }
            block.push(nxt);
            i++;
        }
        const fullCommand = block.join('\n');

        stepNum++;
        const cmdContent = line.substring(2).trim();
        const children: Record<string, string> = {};
        block.slice(1).forEach(l => {
            const m = l.trim().match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
            if (m) children[m[1]] = trimQuotes(m[2]);
        });

        let action = '', target = '', value = '';

        if (cmdContent === 'launchApp') { action = 'launchApp'; target = children.appId || 'Abre o aplicativo'; }
        else if (cmdContent === 'clearState') { action = 'clearState'; target = 'Limpa estado do app'; }
        else if (cmdContent === 'waitForAnimationToEnd') { action = 'waitForAnimationToEnd'; target = children.timeout || 'Aguarda transicao'; }
        else if (cmdContent === 'hideKeyboard') { action = 'hideKeyboard'; target = 'Esconde teclado'; }
        else if (cmdContent === 'back') { action = 'back'; target = 'Volta'; }
        else if (cmdContent === 'scroll') { action = 'scroll'; target = 'Rola a tela'; }
        else if (cmdContent.startsWith('launchApp:')) {
            action = 'launchApp';
            const inline = trimQuotes(cmdContent.replace('launchApp:', ''));
            target = inline || children.appId || 'Abre o aplicativo';
        }
        else if (cmdContent === 'tapOn:' || cmdContent.startsWith('tapOn:')) {
            action = 'tapOn';
            const inline = trimQuotes(cmdContent.replace('tapOn:', ''));
            target = inline || children.id || children.text || children.point || '';
        }
        else if (cmdContent === 'inputText:' || cmdContent.startsWith('inputText:')) {
            action = 'inputText';
            value = trimQuotes(cmdContent.replace('inputText:', '')) || children.text || '';
            target = value ? `Digita: ${value}` : 'Digita texto';
        }
        else if (cmdContent === 'assertVisible:' || cmdContent.startsWith('assertVisible:')) {
            action = 'assertVisible';
            const inline = trimQuotes(cmdContent.replace('assertVisible:', ''));
            target = inline || children.id || children.text || '';
        }
        else if (cmdContent.startsWith('extendedWaitUntil:')) {
            action = 'extendedWaitUntil';
            target = children.visible || '';
            value = children.timeout || '5000';
        }
        else {
            action = cmdContent.split(':')[0] || cmdContent;
            target = Object.values(children).filter(Boolean).join(' ') || trimQuotes(cmdContent.split(':').slice(1).join(':')) || cmdContent;
        }

        steps.push({
            id: String(stepNum),
            num: stepNum,
            action,
            target,
            value,
            engine: 'maestro',
            maestro_command: fullCommand,
        });
    }
    return steps;
};

export const getSelectorsFromGroup = (selectorGroup: ScanSelectorGroup): { type: string; strategy: string; command: string }[] => {
    return (selectorGroup?.commands || []).map((cmd: ScanSelectorCommand) => ({
        type: cmd.type || 'tapOn',
        strategy: cmd.strategy || '',
        command: cmd.command || '',
    }));
};

export const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
};

/**
 * Extract the UI element name from a user description.
 * Removes action verbs and keeps only the element identifier.
 *
 * "Clica em Busque seu produto" -> "Busque seu produto"
 * "Aguarda o elemento Busque seu produto aparecer na tela" -> "Busque seu produto"
 * "Digita o email isaias@gmail.com" -> "isaias@gmail.com"
 * "Valida que feijao e exibido" -> "feijao"
 */
export const extractElementName = (text: string): string => {
    let label = text;

    // 1. If there's quoted text, use it directly
    const quoted = label.match(/"([^"]+)"/);
    if (quoted) return quoted[1];

    // 2. Remove action verb prefixes (order: longest first)
    const actionPrefixes = [
        'Aguarda o elemento ', 'Aguarda que o elemento ', 'Aguarda que ',
        'Aguarda a transicao de tela apos ', 'Aguarda transicao de tela',
        'Aguarda botao ', 'Aguarda o botao ', 'Aguarda campo de ',
        'Aguarda aba ', 'Aguarda o ', 'Aguarda ',
        'Clica no botao ', 'Clica no campo ', 'Clica em ', 'Clica no ', 'Clica na ',
        'Toca no campo de ', 'Toca no campo ', 'Toca no botao ',
        'Toca em ', 'Toca no ', 'Toca na ',
        'Abre o app ', 'Abre o aplicativo ', 'Abre ',
        'Digita o email ', 'Digita a senha ', 'Digita o ', 'Digita a ', 'Digita ',
        'Valida que houve resultado e ', 'Valida que ', 'Valida se ',
        'Verifica que ', 'Verifica se ', 'Confirma que ',
        'Pressiona o botao ', 'Pressiona o ', 'Pressiona ', 'Esconde ',
        'Seleciona o ', 'Seleciona a ', 'Seleciona ',
    ];
    for (const p of actionPrefixes) {
        if (label.startsWith(p)) { label = label.substring(p.length); break; }
    }

    // 3. Remove trailing context phrases
    const contextSuffixes = [
        ' aparecer na tela inicial', ' aparecer na tela', ' aparecer nos resultados',
        ' aparecer', ' apareca', ' na tela inicial', ' na tela',
        ' para garantir que esta selecionada', ' para garantir', ' para confirmar',
        ' para acessar', ' para fazer', ' para iniciar', ' para realizar',
        ' e exibido na aba de produtos', ' e exibido', ' esta visivel',
        ' nos resultados', ' na aba de produtos', ' no campo de busca',
        ' carregar', ' ficar visivel', ' ficar habilitado', ' ficar',
        ' apos tap', ' apos clicar', ' apos digitar',
    ];
    for (const s of contextSuffixes) {
        const idx = label.indexOf(s);
        if (idx > 0) { label = label.substring(0, idx); break; }
    }

    // 4. Remove leftover filler words that are never in UI
    const fillerPrefixes = [
        'botao ', 'o botao ', 'campo ', 'campo de ', 'o campo ',
        'tela ', 'aba ', 'menu ', 'icone ', 'link ',
        'elemento ', 'o elemento ',
    ];
    let labelLower = label.toLowerCase();
    for (const fw of fillerPrefixes) {
        if (labelLower.startsWith(fw)) {
            label = label.substring(fw.length);
            labelLower = label.toLowerCase();
        }
    }

    return label.trim();
};

// ── Pastas de testes (migration 018) ───────────────────────────────────────

// Normaliza um path de pasta: remove barras nas pontas, colapsa barras
// duplicadas e espacos. Retorna '' para a raiz. Segmentos sao sanitizados
// para evitar caracteres problematicos em filesystem/Storage.
export const normalizeFolderPath = (p?: string | null): string => {
    if (!p) return '';
    return p
        .split('/')
        .map(seg => seg.trim().replace(/[^a-zA-Z0-9._ -]/g, '').trim())
        .filter(Boolean)
        .join('/');
};

// Monta a árvore de pastas/testes do projeto a partir da lista plana de
// testes (cada um com folder_path) e das pastas registradas (inclui vazias).
// O nó retornado é a RAIZ: seus `tests` são os testes sem pasta e seus
// `folders` são as pastas de primeiro nível.
export const buildTestTree = (tests: TestCase[], folders: TestFolder[]): TestTreeNode => {
    const root: TestTreeNode = { name: '', path: '', folders: [], tests: [] };

    // getNode: garante (criando se preciso) o nó da pasta com o path dado.
    const getNode = (path: string): TestTreeNode => {
        const norm = normalizeFolderPath(path);
        if (!norm) return root;
        const segments = norm.split('/');
        let node = root;
        let acc = '';
        for (const seg of segments) {
            acc = acc ? `${acc}/${seg}` : seg;
            let child = node.folders.find(f => f.name === seg);
            if (!child) {
                child = { name: seg, path: acc, folders: [], tests: [] };
                node.folders.push(child);
            }
            node = child;
        }
        return node;
    };

    // Pastas registradas primeiro — garante que pastas vazias apareçam.
    for (const f of folders) getNode(f.path);

    // Distribui os testes em seus nós.
    for (const t of tests) {
        const node = getNode(normalizeFolderPath(t.folder_path));
        node.tests.push(t);
    }

    // Ordena recursivamente: pastas por nome, testes por nome.
    const sortNode = (n: TestTreeNode) => {
        n.folders.sort((a, b) => a.name.localeCompare(b.name));
        n.tests.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        n.folders.forEach(sortNode);
    };
    sortNode(root);

    return root;
};
