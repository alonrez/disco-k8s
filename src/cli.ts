
import { Command } from 'commander';
import { HpaManager } from './hpa.js';
import { MetricsClient } from './metrics.js';
import { VerticalScaleOpts } from './types/index.js';


const program = new Command();
program
  .name('disco-k8s')
  .description('CLI for reading metrics, DIY scaling, and HPA management')
  .version('1.0.0');

program
  .command('autoscale <name>')
  .option('-n, --namespace <ns>', 'namespace', 'default')
  .option('--cpu <n>', 'threshold in cores', parseFloat, 0.5)
  .option('--up <r>', 'scale-up replicas', parseInt, 5)
  .option('--down <r>', 'scale-down replicas', parseInt, 1)
  .action(async (name, opts) => {
    const m = new MetricsClient();
    await m.init();
    await m.autoScaleIf(name, opts.namespace, opts.cpu, opts.up, opts.down);
  });

program
  .command('ensure-hpa <name>')
  .option('-n, --namespace <ns>', 'namespace', 'default')
  .option('--min <r>', 'min replicas', parseInt, 1)
  .option('--max <r>', 'max replicas', parseInt, 10)
  .option('--cpu-percent <n>', 'target CPU%', parseInt, 50)
  .action(async (name, opts) => {
    const h = new HpaManager();
    await h.init();
    await h.ensureHpa(name, opts.namespace, opts.min, opts.max, opts.cpuPercent);
  });

  program
  .command('hscale <deployment>')
  .description('Set the number of replicas for a Deployment')
  .option('-n, --namespace <ns>', 'K8s namespace', 'default')
  .requiredOption('-r, --replicas <num>', 'desired replica count', (v: any) => parseInt(v, 10))
  .action(async (name: string, opts: any) => {
    const m = new MetricsClient();
    await m.init();
    console.log(`Scaling ${name} → ${opts.replicas} replicas in namespace ${opts.namespace}…`);
    await m.scaleDeploymentReplace(name, opts.namespace, opts.replicas);
    console.log('✅ Done.');
  });


  program
  .command('vertical-scale <deployment>')
  .description('Patch CPU/memory on one container or all containers')
  .option('-c, --container <name>', 'container name')
  .option('--all', 'apply to all containers')
  .requiredOption('--req-cpu <q>', 'cpu request (e.g. "200m")')
  .requiredOption('--lim-cpu <q>', 'cpu limit   (e.g. "1")')
  .requiredOption('--req-mem <q>', 'memory request (e.g. "256Mi")')
  .requiredOption('--lim-mem <q>', 'memory limit   (e.g. "512Mi")')
  .option('-n, --namespace <ns>', 'K8s namespace', 'default')
  .action(async (deployment: string, rawOpts: any) => {
    // build our discriminated union
    let opts: VerticalScaleOpts;
    if (rawOpts.all) {
      opts = {
        target: 'all',
        namespace: rawOpts.namespace,
        reqCpu: rawOpts.reqCpu,
        limCpu: rawOpts.limCpu,
        reqMem: rawOpts.reqMem,
        limMem: rawOpts.limMem,
      };
    } else if (rawOpts.container) {
      opts = {
        target: 'containerName',
        containerName: rawOpts.container,
        namespace: rawOpts.namespace,
        reqCpu: rawOpts.reqCpu,
        limCpu: rawOpts.limCpu,
        reqMem: rawOpts.reqMem,
        limMem: rawOpts.limMem,
      };
    } else {
      console.error('Error: you must specify either --container or --all');
      process.exit(1);
    }

    const m = new MetricsClient();
    await m.init();
    await m.verticalScaleDeployment(deployment, opts);
    console.log('✅ vertical scale applied');
  });



program
.command('watch <deployment>')
.description('Watch pods and auto-scale on every add/update/delete')
.option('-n, --namespace <ns>',   'namespace', 'default')
.option('--cpu <n>',     'CPU cores threshold',    parseFloat, 0.5)
.option('--up <r>',      'scale-up replicas',       parseInt,   5)
.option('--down <r>',    'scale-down replicas',     parseInt,   1)
.action(async (name, opts) => {
  const m = new MetricsClient();
  await m.init();
  await m.watchAndAutoScale(
    name,
    opts.namespace,
    opts.cpu,
    opts.up,
    opts.down
  );
});


program.parse(process.argv);



// import { KubeConfig, Metrics, PodMetricsList, CoreV1Api, V1Scale } from '@kubernetes/client-node';
// import { parseCPU, parseMemory } from './utils/index.js';
// import { AppsV1Api } from '@kubernetes/client-node';

// export class MetricsAggregator {
//     private kc = new KubeConfig();
//     private core!: CoreV1Api;
//     private metricsClient!: Metrics;
//     private apps!: AppsV1Api;

