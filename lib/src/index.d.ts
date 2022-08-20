import { Logger, IPluginMiddleware, IBasicAuth, IStorageManager, PluginOptions } from "@verdaccio/types";
import { Application } from "express";
import { DownloadMetricsConfig } from "../types/index";
declare class VerdaccioMiddlewarePlugin implements IPluginMiddleware<DownloadMetricsConfig> {
    logger: Logger;
    private downloadMetricsPath;
    private tarballPath;
    constructor(config: DownloadMetricsConfig, options: PluginOptions<DownloadMetricsConfig>);
    register_middlewares(app: Application, _auth: IBasicAuth<DownloadMetricsConfig>, storage: IStorageManager<DownloadMetricsConfig>): void;
}
export { VerdaccioMiddlewarePlugin };
export default VerdaccioMiddlewarePlugin;
