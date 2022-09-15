import debugF from 'debug';
import { Application, NextFunction, Request, Response, Router } from 'express';
import fs from 'fs';
import path from 'path';

import {
  IBasicAuth,
  IPluginMiddleware,
  IStorageManager,
  Logger,
  PluginOptions,
} from '@verdaccio/types';

import { DownloadMetricsConfig } from '../types/index';
import * as DB from './db.js';
// @ts-ignore:next-line
import { getWeek } from './utils';

type downloadEntry = {
  time: number;
};

let FORMAT_VERSION = 1;
let DB_FILE_NAME = `v${FORMAT_VERSION}-package-download-metrics.json`;

const debug = debugF('verdaccio:plugin:download-metrics');
let defaultTarballPath = '/:pkg/-/:filename';
let defaultDownloadMetricsPath = '/-/downloads/:pkg';

class VerdaccioMiddlewarePlugin implements IPluginMiddleware<DownloadMetricsConfig> {
  public logger: Logger;
  private downloadMetricsPath: string;
  private tarballPath: string;
  public constructor(config: DownloadMetricsConfig, options: PluginOptions<DownloadMetricsConfig>) {
    this.logger = options.logger;
    this.downloadMetricsPath = config.downloadMetricsPath;
    this.tarballPath = config.tarballPath;
  }

  /* Should have been,
export interface IPluginMiddleware<T> extends IPlugin<T> {
  register_middlewares(app: any, auth: IBasicAuth<T>, storage: Storage): void;
}
need to update @verdaccio/ libraries by pinning it to our fork */
  public register_middlewares(
    app: Application,
    _auth: IBasicAuth<DownloadMetricsConfig>,
    storage: any /* old IStorageManager<DownloadMetricsConfig> */
  ): void {
    if (!this.downloadMetricsPath) {
      debug(
        `downloadMetricsPath is missing in the config. Using the default ${defaultDownloadMetricsPath}`
      );
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
      dbFilePath = path.join(path.dirname(storage.localStorage.storagePlugin.path), DB_FILE_NAME);
    } else {
      debug('storage.config.storage is not defined');
      debug('quiting...');
      return;
    }
    let db: any;
    try {
      db = require(dbFilePath);
    } catch (_e) {
      //TODO handle e;
      db = {};
    }
    let downloadsEndpointPath = `${this.downloadMetricsPath}/downloads/:pkg`;
    debug(`Registering endpoint ${downloadsEndpointPath}`);
    router.get(
      downloadsEndpointPath,
      async (
        request: Request,
        res: Response & { report_error?: Function },
        _next: NextFunction
      ): Promise<void> => {
        let { pkg } = request.params;
        try {
          res.status(200).json({
            downloads: JSON.parse(fs.readFileSync(dbFilePath).toString())[pkg].length,
          });
        } catch (e) {
          res.status(500).json({ message: 'Internal Server Error' });
        }
      }
    );
    let topLastWeekEndpoint = `${this.downloadMetricsPath}/top-last-week`;
    debug(`Registering endpoint ${topLastWeekEndpoint}`);
    router.get(
      topLastWeekEndpoint,
      async (
        _request: Request,
        response: Response & { report_error?: Function },
        _next: NextFunction
      ): Promise<void> => {
        let packages = DB.getAllPackages(db);
        let downloadCountLastWeek = new Map();
        let today = new Date();
        let aWeekInMilliseconds = 1000 * 60 * 60 * 24 * 7;
        let aWeekAgoInMilliseconds = today.getTime() - aWeekInMilliseconds;
        packages.forEach((pkg) => {
          let downloadEntries = DB.lookupByName(db, pkg);
          if (downloadEntries.length) {
            downloadEntries.forEach((entry: downloadEntry) => {
              let downloadTimestamp = new Date(entry.time);
              if (downloadTimestamp.getTime() > aWeekAgoInMilliseconds) {
                // downloadTimestamp is within a week
                let downloadsLastWeek = downloadCountLastWeek.get(pkg) || 0;
                downloadCountLastWeek.set(pkg, downloadsLastWeek + 1);
              }
            });
          }
        });
        type response = {
          downloads: number;
          name: string;
          version: string;
          author: { name: string; email: string };
        };
        let responseData: response[] = [];
        for (let entry of downloadCountLastWeek.entries()) {
          let [k, v] = entry;
          let packageMeta = await storage.getPackageLocalMetadata(k);
          let { version, author } = packageMeta.versions[packageMeta['dist-tags'].latest];
          responseData.push({
            downloads: v,
            name: k,
            version,
            author, // derived from version
          });
        }
        response.status(200).json(responseData);
      }
    );
    debug(`Hooking endpoint ${this.tarballPath}`);
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
    app.use('/', router);
  }
}
export { VerdaccioMiddlewarePlugin };
export default VerdaccioMiddlewarePlugin;
