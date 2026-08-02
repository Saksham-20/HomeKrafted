#!/usr/bin/env bash
# Rotate the seeded admin password on production.
#
# Needed because the seeded credentials (admin@homekrafted.example plus the
# shared demo password) were compiled into the public JavaScript bundle
# until M17, so they should be treated as public. The bundle is fixed as of
# the current deploy; this closes the account itself.
#
# Run ON THE BOX:
#   ssh -i ~/.ssh/homekrafted_vps root@187.127.171.48
#   bash /var/www/homekrafted/HomeKrafted/scripts/rotate-admin.sh
set -euo pipefail

read -rp "Admin email to set the password for [admin@homekrafted.example]: " EMAIL
EMAIL="${EMAIL:-admin@homekrafted.example}"
read -rsp "New password (min 12 chars, not the demo one): " PW; echo
read -rsp "Confirm: " PW2; echo
[ "$PW" = "$PW2" ] || { echo "Passwords do not match."; exit 1; }
[ "${#PW}" -ge 12 ] || { echo "Use at least 12 characters."; exit 1; }
[ "$PW" != "Passw0rd!123" ] || { echo "That is the leaked demo password."; exit 1; }

cd /var/www/homekrafted/HomeKrafted/server
HASH=$(PW="$PW" node -e '
  const argon2 = require("argon2");
  argon2.hash(process.env.PW).then((h) => process.stdout.write(h));
')

sudo -u postgres psql -d homekrafted -v ON_ERROR_STOP=1 \
  -c "UPDATE \"User\" SET \"passwordHash\" = \$\$${HASH}\$\$ WHERE email = \$\$${EMAIL}\$\$;"

echo
echo "Done. Sign in at https://homekrafted.in/admin/login with the new password."
echo "If this was the last shared credential, also consider deleting the demo"
echo "shopper and HomeKrafter accounts — see docs/LAUNCH-READINESS.md 0.2."
