import fs from "fs";
import debugF from "debug";
import path from "path";
import {
  Logger,
  IPluginMiddleware,
  IBasicAuth,
  IStorageManager,
  PluginOptions,
} from "@verdaccio/types";
import { Router, Request, Response, NextFunction, Application } from "express";

import { DownloadMetricsConfig } from "../types/index";

type downloadEntry = {
  time: number;
};

const debug = debugF("verdaccio:plugin:download-metrics");
let defaultTarballPath = "/:pkg/-/:filename";
let defaultDownloadMetricsPath = "/-/downloads/:pkg"
class VerdaccioMiddlewarePlugin
  implements IPluginMiddleware<DownloadMetricsConfig>
{
  public logger: Logger;
  private downloadMetricsPath: string;
  private tarballPath: string;
  public constructor(
    config: DownloadMetricsConfig,
    options: PluginOptions<DownloadMetricsConfig>
  ) {
    this.logger = options.logger;
    this.downloadMetricsPath = config.downloadMetricsPath;
    this.tarballPath = config.tarballPath;
  }

  public register_middlewares(
    app: Application,
    _auth: IBasicAuth<DownloadMetricsConfig>,
    storage: IStorageManager<DownloadMetricsConfig>
  ): void {

    if (!this.downloadMetricsPath) {
      debug(`downloadMetricsPath is missing in the config. Using the default ${defaultDownloadMetricsPath}`);
      this.downloadMetricsPath = defaultDownloadMetricsPath;
      return;
    }

    if (!this.tarballPath) {
      debug(`tarballPath is missing in the config. Using the default ${defaultTarballPath}`);
      this.tarballPath = defaultTarballPath;
      return;
    }
    
    // eslint new-cap:off
    const router = Router();
    let dbFilePath: string;
    if (storage.config.storage) {
      dbFilePath = path.join(
        process.cwd(),
        storage.config.storage,
        "ligo-registry-package-download-metrics.json"
      );
    } else {
      debug("storage.config.storage is not defined");
      debug("quiting...");
      return;
    }
    let db: any;
    try {
      db = require(dbFilePath);
    } catch (_e) {
      //TODO handle e;
      db = {};
    }
    router.get(
      this.downloadMetricsPath,
      async (
        request: Request,
        res: Response & { report_error?: Function },
        _next: NextFunction
      ): Promise<void> => {
        let { pkg } = request.params;
        try {
          res.status(200).json({
            downloads: JSON.parse(fs.readFileSync(dbFilePath).toString())[pkg]
              .length,
          });
        } catch (e) {
          res.status(500);
        }
      }
    );
    router.get(
      this.tarballPath,
      (
        request: Request,
        _res: Response & { report_error?: Function },
        next: NextFunction
      ): void => {
        // const encryptedString = auth.aesEncrypt(Buffer.from(this.foo, 'utf8'));
        // res.setHeader('X-Verdaccio-Token-Plugin', encryptedString.toString());
        let { pkg } = request.params;
        let downloads: Array<downloadEntry> = db[pkg] || [];
        downloads.unshift({ time: Date.now() });
        db[pkg] = downloads;
        fs.writeFileSync(dbFilePath, JSON.stringify(db, null, 2));
        debug(`Wrote to ${dbFilePath}`);
        next();
      }
    );
    app.use("/", router);
  }
}
export { VerdaccioMiddlewarePlugin };
export default VerdaccioMiddlewarePlugin;
