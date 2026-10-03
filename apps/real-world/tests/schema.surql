-- Conduit (RealWorld) admin — SurrealDB schema.
-- Mirrors the Laravel migrations of f1amy/laravel-realworld-example-app:
--   users → user, articles → article, comments → comment, tags → tag,
--   article_tag → article_tag, article_favorite → favorite, author_follower → follow.
-- Validation mirrors the app's FormRequests; ON DELETE CASCADE foreign keys are DEFINE EVENTs.
-- Idempotent: OVERWRITE / IF NOT EXISTS, safe to re-run.

DEFINE NAMESPACE IF NOT EXISTS app;
USE NS app;
DEFINE DATABASE IF NOT EXISTS app;
USE NS app DB app;

-- Shared field rules, repeated per table (SurrealDB has no field inheritance):
--   created_at  set once; seeds may pass a value
--   updated_at  seeds may pass a value on create; every later write stamps now()

-- ─── user ──────────────────────────────────────────────────────────────────
DEFINE TABLE OVERWRITE user SCHEMAFULL;
DEFINE FIELD OVERWRITE username ON user TYPE string
    ASSERT string::len($value) <= 255 AND $value = /^[\p{L}\p{M}\p{N}._-]+$/;
DEFINE FIELD OVERWRITE email ON user TYPE string
    ASSERT string::len($value) <= 255 AND string::is_email($value);
-- Plain text written here is bcrypt-hashed; an existing hash ($2y$/$2b$) is kept as is.
-- Default hash = "password", the Laravel factory's.
DEFINE FIELD OVERWRITE password ON user TYPE string
    DEFAULT "$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi"
    VALUE IF string::starts_with($value, "$2") THEN $value
        ELSE IF string::len($value) < 8 THEN THROW "The password must be at least 8 characters."
        ELSE crypto::bcrypt::generate($value) END;
DEFINE FIELD OVERWRITE bio ON user TYPE option<string>;
DEFINE FIELD OVERWRITE image ON user TYPE option<string>
    ASSERT $value = NONE OR $value = "" OR string::is_url($value);
