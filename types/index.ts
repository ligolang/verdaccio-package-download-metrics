import {Config} from '@verdaccio/types';

export interface DownloadMetricsConfig extends Config {
  tarballPath: string;
  downloadMetricsPath: string
}
