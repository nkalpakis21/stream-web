/**
 * Generate a Solana keypair for use as the mint authority.
 *
 * Run: npx tsx scripts/generate-mint-keypair.ts
 *
 * Add the private key to .env.local as:
 *   SOLANA_MINT_AUTHORITY_PRIVATE_KEY=<the base58 string>
 *
 * Fund the public key with devnet SOL: https://faucet.solana.com
 * NEVER commit the private key to git.
 */

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

const keypair = Keypair.generate();
const publicKey = keypair.publicKey.toBase58();
const privateKeyBase58 = bs58.encode(keypair.secretKey);

console.log('\n--- Mint Authority Keypair ---\n');
console.log('Public key (fund this with devnet SOL):');
console.log(publicKey);
console.log('\nPrivate key (add to .env.local as SOLANA_MINT_AUTHORITY_PRIVATE_KEY):');
console.log(privateKeyBase58);
console.log('\n---\n');
console.log('Next: Add to .env.local and fund the address at https://faucet.solana.com\n');
