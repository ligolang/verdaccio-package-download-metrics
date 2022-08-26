import { Application } from 'express';
import { IBasicAuth, IPluginMiddleware, Logger, PluginOptions } from '@verdaccio/types';
import { DownloadMetricsConfig } from '../types/index';
declare class VerdaccioMiddlewarePlugin implements IPluginMiddleware<DownloadMetricsConfig> {
    logger: Logger;
    private downloadMetricsPath;
    private tarballPath;
    constructor(config: DownloadMetricsConfig, options: PluginOptions<DownloadMetricsConfig>);
    register_middlewares(app: Application, _auth: IBasicAuth<DownloadMetricsConfig>, storage: any): void;
}
export { VerdaccioMiddlewarePlugin };
export default VerdaccioMiddlewarePlugin;
