const {isTestFilePath} = require('@web/test-runner');
const snowpack = require('snowpack');
const fs = require('fs');
const path = require('path');
const url = require('url');
const cwd = process.cwd();

const TEST_RUNNER_SETUP = `
// This snippet removes mocha markup from the test document/context.
beforeEach(() => {
  document.querySelectorAll('.test').forEach(el => el.remove());
});
`;

module.exports = function () {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(`@snowpack/web-test-runner-plugin: NODE_ENV must === "test" to build files correctly.
To Resolve:
  1. Set "process.env.NODE_ENV = 'test';" at the top of your web-test-runner.config.js file (before all imports).
  2. Prefix your web-test-runner CLI command: "NODE_ENV=test web-test-runner ...".
`);
  }
  const pkgManifest = require(path.join(cwd, 'package.json'));
  const config = snowpack.unstable__loadAndValidateConfig(
    {devOptions: {hmr: false, open: 'none', output: 'stream'}},
    pkgManifest,
  );
  let loadByUrl, shutdownServer;

  return {
    name: 'snowpack-plugin',
    async serverStart({fileWatcher}) {
      fileWatcher.add(Object.keys(config.mount));
      const server = await snowpack.unstable__startServer({
        cwd,
        config,
        lockfile: null,
        pkgManifest,
      });
      loadByUrl = server.loadByUrl;
      shutdownServer = server.shutdown;
    },
    async serverStop() {
      return shutdownServer();
    },
    async serve({request}) {
      const isTestFile = request.url.includes('?isTestFile=1');
      const reqPath = request.url.replace(/\?.*$/, '');
      const result = await loadByUrl(reqPath, {isSSR: false});
      if (isTestFile) {
        return `${TEST_RUNNER_SETUP}\n\n${result}`;
      }
      return result;
    },
    transformImport({source}) {
      if (!isTestFilePath(source)) {
        return;
      }
      const reqPath = source.replace(/\?.*$/, '');
      const sourcePath = path.join(cwd, reqPath);
      const mountedUrl = snowpack.unstable__getUrlForFile(sourcePath, config);
      if (!mountedUrl) {
        throw new Error(`${source} could not be mounted!`);
      }
      return mountedUrl + '?isTestFile=1';
    },
  };
};
