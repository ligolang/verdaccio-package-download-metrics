"use strict";
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
const fs_1 = __importDefault(require("fs"));
const debug_1 = __importDefault(require("debug"));
const path_1 = __importDefault(require("path"));
const express_1 = require("express");
const debug = (0, debug_1.default)("verdaccio:plugin:download-metrics");
let defaultTarballPath = "/:pkg/-/:filename";
let defaultDownloadMetricsPath = "/-/downloads/:pkg";
class VerdaccioMiddlewarePlugin {
    constructor(config, options) {
        this.logger = options.logger;
        this.downloadMetricsPath = config.downloadMetricsPath;
        this.tarballPath = config.tarballPath;
    }
    register_middlewares(app, _auth, storage) {
        if (!this.downloadMetricsPath) {
            debug("downloadMetricsPath is missing in the config. Using the default ${defaultDownloadMetricsPath}");
            this.downloadMetricsPath = defaultDownloadMetricsPath;
            return;
        }
        if (!this.tarballPath) {
            debug("tarballPath is missing in the config. Using the default ${defaultTarballPath}");
            this.tarballPath = defaultTarballPath;
            return;
        }
        // eslint new-cap:off
        const router = (0, express_1.Router)();
        let dbFilePath;
        if (storage.config.storage) {
            dbFilePath = path_1.default.join(process.cwd(), storage.config.storage, "ligo-registry-package-download-metrics.json");
        }
        else {
            debug("storage.config.storage is not defined");
            debug("quiting...");
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
        router.get(this.downloadMetricsPath, (request, res, _next) => __awaiter(this, void 0, void 0, function* () {
            let { pkg } = request.params;
            try {
                res.status(200).json({
                    downloads: JSON.parse(fs_1.default.readFileSync(dbFilePath).toString())[pkg]
                        .length,
                });
            }
            catch (e) {
                res.status(500);
            }
        }));
        router.get(this.tarballPath, (request, _res, next) => {
            // const encryptedString = auth.aesEncrypt(Buffer.from(this.foo, 'utf8'));
            // res.setHeader('X-Verdaccio-Token-Plugin', encryptedString.toString());
            let { pkg } = request.params;
            let downloads = db[pkg] || [];
            downloads.push({ time: Date.now() });
            db[pkg] = downloads;
            fs_1.default.writeFileSync(dbFilePath, JSON.stringify(db, null, 2));
            debug(`Wrote to ${dbFilePath}`);
            next();
        });
        app.use("/", router);
    }
}
exports.VerdaccioMiddlewarePlugin = VerdaccioMiddlewarePlugin;
exports.default = VerdaccioMiddlewarePlugin;
