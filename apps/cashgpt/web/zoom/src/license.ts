import type { useDb } from "./db";

type Db = ReturnType<typeof useDb>;

/**
 * Sets the ZoomCharts licence before any chart is created. The licence lives
 * in the project's secrets (SECRET_ZOOMCHARTS_LICENSE, _KEY) and reaches the
 * page through the zoomcharts_license action. Without one, ZoomCharts runs
 * in evaluation mode.
 */
export async function loadLicense(db: Db): Promise<boolean> {
  try {
    const outcome = await db.run.zoomcharts_license.start({}).done;
    if (!outcome.ok) return false;
    const { license, key } = (outcome.value ?? {}) as { license?: string; key?: string };
    if (!license) return false;
    window.ZoomChartsLicense = license;
    window.ZoomChartsLicenseKey = key ?? "";
    return true;
  } catch {
    return false;
  }
}
