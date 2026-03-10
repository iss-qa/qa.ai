from dataclasses import dataclass
from typing import Optional, List, Dict, Any

@dataclass
class StepScreenshot:
    step_num: int
    description: str
    status: str
    screenshot_url: Optional[str]
    duration_ms: int

@dataclass
class RunEvidence:
    # Test Info
    test_case_name: str
    test_case_id: str
    run_id: str
    
    # Device
    device_name: str
    device_model: str
    android_version: str
    app_package: str
    app_version: str
    
    # Run Lifecycle
    started_at: str
    failed_at: str
    total_duration_ms: int
    
    # Steps History
    all_steps: List[Dict[str, Any]]
    failed_step_num: int
    failed_step_description: str
    failed_step_error: str
    
    # Visual Info
    screenshots: List[StepScreenshot]
    failed_step_screenshot_url: str
    
    # AI Loop
    last_ai_analysis: Optional[str]
    autocorrect_attempts: List[str]

@dataclass
class BugReportContent:
    title: str
    severity: str
    severity_justification: str
    summary: str
    expected_behavior: str
    actual_behavior: str
    root_cause_hypothesis: str
    steps_to_reproduce: List[str]
    environment: Dict[str, str]
    impact: str
    suggested_investigation: str
