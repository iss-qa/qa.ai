export interface Device {
    id: string;
    org_id: string;
    name: string;
    udid: string;
    platform: 'android' | 'ios';
    model?: string;
    manufacturer?: string;
    android_version?: string;
    screen_width?: number;
    screen_height?: number;
    status: 'online' | 'offline' | 'busy' | 'error';
    last_seen_at?: string;
}
