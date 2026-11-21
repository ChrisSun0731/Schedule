/// <reference lib="webworker" />
import { solveSchedule, type SolveInput, type SolveProgress, type SolveResult } from '@/utils/scheduler';

export type WorkerMessage = { type: 'progress'; progress: SolveProgress } | { type: 'done'; result: SolveResult } | { type: 'error'; message: string };

const ctx = self as unknown as { postMessage(msg: WorkerMessage): void; onmessage: ((e: MessageEvent<SolveInput>) => void) | null };

ctx.onmessage = (e) => {
  try {
    const result = solveSchedule(e.data, (progress) => ctx.postMessage({ type: 'progress', progress }));
    ctx.postMessage({ type: 'done', result });
  } catch (err) {
    ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
