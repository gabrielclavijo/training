#!/usr/bin/env bash
# Prueba el esquema y la seguridad (RLS) en un Postgres local desechable.
# Requisitos: PostgreSQL 15+ instalado (initdb, pg_ctl, psql).
# Uso: npm run test:db
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PGBIN:$PATH"

TMP="$(mktemp -d)"
AS=()
PORT="${PGPORT_TEST:-54329}"
cleanup() { "${AS[@]}" env PATH="$PATH" pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

# Postgres no arranca como root: en ese caso se usa el usuario del sistema "postgres".
AS=()
if [ "$(id -u)" = "0" ]; then
  chown postgres "$TMP"
  AS=(runuser -u postgres --)
fi
"${AS[@]}" env PATH="$PATH" initdb -D "$TMP/data" -U postgres --auth=trust >/dev/null
"${AS[@]}" env PATH="$PATH" pg_ctl -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null

PSQL=(psql -h "$TMP" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$ROOT/supabase/tests/_supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "Aplicando $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -At -f "$ROOT/supabase/tests/rls_test.sql" 2>&1 \
  | sed -e 's/^psql:[^ ]* NOTICE:  /  /' -e '/^$/d' -e '/^aaaa\|^bbbb\|^{/d'
"${PSQL[@]}" -At -f "$ROOT/supabase/tests/rls_fase2_test.sql" 2>&1 \
  | sed -e 's/^psql:[^ ]* NOTICE:  /  /' -e '/^$/d' -e '/^aaaa\|^bbbb\|^{/d'
"${PSQL[@]}" -At -f "$ROOT/supabase/tests/rls_fase3_test.sql" 2>&1 \
  | sed -e 's/^psql:[^ ]* NOTICE:  /  /' -e '/^$/d' -e '/^aaaa\|^bbbb\|^{/d'
"${PSQL[@]}" -At -f "$ROOT/supabase/tests/rls_admin_test.sql" 2>&1 \
  | sed -e 's/^psql:[^ ]* NOTICE:  /  /' -e '/^$/d' -e '/^aaaa\|^bbbb\|^{/d'
