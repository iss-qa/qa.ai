from datetime import datetime
from ai.bug_engine.models import RunEvidence, StepScreenshot
import subprocess
import logging

logger = logging.getLogger(__name__)

class EvidenceCollector:
    """
    Coleta todas as evidências necessárias para o bug report.
    Deve ser chamado imediatamente após um step falhar.
    """
    
    def __init__(self, db_client=None, device_manager=None):
        self.db = db_client
        self.device_manager = device_manager

    async def collect(
        self, 
        run_id: str, 
        failed_step_num: int, 
        test_case_data: dict, 
        run_history: list,
        failed_screenshot_url: str,
        ai_analysis: str = None,
        autocorrect_attempts: list = None
    ) -> RunEvidence:
        """
        Para o MVP, faremos o assemble em memória dos dados que o RunOrchestrator já possui.
        """
        
        # Build Screenshots timeline
        screenshots = []
        for event in run_history:
            if event.get('type') == 'step_completed' or event.get('type') == 'step_failed':
                screenshots.append(StepScreenshot(
                    step_num=event['data'].get('step_num', 0),
                    description=event['data'].get('description', ''),
                    status='passed' if event['type'] == 'step_completed' else 'failed',
                    screenshot_url=event['data'].get('screenshot_url'),
                    duration_ms=event['data'].get('duration_ms', 0)
                ))

        # Find the specific failed step context
        failed_step_desc = "Unknown"
        failed_step_error = "Unknown Error"
        
        for step in test_case_data.get('steps', []):
            if step.get('num') == failed_step_num:
                failed_step_desc = step.get('description', '')
                break

        app_version = await self._get_app_version("emulator-5554", "com.bancox")

        return RunEvidence(
            test_case_name=test_case_data.get('name', f"Test {run_id}"),
            test_case_id=test_case_data.get('id', 'unknown'),
            run_id=run_id,
            
            device_name=test_case_data.get('target_device', 'Android Virtual Device'),
            device_model="Pixel 7 Pro", # Mock
            android_version="13.0", # Mock
            app_package="com.bancox", # Mock
            app_version=app_version,
            
            started_at=datetime.utcnow().isoformat() + "Z", # FIXME: Use real start time
            failed_at=datetime.utcnow().isoformat() + "Z",
            total_duration_ms=15000, # Mock
            
            all_steps=test_case_data.get('steps', []),
            failed_step_num=failed_step_num,
            failed_step_description=failed_step_desc,
            failed_step_error=failed_step_error,
            
            screenshots=screenshots,
            failed_step_screenshot_url=failed_screenshot_url,
            
            last_ai_analysis=ai_analysis,
            autocorrect_attempts=autocorrect_attempts or []
        )
    
    async def _get_app_version(self, udid: str, package: str) -> str:
        """Busca a versão do app no dispositivo via ADB."""
        try:
            # Em um cenário real chamaríamos o adb shell
            # result = subprocess.run(['adb', '-s', udid, 'shell', 'dumpsys', 'package', package], capture_output=True, text=True)
            # return parse_version(result.stdout)
            return "1.0.4"
        except Exception as e:
            logger.warning(f"Failed to fetch app version: {e}")
            return "Unknown"
