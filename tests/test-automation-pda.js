// Test if the deployment record is the AUTOMATION PDA
const { PublicKey, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
require('dotenv').config();

const programId = new PublicKey('boreXQWsKpsJz5RR9BMtN8Vk4ndAk23sutj8spWYhwk');
const privateKeyBytes = bs58.decode(process.env.PRIVATE_KEY);
const wallet = Keypair.fromSecretKey(privateKeyBytes);

const targetPDA = new PublicKey('6ZAGF8QjsrSuwtEr9Q8QLJCfs31gd8KRiu8a1zbdgGa3');

console.log('Target PDA:', targetPDA.toBase58());
console.log('Wallet:', wallet.publicKey.toBase58());
console.log();

// Try AUTOMATION seed
const [automationPDA, bump] = PublicKey.findProgramAddressSync(
  [Buffer.from('automation'), wallet.publicKey.toBuffer()],
  programId
);

console.log('AUTOMATION PDA:', automationPDA.toBase58());
console.log('Bump:', bump);
console.log();

if (automationPDA.equals(targetPDA)) {
  console.log('✓✓✓ MATCH! The deployment record IS the AUTOMATION PDA! ✓✓✓');
  console.log('Seeds: [automation, wallet_pubkey]');
} else {
  console.log('Not a match. Trying other variations...');

  const variations = ['automation', 'auto', 'automate', 'bot'];

  for (const seed of variations) {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from(seed), wallet.publicKey.toBuffer()],
      programId
    );

    console.log(`  ${seed}: ${pda.toBase58()}`);
    if (pda.equals(targetPDA)) {
      console.log(`  ✓✓✓ MATCH with seed "${seed}"!`);
    }
  }
}
