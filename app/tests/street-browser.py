"""Street routing now uses the confirmed meeting-point integration flow."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name("meeting-flow-browser.py")), run_name="__main__")
