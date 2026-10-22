"""Nitrogen's require interface for the Silicon sources packaged with this site.

This browser adapter never downloads or substitutes an unverified publication.
Standalone exports use the real Nitrogen package.
"""
import importlib


def require(pub, rel=None):
    if not isinstance(pub, str):
        raise TypeError('Publication must be text.')
    publication, separator, submodule = pub.partition('.')
    if publication.lower() not in ('si', 'silicon') or rel is not None:
        raise ImportError('Browser Python includes the pinned Silicon publication only. Use the local companion with Nitrogen for other publications or releases.')
    return importlib.import_module('silicon' + ('.' + submodule if separator else ''))
