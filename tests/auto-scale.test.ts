// tests/auto-scale.test.ts
import { MetricsClient } from '../src/metrics.js';

(async () => {
  const m = new MetricsClient();
  await m.init();

  try {
    await m.autoScaleIf(
      'my-app',    // deployment name
      'default',   // namespace
      0.5,         // CPU threshold (cores)
      5,           // scale-up replicas
      1            // scale-down replicas
    );
    console.log('✅ autoScaleIf completed');
  } catch (err: any) {
    console.error('autoScaleIf failed:', err.message);
  }
})();
