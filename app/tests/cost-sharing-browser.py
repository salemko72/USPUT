"""Run cost-sharing badge coverage through the confirmed-stop meeting flow.

The shared scenario publishes through the required route preview and checks BHS
and English badges on the resulting ride. It starts its own synthetic-provider
app; this entry point no longer posts unconfirmed rides or mocks search results.
"""
from pathlib import Path
import runpy

runpy.run_path(str(Path(__file__).with_name('meeting-flow-browser.py')), run_name='__main__')
