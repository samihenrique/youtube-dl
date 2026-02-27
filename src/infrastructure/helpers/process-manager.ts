import type { Subprocess } from "bun";

interface ManagedProcess {
  kill(signal?: number): void;
  readonly exited: Promise<number>;
  readonly pid: number;
}

export class ProcessManager {
  private static processes: Map<number, ManagedProcess> = new Map();
  private static initialized = false;
  private static isCleaningUp = false;

  static init(): void {
    if (this.initialized) return;
    this.initialized = true;

    const cleanup = (signal: string) => {
      if (this.isCleaningUp) return;
      this.isCleaningUp = true;
      
      console.log(`\n[ProcessManager] Recebido ${signal}, matando ${this.processes.size} processos...`);
      this.killAll(9); // SIGKILL para morte imediata
      
      // Força saída após cleanup
      setTimeout(() => {
        process.exit(130);
      }, 100);
    };

    // Sobrescreve handlers existentes para garantir que nosso cleanup rode
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    
    process.on("SIGINT", () => cleanup("SIGINT"));
    process.on("SIGTERM", () => cleanup("SIGTERM"));

    // Exit event - última chance de limpar
    process.on("exit", () => {
      this.killAll(9);
    });

    // Handle erros
    process.on("uncaughtException", (err) => {
      console.error("\n[ProcessManager] Uncaught exception:", err);
      cleanup("uncaughtException");
    });

    process.on("unhandledRejection", (reason) => {
      console.error("\n[ProcessManager] Unhandled rejection:", reason);
      cleanup("unhandledRejection");
    });
  }

  static register(subprocess: Subprocess): () => void {
    this.init();
    
    const process: ManagedProcess = {
      kill: (signal?: number) => subprocess.kill(signal),
      exited: subprocess.exited,
      pid: subprocess.pid,
    };
    
    this.processes.set(subprocess.pid, process);
    console.log(`[ProcessManager] Registrado PID ${subprocess.pid} (${this.processes.size} total)`);

    // Auto-remove quando processo termina
    subprocess.exited.then(() => {
      this.processes.delete(subprocess.pid);
      console.log(`[ProcessManager] PID ${subprocess.pid} finalizado (${this.processes.size} restantes)`);
    });

    // Return unregister function
    return () => {
      this.processes.delete(subprocess.pid);
    };
  }

  static killAll(signal: number = 9): void {
    if (this.processes.size === 0) return;
    
    console.log(`[ProcessManager] Matando ${this.processes.size} processo(s) com sinal ${signal}...`);
    
    for (const [pid, proc] of this.processes) {
      try {
        console.log(`[ProcessManager] Matando PID ${pid}...`);
        proc.kill(signal);
        
        // Fallback: tenta matar via sistema se o kill do subprocess falhar
        try {
          process.kill(pid, signal);
        } catch {
          // Ignore
        }
      } catch (err) {
        console.log(`[ProcessManager] Erro ao matar PID ${pid}:`, err);
      }
    }
    
    this.processes.clear();
    console.log("[ProcessManager] Todos os processos foram sinalizados para morte");
  }

  static getActiveCount(): number {
    return this.processes.size;
  }
  
  static getActivePids(): number[] {
    return Array.from(this.processes.keys());
  }
}
