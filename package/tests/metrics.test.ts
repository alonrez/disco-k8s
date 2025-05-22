import { execSync } from 'child_process';

try {
  console.log(execSync(
    'node dist/index.js metrics my-app'
  ).toString());
  console.log('✅ metrics CLI works (aggregated)');
  console.log(execSync(
    'node dist/index.js metrics my-app --raw'
  ).toString().slice(0,200) + '…'); // show truncated JSON
  console.log('✅ metrics CLI works (raw)');
} catch (err: any) {
  console.error('metrics CLI failed:', err.stdout?.toString() || err.message);
  process.exit(1);
}
