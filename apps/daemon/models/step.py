from pydantic import BaseModel, Field
from typing import Optional, Literal
from enum import Enum

class StepAction(str, Enum):
    TAP = "tap"
    TYPE = "type"
    TYPE_TEXT = "type_text"
    SWIPE = "swipe"
    LONG_PRESS = "long_press"
    PRESS_BACK = "press_back"
    PRESS_HOME = "press_home"
    SCROLL = "scroll"
    WAIT = "wait"
    ASSERT_TEXT = "assert_text"
    ASSERT_ELEMENT = "assert_element"
    OPEN_APP = "open_app"

class TestStep(BaseModel):
    id: str
    action: StepAction
    target: Optional[str] = None
    value: Optional[str] = None
    timeout_ms: Optional[int] = 10000
    description: Optional[str] = None
    target_strategies: list[str] = Field(default_factory=list)

class StepResult(BaseModel):
    step_num: int
    status: Literal["passed", "failed"]
    duration_ms: int
    screenshot_url: Optional[str] = None
    error_message: Optional[str] = None
    element_found: bool = False
    retry_count: int = 0
