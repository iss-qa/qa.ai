/**
 * QAMind — Frontend Session Logger
 *
 * Captures user actions in the web interface and sends them to the daemon
 * for persistent logging. Batches entries and flushes periodically.
 */

import { DAEMON_URL } from './constants';

interface LogEntry {
  level: string;
  message: string;
  session_id: string;
}

class SessionLogger {
  private sessionId: string;
  private buffer: LogEntry[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private readonly FLUSH_INTERVAL_MS = 3000;
  private readonly MAX_BUFFER_SIZE = 50;

  constructor() {
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  start() {
    if (this.flushInterval) return;
    this.flushInterval = setInterval(() => this.flush(), this.FLUSH_INTERVAL_MS);

    // Flush on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flush());
    }

    this.info('Sessão iniciada');
  }

  stop() {
    this.info('Sessão finalizada');
    this.flush();
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  info(message: string) {
    this.addEntry('INFO', message);
  }

  warn(message: string) {
    this.addEntry('WARN', message);
  }

  error(message: string) {
    this.addEntry('ERROR', message);
  }

  // --- Specific logging helpers ---

  logNavigation(from: string, to: string) {
    this.info(`Navegação: ${from} → ${to}`);
  }

  logDeviceConnected(udid: string, model: string, osVersion: string) {
    this.info(`Device conectado: ${udid} | ${model} | Android ${osVersion}`);
  }

  logDeviceDisconnected(udid: string) {
    this.warn(`Device desconectado: ${udid}`);
  }

  logButtonClick(buttonName: string, context?: string) {
    const ctx = context ? ` | Contexto: ${context}` : '';
    this.info(`Botão clicado: ${buttonName}${ctx}`);
  }

  logModalOpen(modalName: string) {
    this.info(`Modal aberto: ${modalName}`);
  }

  logModalClose(modalName: string) {
    this.info(`Modal fechado: ${modalName}`);
  }

  logVisionUpload(files: { name: string; size: number }[]) {
    const fileDetails = files
      .map(f => `${f.name} (${Math.round(f.size / 1024)}KB)`)
      .join(' | ');
    this.info(`Upload de imagens Vision: ${files.length} arquivos | ${fileDetails}`);
  }

  logVisionOrder(fileNames: string[]) {
    this.info(`Ordem das imagens definida pelo usuário: [${fileNames.join(' → ')}]`);
  }

  logRecordingStart(udid: string) {
    this.info(`Gravação iniciada no device: ${udid}`);
  }

  logRecordingStop(stepCount: number) {
    this.info(`Gravação parada | ${stepCount} steps capturados`);
  }

  logTestExecution(runId: string, testName: string) {
    this.info(`Execução iniciada: ${testName} | run_id: ${runId}`);
  }

  logError(error: Error | string, context?: string) {
    const msg = error instanceof Error ? error.message : error;
    const ctx = context ? ` [${context}]` : '';
    this.error(`Erro${ctx}: ${msg}`);
  }

  // --- Internal ---

  private addEntry(level: string, message: string) {
    this.buffer.push({
      level,
      message,
      session_id: this.sessionId,
    });

    // Auto-flush if buffer is full
    if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
      this.flush();
    }
  }

  private async flush() {
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    try {
      // Use sendBeacon for unload, fetch otherwise
      const body = JSON.stringify({ entries });

      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' });
        const sent = navigator.sendBeacon(`${DAEMON_URL}/api/logs/session/batch`, blob);
        if (sent) return;
      }

      await fetch(`${DAEMON_URL}/api/logs/session/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    } catch {
      // If daemon is unreachable, log to console as fallback
      for (const entry of entries) {
        console.error(`[SESSION LOG FALLBACK] [${entry.level}] ${entry.message}`);
      }
    }
  }
}

// Singleton
export const sessionLogger = new SessionLogger();
