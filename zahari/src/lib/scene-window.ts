// Calibrate against other complete windows in this asset's uploaded history.
// Window positions use timestamp/id order, never arithmetic on source or serial IDs.
export const WINDOW_CALIBRATION_SQL = `
WITH endpoints AS (
  SELECT deviation,sigma,
    ROW_NUMBER() OVER (ORDER BY timestamp,id) AS position,
    LEAD(deviation,?1-1) OVER (ORDER BY timestamp,id) AS end_deviation,
    LEAD(sigma,?1-1) OVER (ORDER BY timestamp,id) AS end_sigma
  FROM localtod_st_15m WHERE asset=?2
), changes AS (
  SELECT ABS((end_deviation-deviation)/(?1-1)) AS d,
         ABS((end_sigma-sigma)/(?1-1)) AS s
  FROM endpoints WHERE end_deviation IS NOT NULL AND end_sigma IS NOT NULL AND position<>?3+1
), deviation_ranks AS (
  SELECT d,ROW_NUMBER() OVER (ORDER BY d) AS rank,COUNT(*) OVER () AS total FROM changes
), sigma_ranks AS (
  SELECT s,ROW_NUMBER() OVER (ORDER BY s) AS rank,COUNT(*) OVER () AS total FROM changes
)
SELECT
  (SELECT d FROM deviation_ranks WHERE rank=CAST((total*9+9)/10 AS INTEGER)) AS deviation_scale,
  (SELECT s FROM sigma_ranks WHERE rank=CAST((total*9+9)/10 AS INTEGER)) AS sigma_scale`;
