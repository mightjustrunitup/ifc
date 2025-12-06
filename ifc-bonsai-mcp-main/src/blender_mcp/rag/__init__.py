"""
RAG (Retrieval-Augmented Generation) infrastructure for IFC knowledge base.
Note: RAG features are optional and require langchain dependencies.
"""

import sys
import logging

logger = logging.getLogger(__name__)

# Check if langchain dependencies are available
RAG_AVAILABLE = False
_RAG_ERROR = None

try:
    # Test critical imports
    from langchain_core.schema import Document
    from langchain_community.embeddings import HuggingFaceEmbeddings
    from langchain_community.vectorstores import Chroma
    
    # If we get here, dependencies are available
    from .document_parser import IFCDocumentParser
    from .vector_store import IFCKnowledgeStore
    from .retriever import IFCKnowledgeRetriever
    
    RAG_AVAILABLE = True
    
    __all__ = [
        'IFCDocumentParser',
        'IFCKnowledgeStore', 
        'IFCKnowledgeRetriever'
    ]
    
except Exception as e:
    _RAG_ERROR = str(e)
    RAG_AVAILABLE = False
    logger.warning(f"RAG features disabled: {e}")
    
    # Provide stub classes that raise helpful errors
    class IFCDocumentParser:
        def __init__(self, *args, **kwargs):
            raise ImportError(f"RAG features require langchain. Error: {_RAG_ERROR}")
    
    class IFCKnowledgeStore:
        def __init__(self, *args, **kwargs):
            raise ImportError(f"RAG features require langchain. Error: {_RAG_ERROR}")
    
    class IFCKnowledgeRetriever:
        def __init__(self, *args, **kwargs):
            raise ImportError(f"RAG features require langchain. Error: {_RAG_ERROR}")
    
    __all__ = []