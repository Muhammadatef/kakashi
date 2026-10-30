"""Decoy: pseudonymises ids locally and logs a plain status string."""
import hashlib
import logging

logger = logging.getLogger(__name__)


def pseudonymise(ids):
    keys = [hashlib.sha256(str(i).encode()).hexdigest() for i in ids]
    logger.info("pseudonymised ids")
    return keys
