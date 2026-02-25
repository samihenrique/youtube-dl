import { describe, expect, test } from "bun:test";
import { Semaphore } from "./semaphore.ts";

describe("Semaphore", () => {
  test("respeita o limite de concorrência", async () => {
    const semaphore = new Semaphore(2);
    let running = 0;
    let maxRunning = 0;

    const task = () =>
      semaphore.run(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 50));
        running--;
      });

    await Promise.all([task(), task(), task(), task(), task()]);
    expect(maxRunning).toBe(2);
  });

  test("executa todas as tarefas", async () => {
    const semaphore = new Semaphore(3);
    const results: number[] = [];

    const tasks = Array.from({ length: 10 }, (_, i) =>
      semaphore.run(async () => {
        results.push(i);
        return i;
      }),
    );

    await Promise.all(tasks);
    expect(results).toHaveLength(10);
  });

  test("propaga erros sem bloquear a fila", async () => {
    const semaphore = new Semaphore(1);
    const results: string[] = [];

    const failTask = semaphore.run(async () => {
      throw new Error("falha intencional");
    });

    const successTask = semaphore.run(async () => {
      results.push("ok");
    });

    await expect(failTask).rejects.toThrow("falha intencional");
    await successTask;
    expect(results).toEqual(["ok"]);
  });

  test("lança RangeError para concorrência inválida", () => {
    expect(() => new Semaphore(0)).toThrow(RangeError);
    expect(() => new Semaphore(-1)).toThrow(RangeError);
    expect(() => new Semaphore(1.5)).toThrow(RangeError);
  });

  test("activeCount e pendingCount são rastreados corretamente", async () => {
    const semaphore = new Semaphore(1);

    const unblock = new Promise<void>((r) => setTimeout(r, 100));

    const first = semaphore.run(async () => {
      await unblock;
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(semaphore.activeCount).toBe(1);

    const second = semaphore.run(async () => {});
    await new Promise((r) => setTimeout(r, 10));
    expect(semaphore.pendingCount).toBe(1);

    await first;
    await second;
  });
});
