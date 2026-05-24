/**
 * Candy Machine v3 minting module (Sugar / classic Candy Machine v3).
 * Exposed globally as window.mintV3() for the vanilla-JS page.
 *
 * Uses mintV2 from @metaplex-foundation/mpl-candy-machine.
 * Routes through the Candy Guard program (Guard1Jw...) which CPIs into Sugar's CM.
 * Candy Guard address is read from VITE_CANDY_GUARD_ID env var.
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
  getMplCandyGuardProgram,
  getGuardSetSerializer,
} from '@metaplex-foundation/mpl-candy-machine';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import {
  generateSigner,
  transactionBuilder,
  publicKey,
  isSome,
  some,
  none,
} from '@metaplex-foundation/umi';
import { setComputeUnitLimit } from '@metaplex-foundation/mpl-toolbox';

// ── Env ──────────────────────────────────────────────────────────────────────
const CANDY_MACHINE_ID = import.meta.env.VITE_CANDY_MACHINE_ID as string;
const CANDY_GUARD_ID   = import.meta.env.VITE_CANDY_GUARD_ID   as string;
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

// ── Auto-detect mintArgs from the guard's on-chain data ───────────────────────
async function buildMintArgs(umi: any, candyGuardAddress: any): Promise<Record<string, any>> {
  const mintArgs: Record<string, any> = {};
  try {
    const rawAccount = await umi.rpc.getAccount(candyGuardAddress);
    if (!rawAccount.exists) {
      console.log('[mint] Guard account not found on-chain at', candyGuardAddress.toString());
      return mintArgs;
    }
    const GUARD_HEADER    = 73; // 8 discriminator + 32 base + 1 bump + 32 authority
    const guardProgram    = getMplCandyGuardProgram(umi) as any;
    const guardSerializer = getGuardSetSerializer(umi as any, guardProgram);
    const [guardSet]      = guardSerializer.deserialize(rawAccount.data, GUARD_HEADER);

    const active = Object.entries(guardSet)
      .filter(([, v]) => isSome(v as any))
      .map(([k]) => k);
    console.log('[mint] Active guards:', active.join(', ') || 'none');

    if (isSome((guardSet as any).solPayment)) {
      const sp = (guardSet as any).solPayment.value;
      console.log('[mint] solPayment lamports:', sp.lamports?.basisPoints?.toString(), '→ destination:', sp.destination.toString());
      mintArgs.solPayment = some({ destination: sp.destination });
    }
    if (isSome((guardSet as any).freezeSolPayment)) {
      const fsp = (guardSet as any).freezeSolPayment.value;
      console.log('[mint] freezeSolPayment destination:', fsp.destination.toString());
      mintArgs.freezeSolPayment = some({ destination: fsp.destination });
    }
  } catch (err: any) {
    console.warn('[mint] Guard parse warning (using empty mintArgs):', err?.message);
  }
  return mintArgs;
}

// ── Main mint function ────────────────────────────────────────────────────────
export async function mintFromCandyMachine(): Promise<MintResult> {
  console.log('[mint] === Candy Machine v3 mint start ===');
  console.log('[mint] Plugin  : mplCandyMachine (Sugar / classic Candy Machine v3)');
  console.log('[mint] Function: mintV2 via @metaplex-foundation/mpl-candy-machine');
  console.log('[mint] VITE_CANDY_MACHINE_ID:', CANDY_MACHINE_ID || 'NOT SET');
  console.log('[mint] VITE_CANDY_GUARD_ID  :', CANDY_GUARD_ID   || 'NOT SET');
  console.log('[mint] VITE_RPC_URL         :', RPC_URL ? 'loaded' : 'NOT SET');

  if (!CANDY_MACHINE_ID) throw Object.assign(new Error('VITE_CANDY_MACHINE_ID is not configured'), { code: 'config_error' });
  if (!CANDY_GUARD_ID)   throw Object.assign(new Error('VITE_CANDY_GUARD_ID is not configured'),   { code: 'config_error' });
  if (!RPC_URL)          throw Object.assign(new Error('VITE_RPC_URL is not configured'),          { code: 'config_error' });

  const phantom = getPhantom();
  if (!phantom?.publicKey) {
    throw Object.assign(new Error('Connect your Phantom wallet first'), { code: 'wallet_not_connected' });
  }
  console.log('[mint] Wallet:', phantom.publicKey.toString());

  // ── UMI setup ──────────────────────────────────────────────────────────────
  const umi = createUmi(RPC_URL, { commitment: 'confirmed' })
    .use(mplCandyMachine())
    .use(walletAdapterIdentity(phantom as any));

  console.log('[mint] UMI identity:', umi.identity.publicKey.toString());

  // ── Fetch candy machine ────────────────────────────────────────────────────
  const cmPK     = publicKey(CANDY_MACHINE_ID);
  const guardPK  = publicKey(CANDY_GUARD_ID);

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

  console.log('[mint] Candy Machine:');
  console.log('  publicKey         :', cm.publicKey.toString());
  console.log('  mintAuthority     :', cm.mintAuthority.toString());
  console.log('  authority         :', cm.authority.toString());
  console.log('  collectionMint    :', cm.collectionMint.toString());
  console.log('  itemsAvailable    :', cm.data.itemsAvailable.toString());
  console.log('  itemsRedeemed     :', cm.itemsRedeemed.toString());
  console.log('  tokenStandard     :', cm.tokenStandard);
  console.log('[mint] Candy Guard  :', guardPK.toString());

  if (Number(cm.itemsRedeemed) >= Number(cm.data.itemsAvailable)) {
    throw Object.assign(new Error('Sold out — all NFTs have been minted!'), { code: 'sold_out' });
  }

  // ── Generate new NFT mint keypair ─────────────────────────────────────────
  const nftMint = generateSigner(umi);
  console.log('[mint] New NFT mint keypair:', nftMint.publicKey.toString());

  // ── Build mintArgs by reading the guard's active guards on-chain ──────────
  const mintArgs = await buildMintArgs(umi, guardPK);

  // ── Build mintV2 params ────────────────────────────────────────────────────
  const mintParams = {
    candyMachine:              cm.publicKey,
    candyGuard:                guardPK,
    nftMint,
    collectionMint:            cm.collectionMint,
    collectionUpdateAuthority: cm.authority,
    tokenStandard:             cm.tokenStandard,
    mintArgs,
    group:                     none<string>(),
  };

  console.log('[mint] mint params', {
    candyMachine:              mintParams.candyMachine.toString(),
    candyGuard:                mintParams.candyGuard.toString(),
    nftMint:                   nftMint.publicKey.toString(),
    collectionMint:            mintParams.collectionMint.toString(),
    collectionUpdateAuthority: mintParams.collectionUpdateAuthority.toString(),
    tokenStandard:             mintParams.tokenStandard,
    mintArgsKeys:              Object.keys(mintArgs).join(', ') || '(none)',
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
