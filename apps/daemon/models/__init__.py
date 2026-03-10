import os
import sys

# Add apps/daemon to PYTHONPATH when running as a package or direct script
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
