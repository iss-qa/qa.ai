import asyncio
import time
from typing import List, Dict, Any, Optional
from playwright.async_api import async_playwright, Page, Browser, BrowserContext
from models.step import TestStep, StepResult, StepAction

class WebDriverExecutor:
    def __init__(self, ws_manager=None):
        self.ws_manager = ws_manager
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.playwright = None

    async def start_session(self):
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(headless=True)
        self.context = await self.browser.new_context(
            viewport={'width': 1280, 'height': 720},
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 QAMind/1.0'
        )
        self.page = await self.context.new_page()

    async def stop_session(self):
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()

    async def execute_step(self, run_id: str, step_num: int, step: TestStep) -> StepResult:
        """Executes a single step using the active Playwright page."""
        if not self.page:
            await self.start_session()

        start_time = time.time()
        success = True
        error_msg = None

        try:
            action = step.action
            target = step.target
            value = step.value

            if action == StepAction.OPEN_APP:
                if not target or not target.startswith("http"):
                     raise ValueError(f"URL inválida: {target}")
                await self.page.goto(target, wait_until="networkidle")

            elif action == StepAction.TAP:
                try:
                     await self.page.get_by_text(target, exact=False).first.click(timeout=5000)
                except:
                     await self.page.locator(target).first.click(timeout=5000)

            elif action == StepAction.TYPE_TEXT:
                try:
                     await self.page.get_by_placeholder(target, exact=False).first.fill(value, timeout=5000)
                except:
                     await self.page.locator(target).first.fill(value, timeout=5000)

            elif action == StepAction.ASSERT_VISIBLE:
                 try:
                     await self.page.get_by_text(target, exact=False).first.wait_for(state="visible", timeout=5000)
                 except:
                     await self.page.locator(target).first.wait_for(state="visible", timeout=5000)
                     
            elif action == StepAction.SCROLL:
                 # Map scroll to wheel for now
                 await self.page.mouse.wheel(0, 500)
                 await asyncio.sleep(0.5)
                 
            elif action == StepAction.WAIT:
                 ms = int(value) if value else 1000
                 await asyncio.sleep(ms / 1000)

            else:
                raise NotImplementedError(f"Ação {action} não suportada na Web.")

        except Exception as e:
            success = False
            error_msg = str(e)

        duration = int((time.time() - start_time) * 1000)
        return StepResult(
            step_num=step_num,
            status="passed" if success else "failed",
            duration_ms=duration,
            error_message=error_msg
        )


