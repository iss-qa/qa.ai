'use client';

export function EnvVarsModal({
    envVarsNeeded,
    envVarsValues,
    setEnvVarsValues,
    onCancel,
    onExecute,
}: {
    envVarsNeeded: string[];
    envVarsValues: Record<string, string>;
    setEnvVarsValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    onCancel: () => void;
    onExecute: () => void;
}) {
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-popover border border-border rounded-2xl p-6 w-[400px] shadow-2xl">
                <h3 className="text-lg font-bold text-foreground mb-4">Variaveis de ambiente</h3>
                <p className="text-xs text-muted-foreground mb-4">O YAML Maestro requer as seguintes variaveis:</p>
                <div className="flex flex-col gap-3">
                    {envVarsNeeded.map((varName) => (
                        <div key={varName}>
                            <label className="text-xs font-bold text-muted-foreground mb-1 block">{varName}</label>
                            <input
                                type={varName.toLowerCase().includes('password') || varName.toLowerCase().includes('senha') ? 'password' : 'text'}
                                value={envVarsValues[varName] || ''}
                                onChange={(e) => setEnvVarsValues(prev => ({ ...prev, [varName]: e.target.value }))}
                                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                                placeholder={`Valor para ${varName}`}
                            />
                        </div>
                    ))}
                </div>
                <div className="flex gap-2 mt-5">
                    <button
                        onClick={onCancel}
                        className="flex-1 px-4 py-2 text-sm border border-zinc-700 text-zinc-400 rounded-lg hover:text-foreground hover:border-zinc-500 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onExecute}
                        className="flex-1 px-4 py-2 text-sm bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition-colors"
                    >
                        Executar Teste
                    </button>
                </div>
            </div>
        </div>
    );
}
