// src/hpa.ts
import {
  KubeConfig,
  AutoscalingV2Api,
  V2HorizontalPodAutoscaler,
} from '@kubernetes/client-node';

export class HpaManager {
  private kc = new KubeConfig();
  private hpa!: AutoscalingV2Api;

  async init() {
    this.kc.loadFromDefault();
    this.hpa = this.kc.makeApiClient(AutoscalingV2Api);
  }

  async ensureHpa(
    deployment: string,
    namespace: string,
    min: number,
    max: number,
    targetCpuPercent: number
  ) {
    const desired: V2HorizontalPodAutoscaler = {
      apiVersion: 'autoscaling/v2',
      kind: 'HorizontalPodAutoscaler',
      metadata: { name: deployment, namespace },
      spec: {
        scaleTargetRef: {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          name: deployment,
        },
        minReplicas: min,
        maxReplicas: max,
        metrics: [
          {
            type: 'Resource',
            resource: {
              name: 'cpu',
              target: {
                type: 'Utilization',
                averageUtilization: targetCpuPercent,
              },
            },
          },
        ],
      },
    };

    try {
      // Try to create fresh
      await this.hpa.createNamespacedHorizontalPodAutoscaler({ namespace, body: desired });
      console.log('HPA created');
    } catch (err: any) {
      const status = err.response?.statusCode ?? err.code;
      if (status === 409) {
        // Already exists → read current, overwrite spec, then replace
        const existing =
          await this.hpa.readNamespacedHorizontalPodAutoscaler({
            name: deployment,
            namespace
          }
          );

        const newHpaAs: V2HorizontalPodAutoscaler = { ...existing, spec: desired.spec };

        await this.hpa.replaceNamespacedHorizontalPodAutoscaler({
          name: deployment,
          namespace,
          body: newHpaAs
        }
        );
        console.log('HPA spec replaced');
      } else {
        throw err;
      }
    }
  }
}
