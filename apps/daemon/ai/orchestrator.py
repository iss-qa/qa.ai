import logging
import asyncio
import time
from typing import List, Optional, Any
from pathlib import Path
from models.step import TestStep, StepResult, StepAction
from models.run_event import RunEvent
from ws.events import EventType
# Removed fixed import to allow injection or dynamic selection
from ai.vision_analyzer import VisionAnalyzer, VisionResult, VisionCoordinateResult
from ai.image_step_mapper import get_reference_image_for_step
from ai.auto_corrector import AutoCorrector
from supabase import create_client, Client
from pydantic import BaseModel
import os
import base64
from ai.bug_engine.collector import EvidenceCollector
from ai.bug_engine.ai_reporter import AIReporter
from ai.bug_engine.pdf_generator import PDFGenerator
import httpx
from supabase.client import ClientOptions
from log_manager import log_manager

# Keep legacy per-run log dir for backwards compat
LOGS_DIR = Path(__file__).parent.parent / "logs"
LOGS_DIR.mkdir(exist_ok=True)

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
                # Bypass SSL checking for Supabase client when behind VPNs or Proxies
                # Supabase Python Client relies on httpx underneath
                import httpx
                from supabase.client import ClientOptions
                
                custom_httpx_client = httpx.Client(verify=False)
                
                # In most supabase-py versions, postgrest client can take a custom session or verify arg
                # If creating an explicit client fails, we can tell Supabase to use verify=False by environment
                os.environ["CURL_CA_BUNDLE"] = ""
                os.environ["REQUESTS_CA_BUNDLE"] = ""
                self.db = create_client(supabase_url, supabase_key)
                
                # Force replace the underlying httpx clients
                if hasattr(self.db, 'postgrest'):
                    if hasattr(self.db.postgrest, 'session'):
                         self.db.postgrest.session = custom_httpx_client
                    self.db.postgrest.client = custom_httpx_client
                if hasattr(self.db, 'storage'):
                    self.db.storage.client = custom_httpx_client

            except Exception as e:
                logger.warning(f"Failed to create Supabase client: {e}")
                log_manager.error(f"Falha ao criar cliente Supabase: {e}", context="SUPABASE", exc=e)
        self.is_cancelled = False
        # Vision-first state
        self._reference_images: list[bytes] = []
        self._image_step_mapping: Optional[dict] = None
        self._ambiguity_events: dict[int, asyncio.Event] = {}
        self._ambiguity_resolutions: dict[int, dict] = {}
        # Per-run file logger (initialized in run())
        self._run_logger: Optional[logging.Logger] = None

    def _init_run_logger(self, run_id: str):
        """Create a per-run log file in logs/ directory."""
        log_file = LOGS_DIR / f"{run_id}.log"
        run_logger = logging.getLogger(f"run.{run_id}")
        run_logger.setLevel(logging.DEBUG)
        # Avoid duplicate handlers on re-runs
        run_logger.handlers.clear()
        fh = logging.FileHandler(str(log_file), mode="w", encoding="utf-8")
        fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S"))
        run_logger.addHandler(fh)
        self._run_logger = run_logger
        run_logger.info(f"=== RUN {run_id} STARTED ===")
        return run_logger

    def _log(self, msg: str, level: str = "info"):
        """Log to both main logger and per-run file."""
        getattr(logger, level)(msg)
        if self._run_logger:
            getattr(self._run_logger, level)(msg)
    
    async def cancel(self):
        self.is_cancelled = True
        
    async def run(self, test_case: TestCase, run_id: str, device_udid: Optional[str] = None, platform: str = "android") -> RunSummary:
        self.is_cancelled = False
        history = []
        self._run_id = run_id
        self._device_udid = device_udid
        self._vision_call_count = 0
        self._xml_dump_count = 0

        # Initialize per-run file logger (legacy)
        self._init_run_logger(run_id)

        # Initialize structured execution log
        log_manager.start_execution_log(run_id)

        # Get device info for log header
        device_info_str = f"Device: {device_udid or 'N/A'}"
        if device_udid and hasattr(self.executor, 'd'):
            try:
                w, h = self.executor.get_device_dimensions()
                device_info_str = f"Device: {device_udid} | {w}x{h}"
            except Exception as e:
                log_manager.error(f"Falha ao obter dimensões do device: {e}", context="EXECUTION", run_id=run_id, exc=e)

        log_manager.execution("=" * 60, run_id=run_id)
        log_manager.execution("Execução iniciada", run_id=run_id)
        log_manager.execution(f"{device_info_str} | Plataforma: {platform}", run_id=run_id)
        log_manager.execution(f"Modo Vision: {'SIM' if self._reference_images else 'NÃO'} | {len(self._reference_images)} imagens de referência", run_id=run_id)
        log_manager.execution(f"Total de steps: {len(test_case.steps)}", run_id=run_id)
        log_manager.execution("=" * 60, run_id=run_id)

        self._log(f"Run config: device={device_udid}, platform={platform}, steps={len(test_case.steps)}, "
                  f"reference_images={len(self._reference_images)}, mapping={self._image_step_mapping}")

        # Start Web session if needed
        if platform == "web" and hasattr(self.executor, "start_session"):
            await self.executor.start_session()

        self._log(f"[RUN] {run_id} started. Total steps: {len(test_case.steps)}")
        await self.ws.broadcast(RunEvent(
            type=EventType.RUN_STARTED,
            run_id=run_id,
            data={"total_steps": len(test_case.steps), "device_udid": device_udid, "platform": platform}
        ))

        for i, step in enumerate(test_case.steps):
            step_start = time.time()
            self._log(f"\n{'='*60}")
            self._log(f"[STEP {i+1}/{len(test_case.steps)}] action={step.action.value}, target='{step.target}', value='{step.value}'")

            if self.is_cancelled:
                self._log(f"[STEP {i+1}] CANCELLED by user")
                await self.ws.broadcast(RunEvent(
                    type=EventType.RUN_CANCELLED,
                    run_id=run_id,
                    data={"step_aborted": i + 1}
                ))
                return RunSummary(status="cancelled", total_steps=len(test_case.steps), failed_at_step=i+1)

            # Vision-first: use reference image if available for actionable steps
            ref_image = get_reference_image_for_step(
                i + 1, len(test_case.steps), self._reference_images, self._image_step_mapping
            )
            vision_first_actions = [StepAction.TAP, StepAction.LONG_PRESS, StepAction.TYPE_TEXT, StepAction.TYPE]

            use_vision = ref_image and step.action in vision_first_actions
            strategy_name = "VISION-FIRST" if use_vision else "AI-LOOP"
            self._log(f"[STEP {i+1}] Strategy: {strategy_name}"
                      f" | ref_image={'YES' if ref_image else 'NO'}")

            log_manager.execution_step(i+1, f'Iniciando: "{step.description or step.action.value}"', run_id=run_id)
            log_manager.execution_step(i+1, f"Estratégia: {strategy_name} | action={step.action.value} | target='{step.target}'", run_id=run_id)

            if use_vision:
                result = await self._execute_with_vision_first(step, run_id, i + 1, ref_image, history)
            else:
                result = await self._execute_with_ai_loop(step, run_id, i + 1, history)

            step_duration = int((time.time() - step_start) * 1000)
            self._log(f"[STEP {i+1}] RESULT: {result.status.upper()} ({step_duration}ms)")

            # Log strategies used
            if result.strategies_log:
                for log_entry in result.strategies_log:
                    strategy_detail = f"{log_entry.get('name', '?')} -> {log_entry.get('result', '?')}"
                    self._log(f"  Strategy: {strategy_detail}")
                    log_manager.execution_step(i+1, f"Estratégia: {strategy_detail}", run_id=run_id)

            status_icon = "PASSOU" if result.status == "passed" else "FALHOU"
            duration_str = f"{step_duration/1000:.1f}s"
            log_manager.execution_step(
                i+1,
                f"{status_icon} | Duração: {duration_str} | Tentativas: {result.retry_count + 1}",
                run_id=run_id,
                level="INFO" if result.status == "passed" else "ERROR"
            )

            if result.error_message:
                self._log(f"  Error: {result.error_message}")
                log_manager.execution_step(i+1, f"Erro: {result.error_message}", run_id=run_id, level="ERROR")
            
            # Save safely
            await self._save_step_result(run_id, result)
            
            # Prevent token explosion in history due to Base64 screenshots
            clean_result = result.model_dump()
            if clean_result.get("screenshot_url") and clean_result["screenshot_url"].startswith("data:image"):
                clean_result["screenshot_url"] = "<base64_image_hidden_to_save_tokens>"

            history.append({"step": step.model_dump(), "result": clean_result})
            if len(history) > 3: history.pop(0)
            
            if result.status == "failed":
                self._log(f"\n{'='*60}")
                self._log(f"[RUN FAILED] Step {i+1} failed. Stopping execution.")
                self._log(f"  Error: {result.error_message}")

                # Structured execution log footer
                total_time = time.time() - step_start
                passed_count = i  # steps before this one passed
                log_manager.execution("=" * 60, run_id=run_id)
                log_manager.execution(f"Execução finalizada: FALHOU", run_id=run_id, level="ERROR")
                log_manager.execution(f"Step que falhou: {i+1} | Motivo: {result.error_message}", run_id=run_id, level="ERROR")
                log_manager.execution(f"Steps: {len(test_case.steps)} total | {passed_count} passaram | 1 falhou | {len(test_case.steps) - i - 1} pulados", run_id=run_id)
                log_manager.execution(f"Chamadas Vision: {self._vision_call_count}", run_id=run_id)
                log_manager.execution(f"Dumps XML: {self._xml_dump_count}", run_id=run_id)
                log_manager.execution("=" * 60, run_id=run_id)

                log_manager.error(
                    f"Execução falhou no step {i+1}: {result.error_message}",
                    context="EXECUTION", run_id=run_id
                )
                log_manager.end_execution_log(run_id)

                await self.ws.broadcast(RunEvent(
                    type=EventType.RUN_FAILED,
                    run_id=run_id,
                    data={"failed_step": i + 1, "reason": result.error_message}
                ))

                # Trigger Bug Engine asynchronously so we don't block the return
                self._log(f"[RUN FAILED] Triggering bug engine...")
                asyncio.create_task(self._trigger_bug_engine(
                    test_case=test_case,
                    run_id=run_id,
                    failed_step_num=i + 1,
                    history=history,
                    failed_screenshot_url=result.screenshot_url,
                    device_udid=device_udid
                ))

                self._log(f"=== RUN {run_id} FINISHED: FAILED at step {i+1} ===")
                return RunSummary(status="failed", total_steps=len(test_case.steps), failed_at_step=i+1)

        # Structured execution log footer - SUCCESS
        log_manager.execution("=" * 60, run_id=run_id)
        log_manager.execution(f"Execução finalizada: PASSOU", run_id=run_id)
        log_manager.execution(f"Steps: {len(test_case.steps)} total | {len(test_case.steps)} passaram | 0 falharam", run_id=run_id)
        log_manager.execution(f"Chamadas Vision: {self._vision_call_count}", run_id=run_id)
        log_manager.execution(f"Dumps XML: {self._xml_dump_count}", run_id=run_id)
        log_manager.execution("=" * 60, run_id=run_id)
        log_manager.end_execution_log(run_id)

        self._log(f"\n{'='*60}")
        self._log(f"=== RUN {run_id} FINISHED: PASSED ({len(test_case.steps)} steps) ===")
        await self.ws.broadcast(RunEvent(
            type=EventType.RUN_COMPLETED,
            run_id=run_id,
            data={"total_steps": len(test_case.steps)}
        ))

        if platform == "web" and hasattr(self.executor, "stop_session"):
            await self.executor.stop_session()

        return RunSummary(status="passed", total_steps=len(test_case.steps))
        
    async def resolve_ambiguity(self, step_num: int, x: int, y: int):
        """Called from API endpoint when user resolves an ambiguous element."""
        self._ambiguity_resolutions[step_num] = {"x": x, "y": y}
        if step_num in self._ambiguity_events:
            self._ambiguity_events[step_num].set()

    async def _execute_with_vision_first(
        self, step: TestStep, run_id: str, step_num: int,
        reference_image: bytes, history: list
    ) -> StepResult:
        """Vision-first execution: use Claude Vision to find element coordinates."""
        start_time = time.time()

        try:
            # 0. Broadcast STEP_STARTED so frontend shows "running"
            await self.ws.broadcast(RunEvent(
                type=EventType.STEP_STARTED,
                run_id=run_id,
                data={"step_num": step_num, "action": step.action.value}
            ))

            # 1. Broadcast STEP_ANALYZING
            self._log(f"[STEP {step_num}] VISION: Sending to Claude Vision API...")
            await self.ws.broadcast(RunEvent(
                type=EventType.STEP_ANALYZING,
                run_id=run_id,
                data={"step_num": step_num, "action": step.action.value}
            ))

            # 2. Capture current screenshot
            current_screenshot_url = await self.screenshots.capture_and_upload(
                self.executor.d, run_id, step_num, "vision_current"
            )

            # 3. Convert images to base64
            ref_b64 = base64.b64encode(reference_image).decode("utf-8")
            current_b64 = await self.vision._url_to_base64(current_screenshot_url)

            if not current_b64:
                logger.warning(f"[{run_id}] Step {step_num}: Failed to get current screenshot, falling back to AI loop")
                await self.ws.broadcast(RunEvent(
                    type=EventType.STEP_FALLBACK,
                    run_id=run_id,
                    data={"step_num": step_num, "reason": "Falha ao capturar screenshot"}
                ))
                return await self._execute_with_ai_loop(step, run_id, step_num, history)

            # 4. Get device dimensions
            device_w, device_h = self.executor.get_device_dimensions()

            # 5. Build descriptive instruction for Claude Vision
            if step.description:
                instruction = step.description
            else:
                target_desc = step.target or ""
                value_desc = f" com valor '{step.value}'" if step.value else ""
                action_map = {
                    "tap": f"Clique no elemento '{target_desc}' na tela",
                    "type": f"Digite no campo de texto que contém '{target_desc}'{value_desc}",
                    "type_text": f"Digite no campo de texto que contém '{target_desc}'{value_desc}",
                    "long_press": f"Pressione e segure o elemento '{target_desc}'",
                }
                instruction = action_map.get(step.action.value, f"{step.action.value} no elemento '{target_desc}'")

            self._log(f"[STEP {step_num}] VISION instruction: '{instruction}'")
            self._log(f"[STEP {step_num}] VISION device dimensions: {device_w}x{device_h}")

            coord_result = await self.vision.find_element_by_vision(
                ref_b64, current_b64, instruction, device_w, device_h
            )
            self._vision_call_count += 1

            self._log(f"[STEP {step_num}] VISION result: element_found={coord_result.element_found}, "
                      f"x={coord_result.x}, y={coord_result.y}, confidence={coord_result.confidence}, "
                      f"ambiguous={coord_result.ambiguous}, fallback_suggested={coord_result.fallback_suggested}")

            log_manager.execution_step(
                step_num,
                f"Vision retornou | Confidence: {coord_result.confidence} | "
                f"Coordenadas: ({coord_result.x}, {coord_result.y}) | "
                f"Elemento encontrado: {coord_result.element_found}",
                run_id=run_id
            )
            self._log(f"[STEP {step_num}] VISION observation: {coord_result.observation}")

            # 6. Broadcast STEP_LOCATED
            await self.ws.broadcast(RunEvent(
                type=EventType.STEP_LOCATED,
                run_id=run_id,
                data={
                    "step_num": step_num,
                    "element_found": coord_result.element_found,
                    "coordinates": {"x": coord_result.x, "y": coord_result.y} if coord_result.element_found else None,
                    "confidence": coord_result.confidence
                }
            ))

            # 7. Decision tree
            tap_x, tap_y = coord_result.x, coord_result.y

            # 7a. Ambiguous — ask user
            if coord_result.ambiguous and coord_result.ambiguous_options:
                await self.ws.broadcast(RunEvent(
                    type=EventType.AMBIGUITY_DETECTED,
                    run_id=run_id,
                    data={
                        "step_num": step_num,
                        "screenshot": current_b64,
                        "candidates": coord_result.ambiguous_options,
                        "reason": coord_result.ambiguous_reason
                    }
                ))

                # Wait for user resolution
                event = asyncio.Event()
                self._ambiguity_events[step_num] = event
                try:
                    await asyncio.wait_for(event.wait(), timeout=300)  # 5 min timeout
                    resolution = self._ambiguity_resolutions.get(step_num)
                    if resolution:
                        tap_x, tap_y = resolution["x"], resolution["y"]
                        await self.ws.broadcast(RunEvent(
                            type=EventType.AMBIGUITY_RESOLVED,
                            run_id=run_id,
                            data={"step_num": step_num, "chosen": {"x": tap_x, "y": tap_y}}
                        ))
                except asyncio.TimeoutError:
                    logger.warning(f"[{run_id}] Step {step_num}: Ambiguity timeout, falling back to AI loop")
                    await self.ws.broadcast(RunEvent(
                        type=EventType.STEP_FALLBACK,
                        run_id=run_id,
                        data={"step_num": step_num, "reason": "Timeout aguardando resolução de ambiguidade"}
                    ))
                    return await self._execute_with_ai_loop(step, run_id, step_num, history)
                finally:
                    self._ambiguity_events.pop(step_num, None)
                    self._ambiguity_resolutions.pop(step_num, None)

            # 7b. Low confidence or fallback suggested
            elif coord_result.confidence < 0.75 or coord_result.fallback_suggested or not coord_result.element_found:
                logger.info(f"[{run_id}] Step {step_num}: Vision confidence {coord_result.confidence} < 0.75, falling back")
                await self.ws.broadcast(RunEvent(
                    type=EventType.STEP_FALLBACK,
                    run_id=run_id,
                    data={"step_num": step_num, "reason": coord_result.observation, "confidence": coord_result.confidence}
                ))
                return await self._execute_with_ai_loop(step, run_id, step_num, history)

            # 7c. High confidence — tap coordinates (and type text if needed)
            if tap_x is not None and tap_y is not None:
                self._log(f"[STEP {step_num}] VISION: Tapping coordinates ({int(tap_x)}, {int(tap_y)})")
                success, logs = await self.executor.tap_coordinates(int(tap_x), int(tap_y))
                await asyncio.sleep(0.5)

                # If this is a TYPE step, also send the text after tapping the field
                if step.action in (StepAction.TYPE, StepAction.TYPE_TEXT) and step.value:
                    self._log(f"[STEP {step_num}] VISION: Typing value '{step.value}'")
                    self.executor.d.send_keys(step.value, clear=True)
                    await asyncio.sleep(0.4)
                    try:
                        self.executor.d.hide_keyboard()
                    except Exception as e:
                        log_manager.error(f"hide_keyboard falhou no vision-first: {e}", context="EXECUTION", run_id=run_id, exc=e)
                    logs.append({"name": "vision_type", "result": f"digitou '{step.value}'"})

                await asyncio.sleep(0.5)

                # Capture AFTER screenshot
                after_url = await self.screenshots.capture_and_upload(
                    self.executor.d, run_id, step_num, "after"
                )

                # Broadcast STEP_CONFIRMING
                self._log(f"[STEP {step_num}] VISION: Confirming via visual analysis...")
                await self.ws.broadcast(RunEvent(
                    type=EventType.STEP_CONFIRMING,
                    run_id=run_id,
                    data={"step_num": step_num}
                ))

                # Visual confirmation using existing analyze_step
                before_url = current_screenshot_url
                vision_confirm = await self.vision.analyze_step(step, before_url, after_url, history)

                duration_ms = int((time.time() - start_time) * 1000)
                self._log(f"[STEP {step_num}] VISION confirm: success={vision_confirm.success}, "
                          f"confidence={vision_confirm.confidence}, observation='{vision_confirm.observation}'")

                if vision_confirm.success:
                    self._log(f"[STEP {step_num}] VISION-FIRST PASSED ({duration_ms}ms, coord_confidence={coord_result.confidence})")

                    result = StepResult(
                        step_num=step_num,
                        status="passed",
                        duration_ms=duration_ms,
                        screenshot_url=after_url,
                        element_found=True,
                        strategies_log=logs
                    )

                    # Broadcast STEP_COMPLETED so frontend updates status
                    await self.ws.broadcast(RunEvent(
                        type=EventType.STEP_COMPLETED,
                        run_id=run_id,
                        data=result.model_dump()
                    ))
                    return result
                else:
                    # Vision confirmation failed — fallback to AI loop
                    self._log(f"[STEP {step_num}] VISION confirm FAILED: {vision_confirm.observation}. Falling back to AI loop.", "warning")
                    await self.ws.broadcast(RunEvent(
                        type=EventType.STEP_FALLBACK,
                        run_id=run_id,
                        data={"step_num": step_num, "reason": vision_confirm.observation}
                    ))
                    return await self._execute_with_ai_loop(step, run_id, step_num, history)

            # Shouldn't reach here, but fallback just in case
            return await self._execute_with_ai_loop(step, run_id, step_num, history)

        except Exception as e:
            logger.error(f"[{run_id}] Step {step_num} vision-first error: {e}")
            await self.ws.broadcast(RunEvent(
                type=EventType.STEP_FALLBACK,
                run_id=run_id,
                data={"step_num": step_num, "reason": str(e)}
            ))
            return await self._execute_with_ai_loop(step, run_id, step_num, history)

    async def _execute_with_ai_loop(self, step: TestStep, run_id: str, step_num: int, history: list) -> StepResult:
        attempt = 0
        current_step = step

        # Capture before
        self._log(f"[STEP {step_num}] AI-LOOP: action={current_step.action.value}, target='{current_step.target}', value='{current_step.value}'")
        
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
            self._log(f"[STEP {step_num}] AI-LOOP: attempt {attempt + 1}/{self.MAX_RETRIES + 1}, executing via executor...")
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

            self._log(f"[STEP {step_num}] AI-LOOP: executor result={result.status}")
            if result.strategies_log:
                for entry in result.strategies_log:
                    self._log(f"  Strategy used: {entry.get('name', '?')} -> {entry.get('result', '?')}")

            # Visual Analysis
            if result.status == "passed":
                # Skip visual evaluation for low-complexity steps to save cost & execution time
                if current_step.action in [StepAction.WAIT, StepAction.OPEN_APP, StepAction.PRESS_HOME, StepAction.PRESS_BACK, StepAction.SCROLL]:
                    self._log(f"[STEP {step_num}] AI-LOOP: simple action, skipping Vision validation -> PASSED")
                    return result

                self._log(f"[STEP {step_num}] AI-LOOP: sending to Vision API for visual validation...")
                vision_result = await self.vision.analyze_step(current_step, before_url, after_url, history)
                self._vision_call_count += 1

                if vision_result.success:
                    self._log(f"[STEP {step_num}] AI-LOOP: Vision confirmed -> PASSED (confidence={vision_result.confidence})")
                    return result
                else:
                    self._log(f"[STEP {step_num}] AI-LOOP: Vision REJECTED -> {vision_result.observation}", level="warning")
                    result.status = "failed"
                    result.error_message = f"Visual check failed: {vision_result.observation}"
            else:
                self._log(f"[STEP {step_num}] AI-LOOP: executor FAILED natively, skipping Vision")
                vision_result = VisionResult(success=False, confidence=0, observation="Native execution failed.")

            attempt += 1
            if attempt > self.MAX_RETRIES:
                self._log(f"[STEP {step_num}] AI-LOOP: max retries ({self.MAX_RETRIES}) exceeded -> FAILED")
                break

            # Auto-Correction
            self._log(f"[STEP {step_num}] AI-LOOP: requesting auto-correction (attempt {attempt})...")
            await self.ws.broadcast(RunEvent(
                type=EventType.STEP_RETRYING,
                run_id=run_id,
                data={"step_num": step_num, "attempt": attempt, "reason": vision_result.observation}
            ))

            correction_step = await self.corrector.suggest_correction(current_step, vision_result, attempt)
            if not correction_step:
                self._log(f"[STEP {step_num}] AI-LOOP: no correction suggested -> FAILED")
                break

            # Execute the correction step (e.g. Closing popup)
            self._log(f"[STEP {step_num}] AI-LOOP: executing correction: {correction_step.description}")
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
            log_manager.error(f"Falha ao salvar resultado do step {result.step_num} no Supabase: {e}", context="SUPABASE", run_id=run_id, exc=e)

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
            log_manager.error(f"Falha ao gerar Bug Report para run {run_id}: {e}", context="BUG_ENGINE", run_id=run_id, exc=e)

