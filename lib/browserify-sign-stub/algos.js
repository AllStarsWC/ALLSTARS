'use strict';

// Algorithm list from the original browserify-sign/algos.
// Exported so that crypto-browserify's getHashes() can include them.
module.exports = {
  sha224WithRSAEncryption: { sign: 'rsa', hash: 'sha224', id: Buffer.from('302d300d06096086480165030402040500041c', 'hex') },
  'RSA-SHA224': { sign: 'rsa', hash: 'sha224', id: Buffer.from('302d300d06096086480165030402040500041c', 'hex') },
  sha256WithRSAEncryption: { sign: 'rsa', hash: 'sha256', id: Buffer.from('3031300d060960864801650304020105000420', 'hex') },
  'RSA-SHA256': { sign: 'rsa', hash: 'sha256', id: Buffer.from('3031300d060960864801650304020105000420', 'hex') },
  sha384WithRSAEncryption: { sign: 'rsa', hash: 'sha384', id: Buffer.from('3041300d060960864801650304020205000430', 'hex') },
  'RSA-SHA384': { sign: 'rsa', hash: 'sha384', id: Buffer.from('3041300d060960864801650304020205000430', 'hex') },
  sha512WithRSAEncryption: { sign: 'rsa', hash: 'sha512', id: Buffer.from('3051300d060960864801650304020305000440', 'hex') },
  'RSA-SHA512': { sign: 'rsa', hash: 'sha512', id: Buffer.from('3051300d060960864801650304020305000440', 'hex') },
  'RSA-SHA1': { sign: 'rsa', hash: 'sha1', id: Buffer.from('3021300906052b0e03021a05000414', 'hex') },
  'ecdsa-with-SHA1': { sign: 'ecdsa', hash: 'sha1', id: Buffer.alloc(0) },
  'ecdsa-with-SHA256': { sign: 'ecdsa', hash: 'sha256', id: Buffer.alloc(0) },
  'ecdsa-with-SHA384': { sign: 'ecdsa', hash: 'sha384', id: Buffer.alloc(0) },
  'ecdsa-with-SHA512': { sign: 'ecdsa', hash: 'sha512', id: Buffer.alloc(0) },
  'DSA-SHA': { sign: 'dsa', hash: 'sha1', id: Buffer.alloc(0) },
  'DSA-SHA1': { sign: 'dsa', hash: 'sha1', id: Buffer.alloc(0) },
  DSA: { sign: 'dsa', hash: 'sha1', id: Buffer.alloc(0) },
  'DSA-WITH-SHA224': { sign: 'dsa', hash: 'sha224', id: Buffer.alloc(0) },
  'DSA-SHA224': { sign: 'dsa', hash: 'sha224', id: Buffer.alloc(0) },
  'DSA-WITH-SHA256': { sign: 'dsa', hash: 'sha256', id: Buffer.alloc(0) },
  'DSA-SHA256': { sign: 'dsa', hash: 'sha256', id: Buffer.alloc(0) },
  'DSA-WITH-SHA384': { sign: 'dsa', hash: 'sha384', id: Buffer.alloc(0) },
  'DSA-SHA384': { sign: 'dsa', hash: 'sha384', id: Buffer.alloc(0) },
  'DSA-WITH-SHA512': { sign: 'dsa', hash: 'sha512', id: Buffer.alloc(0) },
  'DSA-SHA512': { sign: 'dsa', hash: 'sha512', id: Buffer.alloc(0) },
  'DSA-RIPEMD160': { sign: 'dsa', hash: 'rmd160', id: Buffer.alloc(0) },
  ripemd160WithRSA: { sign: 'rsa', hash: 'rmd160', id: Buffer.from('3021300906052b2403020105000414', 'hex') },
  'RSA-RIPEMD160': { sign: 'rsa', hash: 'rmd160', id: Buffer.from('3021300906052b2403020105000414', 'hex') },
  md5WithRSAEncryption: { sign: 'rsa', hash: 'md5', id: Buffer.from('3020300c06082a864886f70d020505000410', 'hex') },
  'RSA-MD5': { sign: 'rsa', hash: 'md5', id: Buffer.from('3020300c06082a864886f70d020505000410', 'hex') }
};
