from jinja2 import Environment, FileSystemLoader
from playwright.async_api import async_playwright
import tempfile
import os
import base64
import aiohttp
from ai.bug_engine.models import RunEvidence, BugReportContent

class PDFGenerator:
    
    TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "templates")
    
    async def generate(
        self,
        bug_report: BugReportContent,
        evidence: RunEvidence
    ) -> bytes:
        """
        Gera o PDF e retorna como bytes.
        """
        screenshots_b64 = await self._screenshots_to_base64(evidence)
        html_content = self._render_html(bug_report, evidence, screenshots_b64)
        
        with tempfile.NamedTemporaryFile(suffix=".html", delete=False) as tmp:
            tmp.write(html_content.encode('utf-8'))
            tmp_path = tmp.name
            
        try:
             async with async_playwright() as p:
                browser = await p.chromium.launch()
                page = await browser.new_page()
                await page.goto(f"file://{tmp_path}")
                # Wait for any network images or fonts to settle
                await page.wait_for_load_state('networkidle')
                pdf_bytes = await page.pdf(format="A4", print_background=True)
                await browser.close()
                return pdf_bytes
        finally:
             if os.path.exists(tmp_path):
                 os.remove(tmp_path)
    
    async def _screenshots_to_base64(self, evidence: RunEvidence) -> dict[str, str]:
        """
        Baixa e converte screenshots para base64. Limitado a no máximo 10.
        """
        result = {}
        target_screenshots = [s for s in evidence.screenshots if s.screenshot_url][:10]
        
        async with aiohttp.ClientSession() as session:
            for s in target_screenshots:
                 if s.screenshot_url.startswith("data:image"):
                     result[str(s.step_num)] = s.screenshot_url.split(",")[1]
                     continue
                     
                 try:
                     async with session.get(s.screenshot_url) as resp:
                         resp.raise_for_status()
                         data = await resp.read()
                         result[str(s.step_num)] = base64.b64encode(data).decode('utf-8')
                 except Exception as e:
                     print(f"Failed to fetch screenshot for step {s.step_num}: {e}")
        return result
    
    def _render_html(
        self,
        bug_report: BugReportContent,
        evidence: RunEvidence,
        screenshots_b64: dict[str, str]
    ) -> str:
        """Renderiza o template HTML com todos os dados."""
        if not os.path.exists(self.TEMPLATE_DIR):
             os.makedirs(self.TEMPLATE_DIR)
             
        env = Environment(loader=FileSystemLoader(self.TEMPLATE_DIR))
        # Support fallback if template not created yet
        try:
             template = env.get_template("bug_report.html")
             return template.render(
                 bug_report=bug_report,
                 evidence=evidence,
                 screenshots=screenshots_b64
             )
        except Exception:
             return f"<html><body><h1>{bug_report.title}</h1><p>{bug_report.summary}</p></body></html>"
