#!/usr/bin/env bash
# Conduit admin invariants, checked against the live SurrealDB stack.
#   tests/admin_test.sh <compose project from services_status>
# Expects schema.surql + seed.surql loaded (needs user:jake). Writes only scratch rows, and removes them.
set -uo pipefail
cd "$(dirname "$0")/.."

P="${1:?compose project name from services_status}"
Q() { printf '%s\n' "$1" | docker compose -p "$P" -f composer.yaml exec -T surrealdb /surreal sql \
      -e http://127.0.0.1:8000 -u root -p root --ns app --db app --json --hide-welcome 2>/dev/null | grep '^\[' | tail -1; }
Q 'RETURN 1;' | grep -q 1 || { echo "surrealdb service not running"; exit 1; }

fail=0
check() { if [ "$2" = "$3" ]; then echo "ok - $1"; else echo "FAIL - $1 (expected $2, got $3)"; fail=1; fi }
count() { Q "SELECT count() AS c FROM $1 GROUP ALL;"; }
n() { printf '[[{"c":%s}]]' "$1"; }
# rejects <expected error fragment> <query>: "yes" when the database refuses the write with that error
rejects() { local r; r=$(Q "$2"); if [[ "$r" == *"$1"* ]]; then echo yes; else echo "$r"; fi; }

# Row counts (informational: the seed creates 20/30/60/20/90/108/50; app edits change them)
for t in user article comment tag article_tag favorite follow; do echo "# $t: $(count $t)"; done
users_before=$(count user); comments_before=$(count comment); tags_before=$(count tag)

# Referential integrity: no link points at a missing record
check "no orphan articles" "$(n 0)" "$(count 'article WHERE author.id IS NONE')"
check "no orphan comments" "$(n 0)" "$(count 'comment WHERE article.id IS NONE OR author.id IS NONE')"
check "no orphan article tags" "$(n 0)" "$(count 'article_tag WHERE article.id IS NONE OR tag.id IS NONE')"
check "no orphan favorites" "$(n 0)" "$(count 'favorite WHERE article.id IS NONE OR user.id IS NONE')"
check "no orphan follows" "$(n 0)" "$(count 'follow WHERE author.id IS NONE OR follower.id IS NONE')"
check "nobody follows themselves in the seed" "$(n 0)" "$(count 'follow WHERE author = follower')"

# Validation (mirrors the Laravel FormRequests)
check "username regex rejects spaces" yes "$(rejects 'must conform' 'CREATE user:zz_bad SET username = "has space", email = "zz@example.com";')"
check "email must be an email" yes "$(rejects 'must conform' 'CREATE user:zz_bad SET username = "zz_bad", email = "nope";')"
check "username is unique" yes "$(rejects 'already contains' 'CREATE user:zz_bad SET username = "jake", email = "zz@example.com";')"
check "password needs 8+ characters" yes "$(rejects 'at least 8' 'CREATE user:zz_bad SET username = "zz_bad", email = "zz@example.com", password = "short";')"
check "a follow pair is unique" yes "$(rejects 'already contains' 'CREATE follow SET author = user:jake, follower = user:jake; CREATE follow SET author = user:jake, follower = user:jake;')"
Q 'DELETE follow WHERE author = user:jake AND follower = user:jake; DELETE user:zz_bad;' >/dev/null

# Scratch user + article: hashing, slug default, updated_at stamping, cascades
Q 'DELETE user:zz_scratch; DELETE user:zz_fan; DELETE tag:zz_scratch;' >/dev/null
Q 'CREATE user:zz_scratch SET username = "zz_scratch", email = "zz.scratch@example.com", password = "correct horse", created_at = d"2026-01-01T00:00:00Z", updated_at = d"2026-01-01T00:00:00Z";' >/dev/null
check "plain password is stored as a bcrypt hash" '[["$2b"]]' "$(Q 'SELECT VALUE string::slice(password, 0, 3) FROM user:zz_scratch;')"
check "stored hash verifies" '[[true]]' "$(Q 'SELECT VALUE crypto::bcrypt::compare(password, "correct horse") FROM user:zz_scratch;')"
Q 'UPDATE user:zz_scratch SET email_verified_at = time::now();' >/dev/null
Q 'UPDATE user:zz_scratch SET email_verified_at = NULL;' >/dev/null
check "clearing email_verified_at (null) unverifies" '[[true]]' "$(Q 'SELECT VALUE email_verified_at = NONE FROM user:zz_scratch;')"
Q 'UPDATE user:zz_scratch SET bio = "touched";' >/dev/null
check "an update stamps updated_at" '[[true]]' "$(Q 'SELECT VALUE updated_at > d"2026-06-01T00:00:00Z" FROM user:zz_scratch;')"
check "created_at is kept on update" '[["2026-01-01T00:00:00Z"]]' "$(Q 'SELECT VALUE <string> created_at FROM user:zz_scratch;')"

Q 'CREATE user:zz_fan SET username = "zz_fan", email = "zz.fan@example.com";
   CREATE tag:zz_scratch SET name = "zz-scratch";
   CREATE article:zz_scratch SET author = user:zz_scratch, title = "Scratch Article Title", description = "d", body = "b";
   CREATE comment:zz_scratch SET article = article:zz_scratch, author = user:zz_fan, body = "hi";
   CREATE favorite SET article = article:zz_scratch, user = user:zz_fan;
   CREATE article_tag SET article = article:zz_scratch, tag = tag:zz_scratch;
   CREATE follow SET author = user:zz_scratch, follower = user:zz_fan;' >/dev/null
check "blank slug is derived from the title" '[["scratch-article-title"]]' "$(Q 'SELECT VALUE slug FROM article:zz_scratch;')"

Q 'DELETE tag:zz_scratch;' >/dev/null
check "deleting a tag removes its article tags" "$(n 0)" "$(count 'article_tag WHERE article = article:zz_scratch')"

Q 'DELETE user:zz_scratch;' >/dev/null
check "deleting a user removes their articles" "$(n 0)" "$(count 'article WHERE id = article:zz_scratch')"
check "…and, through the article, its comments" "$(n 0)" "$(count 'comment WHERE id = comment:zz_scratch')"
check "…and its favorites" "$(n 0)" "$(count 'favorite WHERE user = user:zz_fan')"
check "…and follows either way" "$(n 0)" "$(count 'follow WHERE follower = user:zz_fan')"
Q 'DELETE user:zz_fan;' >/dev/null

check "user count unchanged after scratch work" "$users_before" "$(count user)"
check "comment count unchanged after scratch work" "$comments_before" "$(count comment)"
check "tag count unchanged after scratch work" "$tags_before" "$(count tag)"

if [ "$fail" = 0 ]; then echo "PASS: Conduit invariants hold"; else echo "FAIL"; exit 1; fi
