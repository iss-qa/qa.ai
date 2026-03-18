import math
from typing import List, Optional


def get_reference_image_for_step(
    step_num: int,
    total_steps: int,
    images: List[bytes],
    mapping: Optional[dict] = None
) -> Optional[bytes]:
    """Return the reference image for a given step number.

    If an explicit mapping is provided, use it.
    Otherwise, distribute images proportionally across steps.

    Args:
        step_num: 1-based step number
        total_steps: total number of steps in the test
        images: list of image bytes in order
        mapping: optional dict mapping image_index (str) -> list of step_nums

    Returns:
        Image bytes or None if no image maps to this step.
    """
    if not images:
        return None

    # Explicit mapping: {image_index: [step_nums]}
    if mapping:
        for img_idx_str, step_nums in mapping.items():
            img_idx = int(img_idx_str)
            if step_num in step_nums and 0 <= img_idx < len(images):
                return images[img_idx]
        return None

    # Proportional distribution
    if total_steps <= 0:
        return None

    image_index = (step_num - 1) * len(images) // total_steps
    image_index = min(image_index, len(images) - 1)
    return images[image_index]