-- Null (a cleared form field, or the admin's "Mark email unverified") is stored as NONE.
DEFINE FIELD OVERWRITE email_verified_at ON user TYPE option<datetime | null>
    VALUE IF $value = NULL THEN NONE ELSE $value END;
DEFINE FIELD OVERWRITE created_at ON user TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE updated_at ON user TYPE datetime
    VALUE IF $before = NONE AND $value != NONE THEN $value ELSE time::now() END;
DEFINE INDEX OVERWRITE user_username ON user FIELDS username UNIQUE;
DEFINE INDEX OVERWRITE user_email ON user FIELDS email UNIQUE;

-- ─── article ───────────────────────────────────────────────────────────────
DEFINE TABLE OVERWRITE article SCHEMAFULL;
DEFINE FIELD OVERWRITE author ON article TYPE record<user>;
DEFINE FIELD OVERWRITE title ON article TYPE string
    ASSERT string::len($value) > 0 AND string::len($value) <= 255;
-- Left blank, the slug is derived from the title (the API always sends one).
DEFINE FIELD OVERWRITE slug ON article TYPE string
    VALUE IF $value != NONE AND $value != "" THEN $value ELSE string::slug($this.title) END
    ASSERT string::len($value) <= 255;
DEFINE FIELD OVERWRITE description ON article TYPE string
    ASSERT string::len($value) > 0 AND string::len($value) <= 510;
DEFINE FIELD OVERWRITE body ON article TYPE string ASSERT string::len($value) > 0;
DEFINE FIELD OVERWRITE created_at ON article TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE updated_at ON article TYPE datetime
    VALUE IF $before = NONE AND $value != NONE THEN $value ELSE time::now() END;
DEFINE INDEX OVERWRITE article_slug ON article FIELDS slug UNIQUE;
DEFINE INDEX OVERWRITE article_created ON article FIELDS created_at;
DEFINE INDEX OVERWRITE article_author ON article FIELDS author;

-- ─── comment ───────────────────────────────────────────────────────────────
DEFINE TABLE OVERWRITE comment SCHEMAFULL;
DEFINE FIELD OVERWRITE article ON comment TYPE record<article>;
DEFINE FIELD OVERWRITE author ON comment TYPE record<user>;
DEFINE FIELD OVERWRITE body ON comment TYPE string ASSERT string::len($value) > 0;
DEFINE FIELD OVERWRITE created_at ON comment TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE updated_at ON comment TYPE datetime
    VALUE IF $before = NONE AND $value != NONE THEN $value ELSE time::now() END;
DEFINE INDEX OVERWRITE comment_article ON comment FIELDS article;
DEFINE INDEX OVERWRITE comment_author ON comment FIELDS author;
DEFINE INDEX OVERWRITE comment_created ON comment FIELDS created_at;

-- ─── tag ───────────────────────────────────────────────────────────────────
DEFINE TABLE OVERWRITE tag SCHEMAFULL;
DEFINE FIELD OVERWRITE name ON tag TYPE string
    ASSERT string::len($value) > 0 AND string::len($value) <= 255;
DEFINE FIELD OVERWRITE created_at ON tag TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD OVERWRITE updated_at ON tag TYPE datetime
    VALUE IF $before = NONE AND $value != NONE THEN $value ELSE time::now() END;
DEFINE INDEX OVERWRITE tag_name ON tag FIELDS name UNIQUE;

-- ─── article_tag (pivot) ───────────────────────────────────────────────────
DEFINE TABLE OVERWRITE article_tag SCHEMAFULL;
DEFINE FIELD OVERWRITE article ON article_tag TYPE record<article>;
DEFINE FIELD OVERWRITE tag ON article_tag TYPE record<tag>;
DEFINE INDEX OVERWRITE article_tag_unique ON article_tag FIELDS article, tag UNIQUE;
DEFINE INDEX OVERWRITE article_tag_tag ON article_tag FIELDS tag;

-- ─── favorite (article_favorite pivot) ─────────────────────────────────────
-- The Laravel pivot has no timestamps; created_at is added for the admin.
DEFINE TABLE OVERWRITE favorite SCHEMAFULL;
DEFINE FIELD OVERWRITE article ON favorite TYPE record<article>;
DEFINE FIELD OVERWRITE user ON favorite TYPE record<user>;
DEFINE FIELD OVERWRITE created_at ON favorite TYPE datetime DEFAULT time::now() READONLY;
DEFINE INDEX OVERWRITE favorite_unique ON favorite FIELDS article, user UNIQUE;
DEFINE INDEX OVERWRITE favorite_user ON favorite FIELDS user;

-- ─── follow (author_follower pivot) ────────────────────────────────────────
-- `follower` follows `author`.
DEFINE TABLE OVERWRITE follow SCHEMAFULL;
DEFINE FIELD OVERWRITE author ON follow TYPE record<user>;
DEFINE FIELD OVERWRITE follower ON follow TYPE record<user>;
DEFINE FIELD OVERWRITE created_at ON follow TYPE datetime DEFAULT time::now() READONLY;
DEFINE INDEX OVERWRITE follow_unique ON follow FIELDS author, follower UNIQUE;
DEFINE INDEX OVERWRITE follow_follower ON follow FIELDS follower;

-- ─── cascades (the migrations' ->onDelete('cascade')) ──────────────────────
DEFINE EVENT OVERWRITE cascade_user ON TABLE user WHEN $event = "DELETE" THEN {
    DELETE article WHERE author = $before.id;
    DELETE comment WHERE author = $before.id;
    DELETE favorite WHERE user = $before.id;
    DELETE follow WHERE author = $before.id OR follower = $before.id;
};
DEFINE EVENT OVERWRITE cascade_article ON TABLE article WHEN $event = "DELETE" THEN {
    DELETE comment WHERE article = $before.id;
    DELETE favorite WHERE article = $before.id;
    DELETE article_tag WHERE article = $before.id;
};
DEFINE EVENT OVERWRITE cascade_tag ON TABLE tag WHEN $event = "DELETE" THEN {
    DELETE article_tag WHERE tag = $before.id;
};

-- ─── helpers for the admin ─────────────────────────────────────────────────
-- "just now", "5 minutes ago", "3 hours ago", "yesterday", "12 days ago", else "Mar 4, 2026".
DEFINE FUNCTION OVERWRITE fn::ago($t: option<datetime>) -> string {
    IF $t = NONE { RETURN ""; };
    LET $s = duration::secs(time::now() - $t);
    RETURN IF $s < 60 { "just now" }
        ELSE IF $s < 120 { "a minute ago" }
        ELSE IF $s < 3600 { string::concat(math::floor($s / 60), " minutes ago") }
        ELSE IF $s < 7200 { "an hour ago" }
        ELSE IF $s < 86400 { string::concat(math::floor($s / 3600), " hours ago") }
        ELSE IF $s < 172800 { "yesterday" }
        ELSE IF $s < 2592000 { string::concat(math::floor($s / 86400), " days ago") }
        ELSE { time::format($t, "%b %-d, %Y") };
};
