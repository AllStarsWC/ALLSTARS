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

// ── Classify send/confirm errors ─────────────────────────────────────────────
function classifyError(e: any): never {
  const msg: string = String(e?.message ?? e ?? '').toLowerCase();
  const logs: string = (e?.logs ?? []).join(' ').toLowerCase();
  const combined = msg + ' ' + logs;

  if (
    msg.includes('user rejected') ||
    msg.includes('transaction rejected') ||
    msg.includes('cancelled') ||
    msg.includes('denied') ||
    e?.code === 4001
  ) {
    throw Object.assign(new Error('Transaction rejected by user'), { code: 'user_rejected' });
  }
  if (
    combined.includes('0x1') ||
    combined.includes('insufficient lamports') ||
    combined.includes('insufficientfunds') ||
    combined.includes('insufficient funds')
  ) {
    throw Object.assign(
      new Error('Insufficient SOL — you need enough SOL for the mint price + transaction fees'),
      { code: 'insufficient_sol' },
    );
  }
  if (combined.includes('sold out') || combined.includes('0x1578')) {
    throw Object.assign(new Error('Sold out — all NFTs have been minted!'), { code: 'sold_out' });
  }
  if (combined.includes('not live') || combined.includes('mint not started') || combined.includes('before start date')) {
    throw Object.assign(new Error('Mint has not started yet'), { code: 'not_live' });
  }
  if (combined.includes('allowlist') || combined.includes('address gate') || combined.includes('not eligible')) {
    throw Object.assign(new Error('Your wallet is not on the allowlist for this mint'), { code: 'not_eligible' });
  }
  throw e;
}

// ── Candy Guard auto-detection ────────────────────────────────────────────────
async function buildMintArgs(umi: any, candyGuardAddress: any) {
  const mintArgs: Record<string, any> = {};
  try {
    const rawAccount = await umi.rpc.getAccount(candyGuardAddress);
    if (!rawAccount.exists) {
      console.log('[mint] Candy Guard account not found at', candyGuardAddress.toString());
      return mintArgs;
    }

    // Header: 8 discriminator + 32 base + 1 bump + 32 authority = 73 bytes
    const GUARD_HEADER = 73;
    const guardProgram = getMplCandyGuardProgram(umi) as any;
    const guardSetSerializer = getGuardSetSerializer(umi as any, guardProgram);
    const [guardSet] = guardSetSerializer.deserialize(rawAccount.data, GUARD_HEADER);

    console.log('[mint] Candy Guard deserialized. Active guards:',
      Object.entries(guardSet)
        .filter(([, v]) => isSome(v as any))
        .map(([k]) => k)
        .join(', ') || 'none'
    );

    // solPayment — destination is required as a mint arg
    if (isSome((guardSet as any).solPayment)) {
      const sp = (guardSet as any).solPayment.value;
      console.log('[mint] solPayment guard detected — lamports:', sp.lamports.basisPoints?.toString(), 'destination:', sp.destination.toString());
      mintArgs.solPayment = some({ destination: sp.destination });
    }

    // freezeSolPayment
    if (isSome((guardSet as any).freezeSolPayment)) {
      const fsp = (guardSet as any).freezeSolPayment.value;
      console.log('[mint] freezeSolPayment guard detected — destination:', fsp.destination.toString());
      mintArgs.freezeSolPayment = some({ destination: fsp.destination });
    }

    // mintLimit — no extra arg needed but log it
    if (isSome((guardSet as any).mintLimit)) {
      const ml = (guardSet as any).mintLimit.value;
      console.log('[mint] mintLimit guard detected — id:', ml.id, 'limit:', ml.limit);
    }

    // startDate / endDate — log for info
    if (isSome((guardSet as any).startDate)) {
      const sd = (guardSet as any).startDate.value;
      console.log('[mint] startDate guard — date:', new Date(Number(sd.date) * 1000).toISOString());
    }
    if (isSome((guardSet as any).endDate)) {
      const ed = (guardSet as any).endDate.value;
      console.log('[mint] endDate guard — date:', new Date(Number(ed.date) * 1000).toISOString());
    }

  } catch (guardErr: any) {
    console.warn('[mint] Could not fully parse Candy Guard (mint will still proceed without guard args):', guardErr?.message);
  }
  return mintArgs;
}

