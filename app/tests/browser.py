"""Run the real-account browser flow; anonymous demo entry was removed."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('real-browser.py')),run_name='__main__')
