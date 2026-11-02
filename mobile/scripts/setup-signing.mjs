// Creates the release signing key, once, outside this public repo:  node mobile/scripts/setup-signing.mjs
// You type the password here; it goes to keytool through the environment, never on a command line, and stays out of git.
// Back up the whole folder it prints. Without that key and password, Android won't accept updates to the installed app.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const MIN_PASSWORD = 12;
const dir = process.env.HR_KEYSTORE_DIR || join(homedir(), '.keystores');
const keystore = join(dir, 'health-records.jks');
const propsFile = join(dir, 'health-records.properties');
const keytool = process.env.KEYTOOL || 'C:/Program Files/Android/Android Studio/jbr/bin/keytool.exe';

// Typed or pasted input can arrive as several lines in one chunk, so what's left over waits for the next prompt.
let pending = '';
function readLine(prompt) {
  return new Promise(resolve => {
    process.stdout.write(prompt);
    const { stdin } = process;
    let value = '';
    const finish = () => {
      stdin.off('data', onData);
      stdin.off('end', onEnd);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\n');
      resolve(value);
    };
    const onEnd = () => finish();
    const take = chunk => {
      for (let i = 0; i < chunk.length; i++) {
        const c = chunk[i];
        if (c === '\u0003') { process.stdout.write('\n'); process.exit(1); }
        if (c === '\r' || c === '\n') {
          pending = chunk.slice(i + 1).replace(/^\n/, '');
          return true;
        }
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
        else value += c;
      }
      return false;
    };
    const onData = chunk => { if (take(chunk)) finish(); };
    const waiting = pending;
    pending = '';
    if (take(waiting)) { process.stdout.write('\n'); resolve(value); return; }
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
    stdin.on('end', onEnd);
    stdin.resume();
  });
}

if (existsSync(keystore) || existsSync(propsFile)) {
  console.error(`Already set up, and replacing the key would block updates to the installed app: ${keystore}`);
  process.exit(1);
}
if (!existsSync(keytool)) {
  console.error(`keytool not found at ${keytool}`);
  process.exit(1);
}

console.log(`Choose a password for the signing key (${MIN_PASSWORD}+ characters). Nothing shows as you type.`);
const password = await readLine('Password: ');
const again = await readLine('Again: ');
if (password !== again) { console.error('Those did not match. Nothing was created.'); process.exit(1); }
if (password.length < MIN_PASSWORD) { console.error(`Use ${MIN_PASSWORD} or more characters. Nothing was created.`); process.exit(1); }

mkdirSync(dir, { recursive: true });
const made = spawnSync(keytool, ['-genkeypair', '-keystore', keystore, '-alias', 'health-records', '-keyalg', 'RSA', '-keysize', '4096',
  '-validity', '36500', '-dname', 'CN=Health Records', '-storepass:env', 'HR_SIGNING_PASSWORD', '-keypass:env', 'HR_SIGNING_PASSWORD'],
{ env: { ...process.env, HR_SIGNING_PASSWORD: password }, stdio: ['ignore', 'ignore', 'inherit'] });
if (made.status !== 0) { console.error('keytool failed. Nothing was saved.'); process.exit(1); }

// A .properties file treats a backslash as an escape.
writeFileSync(propsFile, `password=${password.replace(/\\/g, '\\\\')}\n`, { mode: 0o600 });
console.log(`Done. Back up this folder somewhere safe: ${dir}`);
