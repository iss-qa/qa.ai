from enum import Enum

class EventType(str, Enum):
    # Dispositivos
    DEVICE_CONNECTED = "device_connected"
    DEVICE_DISCONNECTED = "device_disconnected"
    DEVICE_STATUS_CHANGED = "device_status_changed"
    
    # Gravação
    RECORDING_STARTED = "recording_started"
    RECORDING_STOPPED = "recording_stopped"
    STEP_RECORDED = "step_recorded"
    SCREENSHOT_UPDATED = "screenshot_updated"
    
    # Execução
    RUN_STARTED = "run_started"
    RUN_COMPLETED = "run_completed"
    RUN_FAILED = "run_failed"
    RUN_CANCELLED = "run_cancelled"
    
    # Bug Engine Events
    BUG_REPORT_GENERATING = "bug_report_generating"
    BUG_REPORT_READY = "bug_report_ready"
    STEP_STARTED = "step_started"
    STEP_COMPLETED = "step_completed"
    STEP_FAILED = "step_failed"
    STEP_RETRYING = "step_retrying"
    
    # IA
    AI_ANALYSIS_STARTED = "ai_analysis_started"
    AI_ANALYSIS_COMPLETED = "ai_analysis_completed"
    AI_AUTOCORRECT = "ai_autocorrect"
    
    # Erros
    ERROR = "error"
