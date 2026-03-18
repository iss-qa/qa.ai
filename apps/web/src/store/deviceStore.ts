import { create } from 'zustand';
import { DAEMON_URL } from '@/lib/constants';
import { sessionLogger } from '@/lib/session-logger';

export interface Device {
    udid: string;
    model: string;
    os_version: string;
    status: string;
    resolution?: string;
    platform?: string;
}

interface DeviceState {
    connectedDevice: Device | null;
    setConnectedDevice: (device: Device | null) => void;
    _pollInterval: ReturnType<typeof setInterval> | null;
    startPolling: () => void;
    stopPolling: () => void;
}

export const useDeviceStore = create<DeviceState>((set, get) => ({
    connectedDevice: null,
    _pollInterval: null,

    setConnectedDevice: (device) => {
        const prev = get().connectedDevice;
        set({ connectedDevice: device });
        if (device) {
            sessionLogger.logDeviceConnected(device.udid, device.model, device.os_version);
            get().startPolling();
        } else {
            if (prev) sessionLogger.logDeviceDisconnected(prev.udid);
            get().stopPolling();
        }
    },

    startPolling: () => {
        const existing = get()._pollInterval;
        if (existing) return;

        const interval = setInterval(async () => {
            const device = get().connectedDevice;
            if (!device) {
                get().stopPolling();
                return;
            }

            try {
                const res = await fetch(`${DAEMON_URL}/devices`);
                if (!res.ok) return;
                const data = await res.json();
                const devices: Device[] = data.devices || [];
                const found = devices.find(d => d.udid === device.udid);
                if (!found) {
                    set({ connectedDevice: null });
                    get().stopPolling();
                }
            } catch {
                // Network error — don't disconnect yet, could be transient
            }
        }, 5000);

        set({ _pollInterval: interval });
    },

    stopPolling: () => {
        const interval = get()._pollInterval;
        if (interval) {
            clearInterval(interval);
            set({ _pollInterval: null });
        }
    },
}));
