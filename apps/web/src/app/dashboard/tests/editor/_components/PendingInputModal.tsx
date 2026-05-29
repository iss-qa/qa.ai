'use client';

export function PendingInputModal({
    pendingInputText,
    setPendingInputText,
    onConfirm,
    onSkip,
    onEscape,
}: {
    pendingInputText: string;
    setPendingInputText: (text: string) => void;
    onConfirm: () => void;
    onSkip: () => void;
    onEscape: () => void;
}) {
    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-popover border border-border rounded-2xl p-6 w-[380px] shadow-2xl">
                <h3 className="text-base font-bold text-foreground mb-2">Qual texto você digitou?</h3>
                <p className="text-xs text-muted-foreground mb-4">
                    Um campo de texto foi detectado. Informe o valor digitado para gerar o passo <code className="text-purple-400">inputText</code>.
                </p>
                <input
                    autoFocus
                    className="w-full bg-foreground/5 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand mb-4"
                    placeholder="Texto digitado..."
                    value={pendingInputText}
                    onChange={e => setPendingInputText(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') onConfirm();
                        if (e.key === 'Escape') onEscape();
                    }}
                />
                <div className="flex gap-2 justify-end">
                    <button
                        onClick={onSkip}
                        className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg"
                    >
                        Pular
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-1.5 text-xs font-semibold bg-brand text-white rounded-lg hover:bg-brand/80"
                    >
                        Confirmar
                    </button>
                </div>
            </div>
        </div>
    );
}
