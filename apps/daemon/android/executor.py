import uiautomator2 as u2
import asyncio
import logging
import time
from models.step import TestStep, StepAction, StepResult
from models.run_event import RunEvent
from ws.events import EventType

logger = logging.getLogger("executor")

class StepExecutor:
    def __init__(self, device: u2.Device, screenshot_handler, ws_broadcaster):
        self.d = device
        self.screenshot_handler = screenshot_handler
        self.ws_broadcaster = ws_broadcaster
    
    async def execute_step(self, run_id: str, step_num: int, step: TestStep) -> StepResult:
        try:
            import traceback
            # Broadcast start
            logger.info(f"[EXECUTOR] Iniciando Step {step_num}: action={step.action.value}, target={step.target}, value={step.value}")
            logger.info(f"[EXECUTOR] WS Broadcast STEP_STARTED: step_num={step_num}")
            
            await self.ws_broadcaster.broadcast(RunEvent(
                type=EventType.STEP_STARTED,
                run_id=run_id,
                data={"step_num": step_num, "action": step.action.value}
            ))

            start_time = time.time()
            status = "passed"
            error_message = None
            element_found = True
            strategies_log = []
            
            # Execute action
            try:
                success, strategies_log = await self._dispatch_action(step)
                if not success:
                    status = "failed"
                    error_message = f"Action {step.action.value} failed to complete."
                    element_found = False
            except Exception as e:
                status = "failed"
                error_message = str(e)
                element_found = False
                logger.error(f"[EXECUTOR] Step {step_num} failed with exception: {e}")
                traceback.print_exc()

            duration_ms = int((time.time() - start_time) * 1000)
            logger.info(f"[EXECUTOR] Resultado Step {step_num}: status={status}, duration_ms={duration_ms}")

            # Capture screenshot
            screenshot_url = await self.screenshot_handler.capture_and_upload(
                device=self.d,
                run_id=run_id,
                step_num=step_num,
                phase="after"
            )

            result = StepResult(
                step_num=step_num,
                status=status,
                duration_ms=duration_ms,
                screenshot_url=screenshot_url,
                error_message=error_message,
                element_found=element_found,
                retry_count=0,
                strategies_log=strategies_log
            )

            # Broadcast completion
            event_type = EventType.STEP_COMPLETED if status == "passed" else EventType.STEP_FAILED
            logger.info(f"[EXECUTOR] WS Broadcast {event_type.value}: step_num={step_num}")
            
            await self.ws_broadcaster.broadcast(RunEvent(
                type=event_type,
                run_id=run_id,
                data=result.model_dump()
            ))

            return result

        except Exception as e:
            logger.error(f"[EXECUTOR] Critical error executing step: {e}")
            traceback.print_exc()
            return StepResult(
                step_num=step_num,
                status="failed",
                duration_ms=0,
                error_message=f"Critical executor error: {str(e)}"
            )

    async def _dispatch_action(self, step: TestStep) -> tuple[bool, list]:
        if step.action == StepAction.TAP:                 return await self._tap(step)
        elif step.action in (StepAction.TYPE_TEXT, StepAction.TYPE): return await self._type_text(step)
        elif step.action == StepAction.SWIPE:             return await self._swipe(step)
        elif step.action == StepAction.LONG_PRESS:        return await self._long_press(step)
        elif step.action == StepAction.PRESS_BACK:        return await self._press_back(step)
        elif step.action == StepAction.PRESS_HOME:        return await self._press_home(step)
        elif step.action == StepAction.SCROLL:            return await self._scroll(step)
        elif step.action == StepAction.WAIT:              return await self._wait(step)
        elif step.action == StepAction.ASSERT_TEXT:       return await self._assert_text(step)
        elif step.action == StepAction.ASSERT_ELEMENT:    return await self._assert_element(step)
        elif step.action == StepAction.OPEN_APP:          return await self._open_app(step)
        return False, []

    async def _tap(self, step: TestStep) -> tuple[bool, list]:
        strategies = step.target_strategies or []
        target = step.target or ""
        if target and not strategies:
            strategies = [f"text:{target}"]
            
        logs = []
        for strategy in strategies:
            try:
                logs.append({"name": strategy, "result": "verificando..."})
                if strategy.startswith("text:"):
                    el = self.d(text=strategy[5:])
                elif strategy.startswith("resource-id:"):
                    el = self.d(resourceId=strategy[12:])
                elif strategy.startswith("hint:") or strategy.startswith("placeholder:"):
                    val = strategy.split(":", 1)[1]
                    el = self.d(description=val)
                elif strategy.startswith("xpath:"):
                    el = self.d.xpath(strategy[6:])
                elif strategy.startswith("textContains:"):
                    el = self.d(textContains=strategy[13:])
                else:
                    el = self.d(textContains=strategy)
                
                if el.exists(timeout=6):
                    logs[-1]["result"] = "encontrado com sucesso"
                    el.click()
                    await asyncio.sleep(0.5)
                    return True, logs
                else:
                    logs[-1]["result"] = "não encontrado após 6s"
            except Exception as e:
                logs[-1]["result"] = f"erro ao tentar: {str(e)}"
                continue
                
        # Fallback to old basic
        if target:
            if ',' in target and target.replace(',', '').replace('.', '').isdigit():
                logs.append({"name": f"coordinates:{target}", "result": "clique cego"})
                x, y = map(float, target.split(','))
                self.d.click(x, y)
                return True, logs
                
        return False, logs

    async def _type_text(self, step: TestStep) -> tuple[bool, list]:
        value = step.value or ""
        self.d.send_keys(value, clear=True)
        await asyncio.sleep(0.4)
        return True, [{"name": "input_text", "result": f"digitou '{value}'"}]

    async def _swipe(self, step: TestStep) -> tuple[bool, list]:
        if not step.value:
            return False, [{"name": "swipe", "result": "sem valor de direção"}]
            
        w, h = self.d.window_size()
        
        if step.value == "up":
            self.d.swipe(w/2, h*0.8, w/2, h*0.2, 0.3)
        elif step.value == "down":
            self.d.swipe(w/2, h*0.2, w/2, h*0.8, 0.3)
        elif step.value == "left":
            self.d.swipe(w*0.8, h/2, w*0.2, h/2, 0.3)
        elif step.value == "right":
            self.d.swipe(w*0.2, h/2, w*0.8, h/2, 0.3)
        elif ',' in step.value:
            x1, y1, x2, y2 = map(float, step.value.split(','))
            self.d.swipe(x1, y1, x2, y2, 0.3)
        else:
            return False, [{"name": f"swipe:{step.value}", "result": "direção inválida"}]
            
        return True, [{"name": f"swipe:{step.value}", "result": "sucesso"}]

    async def _long_press(self, step: TestStep) -> tuple[bool, list]:
        duration = float(step.value or "1.5")
        if step.target and ',' in step.target:
            x, y = map(float, step.target.split(','))
            self.d.long_click(x, y, duration)
            return True, [{"name": f"coordinates:{step.target}", "result": "clique longo aplicado"}]
            
        # Add basic target support for long press
        if step.target:
            el = self.d(resourceId=step.target)
            if not el.exists: el = self.d(text=step.target)
            if el.exists:
                el.long_click(duration)
                return True, [{"name": step.target, "result": "elemento encontrado e clicado"}]
                
        return False, [{"name": step.target, "result": "nenhum elemento para clique longo"}]

    async def _press_back(self, step: TestStep) -> tuple[bool, list]:
        self.d.press('back')
        return True, []

    async def _press_home(self, step: TestStep) -> tuple[bool, list]:
        self.d.press('home')
        return True, []

    async def _scroll(self, step: TestStep) -> tuple[bool, list]:
        direction = step.value or "forward"
        # Map simple directions to u2 commands
        if direction in ["up", "backward"]:
            self.d(scrollable=True).scroll.backward()
        else:
            self.d(scrollable=True).scroll.forward()
        return True, [{"name": f"scroll:{direction}", "result": "sucesso"}]

    async def _wait(self, step: TestStep) -> tuple[bool, list]:
        ms = int(step.value or "2000")
        await asyncio.sleep(ms / 1000)
        return True, []

    async def _assert_text(self, step: TestStep) -> tuple[bool, list]:
        value = step.value or ""
        alternatives = [v.strip() for v in value.split("|")]
        logs = []
        for text in alternatives:
            logs.append({"name": f"text:{text}", "result": "procurando..."})
            if self.d(textContains=text).exists(timeout=4):
                logs[-1]["result"] = "texto encontrado"
                return True, logs
            else:
                logs[-1]["result"] = "ausente na tela"
        return False, logs

    async def _assert_element(self, step: TestStep) -> tuple[bool, list]:
        strategies = step.target_strategies or [step.target or ""]
        logs = []
        for s in strategies:
            logs.append({"name": s, "result": "procurando..."})
            if self.d(text=s).exists(timeout=4) or self.d(resourceId=s).exists(timeout=1):
                logs[-1]["result"] = "elemento presente"
                return True, logs
            else:
                logs[-1]["result"] = "ausente"
        return False, logs

    async def _open_app(self, step: TestStep) -> tuple[bool, list]:
        app_name = step.target or ""
        strategies = step.target_strategies or []
        logs = []
        
        # Try package directly
        for s in strategies:
            if s.startswith("package:"):
                logs.append({"name": s, "result": "iniciando intent..."})
                pkg = s.replace("package:", "")
                try:
                    self.d.app_start(pkg)
                    await asyncio.sleep(2.0)
                    logs[-1]["result"] = "intent executado"
                    return True, logs
                except Exception as e:
                    logs[-1]["result"] = f"falha: {str(e)}"
                    continue
                    
        # Try discover package by list
        logs.append({"name": f"search:{app_name}", "result": "buscando na lista de pacotes..."})
        import subprocess
        result = subprocess.run(
            ['adb', '-s', self.d._serial, 'shell', 'pm', 'list', 'packages'],
            capture_output=True, text=True
        )
        for line in result.stdout.splitlines():
            pkg = line.replace("package:", "").strip()
            if app_name.lower().replace(" ", "") in pkg.lower():
                self.d.app_start(pkg)
                await asyncio.sleep(2.0)
                logs[-1]["result"] = f"pacote inferido: {pkg}"
                return True, logs
                
        logs[-1]["result"] = "pacote não encontrado nos instalados"
                
        # Fallback press home and click by text
        self.d.press("home")
        await asyncio.sleep(1.0)
        logs.append({"name": f"ui:{app_name}", "result": "procurando ícone no launcher..."})
        try:
            if self.d(text=app_name).exists(timeout=5):
                self.d(text=app_name).click()
                await asyncio.sleep(2.0)
                logs[-1]["result"] = "ícone de app clicado"
                return True, logs
        except:
            pass
            
        logs[-1]["result"] = "ícone ausente"
        return False, logs
