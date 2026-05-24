/**
 * Candy Machine v3 on-chain minting module.
 * Exposed globally as window.mintV3() for the vanilla-JS page.
 *
 * Unguarded CM  (mintAuthority === authority):  uses mintFromCandyMachineV2
 *   → calls CndyV3LdqHUfDLmE5naZjVN8rBZz4tqhdefbAnjHG3JR directly, NO guard accounts
 *
 * Guarded CM    (mintAuthority !== authority):  uses mintV2 through the guard
 *   → calls Guard1JwRhJkVH6XZhzoYxeBVQe872VH6QggF4BWmS9g with auto-detected mintArgs
 */

// ── Buffer polyfill (required by @solana/web3.js in browser) ─────────────────
import { Buffer } from 'buffer';
if (typeof window !== 'undefined' && !(window as any).Buffer) {
  (window as any).Buffer = Buffer;
}

import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  mplCandyMachine,
  fetchCandyMachine,
  mintV2,
  mintFromCandyMachineV2,
  getGuardSetSerializer,
  getMplCandyGuardProgram,
} from '@metaplex-foundation/mpl-candy-machine';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import {
  generateSigner,
  transactionBuilder,
  publicKey,
  isSome,
  some,
} from '@metaplex-foundation/umi';
import { setComputeUnitLimit } from '@metaplex-foundation/mpl-toolbox';

// ── Env ──────────────────────────────────────────────────────────────────────
const CANDY_MACHINE_ID = import.meta.env.VITE_CANDY_MACHINE_ID as string;
const RPC_URL          = import.meta.env.VITE_RPC_URL          as string;

// ── Types ────────────────────────────────────────────────────────────────────
export interface MintResult {
  signature:   string;
  mintAddress: string;
  name?:       string;
  image?:      string;
}

interface PhantomLike {
  publicKey: { toString(): string } | null;
  signTransaction(tx: unknown): Promise<unknown>;
  signAllTransactions(txs: unknown[]): Promise<unknown[]>;
  signMessage(msg: Uint8Array): Promise<{ signature: Uint8Array }>;
}

declare global {
  interface Window {
    solana?:  PhantomLike & { isPhantom?: boolean };
    phantom?: { solana?: PhantomLike & { isPhantom?: boolean } };
    mintV3?:  () => Promise<MintResult>;
  }
}

// ── Tiny base58 encoder ───────────────────────────────────────────────────────
function toBase58(bytes: Uint8Array): string {
  const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const digits = [0];
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let str = '';
  for (let k = 0; bytes[k] === 0 && k < bytes.length - 1; k++) str += '1';
  for (let q = digits.length - 1; q >= 0; q--) str += ALPHA[digits[q]];
  return str;
}

// ── Phantom resolver ─────────────────────────────────────────────────────────
function getPhantom(): PhantomLike | null {
  return window.phantom?.solana ?? window.solana ?? null;
}

// ── Error classifier ──────────────────────────────────────────────────────────
function classifyError(e: any): never {
  const msg     = String(e?.message ?? e ?? '').toLowerCase();
  const logs    = (e?.logs ?? []).join(' ').toLowerCase();
  const combined = msg + ' ' + logs;

  if (msg.includes('user rejected') || msg.includes('transaction rejected') ||
      msg.includes('cancelled') || msg.includes('denied') || e?.code === 4001) {
    throw Object.assign(new Error('Transaction rejected by user'), { code: 'user_rejected' });
  }
  if (combined.includes('0x1') || combined.includes('insufficient lamports') ||
      combined.includes('insufficientfunds') || combined.includes('insufficient funds')) {
    throw Object.assign(
      new Error('Insufficient SOL — you need enough SOL for the mint price + transaction fees'),
      { code: 'insufficient_sol' },
    );
  }
  if (combined.includes('sold out') || combined.includes('0x1578')) {
    throw Object.assign(new Error('Sold out — all NFTs have been minted!'), { code: 'sold_out' });
  }
  if (combined.includes('not live') || combined.includes('before start date')) {
    throw Object.assign(new Error('Mint has not started yet'), { code: 'not_live' });
  }
  if (combined.includes('allowlist') || combined.includes('address gate') ||
      combined.includes('not eligible')) {
    throw Object.assign(new Error('Your wallet is not on the allowlist for this mint'), { code: 'not_eligible' });
  }
  throw e;
}

