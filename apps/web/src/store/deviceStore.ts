import { create } from 'zustand';

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
}

export const useDeviceStore = create<DeviceState>((set) => ({
    connectedDevice: null,
    setConnectedDevice: (device) => set({ connectedDevice: device })
}));
