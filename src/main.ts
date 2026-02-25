#!/usr/bin/env bun
import pc from "picocolors";
import { createContainer } from "./container.ts";
import { CliApp } from "./presentation/cli/app.ts";
import { parseArgs } from "./presentation/cli/args.ts";
import { handleError } from "./presentation/cli/error-handler.ts";

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const container = createContainer();
  const app = new CliApp(container);

  const cleanup = (): void => {
    console.log(pc.dim("\n\n  Tudo bem, saindo. Até a próxima!"));
    process.exit(130);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  await app.run(args);
}

main().catch((error: unknown) => {
  handleError(error);
  process.exit(1);
});
