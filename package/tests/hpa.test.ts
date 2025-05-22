// tests/hpa.test.ts
import { HpaManager } from '../src/hpa.js';

(async () => {
  const h = new HpaManager();
  await h.init();

  try {
    await h.ensureHpa(
      'my-app',     // deployment name
      'default',    // namespace
      1,            // min replicas
      5,            // max replicas
      50            // target CPU utilization (%)
    );
    console.log('✅ HPA ensured/updated');
  } catch (err: any) {
    console.error(
      'HPA creation/patch failed:',
      err.response?.body?.message || err.message
    );
  }
})();
