// AES-256-GCM helpers para encriptar credenciais sensiveis antes de
// gravar em org_integrations.credentials_cipher. A chave vem de
// INTEGRATIONS_ENCRYPTION_KEY (32 bytes em base64).
//
// Formato do output: "{iv}:{authTag}:{ciphertext}" todos em base64.

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;       // 96 bits, recomendado para GCM
const KEY_LENGTH = 32;      // 256 bits

let cachedKey: Buffer | null = null;
let keyError: string | null = null;

function loadKey(): Buffer {
    if (cachedKey) return cachedKey;
    const raw = (process.env.INTEGRATIONS_ENCRYPTION_KEY || '').trim();
    if (!raw) {
        keyError = 'INTEGRATIONS_ENCRYPTION_KEY nao definido no apps/api/.env';
        throw new Error(keyError);
    }
    let key: Buffer;
    try {
        key = Buffer.from(raw, 'base64');
    } catch {
        keyError = 'INTEGRATIONS_ENCRYPTION_KEY nao e base64 valido';
        throw new Error(keyError);
    }
    if (key.length !== KEY_LENGTH) {
        keyError = `INTEGRATIONS_ENCRYPTION_KEY decoded length=${key.length}, esperado ${KEY_LENGTH} bytes (gere com: openssl rand -base64 32)`;
        throw new Error(keyError);
    }
    cachedKey = key;
    return key;
}

export function isEncryptionConfigured(): boolean {
    try {
        loadKey();
        return true;
    } catch {
        return false;
    }
}

export function encryptionConfigError(): string | null {
    if (cachedKey) return null;
    try { loadKey(); return null; }
    catch { return keyError; }
}

export function encrypt(plaintext: string): string {
    const key = loadKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGO, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decrypt(encoded: string): string {
    const key = loadKey();
    const parts = encoded.split(':');
    if (parts.length !== 3) {
        throw new Error('Formato de credenciais cifradas invalido');
    }
    const [ivB64, tagB64, ctB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const ct = Buffer.from(ctB64, 'base64');
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
    return plaintext.toString('utf8');
}

// Helper conveniente para credenciais JSON
export function encryptJson(value: unknown): string {
    return encrypt(JSON.stringify(value));
}

export function decryptJson<T = unknown>(encoded: string): T {
    return JSON.parse(decrypt(encoded)) as T;
}
