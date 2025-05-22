// src/metrics.ts
import {
  KubeConfig,
  CoreV1Api,
  AppsV1Api,
  Metrics,
  PodMetricsList,
  V1Scale,
  V1Deployment,
  Watch,
} from '@kubernetes/client-node';
import { parseCPU, parseMemory } from './utils/index.js';
import type { VerticalScaleOpts } from './types/index.js';

export class MetricsClient {
  private kc = new KubeConfig();
  private core!: CoreV1Api;
  private metrics!: Metrics;
  private apps!: AppsV1Api;

  async init() {
    this.kc.loadFromDefault();
    this.core = this.kc.makeApiClient(CoreV1Api);
    this.metrics = new Metrics(this.kc);
    this.apps = this.kc.makeApiClient(AppsV1Api);
  }
  async getPodMetrics(namespace: string): Promise<PodMetricsList> {
    const res = await this.metrics.getPodMetrics(namespace);
    return res;
  }

  async getDeploymentMetrics(
    deploymentName: string,
    namespace: string
  ): Promise<{
    cpuCores: number;
    memoryBytes: number;
    raw: PodMetricsList;
  }> {
    const core = this.kc.makeApiClient(CoreV1Api);
    const podList = await core.listNamespacedPod({ namespace, labelSelector: `app=${deploymentName}` });
    const podNames = new Set(podList.items.map(p => p.metadata!.name!));
    const raw = await this.getPodMetrics(namespace);
    const items = raw.items.filter(m => podNames.has(m.metadata.name));

    let totalCPU = 0;
    let totalMem = 0;
    for (const pod of items) {
      for (const cont of pod.containers) {
        totalCPU += parseCPU(cont.usage.cpu);
        totalMem += parseMemory(cont.usage.memory);
      }
    }

    // build a “raw” list of just the matching pods
    const filteredRaw: PodMetricsList = {
      apiVersion: raw.apiVersion,
      kind: raw.kind,
      metadata: raw.metadata,
      items,
    };

    return { cpuCores: totalCPU, memoryBytes: totalMem, raw: filteredRaw };
  };



  async scaleDeploymentReplace(
    deploymentName: string,
    namespace: string,
    replicas: number
  ): Promise<void> {
    // 1) Fetch current scale
    const d = await this.apps.readNamespacedDeploymentScale(
      { name: deploymentName, namespace }
    );
    let newDep: V1Scale = d

    // 2) Modify and replace
    newDep.spec = d.spec || {};
    newDep.spec.replicas = replicas;
    await this.apps.replaceNamespacedDeploymentScale(
      {
        name: deploymentName,
        namespace,
        body: newDep
      }
    );
  }
  /**
   * Check average CPU usage and scale up or down.
   *
   * @param deploymentName  name of the Deployment (must match your labelSelector)
   * @param namespace       Kubernetes namespace
   * @param cpuThreshold    target average CPU (in cores)—if avg > this, we scale up
   * @param scaleUpReplicas   replicas count to set when scaling up
   * @param scaleDownReplicas replicas count to set when scaling down
   */
  async autoScaleIf(
    deploymentName: string,
    namespace: string,
    cpuThreshold: number,
    scaleUpReplicas: number,
    scaleDownReplicas: number
  ): Promise<void> {
    // 1) Fetch metrics & pod count
    const { cpuCores, raw } = await this.getDeploymentMetrics(
      deploymentName,
      namespace
    );
    const podCount = raw.items.length;
    if (podCount === 0) {
      console.warn(`No pods found for ${deploymentName}; skipping autoscale.`);
      return;
    }

    // 2) Compute average
    const avgCpu = cpuCores / podCount;
    console.log(
      `Average CPU for ${deploymentName}: ${avgCpu.toFixed(3)} cores/pod`
    );

    // 3) Decide and act
    if (avgCpu > cpuThreshold) {
      console.log(
        `→ CPU above ${cpuThreshold}, scaling UP to ${scaleUpReplicas} replicas`
      );
      await this.scaleDeploymentReplace(deploymentName, namespace, scaleUpReplicas);
    } else if (avgCpu < cpuThreshold * 0.5) {
      console.log(
        `→ CPU below ${cpuThreshold * 0.5}, scaling DOWN to ${scaleDownReplicas} replicas`
      );
      await this.scaleDeploymentReplace(deploymentName, namespace, scaleDownReplicas);
    } else {
      console.log(`→ CPU within acceptable range, no scaling action.`);
    }
  };

  /**
* Vertically scale by patching container resources on the Deployment.
*/
  async verticalScaleDeployment(
    deployment: string,
    opts: VerticalScaleOpts
  ): Promise<void> {
    // 1) Read the Deployment
    const dep = await this.apps.readNamespacedDeployment({
      name: deployment,
      namespace: opts.namespace
    }
    );

    // 2) Decide which containers to patch
    const ontainers = dep.spec!.template.spec!.containers!;
    const targets =
      opts.target === 'all'
        ? ontainers
        : ontainers.filter(c => c.name === opts.containerName);

    if (targets.length === 0) {
      throw new Error(
        opts.target === 'all'
          ? 'No containers found to patch'
          : `Container "${opts.containerName}" not found`
      );
    }

    // 3) Update resources on each target
    for (const c of targets) {
      c.resources = {
        requests: { cpu: opts.reqCpu, memory: opts.reqMem },
        limits:   { cpu: opts.limCpu, memory: opts.limMem },
      };
    }

    // 4) Replace the Deployment
    await this.apps.replaceNamespacedDeployment({
      name: deployment,
      namespace: opts.namespace,
      body: dep
    });
  };



  async watchAndAutoScale(
    deployment: string,
    namespace: string,
    cpuThreshold: number,
    scaleUp: number,
    scaleDown: number
  ): Promise<void> {
    const watch = new Watch(this.kc);
    console.log(
      `▶️  Watching pods in ns="${namespace}" with label app=${deployment}`
    );

    // this will keep the HTTP connection open and call our handler per event
    const path = `/api/v1/namespaces/${namespace}/pods`;
    const params = { labelSelector: `app=${deployment}` };

    const handler = async (phase: string, obj: any) => {
      console.log(`Pod ${phase}: ${obj.metadata.name}`);
      try {
        await this.autoScaleIf(
          deployment,
          namespace,
          cpuThreshold,
          scaleUp,
          scaleDown
        );
      } catch (err: any) {
        console.error('autoScaleIf error:', err.message);
      }
    };

    const done = (err: any) => {
      console.error('Watch ended:', err?.message || err);
      // Attempt to reconnect after a pause
      setTimeout(() => this.watchAndAutoScale(
        deployment, namespace, cpuThreshold, scaleUp, scaleDown
      ), 5_000);
    };

    await watch.watch(path, params, handler, done);
  }
}


