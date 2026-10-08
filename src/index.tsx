import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { pluginLogger } from 'bigbluebutton-html-plugin-sdk';
import PluginLogCollection from './plugin-log-collection/component';
import { PLUGIN_NAME, PLUGIN_VERSION } from './core/constants';
import { getCaptureCore } from './services/capture';

// Start capturing console output and connection events as early as possible -
// at bundle evaluation time, before the plugin's React tree is mounted.
getCaptureCore();

// Make the running plugin version visible in the console: BBB caches the
// bundle keyed on the manifest "version", so this line is the quickest way
// to verify which build is actually active after a deployment.
pluginLogger.info(`${PLUGIN_NAME} v${PLUGIN_VERSION} active, capture running`);

const uuid = document.currentScript?.getAttribute('uuid') || 'root';
const pluginName = document.currentScript?.getAttribute('pluginName') || 'plugin';

const container = document.getElementById(uuid);
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(<PluginLogCollection pluginUuid={uuid} pluginName={pluginName} />);
}
