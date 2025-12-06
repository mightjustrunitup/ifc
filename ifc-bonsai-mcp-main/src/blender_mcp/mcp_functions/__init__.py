"""
MCP functions module - imports all tools, resources, and prompts
RAG tools are optional and imported lazily
"""

from . import api_tools
from . import analysis_tools  
from . import prompts

# RAG tools are optional - import lazily to avoid dependency errors
try:
    from . import rag_tools
except ImportError:
    rag_tools = None

__all__ = [
    'api_tools', 'analysis_tools', 'prompts',
    'rag_tools'
]
