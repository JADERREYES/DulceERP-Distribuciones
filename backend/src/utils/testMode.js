const isExpiredLotSaleTestModeEnabled = () => (
  process.env.ALLOW_EXPIRED_LOT_SALES_FOR_TEST === 'true' &&
  process.env.NODE_ENV !== 'production'
);

module.exports = { isExpiredLotSaleTestModeEnabled };
