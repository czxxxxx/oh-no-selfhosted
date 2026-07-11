import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { atomicInstallPlugin, stagePluginInstall, stagePluginRemoval } from "./installer.mjs";

describe("atomic plugin installer", () => {
  let root;

  afterEach(async () => {
    if (root) {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("keeps the previous plugin when validation or compilation fails", async () => {
    root = await mkdtemp(join(tmpdir(), "oh-no-atomic-plugin-"));
    const oldSourcePath = join(root, "old-source");
    const newSourcePath = join(root, "new-source");
    const installedPath = join(root, "installed", "clock");
    await mkdir(oldSourcePath, { recursive: true });
    await writeFile(join(oldSourcePath, "marker.txt"), "old", "utf8");
    await atomicInstallPlugin({
      installedPath,
      sourcePath: oldSourcePath,
      validate: async () => ({ version: "old" }),
    });
    await mkdir(newSourcePath, { recursive: true });
    await writeFile(join(newSourcePath, "marker.txt"), "new", "utf8");

    await expect(
      atomicInstallPlugin({
        build: async () => {
          throw new Error("compile failed");
        },
        installedPath,
        sourcePath: newSourcePath,
      }),
    ).rejects.toThrow(/compile failed/);
    await expect(readFile(join(installedPath, "marker.txt"), "utf8")).resolves.toBe("old");
  });

  test("can roll back a staged uninstall", async () => {
    root = await mkdtemp(join(tmpdir(), "oh-no-remove-plugin-"));
    const installedPath = join(root, "clock");
    await mkdir(installedPath, { recursive: true });
    await writeFile(join(installedPath, "marker.txt"), "installed", "utf8");

    const removal = await stagePluginRemoval(installedPath);
    await removal.rollback();

    await expect(readFile(join(installedPath, "marker.txt"), "utf8")).resolves.toBe("installed");
  });

  test("can roll back a staged update after the filesystem swap", async () => {
    root = await mkdtemp(join(tmpdir(), "oh-no-install-rollback-"));
    const oldSourcePath = join(root, "old-source");
    const newSourcePath = join(root, "new-source");
    const installedPath = join(root, "installed", "clock");
    await mkdir(oldSourcePath, { recursive: true });
    await mkdir(newSourcePath, { recursive: true });
    await writeFile(join(oldSourcePath, "marker.txt"), "old", "utf8");
    await writeFile(join(newSourcePath, "marker.txt"), "new", "utf8");
    await atomicInstallPlugin({ installedPath, sourcePath: oldSourcePath });

    const installation = await stagePluginInstall({ installedPath, sourcePath: newSourcePath });
    await expect(readFile(join(installedPath, "marker.txt"), "utf8")).resolves.toBe("new");
    await installation.rollback();

    await expect(readFile(join(installedPath, "marker.txt"), "utf8")).resolves.toBe("old");
  });
});
