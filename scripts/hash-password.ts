/**
 * Genera un hash bcrypt para STAFF_PASSWORD_HASH.
 * Uso: npm run hash:password -- "tu-contraseña"
 */
import bcrypt from "bcryptjs";

async function main() {
  const password = process.argv[2];
  if (!password) {
    console.error('Uso: npm run hash:password -- "tu-contraseña"');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  console.log(hash);
}

main();
