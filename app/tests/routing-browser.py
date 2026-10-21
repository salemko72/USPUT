"""Run the fixed-stop routing regression in an isolated synthetic-provider app.

The former matrix-only scenario inferred arbitrary intermediate stops. Matching
now uses the driver's confirmed points; the shared flow exercises route preview,
walking limits and the same stop agreement through request and acceptance.
"""
from pathlib import Path
import runpy

runpy.run_path(str(Path(__file__).with_name('meeting-flow-browser.py')), run_name='__main__')
