"""Run the account-backed ride regression with confirmed driver meeting points.

The old flow published unconfirmed endpoints. Its publish/search/request coverage
now lives in the isolated synthetic-provider meeting flow, which starts its own
server and verifies the required stop preview rather than bypassing it.
"""
from pathlib import Path
import runpy

runpy.run_path(str(Path(__file__).with_name('meeting-flow-browser.py')), run_name='__main__')
