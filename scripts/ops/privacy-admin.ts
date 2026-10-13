// Operator tool for data-subject requests. Run with the owner connection:
//   pnpm ops:privacy access-report <email>   (JSON to stdout)
//   pnpm ops:privacy erase-user <email>
// Worker records are erased per tenant by an owner/admin through the application.
import "../../prisma/seed-env";
import { pathToFileURL } from "node:url";
import prisma from "../../src/lib/prisma";
import { buildUserAccessReport, eraseUserAccount, SoleOwnerError } from "../../src/lib/privacy";

async function main() {
  const [command, email] = process.argv.slice(2);
  if (!["erase-user", "access-report"].includes(command) || !email) {
    console.error("usage: ops:privacy <erase-user|access-report> <email>");
    process.exitCode = 1;
    return;
  }
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true } });
  if (!user) {
    console.error("No user with that email");
    process.exitCode = 1;
    return;
  }
  if (command === "access-report") {
    console.log(JSON.stringify(await buildUserAccessReport(user.id), null, 2));
    return;
  }
  try {
    await eraseUserAccount(user.id);
    console.log("erased", user.id);
  } catch (error) {
    if (error instanceof SoleOwnerError) {
      console.error(`Blocked: sole owner of ${error.organizationIds.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().finally(() => prisma.$disconnect());
}
