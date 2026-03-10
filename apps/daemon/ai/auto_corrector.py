import logging
from typing import Optional
from models.step import TestStep, StepAction
from ai.vision_analyzer import VisionResult
import uuid

logger = logging.getLogger("autocorrector")

class AutoCorrector:
    async def suggest_correction(
        self,
        original_step: TestStep,
        vision_result: VisionResult,
        attempt_num: int
    ) -> Optional[TestStep]:
        if attempt_num > 3:
            logger.warning(f"Max attempts reached for step {original_step.id}.")
            return None
            
        logger.info(f"Attempt {attempt_num} self-heal for {original_step.id}. Vision says: {vision_result.suggestion}")
        
        # 1. First attempt: If Vision has a suggestion, try turning it into a step if we can parse it, 
        # or just try a fallback strategy based on the action
        if attempt_num == 1:
            if "alert" in str(vision_result.unexpected_elements).lower() or "popup" in str(vision_result.unexpected_elements).lower():
                # Let's try to close the popup first before retrying the original step
                logger.info("AutoCorrector: Injecting PRESS_BACK to close unexpected popup.")
                return TestStep(
                    id=str(uuid.uuid4()),
                    action=StepAction.PRESS_BACK,
                    target=None,
                    description="[AutoCorrect] Press Back to close popup"
                )
            
            # If vision explicitly suggests a new target, try to use it
            if vision_result.suggestion and "use target" in vision_result.suggestion.lower():
                # Primitive parsing of suggestion: "use target: 'new_id'"
                parts = vision_result.suggestion.split("'")
                if len(parts) >= 3:
                    new_target = parts[1]
                    new_step = original_step.model_copy()
                    new_step.target = new_target
                    new_step.description += " [AutoCorrected Target]"
                    return new_step
            
        # 2. Second attempt: Try scrolling instead (maybe element is off screen)
        if attempt_num == 2 and original_step.action in [StepAction.TAP, StepAction.TYPE_TEXT, StepAction.ASSERT_ELEMENT]:
            logger.info("AutoCorrector: Trying scroll down to find element.")
            return TestStep(
                id=str(uuid.uuid4()),
                action=StepAction.SCROLL,
                value="forward",
                description="[AutoCorrect] Scroll to find element"
            )
            
        # 3. Third attempt: Wait longer
        if attempt_num == 3:
            logger.info("AutoCorrector: Injecting Wait for page to settle.")
            return TestStep(
                id=str(uuid.uuid4()),
                action=StepAction.WAIT,
                value="3000",
                description="[AutoCorrect] Wait for UI to settle"
            )
            
        return None
