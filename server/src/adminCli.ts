/**
 * A maintenance script, not part of the running app — grants or revokes
 * admin rights by email. There is no in-app way to do this on purpose: admin
 * status controls who can edit or delete any course in the shared library,
 * and handing that out has to go through someone with shell access to the
 * server itself.
 *
 * Usage (from the server's dist output, e.g. inside the container):
 *   node server/dist/server/src/adminCli.js grant alice@example.com
 *   node server/dist/server/src/adminCli.js revoke alice@example.com
 *   node server/dist/server/src/adminCli.js list
 */
import { getDb } from './db.js';
import { grantAdmin, listAdmins, revokeAdmin } from './admins.js';
import { getUserByEmail } from './users.js';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function main(): void {
  const [command, email] = process.argv.slice(2);
  getDb(); // ensures the schema (including the admins table) exists before we touch it

  if (command === 'list') {
    const admins = listAdmins();
    if (admins.length === 0) {
      console.log('No admins yet.');
      return;
    }
    for (const admin of admins) {
      console.log(`${admin.email}\t${admin.name}\tsince ${new Date(admin.grantedAt).toISOString()}`);
    }
    return;
  }

  if (command !== 'grant' && command !== 'revoke') {
    fail('Usage: adminCli.js <grant|revoke> <email>  |  adminCli.js list');
  }
  if (!email) fail('Missing email argument');

  const user = getUserByEmail(email);
  if (!user) fail(`No account with email ${email}`);

  if (command === 'grant') {
    grantAdmin(user.id);
    console.log(`Granted admin to ${user.email} (${user.name}).`);
  } else {
    revokeAdmin(user.id);
    console.log(`Revoked admin from ${user.email} (${user.name}).`);
  }
}

main();
