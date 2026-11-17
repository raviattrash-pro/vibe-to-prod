import { hashPassword } from '../src/auth.js';
let password='';for await(const chunk of process.stdin)password+=chunk.toString();password=password.replace(/[\r\n]+$/,'');if(password.length<12){process.stderr.write('Use a password with at least 12 characters.\n');process.exit(1);}process.stdout.write(`${await hashPassword(password)}\n`);
