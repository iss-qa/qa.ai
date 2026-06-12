'use client';

import { useState } from 'react';
import { Loader2, MessageSquare } from 'lucide-react';
import { ModalShell } from '@/components/qa-journey/ModalShell';
import { saveSlackCredentials } from '@/lib/integrations/api';
import type { IntegrationRecord, SlackCredentialsInput } from '@/types/integrations';

interface Props {
    initial?: { default_channel?: string | null };
    onClose: () => void;
    onSaved: (rec: IntegrationRecord) => void;
}

const inputClass = 'bg-foreground/5 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-brand/50';

export function SlackIntegrationModal({ initial, onClose, onSaved }: Props) {
    const [webhookUrl, setWebhookUrl] = useState('');
    const [channel, setChannel] = useState(initial?.default_channel ?? '');
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const handleSubmit = async () => {
        setError(null);
        const url = webhookUrl.trim();
        if (!/^https:\/\/hooks\.slack\.com\//.test(url)) {
            setError('Informe a Incoming Webhook URL (começa com https://hooks.slack.com/services/...)');
            return;
        }
        setSaving(true);
        try {
            const creds: SlackCredentialsInput = {
                webhook_url: url,
                default_channel: channel.trim() || undefined,
            };
            const saved = await saveSlackCredentials(creds);
            onSaved(saved);
        } catch (e2) {
            setError(e2 instanceof Error ? e2.message : String(e2));
        } finally {
            setSaving(false);
        }
    };

    return (
        <ModalShell
            title={<><MessageSquare className="w-5 h-5 text-brand" /> Configurar Slack</>}
            onClose={onClose}
            maxWidth="max-w-xl"
            footer={
                <>
                    <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={saving}
                        className="px-5 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:bg-brand/90 disabled:opacity-50 flex items-center gap-2"
                    >
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        Salvar webhook
                    </button>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                    Crie um <strong>Incoming Webhook</strong> no workspace do Slack em{' '}
                    <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                        api.slack.com/messaging/webhooks
                    </a>{' '}
                    apontando para o canal desejado (ex.: <code className="font-mono">#qa-alertas</code>) e cole a URL aqui.
                    O QAMind usa esse canal para notificações (syncs, falhas de teste, relatórios).
                </p>

                <Field label="Incoming Webhook URL">
                    <input
                        type="password"
                        value={webhookUrl}
                        onChange={e => setWebhookUrl(e.target.value)}
                        placeholder="https://hooks.slack.com/services/T000/B000/xxxx"
                        className={`${inputClass} font-mono`}
                        autoFocus
                    />
                </Field>

                <Field label="Canal (informativo)">
                    <input
                        type="text"
                        value={channel || ''}
                        onChange={e => setChannel(e.target.value)}
                        placeholder="#qa-alertas"
                        className={inputClass}
                    />
                    <p className="text-[10px] text-muted-foreground">
                        Só para exibição — o canal de destino real é o configurado no próprio webhook.
                    </p>
                </Field>

                {error && (
                    <div className="bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 text-xs text-danger">
                        {error}
                    </div>
                )}

                <p className="text-[10px] text-muted-foreground">
                    A URL do webhook é um segredo: é criptografada (AES-256-GCM) antes de ser gravada e nunca
                    volta para o navegador. O botão &quot;Testar conexão&quot; envia uma mensagem real no canal.
                </p>
            </div>
        </ModalShell>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</label>
            {children}
        </div>
    );
}
