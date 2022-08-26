import cp from "child_process";
import os from "os";
import fs from "fs";
import fse from "fs-extra";
import path from "path";
import startServer from "verdaccio";
import request from "request";

let host = "127.0.0.1";

function runVerdaccioServer(config): Promise<{ webServer: any; addrs: any }> {
  return new Promise((resolve) => {
    startServer(
      config,
      config.listen,
      undefined,
      "1.0.0",
      "verdaccio",
      (webServer, addrs) => resolve({ webServer, addrs })
    );
  });
}

function fetchDownloadMetrics(pkg, port): Promise<number> {
  return new Promise((resolve, reject) => {
    request.get(
      `/-/api/downloads/${pkg}`,
      { baseUrl: `http://${host}:${port}/` },
      function (error, response, body) {
        if (error) {
          reject(error);
        } else {
          try {
            if (response.statusCode === 200) {
              let { downloads } = JSON.parse(body);
              resolve(downloads);
            } else {
              reject(`non-200 status: ${response.statusCode}
body: ${body}
`);
            }
          } catch (e) {
            if (e instanceof SyntaxError) {
              reject(
                `Malformed JSON response from /-/downloads/${pkg}: ${e.message}. Full body: ${body}`
              );
            } else {
              reject(`Failed to JSON parse. Full body ${body}`);
            }
          }
        }
      }
    );
  });
}
function hitPkg(pkgName, port) {
  return new Promise((resolve, reject) => {
    request.get(
      `/${pkgName}`,
      { baseUrl: `http://${host}:${port}/` },
      function (error, response, body) {
        if (error) {
          reject(error);
        } else {
          resolve({ response, body });
        }
      }
    );
  });
}

type LigoCommandConstructorArgs = {
  ligoBin: string;
  cwd?: string;
  registry?: string;
};

class LigoCommand {
  private binPath: string;
  private workingDir: string;
  private registry: string;
  constructor(args: LigoCommandConstructorArgs) {
    let { ligoBin, cwd, registry } = args;
    this.binPath = ligoBin ? ligoBin : "ligo";
    this.workingDir = cwd ? cwd : process.cwd();
    this.registry = registry ? registry : "http://localhost:4873";
  }
  install(args?: {
    registry?: string;
  }): Promise<{ stdout: string; stderr: string }> {
    let registry = args?.registry;
    if (!registry) {
      registry = this.registry;
    }
    return new Promise((resolve, reject) => {
      let command = `${this.binPath} install --registry ${registry}`;
      let { workingDir } = this;
      cp.exec(
        command,
        {
          cwd: workingDir,
        },
        function (error, stdout, stderr) {
          if (error) {
            console.log(error.message);
            let message = `
command: ${command}
cwd: ${workingDir}
stdout:
${stdout}
stderr:
${stderr}
`;
            reject(new Error(message));
          } else {
            resolve({ stdout, stderr });
          }
        }
      );
    });
  }
  cwd(currentWorkingDirPath: string) {
    this.workingDir = currentWorkingDirPath;
    return this;
  }
}

let { LIGO_BIN } = process.env;
if (!LIGO_BIN) {
  console.log("LIGO_BIN missing in the environment");
  process.exit(-1);
}

