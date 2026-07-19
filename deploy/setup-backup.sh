#!/bin/bash
# Richtet die tägliche Sicherung ein. Auf dem Server als root ausführen:
#   bash setup-backup.sh
set -euo pipefail
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ $EUID -eq 0 ]] || { echo "Bitte als root ausführen." >&2; exit 1; }

install -d -m 700 -o root -g root /var/backups/cubory
install -m 755 -o root -g root "$SCRIPT_DIR/cubory-backup" /usr/local/sbin/cubory-backup
install -m 644 -o root -g root "$SCRIPT_DIR/cubory-backup.service" /etc/systemd/system/
install -m 644 -o root -g root "$SCRIPT_DIR/cubory-backup.timer" /etc/systemd/system/

systemctl daemon-reload
systemctl enable --now cubory-backup.timer

echo
echo "Timer aktiv. Erster Lauf:"
systemctl list-timers cubory-backup.timer --no-pager | sed -n 2p
echo
echo "Sofort testen:  systemctl start cubory-backup && journalctl -u cubory-backup -n 20"
