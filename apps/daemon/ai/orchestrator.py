import logging
import asyncio
from typing import List, Optional, Any
from models.step import TestStep, StepResult, StepAction
from models.run_event import RunEvent
from ws.events import EventType
# Removed fixed import to allow injection or dynamic selection
from ai.vision_analyzer import VisionAnalyzer, VisionResult
from ai.auto_corrector import AutoCorrector
from supabase import create_client, Client
from pydantic import BaseModel
import os
from ai.bug_engine.collector import EvidenceCollector
from ai.bug_engine.ai_reporter import AIReporter
from ai.bug_engine.pdf_generator import PDFGenerator

logger = logging.getLogger("orchestrator")

class TestCase(BaseModel):
    steps: List[TestStep]

class RunSummary(BaseModel):
    status: str
    total_steps: int
    failed_at_step: Optional[int] = None

class RunOrchestrator:
    MAX_RETRIES = 3
    
    def __init__(
        self,
        executor: Any,
        vision_analyzer: VisionAnalyzer,
        auto_corrector: AutoCorrector,
        screenshot_handler,
        ws_broadcaster,
        supabase_url: str,
        supabase_key: str
    ):
        self.executor = executor
        self.vision = vision_analyzer
        self.corrector = auto_corrector
        self.screenshots = screenshot_handler
        self.ws = ws_broadcaster
        self.db: Optional[Client] = None
        if supabase_url and supabase_key:
            try:
                self.db = create_client(supabase_url, supabase_key)
            except Exception as e:
                logger.warning(f"Failed to create Supabase client: {e}")
        self.is_cancelled = False
    
    async def cancel(self):
        self.is_cancelled = True
        
    async def run(self, test_case: TestCase, run_id: str, device_udid: Optional[str] = None, platform: str = "android") -> RunSummary:
        self.is_cancelled = False
        history = []
        
        # Start Web session if needed
        if platform == "web" and hasattr(self.executor, "start_session"):
            await self.executor.start_session()
        
        logger.info(f"[EXECUTOR] Run {run_id} started. Total steps: {len(test_case.steps)}")
        await self.ws.broadcast(RunEvent(
            type=EventType.RUN_STARTED,
            run_id=run_id,
            data={"total_steps": len(test_case.steps), "device_udid": device_udid, "platform": platform}
        ))
        
        for i, step in enumerate(test_case.steps):
            if self.is_cancelled:
                await self.ws.broadcast(RunEvent(
                    type=EventType.RUN_CANCELLED,
                    run_id=run_id,
                    data={"step_aborted": i + 1}
                ))
                return RunSummary(status="cancelled", total_steps=len(test_case.steps), failed_at_step=i+1)

            # Execution with AI loop
            result = await self._execute_with_ai_loop(step, run_id, i + 1, history)
            
            # Save safely
            await self._save_step_result(run_id, result)
            
            history.append({"step": step.model_dump(), "result": result.model_dump()})
            if len(history) > 3: history.pop(0)
            
            if result.status == "failed":
                await self.ws.broadcast(RunEvent(
                    type=EventType.RUN_FAILED,
                    run_id=run_id,
                    data={"failed_step": i + 1, "reason": result.error_message}
                ))
                
                # Trigger Bug Engine asynchronously so we don't block the return
                logger.info(f"[EXECUTOR] Run {run_id} failed at step {i + 1}.")
                asyncio.create_task(self._trigger_bug_engine(
                    test_case=test_case,
                    run_id=run_id,
                    failed_step_num=i + 1,
                    history=history,
                    failed_screenshot_url=result.screenshot_url,
                    device_udid=device_udid
                ))
                
                return RunSummary(status="failed", total_steps=len(test_case.steps), failed_at_step=i+1)
        
        await self.ws.broadcast(RunEvent(
            type=EventType.RUN_COMPLETED,
            run_id=run_id,
            data={"total_steps": len(test_case.steps)}
        ))
        
        
        if platform == "web" and hasattr(self.executor, "stop_session"):
            await self.executor.stop_session()
        
        logger.info(f"[EXECUTOR] Run {run_id} completed successfully.")
        return RunSummary(status="passed", total_steps=len(test_case.steps))
        
    async def _execute_with_ai_loop(self, step: TestStep, run_id: str, step_num: int, history: list) -> StepResult:
        attempt = 0
        current_step = step
        
        # Capture before
        logger.info(f"[{run_id}] Step {step_num} Start: {current_step.action}")
        
        before_url = None
        if hasattr(self.executor, "d"): # Android
            before_url = await self.screenshots.capture_and_upload(self.executor.d, run_id, step_num, "before")
        elif hasattr(self.executor, "page"): # Web
            # For Web, we can capture from the page
            screenshot_bytes = await self.executor.page.screenshot()
            # Generic/Mocked upload for web until storage is fully mapped for bytes
            before_url = "https://mock-storage.com/before.png" 
        
        
        while attempt <= self.MAX_RETRIES:
            if self.is_cancelled:
                break
                
            # Execute step natively
            result = await self.executor.execute_step(run_id, step_num, current_step)
            
            # Wait a little for UI to render
            await asyncio.sleep(1.0)
            
            # Capture after
            if hasattr(self.executor, "d"):
                after_url = await self.screenshots.capture_and_upload(self.executor.d, run_id, step_num, "after")
            elif hasattr(self.executor, "page"):
                # Mock/Placeholder for Web screenshot url
                after_url = "https://mock-storage.com/after.png"
            
            result.screenshot_url = after_url
            
            # Visual Analysis
            if result.status == "passed":
                vision_result = await self.vision.analyze_step(current_step, before_url, after_url, history)
                
                if vision_result.success:
                    logger.info(f"[{run_id}] Step {step_num} visually passed.")
                    return result
                else:
                    logger.warning(f"[{run_id}] Step {step_num} visually failed: {vision_result.observation}")
                    result.status = "failed"
                    result.error_message = f"Visual check failed: {vision_result.observation}"
            else:
                vision_result = VisionResult(success=False, confidence=0, observation="Native execution failed.")
            
            attempt += 1
            if attempt > self.MAX_RETRIES:
                break
                
            # Auto-Correction
            await self.ws.broadcast(RunEvent(
                type=EventType.STEP_RETRYING,
                run_id=run_id,
                data={"step_num": step_num, "attempt": attempt, "reason": vision_result.observation}
            ))
            
            correction_step = await self.corrector.suggest_correction(current_step, vision_result, attempt)
            if not correction_step:
                break
                
            # Execute the correction step (e.g. Closing popup)
            logger.info(f"[{run_id}] Executing correction step: {correction_step.description}")
            await self.executor.execute_step(run_id, f"{step_num}_c{attempt}", correction_step)
            
            # After correction, update before_url to the new state
            before_url = await self.screenshots.capture_and_upload(self.executor.d, run_id, step_num, f"before_retry_{attempt}")
            # we will re-run the `current_step` in the next loop iteration
        
        return result
        
    async def _save_step_result(self, run_id: str, result: StepResult):
        if not self.db:
            logger.info(f"[EXECUTOR] Skipping DB save for step {result.step_num} (No DB configured)")
            return
        try:
            # Depending on DB schema, handle mapping. For MVP, wrap in try/except to avoid crashing the runner
            self.db.table("run_steps").insert({
                "run_id": run_id,
                "step_order": result.step_num,
                "status": result.status,
                "duration_ms": result.duration_ms,
                "screenshot_url": result.screenshot_url,
                "error_message": result.error_message
            }).execute()
        except Exception as e:
            logger.error(f"Failed to save step result to DB: {e}")

    async def _trigger_bug_engine(self, test_case: TestCase, run_id: str, failed_step_num: int, history: list, failed_screenshot_url: str, device_udid: str):
        try:
            await self.ws.broadcast(RunEvent(
                type=EventType.BUG_REPORT_GENERATING,
                run_id=run_id,
                data={"message": "Gerando bug report automaticamente..."}
            ))
            
            # Coletar evidências
            collector = EvidenceCollector(self.db, self.executor)
            evidence = await collector.collect(
                run_id=run_id, 
                failed_step_num=failed_step_num, 
                test_case_data=test_case.model_dump(), 
                run_history=history,
                failed_screenshot_url=failed_screenshot_url
            )
            
            # Gerar conteúdo com IA
            anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
            if not anthropic_key or anthropic_key == "your-anthropic-key-here":
                 logger.warning("No Anthropic API key found. Skipping Bug Report contents.")
                 return
                 
            reporter = AIReporter(api_key=anthropic_key)
            bug_content = await reporter.generate_bug_report(evidence)
            
            # Gerar PDF
            pdf_gen = PDFGenerator()
            pdf_bytes = await pdf_gen.generate(bug_content, evidence)
            
            if not self.db:
                logger.warning("No DB client found. Cannot generate Bug Report.")
                return

            # Upload para Supabase Storage
            # Requires a 'reports' bucket in supabase
            file_path = f"{run_id}/bug_report_{failed_step_num}.pdf"
            self.db.storage.from_("reports").upload(file_path, pdf_bytes, file_options={"content-type": "application/pdf"})
            pdf_url = self.db.storage.from_("reports").get_public_url(file_path)
            
            # Salvar no banco
            self.db.table("bug_reports").insert({
                "run_id": run_id,
                "title": bug_content.title,
                "severity": bug_content.severity,
                "ai_summary": bug_content.summary,
                "expected_behavior": bug_content.expected_behavior,
                "actual_behavior": bug_content.actual_behavior,
                "steps_to_reproduce": bug_content.steps_to_reproduce,
                "pdf_url": pdf_url
            }).execute()
            
            # Emitir evento WS: bug_report_ready
            await self.ws.broadcast(RunEvent(
                type=EventType.BUG_REPORT_READY,
                run_id=run_id,
                data={"pdf_url": pdf_url, "title": bug_content.title, "severity": bug_content.severity}
            ))
        except Exception as e:
            logger.error(f"Failed to generate Bug Report: {e}")

