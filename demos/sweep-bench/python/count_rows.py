"""Decoy: counts rows per table and writes only the counts. No records move."""
import json
import logging

logger = logging.getLogger(__name__)

TABLES = ["orders", "payouts"]


def main(counts: dict) -> None:
    logger.info("counting rows")
    summary = {t: int(counts.get(t, 0)) for t in TABLES}
    with open("/tmp/row_counts.json", "w") as fh:
        json.dump(summary, fh)
    logger.info("done")


if __name__ == "__main__":
    main({})
