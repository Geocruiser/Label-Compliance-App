import { spawn } from "node:child_process";
import { access, rename, rm } from "node:fs/promises";
import path from "node:path";
import { constants as fsConstants } from "node:fs";

const repositoryRoot = process.cwd();
const apiRouteDirectoryPath = path.join(repositoryRoot, "src", "app", "api");
const temporaryApiRouteDirectoryPath = path.join(
  repositoryRoot,
  "src",
  "app",
  "_api_for_local_only",
);
const nextBuildCachePath = path.join(repositoryRoot, ".next");

const directoryExists = async (directoryPath) => {
  try {
    await access(directoryPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const runBuild = async () => {
  return new Promise((resolve, reject) => {
    const childProcess = spawn("npm", ["run", "build"], {
      cwd: repositoryRoot,
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        GITHUB_PAGES: "true",
        NEXT_PUBLIC_APP_MODE: "demo",
      },
    });

    childProcess.on("exit", (exitCode) => {
      if (exitCode === 0) {
        resolve();
        return;
      }

      reject(new Error(`GitHub Pages build failed with exit code ${exitCode ?? "unknown"}.`));
    });

    childProcess.on("error", (error) => {
      reject(error);
    });
  });
};

const main = async () => {
  let movedApiDirectory = false;

  if (await directoryExists(nextBuildCachePath)) {
    await rm(nextBuildCachePath, { recursive: true, force: true });
  }

  if (await directoryExists(apiRouteDirectoryPath)) {
    if (await directoryExists(temporaryApiRouteDirectoryPath)) {
      throw new Error(
        "Cannot run pages build because src/app/_api_for_local_only already exists.",
      );
    }
    await rename(apiRouteDirectoryPath, temporaryApiRouteDirectoryPath);
    movedApiDirectory = true;
  }

  try {
    await runBuild();
  } finally {
    if (movedApiDirectory && (await directoryExists(temporaryApiRouteDirectoryPath))) {
      await rename(temporaryApiRouteDirectoryPath, apiRouteDirectoryPath);
    }
  }
};

await main();

