// Cliente Google Sheets autenticado por instancia.
// As credenciais agora chegam via DB (org_integrations.credentials_cipher)
// e nao mais do env - assim cada empresa configura a sua propria.

import { google, sheets_v4 } from 'googleapis';

export interface GoogleServiceAccountCreds {
    client_email: string;
    private_key: string;
    project_id?: string;
    [key: string]: unknown;
}

// Cacheamos clients por client_email para evitar refazer JWT a cada chamada.
const clientCache = new Map<string, sheets_v4.Sheets>();

export function getSheetsClient(creds: GoogleServiceAccountCreds): sheets_v4.Sheets {
    const cached = clientCache.get(creds.client_email);
    if (cached) return cached;
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: creds.client_email,
            private_key: creds.private_key,
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const client = google.sheets({ version: 'v4', auth });
    clientCache.set(creds.client_email, client);
    return client;
}

// ============================================================
// Operacoes
// ============================================================

export interface SheetTab {
    sheetId: number;
    title: string;
    rowCount: number;
    columnCount: number;
}

/** Lista todas as abas de uma planilha. */
export async function listSheetTabs(creds: GoogleServiceAccountCreds, spreadsheetId: string): Promise<SheetTab[]> {
    const sheets = getSheetsClient(creds);
    const { data } = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))',
    });
    return (data.sheets || []).map(s => {
        const p = s.properties || {};
        return {
            sheetId: p.sheetId ?? 0,
            title: p.title ?? '',
            rowCount: p.gridProperties?.rowCount ?? 0,
            columnCount: p.gridProperties?.columnCount ?? 0,
        };
    });
}

export interface SheetPreview {
    headers: string[];
    rows: string[][];
    totalRows: number;
}

/** Le um trecho da aba retornando header + amostras de linhas. */
export async function previewSheet(
    creds: GoogleServiceAccountCreds,
    spreadsheetId: string,
    sheetName: string,
    headerRow = 1,
    sampleRows = 10,
): Promise<SheetPreview> {
    const sheets = getSheetsClient(creds);
    const lastSampleRow = headerRow + sampleRows;
    const range = `${sheetName}!A${headerRow}:ZZ${lastSampleRow}`;
    const { data } = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const values = (data.values || []) as string[][];

    const headers = values[0] ? values[0].map(v => (v || '').toString().trim()) : [];
    const rows = values.slice(1).map(r => r.map(v => (v || '').toString()));

    const props = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties(title,gridProperties(rowCount))',
    });
    const tab = (props.data.sheets || []).find(s => s.properties?.title === sheetName);
    const totalRows = tab?.properties?.gridProperties?.rowCount ?? values.length;

    return { headers, rows, totalRows };
}

/** Le todas as linhas de dados de uma aba como objetos chaveados por header. */
export async function readSheetRows(
    creds: GoogleServiceAccountCreds,
    spreadsheetId: string,
    sheetName: string,
    headerRow: number,
    dataStartRow: number,
): Promise<Record<string, string>[]> {
    const sheets = getSheetsClient(creds);

    const headerRange = `${sheetName}!A${headerRow}:ZZ${headerRow}`;
    const headerRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: headerRange });
    const headers = (headerRes.data.values?.[0] || []).map(v => (v || '').toString().trim());
    if (headers.length === 0) {
        throw new Error(`Header row ${headerRow} esta vazia em "${sheetName}"`);
    }

    const dataRange = `${sheetName}!A${dataStartRow}:ZZ`;
    const dataRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: dataRange });
    const values = (dataRes.data.values || []) as string[][];

    return values.map(row => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
            obj[h] = (row[i] ?? '').toString();
        });
        return obj;
    });
}
