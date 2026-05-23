/**
 * Candy Machine v3 on-chain minting module.
 * Exposed globally as window.mintV3() for the vanilla-JS page.
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
} from '@metaplex-foundation/mpl-candy-machine';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import {
  generateSigner,
  transactionBuilder,
  publicKey,
} from '@metaplex-foundation/umi';
import { setComputeUnitLimit } from '@metaplex-foundation/mpl-toolbox';

// ── Env ──────────────────────────────────────────────────────────────────────
const CANDY_MACHINE_ID = import.meta.env.VITE_CANDY_MACHINE_ID as string;
const COLLECTION_MINT  = import.meta.env.VITE_COLLECTION_MINT  as string;
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

// ── Tiny base58 encoder (avoids pulling in full bs58 in browser) ─────────────
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

// ── Mint ─────────────────────────────────────────────────────────────────────
export async function mintFromCandyMachine(): Promise<MintResult> {
  const phantom = getPhantom();
  if (!phantom?.publicKey) {
    throw Object.assign(
      new Error('Connect your Phantom wallet first'),
      { code: 'wallet_not_connected' },
    );
  }

  const umi = createUmi(RPC_URL, { commitment: 'confirmed' })
    .use(mplCandyMachine())
    .use(walletAdapterIdentity(phantom as any));

  const cmPK = publicKey(CANDY_MACHINE_ID);

  // Validate candy machine state
  let cm: Awaited<ReturnType<typeof fetchCandyMachine>>;
  try {
    cm = await fetchCandyMachine(umi, cmPK);
  } catch (e: any) {
    throw Object.assign(
      new Error('Could not load Candy Machine — check your RPC connection'),
      { code: 'rpc_error', cause: e },
    );
  }

  if (Number(cm.itemsRedeemed) >= Number(cm.data.itemsAvailable)) {
    throw Object.assign(
      new Error('Sold out — all NFTs have been minted!'),
      { code: 'sold_out' },
    );
  }

  const nftMint = generateSigner(umi);

  // Build and send the mint transaction
  let sig: Uint8Array;
  try {
    const result = await transactionBuilder()
      .add(setComputeUnitLimit(umi, { units: 600_000 }))
      .add(
        mintV2(umi, {
          candyMachine: cmPK,
          nftMint,
          collectionMint: publicKey(COLLECTION_MINT),
          collectionUpdateAuthority: cm.authority,
        }),
      )
      .sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
    sig = result.signature;
  } catch (e: any) {
    const msg: string = e?.message ?? '';
    if (
      msg.includes('User rejected') ||
      msg.includes('Transaction rejected') ||
      msg.includes('cancelled') ||
      e?.code === 4001
    ) {
      throw Object.assign(new Error('Transaction rejected by user'), { code: 'user_rejected' });
    }
    if (
      msg.includes('0x1') ||
      msg.includes('insufficient lamports') ||
      msg.includes('InsufficientFunds') ||
      msg.includes('insufficient funds')
    ) {
      throw Object.assign(
        new Error('Insufficient SOL — you need at least 0.5 SOL + transaction fees'),
        { code: 'insufficient_sol' },
      );
    }
    throw e;
  }

  const signature   = toBase58(sig);
  const mintAddress = nftMint.publicKey.toString();

  // Best-effort: fetch on-chain metadata for display
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

// Expose globally for the vanilla-JS page
window.mintV3 = mintFromCandyMachine;
