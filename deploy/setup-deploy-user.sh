#!/bin/bash
# Richtet den Deploy-Zugang für die GitHub-Actions-Pipeline ein.
#
# Auf dem Server als root ausführen:
#   bash setup-deploy-user.sh "ssh-ed25519 AAAA... github-actions-deploy@cubory"
#
# Der deploy-Nutzer bekommt bewusst keinen Root-Zugang: er darf ins Webroot
# schreiben und genau ein Skript per sudo starten - den API-Rollout mit
# Health-Prüfung und Rollback. Alles andere bleibt ihm verwehrt.
set -euo pipefail

PUBKEY="${1:?Öffentlichen Deploy-Schlüssel als Argument übergeben}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[[ $EUID -eq 0 ]] || { echo "Bitte als root ausführen." >&2; exit 1; }

# 1) Nutzer
id deploy >/dev/null 2>&1 || useradd -m -s /bin/bash deploy
usermod -aG www-data deploy

install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
printf '%s\n' "$PUBKEY" > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

# 2) Webroot für die Gruppe www-data beschreibbar machen.
#    setgid auf den Verzeichnissen, damit hochgeladene Dateien die Gruppe erben
#    und nginx sie weiterhin lesen kann.
chgrp -R www-data /var/www/cubory
find /var/www/cubory -type d -exec chmod 2775 {} +
find /var/www/cubory -type f -exec chmod 664 {} +

# 3) Ablage für die hochgeladene API-Binary
install -d -m 750 -o deploy -g deploy /srv/cubory-staging

# 4) Rollout-Skript und die dazu passende, eng gefasste sudo-Regel
install -m 755 -o root -g root "$SCRIPT_DIR/cubory-deploy-api" /usr/local/sbin/cubory-deploy-api
printf 'deploy ALL=(root) NOPASSWD: /usr/local/sbin/cubory-deploy-api\n' > /etc/sudoers.d/cubory-deploy
chmod 440 /etc/sudoers.d/cubory-deploy
visudo -cf /etc/sudoers.d/cubory-deploy >/dev/null

echo
echo "Fertig. Der deploy-Nutzer darf:"
echo "  - nach /var/www/cubory schreiben (Website und Downloads)"
echo "  - sudo /usr/local/sbin/cubory-deploy-api ausführen"
echo "Mehr nicht - kein Root, keine Shell-Rechte auf andere Dienste."