// ── Guard auto-detection (guarded CM only) ────────────────────────────────────
async function buildMintArgs(umi: any, candyGuardAddress: any) {
  const mintArgs: Record<string, any> = {};
  try {
    const rawAccount = await umi.rpc.getAccount(candyGuardAddress);
    if (!rawAccount.exists) {
      console.log('[mint] Guard account not found at', candyGuardAddress.toString());
      return mintArgs;
    }
    const GUARD_HEADER = 73; // 8 discriminator + 32 base + 1 bump + 32 authority
    const guardProgram = getMplCandyGuardProgram(umi) as any;
    const guardSetSerializer = getGuardSetSerializer(umi as any, guardProgram);
    const [guardSet] = guardSetSerializer.deserialize(rawAccount.data, GUARD_HEADER);

    console.log('[mint] Active guards:',
      Object.entries(guardSet)
        .filter(([, v]) => isSome(v as any))
        .map(([k]) => k).join(', ') || 'none'
    );

    if (isSome((guardSet as any).solPayment)) {
      const sp = (guardSet as any).solPayment.value;
      console.log('[mint] solPayment destination:', sp.destination.toString());
      mintArgs.solPayment = some({ destination: sp.destination });
    }
    if (isSome((guardSet as any).freezeSolPayment)) {
      const fsp = (guardSet as any).freezeSolPayment.value;
      console.log('[mint] freezeSolPayment destination:', fsp.destination.toString());
      mintArgs.freezeSolPayment = some({ destination: fsp.destination });
    }
  } catch (err: any) {
    console.warn('[mint] Guard parse warning (proceeding anyway):', err?.message);
  }
  return mintArgs;
}