// ── Main mint function ────────────────────────────────────────────────────────
export async function mintFromCandyMachine(): Promise<MintResult> {
  // ── Env validation ────────────────────────────────────────────────────────
  console.log('[mint] === Candy Machine v3 mint start ===');
  console.log('[mint] VITE_CANDY_MACHINE_ID:', CANDY_MACHINE_ID || 'NOT SET');
  console.log('[mint] VITE_COLLECTION_MINT :', COLLECTION_MINT  || 'NOT SET');
  console.log('[mint] VITE_RPC_URL         :', RPC_URL ? 'loaded (helius endpoint)' : 'NOT SET');

  if (!CANDY_MACHINE_ID) {
    throw Object.assign(new Error('VITE_CANDY_MACHINE_ID is not configured'), { code: 'config_error' });
  }
  if (!COLLECTION_MINT) {
    throw Object.assign(new Error('VITE_COLLECTION_MINT is not configured'), { code: 'config_error' });
  }
  if (!RPC_URL) {
    throw Object.assign(new Error('VITE_RPC_URL is not configured'), { code: 'config_error' });
  }

  // ── Wallet check ──────────────────────────────────────────────────────────
  const phantom = getPhantom();
  if (!phantom?.publicKey) {
    throw Object.assign(
      new Error('Connect your Phantom wallet first'),
      { code: 'wallet_not_connected' },
    );
  }
  console.log('[mint] Wallet public key:', phantom.publicKey.toString());

  // ── Build UMI context ─────────────────────────────────────────────────────
  const umi = createUmi(RPC_URL, { commitment: 'confirmed' })
    .use(mplCandyMachine())
    .use(walletAdapterIdentity(phantom as any));

  console.log('[mint] UMI identity:', (umi.identity as any).publicKey?.toString());

  // ── Fetch Candy Machine ───────────────────────────────────────────────────
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
  console.log('  mintAuthority     :', cm.mintAuthority.toString(), '← this is the Candy Guard address');
  console.log('  authority         :', cm.authority.toString());
  console.log('  collectionMint    :', cm.collectionMint.toString());
  console.log('  itemsAvailable    :', cm.data.itemsAvailable.toString());
  console.log('  itemsRedeemed     :', cm.itemsRedeemed.toString());
  console.log('  tokenStandard     :', cm.tokenStandard);

  if (Number(cm.itemsRedeemed) >= Number(cm.data.itemsAvailable)) {
    throw Object.assign(
      new Error('Sold out — all NFTs have been minted!'),
      { code: 'sold_out' },
    );
  }

  // ── Candy Guard detection ─────────────────────────────────────────────────
  // mintAuthority === authority  →  no guard attached (bare CM)
  // mintAuthority !== authority  →  a Candy Guard PDA is attached
  const hasGuard = cm.mintAuthority.toString() !== cm.authority.toString();
  console.log('[mint] Candy Guard attached:', hasGuard);

  let mintArgs: Record<string, any> = {};
  if (hasGuard) {
    console.log('[mint] Candy Guard address:', cm.mintAuthority.toString());
    mintArgs = await buildMintArgs(umi, cm.mintAuthority);
  } else {
    console.log('[mint] No Candy Guard — minting directly against the candy machine');
  }
  console.log('[mint] mintArgs keys:', Object.keys(mintArgs).join(', ') || '(none)');

  // ── Mint ──────────────────────────────────────────────────────────────────
  // Use cm.collectionMint from the on-chain account — avoids env var typo issues
  const nftMint = generateSigner(umi);
  console.log('[mint] New NFT mint keypair:', nftMint.publicKey.toString());
  console.log('[mint] collectionMint (on-chain):', cm.collectionMint.toString());
  console.log('[mint] Sending mintV2 transaction...');

  let sig: Uint8Array;
  try {
    const result = await transactionBuilder()
      .add(setComputeUnitLimit(umi, { units: 800_000 }))
      .add(
        mintV2(umi, {
          candyMachine:              cmPK,
          ...(hasGuard ? { candyGuard: cm.mintAuthority } : {}),
          nftMint,
          collectionMint:            cm.collectionMint,
          collectionUpdateAuthority: cm.authority,
          tokenStandard:             cm.tokenStandard,
          mintArgs,
        }),
      )
      .sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
    sig = result.signature;
  } catch (e: any) {
    console.error('[mint] mintV2 failed:', e);
    if (e?.logs) console.error('[mint] Transaction logs:', e.logs);
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
  } catch (_) { /* optional metadata fetch — no crash if it fails */ }

  return { signature, mintAddress, name, image };
}

// ── Expose globally for the vanilla-JS page ───────────────────────────────────
window.mintV3 = mintFromCandyMachine;
