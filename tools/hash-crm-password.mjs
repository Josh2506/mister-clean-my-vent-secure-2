import crypto from "crypto";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";

const rl = readline.createInterface({ input, output });

const password = await rl.question("Enter the CRM password to hash: ");
rl.close();

if (!password || password.length < 10) {
  console.error("Use a password with at least 10 characters.");
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.scryptSync(password, salt, 64).toString("hex");

console.log(`scrypt$${salt}$${hash}`);

