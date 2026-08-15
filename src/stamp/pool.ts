import type { ProcessRequest, ProcessResult } from "./types";

type Pending = {
  resolve: (value: ProcessResult) => void;
};

export class StampWorkerPool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: Array<{ req: ProcessRequest; pending: Pending }> = [];
  private inflight = new Map<Worker, Pending>();
  private size: number;
  private doneSinceSpawn = 0;

  constructor(size = 2) {
    this.size = size;
    this.spawn();
  }

  private spawn(): void {
    for (let i = 0; i < this.size; i++) {
      const worker = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (event: MessageEvent<ProcessResult>) => {
        const pending = this.inflight.get(worker);
        if (pending) {
          this.inflight.delete(worker);
          pending.resolve(event.data);
        }
        this.idle.push(worker);
        this.pump();
      };
      worker.onerror = () => {
        const pending = this.inflight.get(worker);
        if (pending) {
          this.inflight.delete(worker);
          pending.resolve({
            id: -1,
            ok: false,
            reason: "error",
            message: "Worker が異常終了しました",
          });
        }
        this.idle.push(worker);
        this.pump();
      };
      this.workers.push(worker);
      this.idle.push(worker);
    }
  }

  recycle(): void {
    if (this.queue.length > 0 || this.inflight.size > 0) return;
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.idle = [];
    this.doneSinceSpawn = 0;
    this.spawn();
  }

  recycleEvery(n: number): void {
    this.doneSinceSpawn += 1;
    if (this.doneSinceSpawn >= n) this.recycle();
  }

  run(req: ProcessRequest): Promise<ProcessResult> {
    return new Promise((resolve) => {
      this.queue.push({ req, pending: { resolve } });
      this.pump();
    });
  }

  terminate(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.idle = [];
    this.queue = [];
    this.inflight.clear();
  }

  private pump(): void {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const worker = this.idle.pop()!;
      const job = this.queue.shift()!;
      this.inflight.set(worker, job.pending);
      worker.postMessage(job.req);
    }
  }
}
