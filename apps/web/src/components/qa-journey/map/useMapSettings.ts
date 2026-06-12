'use client';

// Preferências do mapa de jornadas, persistidas em localStorage
// (compartilhadas entre projetos — são preferências do usuário, não do dado).

import { useCallback, useEffect, useState } from 'react';

export interface MapSettings {
    // Arrastar uma jornada move junto os sub-fluxos e casos expandidos.
    groupDrag: boolean;
    // Ao soltar um card sobre outro, o que estava lá é empurrado suavemente.
    antiOverlap: boolean;
}

const STORAGE_KEY = 'qa-journey-map-settings';
const DEFAULTS: MapSettings = { groupDrag: true, antiOverlap: true };

export function useMapSettings(): [MapSettings, (patch: Partial<MapSettings>) => void] {
    const [settings, setSettings] = useState<MapSettings>(DEFAULTS);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
        } catch {
            // parse/storage indisponível — mantém defaults
        }
    }, []);

    const update = useCallback((patch: Partial<MapSettings>) => {
        setSettings(prev => {
            const next = { ...prev, ...patch };
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            } catch {
                // ignore
            }
            return next;
        });
    }, []);

    return [settings, update];
}
