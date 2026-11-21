import { solveSchedule, type SolveInput, type SolveProgress, type SolveResult } from '@/utils/scheduler';
import type { WorkerMessage } from '@/workers/scheduler.worker';

export interface SolverJob {
  promise: Promise<SolveResult>;
  cancel(): void;
}

/** Run the auto-scheduler in a Web Worker (falls back to the main thread). */
export function solveInWorker(input: SolveInput, onProgress?: (p: SolveProgress) => void): SolverJob {
  // Structured clone cannot copy Vue proxies – send plain JSON.
  const payload = JSON.parse(JSON.stringify(input)) as SolveInput;

  if (typeof Worker === 'undefined') {
    return {
      promise: new Promise((resolve) => setTimeout(() => resolve(solveSchedule(payload, onProgress)), 30)),
      cancel: () => undefined,
    };
  }

  const worker = new Worker(new URL('../workers/scheduler.worker.ts', import.meta.url), { type: 'module' });
  let rejectFn: (e: Error) => void = () => undefined;
  const promise = new Promise<SolveResult>((resolve, reject) => {
    rejectFn = reject;
    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const msg = e.data;
      if (msg.type === 'progress') onProgress?.(msg.progress);
      else if (msg.type === 'done') {
        resolve(msg.result);
        worker.terminate();
      } else {
        reject(new Error(msg.message));
        worker.terminate();
      }
    };
    worker.onerror = (e) => {
      reject(new Error(e.message || '排班運算失敗'));
      worker.terminate();
    };
    worker.postMessage(payload);
  });
  return {
    promise,
    cancel() {
      worker.terminate();
      rejectFn(new Error('已取消'));
    },
  };
}
