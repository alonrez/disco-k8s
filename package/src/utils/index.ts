// src/utils.ts
export function parseCPU(q: string): number {
    // “100m” → 100 millicores → 0.1 core; “1” → 1 core
    if (q.endsWith('m')) {
      return parseInt(q.slice(0, -1), 10) / 1000;
    }
    return parseFloat(q);
  }
  
  export function parseMemory(q: string): number {
    // “128Mi” → bytes; “1Gi” etc.
    const units: Record<string, number> = {
      Ki: 2 ** 10, Mi: 2 ** 20, Gi: 2 ** 30,
      Ti: 2 ** 40, Pi: 2 ** 50, Ei: 2 ** 60,
      K: 10 ** 3, M: 10 ** 6, G: 10 ** 9,
    };
    const match = q.match(/^(\d+)([a-zA-Z]+)?$/);
    if (!match) throw new Error(`Invalid memory quantity: ${q}`);
    const [, num, unit] = match;
    return unit ? parseInt(num, 10) * (units[unit] || 1) : parseInt(num, 10);
  }
  