#!/usr/bin/env bun
import pc from "picocolors";
import { DomainError } from "./domain/errors/domain-error.ts";
import { createContainer } from "./container.ts";
import { CliApp } from "./presentation/cli/app.ts";
import { parseArgs } from "./presentation/cli/args.ts";

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const container = createContainer();
  const app = new CliApp(container);

  const cleanup = (): void => {
    console.log(pc.dim("\n\nEncerrando..."));
    process.exit(130);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  await app.run(args);
}

main().catch((error: unknown) => {
  if (error instanceof DomainError) {
    console.error(pc.red(`\n✖ [${error.code}] ${error.message}`));
  } else if (error instanceof Error) {
    console.error(pc.red(`\n✖ ${error.message}`));
  } else {
    console.error(pc.red(`\n✖ Erro fatal: ${String(error)}`));
  }
  process.exit(1);
});
