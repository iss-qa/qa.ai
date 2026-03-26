"""
QAMind — Central Log Manager

Provides structured, context-aware logging for the entire daemon.
Each context (session, recording, execution, device, error) writes
to its own file with a consistent format.

Usage:
    from log_manager import log_manager
    log_manager.session("Sessão iniciada")
    log_manager.recording("Gravação iniciada", run_id="rec_123")
    log_manager.execution("Step 1 passed", run_id="run_abc")
    log_manager.device("Device conectado", udid="dcc71c7d")
    log_manager.error("Falha crítica", context="RECORDING", run_id="rec_123", exc=some_exception)
"""

import logging
import os
import gzip
import shutil
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
import traceback as tb_module

# Base logs directory at project root
PROJECT_ROOT = Path(__file__).parent.parent.parent
LOGS_BASE = PROJECT_ROOT / "logs"

# Sub-directories
SESSIONS_DIR = LOGS_BASE / "sessions"
RECORDINGS_DIR = LOGS_BASE / "recordings"
EXECUTIONS_DIR = LOGS_BASE / "executions"
DEVICE_DIR = LOGS_BASE / "device"
ERRORS_DIR = LOGS_BASE / "errors"
BUILDS_DIR = LOGS_BASE / "builds"

# Ensure all directories exist
for d in [SESSIONS_DIR, RECORDINGS_DIR, EXECUTIONS_DIR, DEVICE_DIR, ERRORS_DIR, BUILDS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# Standard log line format
LOG_FORMAT = "[%(asctime)s] [%(context)s] [%(levelname)s] %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S.%f"


class MillisecondFormatter(logging.Formatter):
    """Formatter that truncates microseconds to milliseconds."""
    def formatTime(self, record, datefmt=None):
        ct = datetime.fromtimestamp(record.created)
        return ct.strftime("%Y-%m-%d %H:%M:%S") + f".{int(ct.microsecond / 1000):03d}"


class ContextFilter(logging.Filter):
    """Adds context field to log records."""
    def __init__(self, context: str):
        super().__init__()
        self.context = context

    def filter(self, record):
        record.context = self.context
        return True


def _create_file_logger(name: str, filepath: Path, context: str, level=logging.DEBUG) -> logging.Logger:
    """Create a logger that writes to a specific file with context tagging."""
    logger = logging.getLogger(f"qamind.{name}")
    logger.setLevel(level)
    logger.propagate = False
    # Avoid duplicate handlers if called multiple times
    logger.handlers.clear()

    fh = logging.FileHandler(str(filepath), mode="a", encoding="utf-8")
    fh.setLevel(level)
    formatter = MillisecondFormatter(
        fmt="[%(asctime)s] [%(context)s] [%(levelname)s] %(message)s"
    )
    fh.setFormatter(formatter)
    fh.addFilter(ContextFilter(context))
    logger.addHandler(fh)
    return logger


class LogManager:
    """
    Central log manager that routes logs to context-specific files.
    """

    # Custom log level for EVENT
    EVENT_LEVEL = 25  # Between INFO (20) and WARNING (30)

    def __init__(self):
        # Register custom EVENT level
        logging.addLevelName(self.EVENT_LEVEL, "EVENT")

        self._today = datetime.now().strftime("%Y-%m-%d")

        # Error logger is daily-aggregated
        self._error_logger = self._init_error_logger()

        # Device loggers are per-device per-day (lazily initialized)
        self._device_loggers: dict[str, logging.Logger] = {}

        # Session/recording/execution/build loggers are per-instance (lazily initialized)
        self._session_loggers: dict[str, logging.Logger] = {}
        self._recording_loggers: dict[str, logging.Logger] = {}
        self._execution_loggers: dict[str, logging.Logger] = {}
        self._build_loggers: dict[str, logging.Logger] = {}

    # --- Error (daily aggregate) ---

    def _init_error_logger(self) -> logging.Logger:
        filepath = ERRORS_DIR / f"errors_{self._today}.log"
        return _create_file_logger("errors", filepath, "ERROR")

    def _ensure_error_logger_date(self):
        today = datetime.now().strftime("%Y-%m-%d")
        if today != self._today:
            self._today = today
            self._error_logger = self._init_error_logger()

    # --- Session ---

    def get_session_logger(self, session_id: str) -> logging.Logger:
        if session_id not in self._session_loggers:
            ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            filepath = SESSIONS_DIR / f"session_{ts}.log"
            self._session_loggers[session_id] = _create_file_logger(
                f"session.{session_id}", filepath, "SESSION"
            )
        return self._session_loggers[session_id]

    def session(self, message: str, session_id: str = "default", level: str = "INFO"):
        logger = self.get_session_logger(session_id)
        self._log(logger, level, message)

    # --- Recording ---

    def start_recording_log(self, recording_id: str) -> logging.Logger:
        ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        filepath = RECORDINGS_DIR / f"recording_{ts}.log"
        logger = _create_file_logger(
            f"recording.{recording_id}", filepath, "RECORDING"
        )
        self._recording_loggers[recording_id] = logger
        return logger

    def recording(self, message: str, recording_id: str = "default", level: str = "INFO"):
        if recording_id not in self._recording_loggers:
            self.start_recording_log(recording_id)
        logger = self._recording_loggers[recording_id]
        self._log(logger, level, message)

    def recording_event(self, message: str, recording_id: str = "default"):
        """Log a recording event (tap, swipe, type)."""
        self.recording(message, recording_id=recording_id, level="EVENT")

    def end_recording_log(self, recording_id: str):
        if recording_id in self._recording_loggers:
            for handler in self._recording_loggers[recording_id].handlers:
                handler.close()
            del self._recording_loggers[recording_id]

    # --- Execution ---

    def start_execution_log(self, run_id: str) -> logging.Logger:
        ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        filepath = EXECUTIONS_DIR / f"run_{run_id}_{ts}.log"
        logger = _create_file_logger(
            f"execution.{run_id}", filepath, f"RUN:{run_id[:8]}"
        )
        self._execution_loggers[run_id] = logger
        return logger

    def execution(self, message: str, run_id: str, level: str = "INFO"):
        if run_id not in self._execution_loggers:
            self.start_execution_log(run_id)
        logger = self._execution_loggers[run_id]
        self._log(logger, level, message)

    def execution_step(self, step_num: int, message: str, run_id: str, level: str = "INFO"):
        """Log with step prefix."""
        self.execution(f"[STEP{step_num}] {message}", run_id=run_id, level=level)

    def end_execution_log(self, run_id: str):
        if run_id in self._execution_loggers:
            for handler in self._execution_loggers[run_id].handlers:
                handler.close()
            del self._execution_loggers[run_id]

    # --- Build (Montagem de casos de teste) ---

    def start_build_log(self, build_id: str) -> logging.Logger:
        ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        filepath = BUILDS_DIR / f"build_{ts}_{build_id[-8:]}.log"
        logger = _create_file_logger(
            f"build.{build_id}", filepath, "BUILD"
        )
        self._build_loggers[build_id] = logger
        return logger

    def build(self, message: str, build_id: str, level: str = "INFO"):
        if build_id not in self._build_loggers:
            self.start_build_log(build_id)
        logger = self._build_loggers[build_id]
        self._log(logger, level, message)

    def end_build_log(self, build_id: str):
        if build_id in self._build_loggers:
            for handler in self._build_loggers[build_id].handlers:
                handler.close()
            del self._build_loggers[build_id]

    # --- Device ---

    def _get_device_logger(self, udid: str) -> logging.Logger:
        today = datetime.now().strftime("%Y-%m-%d")
        key = f"{udid}_{today}"
        if key not in self._device_loggers:
            safe_udid = udid.replace("/", "_").replace(":", "_")
            filepath = DEVICE_DIR / f"device_{safe_udid}_{today}.log"
            self._device_loggers[key] = _create_file_logger(
                f"device.{key}", filepath, "DEVICE"
            )
        return self._device_loggers[key]

    def device(self, message: str, udid: str, level: str = "INFO"):
        logger = self._get_device_logger(udid)
        self._log(logger, level, message)

    # --- Error (aggregated) ---

    def error(self, message: str, context: str = "SYSTEM", run_id: str = "",
              exc: Optional[Exception] = None):
        """Log an error to the daily error aggregate file."""
        self._ensure_error_logger_date()
        prefix = f"[{context}]"
        if run_id:
            prefix += f" [run:{run_id[:8]}]"

        full_msg = f"{prefix} {message}"
        if exc:
            full_msg += f"\n{''.join(tb_module.format_exception(type(exc), exc, exc.__traceback__))}"

        self._error_logger.error(full_msg)

        # Also print to console for visibility
        console_logger = logging.getLogger("qamind.console")
        console_logger.error(full_msg)

    # --- Internal ---

    def _log(self, logger: logging.Logger, level: str, message: str):
        level_upper = level.upper()
        if level_upper == "EVENT":
            logger.log(self.EVENT_LEVEL, message)
        elif level_upper == "DEBUG":
            logger.debug(message)
        elif level_upper == "WARN" or level_upper == "WARNING":
            logger.warning(message)
        elif level_upper == "ERROR":
            logger.error(message)
            # Also write to daily error file
            self._ensure_error_logger_date()
            self._error_logger.error(message)
        else:
            logger.info(message)

    # --- Rotation ---

    def rotate_logs(self):
        """
        Compress logs older than 7 days to .gz.
        Delete logs older than 30 days (except failed execution logs).
        """
        now = datetime.now()
        seven_days_ago = now - timedelta(days=7)
        thirty_days_ago = now - timedelta(days=30)

        for directory in [SESSIONS_DIR, RECORDINGS_DIR, EXECUTIONS_DIR, BUILDS_DIR, DEVICE_DIR, ERRORS_DIR]:
            for file in directory.iterdir():
                if file.suffix == ".log":
                    mtime = datetime.fromtimestamp(file.stat().st_mtime)

                    # Never delete failed execution logs
                    if directory == EXECUTIONS_DIR and self._is_failed_execution(file):
                        # Still compress if old enough
                        if mtime < seven_days_ago:
                            self._compress_file(file)
                        continue

                    if mtime < thirty_days_ago:
                        file.unlink()
                    elif mtime < seven_days_ago:
                        self._compress_file(file)

                elif file.suffix == ".gz":
                    mtime = datetime.fromtimestamp(file.stat().st_mtime)
                    if mtime < thirty_days_ago:
                        # Don't delete compressed failed execution logs
                        if directory == EXECUTIONS_DIR:
                            continue
                        file.unlink()

    def _is_failed_execution(self, filepath: Path) -> bool:
        """Check if an execution log contains a FAILED status."""
        try:
            content = filepath.read_text(encoding="utf-8", errors="ignore")
            return "FAILED" in content or "FALHOU" in content
        except Exception as e:
            logging.getLogger("qamind.console").warning(f"Não foi possível ler {filepath} para verificar falha: {e}")
            return True  # Preserve if we can't read it

    def _compress_file(self, filepath: Path):
        """Compress a log file to .gz"""
        gz_path = filepath.with_suffix(filepath.suffix + ".gz")
        if gz_path.exists():
            return
        try:
            with open(filepath, 'rb') as f_in:
                with gzip.open(gz_path, 'wb') as f_out:
                    shutil.copyfileobj(f_in, f_out)
            filepath.unlink()
        except Exception as e:
            logging.getLogger("qamind.console").error(f"Falha ao comprimir log {filepath}: {e}")

    # --- Query ---

    def list_logs(self, category: Optional[str] = None) -> list[dict]:
        """List all log files, optionally filtered by category."""
        categories = {
            "sessions": SESSIONS_DIR,
            "recordings": RECORDINGS_DIR,
            "executions": EXECUTIONS_DIR,
            "builds": BUILDS_DIR,
            "device": DEVICE_DIR,
            "errors": ERRORS_DIR,
        }

        if category and category in categories:
            dirs_to_scan = {category: categories[category]}
        else:
            dirs_to_scan = categories

        results = []
        for cat, directory in dirs_to_scan.items():
            if not directory.exists():
                continue
            for file in sorted(directory.iterdir(), key=lambda f: f.stat().st_mtime, reverse=True):
                if file.suffix in (".log", ".gz"):
                    stat = file.stat()
                    results.append({
                        "category": cat,
                        "filename": file.name,
                        "path": str(file.relative_to(LOGS_BASE)),
                        "size_bytes": stat.st_size,
                        "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        "compressed": file.suffix == ".gz",
                    })
        return results

    def read_log(self, relative_path: str, offset: int = 0, limit: int = 1000) -> dict:
        """Read log file contents with pagination."""
        filepath = LOGS_BASE / relative_path
        if not filepath.exists() or not filepath.is_file():
            return {"error": "File not found", "lines": [], "total_lines": 0}

        # Security: ensure path is within LOGS_BASE
        try:
            filepath.resolve().relative_to(LOGS_BASE.resolve())
        except ValueError:
            return {"error": "Invalid path", "lines": [], "total_lines": 0}

        try:
            if filepath.suffix == ".gz":
                with gzip.open(filepath, 'rt', encoding='utf-8', errors='replace') as f:
                    all_lines = f.readlines()
            else:
                with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                    all_lines = f.readlines()

            total = len(all_lines)
            lines = [l.rstrip('\n') for l in all_lines[offset:offset + limit]]
            return {
                "lines": lines,
                "total_lines": total,
                "offset": offset,
                "limit": limit,
                "filename": filepath.name,
            }
        except Exception as e:
            return {"error": str(e), "lines": [], "total_lines": 0}

    def get_error_count_today(self) -> int:
        """Count error lines in today's error file."""
        today = datetime.now().strftime("%Y-%m-%d")
        filepath = ERRORS_DIR / f"errors_{today}.log"
        if not filepath.exists():
            return 0
        try:
            with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                return sum(1 for line in f if "[ERROR]" in line)
        except Exception as e:
            logging.getLogger("qamind.console").warning(f"Falha ao contar erros do dia: {e}")
            return 0


# Singleton
log_manager = LogManager()
