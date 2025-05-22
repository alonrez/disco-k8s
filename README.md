# ✨ disco-k8s
A TypeScript-first CLI and library for Kubernetes: metrics aggregation, DIY scaling, HPA management, vertical resource tuning, and event-driven autoscaling.

# 🚀 Features
 **Metrics**: fetch raw PodMetrics or aggregate CPU/memory per Deployment

 **DIY Scaling (hscale)**: set exact replica count

 **Conditional Autoscale (autoscale)**: scale up/down based on avg CPU

 **HPA Management (ensure-hpa)**: create or patch HorizontalPodAutoscaler

 **Vertical Scale (vscale)**: bump CPU/memory requests & limits on one or all containers

 **Watch Mode (watch)**: real-time autoscaling on Pod add/update/delete events

 **Fully Typed**: built with @kubernetes/client-node, ESM, and TS types

 **Standalone Library**: use MetricsClient & HpaManager in your own code


# 💿 Installation
``` bash
npm install -g disco-k8s
# or locally for development:
npm install disco-k8s
```

# 🏁 Quickstart
``` bash 
# Show aggregated Deployment metrics
disco-k8s metrics my-app --namespace default

# Scale Deployment to 3 replicas
disco-k8s hscale my-app --replicas 3

# Conditional autoscale: CPU >0.5 → 5 replicas, <0.25 → 1 replica
disco-k8s autoscale my-app \
  --cpu 0.5 --up 5 --down 1

# Ensure HPA (min=1, max=10, target CPU%=50)
disco-k8s ensure-hpa my-app \
  --min 1 --max 10 --cpu-percent 50

# Vertical scale: set container resources
disco-k8s vscale my-app \
  --container my-container \
  --req-cpu 200m --lim-cpu 1 \
  --req-mem 256Mi --lim-mem 512Mi

# Watch mode: event-driven autoscale
disco-k8s watch my-app \
  --cpu 0.5 --up 5 --down 1
```

# 📚 Commands
- metrics <deployment>
Show CPU/memory metrics for a Deployment:
``` bash 
# aggregated view
disco-k8s metrics my-app --namespace default

# raw PodMetrics JSON
disco-k8s metrics my-app --namespace default --raw
```
- hscale <deployment>
Set exact replica count:
``` bash
disco-k8s hscale my-app --replicas 3
```
- autoscale <deployment>
DIY conditional autoscale on avg CPU:
``` bash
disco-k8s autoscale my-app \
  --cpu 0.5 --up 5 --down 1
```
- ensure-hpa <deployment>
Patch CPU/memory on one or all containers:
``` bash 
# single container
disco-k8s vscale my-app \
  --container my-container \
  --req-cpu 200m --lim-cpu 1 \
  --req-mem 256Mi --lim-mem 512Mi

# all containers
disco-k8s vscale my-app \
  --all \
  --req-cpu 200m --lim-cpu 1 \
  --req-mem 256Mi --lim-mem 512Mi
```
- watch <deployment>
Event-driven autoscaling on Pod events:
``` bash 
disco-k8s watch my-app \
  --cpu 0.5 --up 5 --down 1
```

# 🛠️ Usage in Code
### 1) Initialize clients 
``` typescript
import { MetricsClient } from 'disco-k8s';
import { HpaManager }   from 'disco-k8s';

async function main() {
  const metrics = new MetricsClient();
  await metrics.init();

  const hpa = new HpaManager();
  await hpa.init();

  const deployment = 'my-app';
  const namespace  = 'default';

  main().catch(err => {
  console.error(err);
  process.exit(1);
});
```
### 2) Fetch raw PodMetrics
``` typescript
  const raw = await metrics.getPodMetrics(namespace);
  console.log('Raw PodMetrics:', JSON.stringify(raw.items, null, 2));
```
### 3) Aggregate per-Deployment (CPU cores, memory bytes, podCount)
``` typescript
  const { cpuCores, memoryBytes, raw } =
    await metrics.getDeploymentMetrics(deployment, namespace);
  const podCount = raw.items.length;
  console.log(
    `Aggregated → pods: ${podCount}, CPU: ${cpuCores.toFixed(2)} cores, ` +
    `Memory: ${(memoryBytes / 2**20).toFixed(1)} MiB`
  );
```
### 4) DIY horizontal scaling (hscale)
``` typescript
  await metrics.scaleDeployment(deployment, namespace, /* replicas */ 3);
  console.log('Scaled to 3 replicas');
```
### 5) Conditional autoscale (autoscale)
``` typescript
  // -- if avg CPU > 0.5 → 5 replicas; if < 0.25 → 1 replica
  await metrics.autoScaleIf(deployment, namespace, 0.5, 5, 1);
```
### 6) HPA management (ensure-hpa)
``` typescript
  // --  ensure an HPA with min=1, max=10, targetCPU=50%
try {
  // -- Attempt to create or patch the HPA
  const hpaObj = await hpa.ensureHpa(
    'my-app',     // deployment name
    'default',    // namespace
    1,            // min replicas
    10,           // max replicas
    50            // target CPU utilization (%)
  );

  // -- hpa.ensureHpa now returns the final HPA object
  console.log('✅ HPA is in place:');
  console.log(`   name:      ${hpaObj.metadata?.name}`);
  console.log(`   namespace: ${hpaObj.metadata?.namespace}`);
  console.log(`   min:       ${hpaObj.spec?.minReplicas}`);
  console.log(`   max:       ${hpaObj.spec?.maxReplicas}`);
  console.log(
    `   target:    ${hpaObj.spec?.metrics?.[0].resource.target.averageUtilization}% CPU`
  );
} catch (err: any) {
  console.error('❌ Failed to ensure HPA:', err.message);
  process.exit(1);
}
```
### 7) Vertical scaling (vscale)
``` typescript
  // -- patch resources on “my-container” only
  await metrics.verticalScaleDeployment(deployment, {
    target: 'containerName',
    containerName: 'my-container',
    namespace,
    reqCpu: '200m',
    limCpu: '1',
    reqMem: '256Mi',
    limMem: '512Mi',
  });
  console.log('Vertical scale applied to my-container');
```
### 8) Event-driven watch & auto-scale (watch)
``` typescript
  // -- this will run indefinitely, scaling on every Pod event
  // -- cpuThreshold: 0.5, scaleUp to: 5, scaleDown to: 1
  await metrics.watchAndAutoScale(deployment, namespace, 0.5, 5, 1);
```


## What each block does 
### Initialization

- MetricsClient for reads & DIY scaling

- HpaManager for HPA CRUD

### Raw metrics

- getPodMetrics(namespace) returns the full PodMetricsList so you can inspect every .containers[].usage.

### Aggregated metrics

- getDeploymentMetrics(deployment, namespace) filters by app=<deployment> label and sums CPU & memory.

### DIY horizontal scale

- scaleDeployment(name, ns, replicas) patches the Deployment’s scale subresource.

### Conditional autoscale

- autoScaleIf(deployment, ns, cpuThreshold, up, down) computes avg CPU/pod and scales up or down.

### HPA management

- ensureHpa(name, ns, min, max, cpuPercent) creates or updates a HorizontalPodAutoscaler resource.

### Vertical scaling

- verticalScaleDeployment(deployment, opts) replaces the Deployment spec to bump container resources, for one container or all.

### Watch mode

- watchAndAutoScale(deployment, ns, cpuThreshold, up, down) subscribes to Pod events and runs your autoscale logic in real time.



# 📄 License
MIT © 2025 Alon Reznik

### Happy scaling! 🚀