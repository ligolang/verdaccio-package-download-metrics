"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerdaccioMiddlewarePlugin = void 0;
const debug_1 = __importDefault(require("debug"));
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DB = __importStar(require("./db.js"));
let FORMAT_VERSION = 1;
let DB_FILE_NAME = `v${FORMAT_VERSION}-package-download-metrics.json`;
const debug = (0, debug_1.default)('verdaccio:plugin:download-metrics');
let defaultTarballPath = '/:pkg/-/:filename';
let defaultDownloadMetricsPath = '/-/downloads/:pkg';
class VerdaccioMiddlewarePlugin {
    constructor(config, options) {
        this.logger = options.logger;
        this.downloadMetricsPath = config.downloadMetricsPath;
        this.tarballPath = config.tarballPath;
    }
    /* Should have been,
  export interface IPluginMiddleware<T> extends IPlugin<T> {
    register_middlewares(app: any, auth: IBasicAuth<T>, storage: Storage): void;
  }
  need to update @verdaccio/ libraries by pinning it to our fork */
    register_middlewares(app, _auth, storage /* old IStorageManager<DownloadMetricsConfig> */) {
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
        const router = (0, express_1.Router)();
        let dbFilePath;
        if (storage.config.storage) {
            dbFilePath = path_1.default.join(path_1.default.dirname(storage.localStorage.storagePlugin.path), DB_FILE_NAME);
        }
        else {
            debug('storage.config.storage is not defined');
            debug('quiting...');
            return;
        }
        let db;
        try {
            db = require(dbFilePath);
        }
        catch (_e) {
            //TODO handle e;
            db = {};
        }
        let downloadsEndpointPath = `${this.downloadMetricsPath}/downloads/:pkg`;
        debug(`Registering endpoint ${downloadsEndpointPath}`);
        router.get(downloadsEndpointPath, (request, res, _next) => __awaiter(this, void 0, void 0, function* () {
            let { pkg } = request.params;
            try {
                res.status(200).json({
                    downloads: JSON.parse(fs_1.default.readFileSync(dbFilePath).toString())[pkg].length,
                });
            }
            catch (e) {
                res.status(500).json({ message: 'Internal Server Error' });
            }
        }));
        let topLastWeekEndpoint = `${this.downloadMetricsPath}/top-last-week`;
        debug(`Registering endpoint ${topLastWeekEndpoint}`);
        router.get(topLastWeekEndpoint, (_request, response, _next) => __awaiter(this, void 0, void 0, function* () {
            let packages = DB.getAllPackages(db);
            let downloadCountLastWeek = new Map();
            let today = new Date();
            let aWeekInMilliseconds = 1000 * 60 * 60 * 24 * 7;
            let aWeekAgoInMilliseconds = today.getTime() - aWeekInMilliseconds;
            packages.forEach((pkg) => {
                let downloadEntries = DB.lookupByName(db, pkg);
                if (downloadEntries.length) {
                    downloadEntries.forEach((entry) => {
                        let downloadTimestamp = new Date(entry.time);
                        if (downloadTimestamp.getTime() > aWeekAgoInMilliseconds) {
                            // downloadTimestamp is within a week
                            let downloadsLastWeek = downloadCountLastWeek.get(pkg) || 0;
                            downloadCountLastWeek.set(pkg, downloadsLastWeek + 1);
                        }
                    });
                }
            });
            let responseData = [];
            for (let entry of downloadCountLastWeek.entries()) {
                let [k, v] = entry;
                let packageMeta = yield storage.getPackageLocalMetadata(k);
                let { version, author } = packageMeta.versions[packageMeta['dist-tags'].latest];
                responseData.push({
                    downloads: v,
                    name: k,
                    version,
                    author, // derived from version
                });
            }
            response.status(200).json(responseData);
        }));
        debug(`Hooking endpoint ${this.tarballPath}`);
        router.get(this.tarballPath, (request, _res, next) => {
            // const encryptedString = auth.aesEncrypt(Buffer.from(this.foo, 'utf8'));
            // res.setHeader('X-Verdaccio-Token-Plugin', encryptedString.toString());
            let { pkg } = request.params;
            let downloads = db[pkg] || [];
            downloads.unshift({ time: Date.now() });
            db[pkg] = downloads;
            fs_1.default.writeFileSync(dbFilePath, JSON.stringify(db, null, 2));
            debug(`Wrote to ${dbFilePath}`);
            next();
        });
        app.use('/', router);
    }
}
exports.VerdaccioMiddlewarePlugin = VerdaccioMiddlewarePlugin;
exports.default = VerdaccioMiddlewarePlugin;
