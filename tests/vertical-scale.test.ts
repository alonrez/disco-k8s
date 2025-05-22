// tests/vertical-scale.test.ts
import { MetricsClient } from '../src/metrics.js';
import { VerticalScaleOpts } from '../src/types/index.js';


(async () => {
  const m = new MetricsClient();
  await m.init();

  // Build the discriminated‐union opts
  const opts: VerticalScaleOpts = {
    target: 'all',
    namespace: 'default',
    reqCpu: '250m',
    limCpu: '1',
    reqMem: '256Mi',
    limMem: '512Mi',
  };

  try {
    await m.verticalScaleDeployment('my-app', opts);
    console.log('✅ vertical-scale applied');
  } catch (err: any) {
    console.error('vertical-scale failed:', err.message);
    process.exit(1);
  }
})();
