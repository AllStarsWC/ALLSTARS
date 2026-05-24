/**
 * Candy Machine v3 minting module (Sugar / classic Candy Machine v3).
 * Exposed globally as window.mintV3() for the vanilla-JS page.
 *
 * Guarded mint only — routes through the Candy Guard at VITE_CANDY_GUARD_ID.
 * mintV2 sends to the Candy Guard which CPIs into the Candy Machine.
 *
 * Package : @metaplex-foundation/mpl-candy-machine (classic, not Core)
 * Network : mainnet-beta
 */

// ── Buffer polyfill ───────────────────────────────────────────────────────────
import { Buffer } from 'buffer';
if (typeof window !== 'undefined' && !(window as any).Buffer) {
  (window as any).Buffer = Buffer;
}

import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  mplCandyMachine,
  fetchCandyMachine,
  mintV2,
} from '@metaplex-foundation/mpl-candy-machine';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import {
  generateSigner,
  transactionBuilder,
  publicKey,
  some,
  none,
} from '@metaplex-foundation/umi';
import { setComputeUnitLimit } from '@metaplex-foundation/mpl-toolbox';

// ── Env ──────────────────────────────────────────────────────────────────────
const CANDY_MACHINE_ID = import.meta.env.VITE_CANDY_MACHINE_ID as string;
const CANDY_GUARD_ID   = import.meta.env.VITE_CANDY_GUARD_ID   as string;
const RPC_URL          = import.meta.env.VITE_RPC_URL          as string;

// Treasury wallet — receives SOL payment from the guard
const TREASURY = '5zxQnDjbw12Tb7fr3eFy888SFGQACvNfgvymvaAvMB8b';

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
  const msg      = String(e?.message ?? e ?? '').toLowerCase();
  const logs     = (e?.logs ?? []).join(' ').toLowerCase();
  const combined = msg + ' ' + logs;

  if (msg.includes('user rejected') || msg.includes('transaction rejected') ||
      msg.includes('cancelled') || msg.includes('denied') || e?.code === 4001) {
    throw Object.assign(new Error('Transaction rejected by user'), { code: 'user_rejected' });
  }
  if (combined.includes('0x1') || combined.includes('insufficient lamports') ||
      combined.includes('insufficientfunds') || combined.includes('insufficient funds')) {
    throw Object.assign(
      new Error('Insufficient SOL — you need enough SOL for the mint price + fees'),
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

// ── Main mint function ────────────────────────────────────────────────────────
export async function mintFromCandyMachine(): Promise<MintResult> {
  console.log('[mint] === Candy Machine v3 mint start ===');
  console.log('[mint] Package     : @metaplex-foundation/mpl-candy-machine (classic)');
  console.log('[mint] Network     : mainnet-beta');
  console.log('[mint] CM          :', CANDY_MACHINE_ID || 'NOT SET');
  console.log('[mint] Guard       :', CANDY_GUARD_ID   || 'NOT SET');
  console.log('[mint] Treasury    :', TREASURY);
  console.log('[mint] RPC         :', RPC_URL ? 'loaded' : 'NOT SET');

  if (!CANDY_MACHINE_ID) throw Object.assign(new Error('VITE_CANDY_MACHINE_ID is not configured'), { code: 'config_error' });
  if (!CANDY_GUARD_ID)   throw Object.assign(new Error('VITE_CANDY_GUARD_ID is not configured'),   { code: 'config_error' });
  if (!RPC_URL)          throw Object.assign(new Error('VITE_RPC_URL is not configured'),           { code: 'config_error' });

  const phantom = getPhantom();
  if (!phantom?.publicKey) {
    throw Object.assign(new Error('Connect your Phantom wallet first'), { code: 'wallet_not_connected' });
  }
  console.log('[mint] Wallet:', phantom.publicKey.toString());

  // ── UMI ───────────────────────────────────────────────────────────────────
  const umi = createUmi(RPC_URL, { commitment: 'confirmed' })
    .use(mplCandyMachine())
    .use(walletAdapterIdentity(phantom as any));

  console.log('[mint] UMI identity:', umi.identity.publicKey.toString());

  // ── Fetch candy machine ───────────────────────────────────────────────────
  const cmPK    = publicKey(CANDY_MACHINE_ID);
  const guardPK = publicKey(CANDY_GUARD_ID);

  let cm: Awaited<ReturnType<typeof fetchCandyMachine>>;
  try {
    cm = await fetchCandyMachine(umi, cmPK);
  } catch (e: any) {
    console.error('[mint] fetchCandyMachine failed:', e?.message ?? e);
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

  // ── Generate new NFT mint keypair ─────────────────────────────────────────
  const nftMint = generateSigner(umi);
  console.log('[mint] New NFT mint:', nftMint.publicKey.toString());

  // ── Build mintV2 params (guarded, always) ─────────────────────────────────
  const mintParams = {
    candyMachine:              cm.publicKey,
    candyGuard:                guardPK,
    nftMint,
    collectionMint:            cm.collectionMint,
    collectionUpdateAuthority: cm.authority,
    tokenStandard:             cm.tokenStandard,
    mintArgs: {
      solPayment: some({ destination: publicKey(TREASURY) }),
    },
    group: none<string>(),
  };

  console.log('[mint] mint params', {
    candyMachine:              mintParams.candyMachine.toString(),
    candyGuard:                mintParams.candyGuard.toString(),
    nftMint:                   nftMint.publicKey.toString(),
    collectionMint:            mintParams.collectionMint.toString(),
    collectionUpdateAuthority: mintParams.collectionUpdateAuthority.toString(),
    tokenStandard:             mintParams.tokenStandard,
    'mintArgs.solPayment.destination': TREASURY,
  });

  console.log('[mint] Sending mintV2 transaction...');

  let sig: Uint8Array;
  try {
    const result = await transactionBuilder()
      .add(setComputeUnitLimit(umi, { units: 800_000 }))
      .add(mintV2(umi, mintParams))
      .sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
    sig = result.signature;
  } catch (e: any) {
    console.error('[mint] mintV2 failed:', e?.message ?? e);
    if (e?.logs?.length) console.error('[mint] TX logs:', e.logs);
    classifyError(e);
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
