// tests/scale.test.ts
import { MetricsClient } from '../src/metrics.js';

(async () => {
  const m = new MetricsClient();
  await m.init();

  const deployment = 'my-app';
  const namespace  = 'default';
  const target     = 3;

  try {
    console.log(`Scaling ${deployment} → ${target} replicas…`);
    await m.scaleDeploymentReplace(deployment, namespace, target);
    console.log('✅ Scale request sent.');
  } catch (err: any) {
    console.error(
      '❌ Scaling failed:',
      err.response?.body?.message || err.message
    );
  }
})();
