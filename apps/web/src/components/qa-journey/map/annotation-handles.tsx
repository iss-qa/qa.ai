'use client';

// Pontos de conexão (estilo Miro) nas 4 bordas de uma anotação. Em modo de
// conexão "loose" qualquer ponto serve de origem OU alvo. Alvo de captura
// generoso (hitbox grande) p/ ligar um bloco a outro com facilidade; visíveis
// em baixa opacidade e destacados no hover do nó.

import { Handle, Position } from 'reactflow';

// Hitbox grande (4x4) com um "miolo" visível menor via box-shadow — facilita
// "pegar" o ponto de conexão sem precisar de mira precisa.
const dot = '!w-4 !h-4 !bg-brand/80 !border-2 !border-card !rounded-full opacity-40 group-hover:opacity-100 hover:!bg-brand hover:!scale-125 transition-all';

export function ConnectHandles() {
    return (
        <>
            <Handle type="source" position={Position.Left} id="l" className={dot} />
            <Handle type="source" position={Position.Top} id="t" className={dot} />
            <Handle type="source" position={Position.Right} id="r" className={dot} />
            <Handle type="source" position={Position.Bottom} id="b" className={dot} />
        </>
    );
}

// Classes do NodeResizer compartilhadas pelas anotações. Alça grande (16px) e
// arredondada + linhas de borda grossas/transparentes = alvo de redimensiona-
// mento generoso (pega de primeira, sem mira precisa).
export const RESIZER_LINE = '!border-[8px] !border-transparent hover:!border-brand/25';
export const RESIZER_HANDLE = '!w-4 !h-4 !rounded-sm !bg-brand !border-2 !border-card !shadow';
