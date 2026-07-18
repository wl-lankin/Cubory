// Hardware-Fingerprint: stabiler, anonymer Hash der Maschinen-ID.
// Es verlässt nur der SHA-256-Hash das Gerät - keine Seriennummern, keine PII.
const crypto = require('crypto');
const os = require('os');
const { machineIdSync } = require('node-machine-id');

let cached = null;

function getFingerprint() {
  if (!cached) {
    const id = machineIdSync(true); // bereits gehasht von node-machine-id
    cached = 'sha256:' + crypto.createHash('sha256')
      .update(`cubory|${id}|${process.platform}|${process.arch}`)
      .digest('hex');
  }
  return cached;
}

function getDeviceInfo(appVersion) {
  const release = os.release();
  const osName = process.platform === 'darwin' ? `macOS (Darwin ${release})`
    : process.platform === 'win32' ? `Windows (NT ${release})`
    : `Linux ${release}`;
  return {
    name: os.hostname(),
    os: osName,
    fingerprint: getFingerprint(),
    app_version: appVersion,
  };
}

module.exports = { getFingerprint, getDeviceInfo };
