'use strict';
// En exFAT (Windows), readlink devuelve EISDIR para archivos normales en lugar de EINVAL.
// Este parche convierte EISDIR → EINVAL para que Node.js continúe normalmente.
// En Linux (Vercel, CI) y macOS este error no ocurre — el script termina inmediatamente.
if (process.platform !== 'win32') return;

const fs = require('fs');

function patchAsyncFn(original, onEisdir) {
  return function (...args) {
    const lastIdx = args.length - 1;
    if (typeof args[lastIdx] === 'function') {
      const cb = args[lastIdx];
      args[lastIdx] = function (err, result) {
        if (err && err.code === 'EISDIR') return onEisdir(err, args[0], cb);
        cb(err, result);
      };
    }
    return original(...args);
  };
}

function patchSyncFn(original, onEisdir) {
  return function (...args) {
    try { return original(...args); } catch (err) {
      if (err && err.code === 'EISDIR') return onEisdir(err, args[0]);
      throw err;
    }
  };
}

// readlink: convertir EISDIR → EINVAL (no es un symlink)
const rlOnEisdirAsync = (err, _path, cb) => { err.code = 'EINVAL'; cb(err); };
const rlOnEisdirSync = (err) => { err.code = 'EINVAL'; throw err; };
fs.readlink = patchAsyncFn(fs.readlink.bind(fs), rlOnEisdirAsync);
fs.readlinkSync = patchSyncFn(fs.readlinkSync.bind(fs), rlOnEisdirSync);

// realpath: en caso de EISDIR devolver el path original sin resolver
const rpOnEisdirAsync = (_err, path, cb) => cb(null, path);
const rpOnEisdirSync = (_err, path) => path;

const origRealpath = fs.realpath.bind(fs);
const origRealpathNative = fs.realpath.native ? fs.realpath.native.bind(fs) : null;
fs.realpath = patchAsyncFn(origRealpath, rpOnEisdirAsync);
if (origRealpathNative) {
  fs.realpath.native = patchAsyncFn(origRealpathNative, rpOnEisdirAsync);
} else {
  fs.realpath.native = fs.realpath;
}

const origRealpathSync = fs.realpathSync.bind(fs);
const origRealpathSyncNative = fs.realpathSync.native ? fs.realpathSync.native.bind(fs) : null;
fs.realpathSync = patchSyncFn(origRealpathSync, rpOnEisdirSync);
if (origRealpathSyncNative) {
  fs.realpathSync.native = patchSyncFn(origRealpathSyncNative, rpOnEisdirSync);
} else {
  fs.realpathSync.native = fs.realpathSync;
}
