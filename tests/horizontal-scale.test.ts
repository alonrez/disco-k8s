import { execSync } from 'child_process';

try {
  console.log(execSync('disco-k8s hscale my-app -r 2').toString());
  console.log('✅ horizontal-scale CLI works');
} catch (err: any) {
  console.error('horizontal-scale CLI failed:', err.stdout?.toString() || err.message);
}