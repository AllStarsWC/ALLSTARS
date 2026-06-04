'use strict';

// Browser stub for create-ecdh.
// ECDH key exchange is not used in browser builds of the Solana/Metaplex stack.
// This stub eliminates the elliptic dependency (CVE-2025-14505 / GHSA-848j-6mx2-7j84)
// which has no upstream fix (Patched versions: <0.0.0).

module.exports = function createECDH(curve) {
  throw new Error(
    'create-ecdh: createECDH(' + curve + ') is not supported in browser builds'
  );
};