//     async loadConfig() {
//         this.kc.loadFromDefault();
//         this.core = this.kc.makeApiClient(CoreV1Api);
//         this.metricsClient = new Metrics(this.kc);
//         this.apps = this.kc.makeApiClient(AppsV1Api);
//     }
//     async getPodMetrics(namespace: string): Promise<PodMetricsList> {
//         const res = await this.metricsClient.getPodMetrics(namespace);
//         return res;
//     }
//     /** Sum CPU cores & memory bytes across all pods in a namespace */
//     async getNamespaceMetrics(ns: string): Promise<{
//         cpuCores: number;
//         memoryBytes: number;
//         raw: PodMetricsList;
//     }> {
//         const raw = await this.getPodMetrics(ns);
//         let totalCPU = 0;
//         let totalMem = 0;

//         for (const pod of raw.items) {
//             for (const cont of pod.containers) {
//                 totalCPU += parseCPU(cont.usage.cpu);
//                 totalMem += parseMemory(cont.usage.memory);
//             }
//         }

//         return { cpuCores: totalCPU, memoryBytes: totalMem, raw };
//     }

//     async getDeploymentMetrics(
//         deploymentName: string,
//         namespace: string
//     ): Promise<{
//         cpuCores: number;
//         memoryBytes: number;
//         raw: PodMetricsList;
//     }> {
//         const core = this.kc.makeApiClient(CoreV1Api);
//         const podList = await core.listNamespacedPod({ namespace, labelSelector: `app=${deploymentName}` });
//         const podNames = new Set(podList.items.map(p => p.metadata!.name!));
//         const raw = await this.getPodMetrics(namespace);
//         const items = raw.items.filter(m => podNames.has(m.metadata.name));

//         let totalCPU = 0;
//         let totalMem = 0;
//         for (const pod of items) {
//             for (const cont of pod.containers) {
//                 totalCPU += parseCPU(cont.usage.cpu);
//                 totalMem += parseMemory(cont.usage.memory);
//             }
//         }

//         // build a “raw” list of just the matching pods
//         const filteredRaw: PodMetricsList = {
//             apiVersion: raw.apiVersion,
//             kind: raw.kind,
//             metadata: raw.metadata,
//             items,
//         };

//         return { cpuCores: totalCPU, memoryBytes: totalMem, raw: filteredRaw };
//     };



//     async scaleDeploymentReplace(
//         deploymentName: string,
//         namespace: string,
//         replicas: number
//     ): Promise<void> {
//         // 1) Fetch current scale
//         const d = await this.apps.readNamespacedDeploymentScale(
//             { name: deploymentName, namespace }
//         );
//         let newDep: V1Scale = d

//         // 2) Modify and replace
//         newDep.spec = d.spec || {};
//         newDep.spec.replicas = replicas;
//         await this.apps.replaceNamespacedDeploymentScale(
//             {
//                 name: deploymentName,
//                 namespace,
//                 body: newDep
//             }
//         );
//     }

// /**
//  * Check average CPU usage and scale up or down.
//  *
//  * @param deploymentName  name of the Deployment (must match your labelSelector)
//  * @param namespace       Kubernetes namespace
//  * @param cpuThreshold    target average CPU (in cores)—if avg > this, we scale up
//  * @param scaleUpReplicas   replicas count to set when scaling up
//  * @param scaleDownReplicas replicas count to set when scaling down
//  */
// async autoScaleIf(
//     deploymentName: string,
//     namespace: string,
//     cpuThreshold: number,
//     scaleUpReplicas: number,
//     scaleDownReplicas: number
//   ): Promise<void> {
//     // 1) Fetch metrics & pod count
//     const { cpuCores, raw } = await this.getDeploymentMetrics(
//       deploymentName,
//       namespace
//     );
//     const podCount = raw.items.length;
//     if (podCount === 0) {
//       console.warn(`No pods found for ${deploymentName}; skipping autoscale.`);
//       return;
//     }
  
//     // 2) Compute average
//     const avgCpu = cpuCores / podCount;
//     console.log(
//       `Average CPU for ${deploymentName}: ${avgCpu.toFixed(3)} cores/pod`
//     );
  
//     // 3) Decide and act
//     if (avgCpu > cpuThreshold) {
//       console.log(
//         `→ CPU above ${cpuThreshold}, scaling UP to ${scaleUpReplicas} replicas`
//       );
//       await this.scaleDeploymentReplace(deploymentName, namespace, scaleUpReplicas);
//     } else if (avgCpu < cpuThreshold * 0.5) {
//       console.log(
//         `→ CPU below ${cpuThreshold * 0.5}, scaling DOWN to ${scaleDownReplicas} replicas`
//       );
//       await this.scaleDeploymentReplace(deploymentName, namespace, scaleDownReplicas);
//     } else {
//       console.log(`→ CPU within acceptable range, no scaling action.`);
//     }
//   }

// }

