"""Ad-hoc debugging helper that ended up in the scheduled job."""
import logging

import pandas as pd

logger = logging.getLogger(__name__)


def inspect(customers_df: pd.DataFrame) -> None:
    logger.info("inspecting customer frame")
    logger.info(customers_df.head(20))
    print(customers_df.head())
