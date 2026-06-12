'use client';

// Botão de engrenagem + popover de configurações do mapa de jornadas.

import { useEffect, useRef, useState } from 'react';
import { LayoutGrid, Settings2 } from 'lucide-react';
import type { MapSettings } from './useMapSettings';

interface MapSettingsPopoverProps {
    settings: MapSettings;
    onChange: (patch: Partial<MapSettings>) => void;
    // Redefinir layout: volta os nós para a auto-organização original.
    hasCustomLayout: boolean;
    onResetLayout: () => void;
}

export function MapSettingsPopover({ settings, onChange, hasCustomLayout, onResetLayout }: MapSettingsPopoverProps) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className={`bg-popover/80 backdrop-blur border border-border rounded-lg p-2 transition-colors ${
                    open ? 'text-brand' : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Configurações do mapa"
                aria-label="Configurações do mapa"
                aria-expanded={open}
            >
                <Settings2 className="w-4 h-4" />
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-popover border border-border rounded-xl shadow-xl p-4 flex flex-col gap-4 z-20">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        Configurações do mapa
                    </p>

                    <SettingToggle
                        label="Agrupar jornada com filhas"
                        description="Ao arrastar uma jornada, os sub-fluxos e casos conectados se movem juntos."
                        checked={settings.groupDrag}
                        onChange={v => onChange({ groupDrag: v })}
                    />

                    <SettingToggle
                        label="Evitar sobreposição"
                        description="Ao soltar um card sobre outro, o card de baixo desliza suavemente para um espaço livre."
                        checked={settings.antiOverlap}
                        onChange={v => onChange({ antiOverlap: v })}
                    />

                    <div className="border-t border-border pt-3 flex flex-col gap-1.5">
                        <button
                            type="button"
                            onClick={() => { onResetLayout(); setOpen(false); }}
                            disabled={!hasCustomLayout}
                            className="inline-flex items-center gap-2 text-xs font-bold text-warning hover:text-warning/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            <LayoutGrid className="w-3.5 h-3.5" />
                            Redefinir layout
                        </button>
                        <p className="text-[11px] text-muted-foreground leading-snug">
                            Descarta as posições e tamanhos personalizados e volta à organização automática.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

function SettingToggle({
    label,
    description,
    checked,
    onChange,
}: {
    label: string;
    description: string;
    checked: boolean;
    onChange: (value: boolean) => void;
}) {
    return (
        <label className="flex items-start gap-3 cursor-pointer select-none">
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className={`relative w-9 h-5 rounded-full shrink-0 mt-0.5 transition-colors ${
                    checked ? 'bg-brand' : 'bg-foreground/15'
                }`}
            >
                <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                        checked ? 'left-[18px]' : 'left-0.5'
                    }`}
                />
            </button>
            <span className="flex flex-col gap-0.5">
                <span className="text-xs font-bold text-foreground">{label}</span>
                <span className="text-[11px] text-muted-foreground leading-snug">{description}</span>
            </span>
        </label>
    );
}