// ── Main mint function ────────────────────────────────────────────────────────
export async function mintFromCandyMachine(): Promise<MintResult> {
  console.log('[mint] === Candy Machine v3 mint start ===');
  console.log('[mint] VITE_CANDY_MACHINE_ID:', CANDY_MACHINE_ID || 'NOT SET');
  console.log('[mint] VITE_RPC_URL         :', RPC_URL ? 'loaded' : 'NOT SET');

  if (!CANDY_MACHINE_ID) throw Object.assign(new Error('VITE_CANDY_MACHINE_ID is not configured'), { code: 'config_error' });
  if (!RPC_URL)          throw Object.assign(new Error('VITE_RPC_URL is not configured'), { code: 'config_error' });

  const phantom = getPhantom();
  if (!phantom?.publicKey) {
    throw Object.assign(new Error('Connect your Phantom wallet first'), { code: 'wallet_not_connected' });
  }
  console.log('[mint] Wallet public key:', phantom.publicKey.toString());

  const umi = createUmi(RPC_URL, { commitment: 'confirmed' })
    .use(mplCandyMachine())
    .use(walletAdapterIdentity(phantom as any));

  const cmPK = publicKey(CANDY_MACHINE_ID);
  let cm: Awaited<ReturnType<typeof fetchCandyMachine>>;
  try {
    cm = await fetchCandyMachine(umi, cmPK);
  } catch (e: any) {
    console.error('[mint] fetchCandyMachine failed:', e);
    throw Object.assign(
      new Error('Could not load Candy Machine — check your RPC connection and Candy Machine ID'),
      { code: 'rpc_error', cause: e },
    );
  }

  console.log('[mint] Candy Machine fetched:');
  console.log('  publicKey         :', cm.publicKey.toString());
  console.log('  mintAuthority     :', cm.mintAuthority.toString());
  console.log('  authority         :', cm.authority.toString());
  console.log('  collectionMint    :', cm.collectionMint.toString());
  console.log('  itemsAvailable    :', cm.data.itemsAvailable.toString());
  console.log('  itemsRedeemed     :', cm.itemsRedeemed.toString());
  console.log('  tokenStandard     :', cm.tokenStandard);

  if (Number(cm.itemsRedeemed) >= Number(cm.data.itemsAvailable)) {
    throw Object.assign(new Error('Sold out — all NFTs have been minted!'), { code: 'sold_out' });
  }

  // mintAuthority === authority  →  no Candy Guard, use mintFromCandyMachineV2
  // mintAuthority !== authority  →  Candy Guard attached, use mintV2 through guard
  const hasGuard = cm.mintAuthority.toString() !== cm.authority.toString();
  console.log('[mint] Candy Guard attached:', hasGuard);

  const nftMint = generateSigner(umi);
  console.log('[mint] New NFT mint keypair:', nftMint.publicKey.toString());

  let sig: Uint8Array;

  if (!hasGuard) {
    // ── Unguarded path: call CM Core directly, NO guard accounts ─────────────
    const params = {
      candyMachine:              cm.publicKey,
      mintAuthority:             umi.identity,   // wallet IS the mint authority
      nftOwner:                  umi.identity.publicKey,
      nftMint,
      collectionMint:            cm.collectionMint,
      collectionUpdateAuthority: cm.authority,
    };
    console.log('[mint] mint params (unguarded)', {
      candyMachine:              params.candyMachine.toString(),
      mintAuthority:             params.mintAuthority.publicKey.toString(),
      nftOwner:                  params.nftOwner.toString(),
      nftMint:                   nftMint.publicKey.toString(),
      collectionMint:            params.collectionMint.toString(),
      collectionUpdateAuthority: params.collectionUpdateAuthority.toString(),
      // confirm: NO candyGuard field
      candyGuardPresent:         false,
    });

    try {
      const result = await transactionBuilder()
        .add(setComputeUnitLimit(umi, { units: 800_000 }))
        .add(mintFromCandyMachineV2(umi, params))
        .sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
      sig = result.signature;
    } catch (e: any) {
      console.error('[mint] mintFromCandyMachineV2 failed:', e?.message ?? e);
      if (e?.logs) console.error('[mint] TX logs:', e.logs);
      classifyError(e);
    }

  } else {
    // ── Guarded path: route through Candy Guard ───────────────────────────────
    console.log('[mint] Candy Guard address:', cm.mintAuthority.toString());
    const mintArgs = await buildMintArgs(umi, cm.mintAuthority);

    const params = {
      candyMachine:              cm.publicKey,
      candyGuard:                cm.mintAuthority,
      nftMint,
      collectionMint:            cm.collectionMint,
      collectionUpdateAuthority: cm.authority,
      tokenStandard:             cm.tokenStandard,
      mintArgs,
    };
    console.log('[mint] mint params (guarded)', {
      candyMachine:              params.candyMachine.toString(),
      candyGuard:                params.candyGuard.toString(),
      nftMint:                   nftMint.publicKey.toString(),
      collectionMint:            params.collectionMint.toString(),
      mintArgsKeys:              Object.keys(mintArgs).join(', ') || '(none)',
    });

    try {
      const result = await transactionBuilder()
        .add(setComputeUnitLimit(umi, { units: 800_000 }))
        .add(mintV2(umi, params))
        .sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
      sig = result.signature;
    } catch (e: any) {
      console.error('[mint] mintV2 (guarded) failed:', e?.message ?? e);
      if (e?.logs) console.error('[mint] TX logs:', e.logs);
      classifyError(e);
    }
  }

  const signature   = toBase58(sig!);
  const mintAddress = nftMint.publicKey.toString();

  console.log('[mint] === Mint SUCCESS ===');
  console.log('[mint] Signature  :', signature);
  console.log('[mint] NFT address:', mintAddress);
  console.log('[mint] Solscan TX :', `https://solscan.io/tx/${signature}`);
  console.log('[mint] Solscan NFT:', `https://solscan.io/token/${mintAddress}`);

  // ── Best-effort: fetch on-chain metadata ──────────────────────────────────
  let name: string | undefined;
  let image: string | undefined;
  try {
    const { fetchMetadataFromSeeds } = await import(
      '@metaplex-foundation/mpl-token-metadata' as string
    );
    const meta = await (fetchMetadataFromSeeds as any)(umi, { mint: nftMint.publicKey });
    if (meta?.uri) {
      const json = await fetch(meta.uri).then(r => r.json()).catch(() => null);
      if (json) { name = json.name; image = json.image; }
    }
  } catch (_) { /* optional */ }

  return { signature, mintAddress, name, image };
}

// ── Expose globally for the vanilla-JS page ───────────────────────────────────
window.mintV3 = mintFromCandyMachine;
