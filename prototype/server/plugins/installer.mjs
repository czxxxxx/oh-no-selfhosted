import { access, cp, mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function stagePluginInstall({ build, installedPath, sourcePath, validate }) {
  const parentDir = dirname(installedPath);
  const transactionId = randomUUID();
  const stagePath = join(parentDir, `.stage-${transactionId}`);
  const backupPath = join(parentDir, `.backup-${transactionId}`);
  let movedExisting = false;

  await mkdir(parentDir, { recursive: true });

  try {
    await cp(sourcePath, stagePath, { force: true, recursive: true });
    const definition = validate ? await validate(stagePath) : null;

    if (build) {
      await build(stagePath, definition);
    }

    if (await pathExists(installedPath)) {
      await rename(installedPath, backupPath);
      movedExisting = true;
    }

    await rename(stagePath, installedPath);
    let settled = false;

    return {
      definition,
      async commit() {
        if (settled) {
          return;
        }

        settled = true;
        await rm(backupPath, { force: true, recursive: true });
      },
      async rollback() {
        if (settled) {
          return;
        }

        settled = true;
        await rm(installedPath, { force: true, recursive: true });

        if (movedExisting) {
          await rename(backupPath, installedPath);
        }
      },
    };
  } catch (error) {
    await rm(stagePath, { force: true, recursive: true }).catch(() => {});

    if (movedExisting) {
      await rm(installedPath, { force: true, recursive: true }).catch(() => {});
      await rename(backupPath, installedPath).catch(() => {});
    }

    throw error;
  }
}

export async function atomicInstallPlugin(options) {
  const installation = await stagePluginInstall(options);

  await installation.commit();
  return installation.definition;
}

export async function stagePluginRemoval(installedPath) {
  const trashPath = `${installedPath}.remove-${randomUUID()}`;

  try {
    await rename(installedPath, trashPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        async commit() {},
        async rollback() {},
      };
    }

    throw error;
  }

  return {
    async commit() {
      await rm(trashPath, { force: true, recursive: true });
    },
    async rollback() {
      await rename(trashPath, installedPath);
    },
  };
}
