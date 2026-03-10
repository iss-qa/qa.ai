import uiautomator2 as u2
import logging
from xml.etree import ElementTree

logger = logging.getLogger("ui_inspector")

class UIInspector:
    
    @staticmethod
    def get_element_at(device: u2.Device, x: int, y: int) -> dict:
        """
        Dumps the UI hierarchy and finds the deepest clickable or interactable 
        element that contains the coordinates (x, y).
        """
        try:
            dump = device.dump_hierarchy()
            root = ElementTree.fromstring(dump)
            
            best_match = None
            best_area = float('inf')
            
            # Parse all nodes
            for node in root.iter('node'):
                bounds = node.get('bounds')
                if not bounds:
                    continue
                    
                # bounds format: [x1,y1][x2,y2]
                boundsStr = bounds.replace('][', ',').replace('[', '').replace(']', '')
                x1, y1, x2, y2 = map(int, boundsStr.split(','))
                
                # Check if point is inside
                if x1 <= x <= x2 and y1 <= y <= y2:
                    area = (x2 - x1) * (y2 - y1)
                    # We want the smallest/deepest element containing the point
                    if area < best_area:
                        best_match = node
                        best_area = area
                        
            if best_match is not None:
                return {
                    "resource_id": best_match.get("resource-id", ""),
                    "text": best_match.get("text", ""),
                    "content_desc": best_match.get("content-desc", ""),
                    "class_name": best_match.get("class", ""),
                    "bounds": best_match.get("bounds", "")
                }
                
        except Exception as e:
            logger.error(f"Error inspecting UI: {e}")
            
        return {}
