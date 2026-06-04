'use strict';

// Browser stub for browserify-sign.
// createSign/createVerify are not used in browser builds of the Solana/Metaplex stack.
// This stub eliminates the elliptic dependency (CVE-2025-14505 / GHSA-848j-6mx2-7j84)
// which has no upstream fix (Patched versions: <0.0.0).

var algos = require('./algos');
exports.algos = algos;

exports.createSign = function createSign(algorithm) {
  throw new Error(
    'browserify-sign: createSign(' + algorithm + ') is not supported in browser builds'
  );
};
exports.Sign = exports.createSign;

exports.createVerify = function createVerify(algorithm) {
  throw new Error(
    'browserify-sign: createVerify(' + algorithm + ') is not supported in browser builds'
  );
};
exports.Verify = exports.createVerify;