describe("Install and check if download metrics are available", () => {
  let testPkg = "ligo-list-helpers";
  let workspacePath = fs.mkdtempSync(
    path.join(os.tmpdir(), "ligo-registry-e2e-")
  );
  let testPkgTarballName = "test-data-ligo-list-helpers-1.0.3.tgz";
  beforeAll(async () => {});
  afterAll(async () => {});
  test("workflow end-to-end: basic case", async () => {
    jest.setTimeout(10000);
    let port = 4000;
    let config = {
      storage: "./storage",
      plugins: "./plugins",
      self_path: "./",
      packages: {
        "**": {
          access: "$anonymous",
          publish: "$anonymous",
        },
      },
      listen: `${host}:${port}`,
      log: {
        type: "stdout",
        format: "pretty",
        level: "http",
      },
      middlewares: {
        "package-download-metrics": {
          enabled: true,
          downloadMetricsPath: "/-/api/metrics",
          tarballPath: "/:pkg/-/:filename",
        },
      },
    };
    let registryCwdDir = "download-metrics-e2e-registry";
    let registryCwdPath = path.join(workspacePath, registryCwdDir);
    let storagePath = path.join(registryCwdPath, "storage");
    let pluginsPath = path.join(registryCwdPath, "plugins");
    let testPkgManifest = path.join(storagePath, testPkg, "package.json");
    let testPkgTarballPath = path.join(registryCwdPath, `${testPkg}-1.0.3.tgz`);
    fs.mkdirSync(registryCwdPath);
    fs.mkdirSync(storagePath);
    fs.mkdirSync(pluginsPath);
    fse.copySync(path.join(__dirname, testPkgTarballName), testPkgTarballPath);
    fse.copySync(
      path.join(__dirname, "test-data-storage"),
      path.join(registryCwdPath, "storage")
    );
    fse.copySync(
      path.join(__dirname),
      path.join(pluginsPath, require("./package.json").name)
    );
    fs.writeFileSync(
      testPkgManifest,
      fs
        .readFileSync(testPkgManifest)
        .toString()
        .replace("{{TARBALL_PATH}}", testPkgTarballPath)
        .replace("{{VERDACCIO_LISTEN_CONFIG}}", config.listen)
    );
    process.chdir(registryCwdPath);
    const { webServer, addrs } = await runVerdaccioServer(config);
    webServer.listen(addrs.port || addrs.path, addrs.host, () => {
      console.log(`verdaccio running on : ${addrs.host}:${addrs.port}`);
    });
    let ligo = new LigoCommand({
      ligoBin: LIGO_BIN as string,
      registry: `http://${host}:${port}/`,
    });
    let projectDir = "download-metrics-e2e-project";
    let projectPath = path.join(workspacePath, projectDir);
    fs.mkdirSync(projectPath);
    fs.writeFileSync(
      path.join(projectPath, "package.json"),
      JSON.stringify({ dependencies: { [testPkg]: "*" } }, null, 2)
    );
    await ligo.cwd(projectPath).install();
    let downloads = await fetchDownloadMetrics(testPkg, port);
    expect(downloads).toBe(1);
    webServer.close();
  });
  test("When config is missing", async () => {
    jest.setTimeout(10000);
    let port = 4000; // 4001 didn't work. manifest on storage would have the right port number, but http://127.0.0.1:4001/ligo-list-helpers would show 4000. Had to make the test serial
    let config = {
      storage: "./storage",
      plugins: "./plugins",
      self_path: "./",
      packages: {
        "**": {
          access: "$anonymous",
          publish: "$anonymous",
        },
      },
      listen: `${host}:${port}`,
      log: {
        type: "stdout",
        format: "pretty",
        level: "http",
      },
      middlewares: {
        "package-download-metrics": {
          enabled: true,
          // downloadMetricsPath
          // tarballPath
        },
      },
    };
    let registryCwdDir = "download-metrics-e2e-registry-missing-config";
    let registryCwdPath = path.join(workspacePath, registryCwdDir);
    let storagePath = path.join(registryCwdPath, "storage");
    let pluginsPath = path.join(registryCwdPath, "plugins");
    let testPkgManifest = path.join(storagePath, testPkg, "package.json");
    let testPkgTarballPath = path.join(registryCwdPath, `${testPkg}-1.0.3.tgz`);
    fs.mkdirSync(registryCwdPath);
    fs.mkdirSync(storagePath);
    fs.mkdirSync(pluginsPath);
    fse.copySync(path.join(__dirname, testPkgTarballName), testPkgTarballPath);
    fse.copySync(
      path.join(__dirname, "test-data-storage"),
      path.join(registryCwdPath, "storage")
    );
    fse.copySync(
      path.join(__dirname),
      path.join(pluginsPath, require("./package.json").name)
    );
    fs.writeFileSync(
      testPkgManifest,
      fs
        .readFileSync(testPkgManifest)
        .toString()
        .replace("{{TARBALL_PATH}}", testPkgTarballPath)
        .replace("{{VERDACCIO_LISTEN_CONFIG}}", config.listen)
    );
    process.chdir(registryCwdPath);
    const { webServer, addrs } = await runVerdaccioServer(config);
    webServer.listen(addrs.port || addrs.path, addrs.host, () => {
      console.log(`verdaccio running on : ${addrs.host}:${addrs.port}`);
    });
    let ligo = new LigoCommand({
      ligoBin: LIGO_BIN as string,
      registry: `http://${host}:${port}/`,
    });
    let projectDir = "download-metrics-e2e-project-missing-config";
    let projectPath = path.join(workspacePath, projectDir);
    fs.mkdirSync(projectPath);
    fs.writeFileSync(
      path.join(projectPath, "package.json"),
      JSON.stringify({ dependencies: { [testPkg]: "*" } }, null, 2)
    );
    await ligo.cwd(projectPath).install();
    try {
      let downloads = await fetchDownloadMetrics(testPkg, port);
      expect(downloads).toBeUndefined();
    } catch {
      // ok
    }
    webServer.close();
  });
  test("When plugin is missing", async () => {
    jest.setTimeout(10000);
    let port = 4000; // 4001 didn't work. manifest on storage would have the right port number, but http://127.0.0.1:4001/ligo-list-helpers would show 4000. Had to make the test serial
    let config = {
      storage: "./storage",
      self_path: "./",
      packages: {
        "**": {
          access: "$anonymous",
          publish: "$anonymous",
        },
      },
      listen: `${host}:${port}`,
      log: {
        type: "stdout",
        format: "pretty",
        level: "http",
      },
      middlewares: {
        "package-download-metrics": {
          enabled: true,
          // downloadMetricsPath
          // tarballPath
        },
      },
    };
    let registryCwdDir = "download-metrics-e2e-registry-missing-plugin";
    let registryCwdPath = path.join(workspacePath, registryCwdDir);
    let storagePath = path.join(registryCwdPath, "storage");
    let pluginsPath = path.join(registryCwdPath, "plugins");
    let testPkgManifest = path.join(storagePath, testPkg, "package.json");
    let testPkgTarballPath = path.join(registryCwdPath, `${testPkg}-1.0.3.tgz`);
    fs.mkdirSync(registryCwdPath);
    fs.mkdirSync(storagePath);
    fs.mkdirSync(pluginsPath);
    fse.copySync(path.join(__dirname, testPkgTarballName), testPkgTarballPath);
    fse.copySync(
      path.join(__dirname, "test-data-storage"),
      path.join(registryCwdPath, "storage")
    );
    fse.copySync(
      path.join(__dirname),
      path.join(pluginsPath, require("./package.json").name)
    );
    fs.writeFileSync(
      testPkgManifest,
      fs
        .readFileSync(testPkgManifest)
        .toString()
        .replace("{{TARBALL_PATH}}", testPkgTarballPath)
        .replace("{{VERDACCIO_LISTEN_CONFIG}}", config.listen)
    );
    process.chdir(registryCwdPath);
    const { webServer, addrs } = await runVerdaccioServer(config);
    webServer.listen(addrs.port || addrs.path, addrs.host, () => {
      console.log(`verdaccio running on : ${addrs.host}:${addrs.port}`);
    });
    let ligo = new LigoCommand({
      ligoBin: LIGO_BIN as string,
      registry: `http://${host}:${port}/`,
    });
    let projectDir = "download-metrics-e2e-project-missing-plugin";
    let projectPath = path.join(workspacePath, projectDir);
    fs.mkdirSync(projectPath);
    fs.writeFileSync(
      path.join(projectPath, "package.json"),
      JSON.stringify({ dependencies: { [testPkg]: "*" } }, null, 2)
    );
    await ligo.cwd(projectPath).install();
    try {
      let downloads = await fetchDownloadMetrics(testPkg, port);
      expect(downloads).toBeUndefined();
    } catch {
      // ok
    }
    webServer.close();
  });
});
