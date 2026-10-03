#!/usr/bin/env python3
"""Generate tests/seed.surql — the Laravel DatabaseSeeder's shape with readable content.

20 users, each followed by 0–5 others; 30 articles by random authors; 20 tags,
0–6 per article; 0–8 favorites per article; 60 comments. Fixed random seed, so the
output (and the counts tests/admin_test.sh expects) is stable.

    python3 tests/gen_seed.py > tests/seed.surql
"""
import random
import re
import unicodedata
from datetime import datetime, timedelta, timezone

rng = random.Random(42)
NOW = datetime(2026, 9, 14, 12, 0, tzinfo=timezone.utc)

USERS = [
    ("jake", "Jake Harlow", "I work at a small studio and write about the web platform."),
    ("anna.k", "Anna Kowalska", "Accessibility advocate. Coffee, keyboards, screen readers."),
    ("dmitri_v", "Dmitri Volkov", None),
    ("sofia-m", "Sofia Marquez", "Backend engineer. Databases are my love language."),
    ("tomasz", "Tomasz Nowak", "Rust in the day, sourdough at night."),
    ("priya.r", "Priya Raman", "Design systems at scale. Previously a print designer."),
    ("liam_o", "Liam O'Connor", None),
    ("mei.lin", "Mei Lin", "Writing about distributed systems and the people who run them."),
    ("oliver", "Oliver Brandt", "CTO of a 12-person startup. Opinions are mine."),
    ("grace.h", "Grace Hopkins", "Teaching kids to code on weekends."),
    ("yusuf", "Yusuf Demir", "Mobile developer, occasional speaker."),
    ("chloe_b", "Chloé Bernard", None),
    ("mateo", "Mateo Rossi", "Performance nerd. I measure things."),
    ("hannah.s", "Hannah Schmidt", "Product engineer. Shipping small, shipping often."),
    ("kwame", "Kwame Mensah", "Infrastructure and developer tooling."),
    ("lucia_f", "Lucía Fernández", None),
    ("noah.w", "Noah Williams", "Security engineer. Please rotate your keys."),
    ("aiko", "Aiko Tanaka", "Frontend, typography, and good defaults."),
    ("ben.c", "Ben Carter", None),
    ("elena_p", "Elena Petrova", "Data engineer turned engineering manager."),
]

TAGS = [
    "javascript", "rust", "databases", "accessibility", "css", "career", "testing",
    "devops", "security", "performance", "design", "php", "laravel", "architecture",
    "open-source", "mobile", "ai", "productivity", "surrealdb", "tutorial",
]

TITLES = [
    "Why accessibility is a feature, not a checklist",
    "Getting started with Laravel queues",
    "The hidden cost of premature abstraction",
    "Five CSS layout tricks I use every week",
    "How we cut our cloud bill in half",
    "Writing tests that survive refactoring",
    "Rust ownership explained with coffee cups",
    "Designing a schema you will not regret",
    "What I learned mentoring junior developers",
    "Graph queries without a graph database",
    "A practical guide to rate limiting",
    "Stop storing money as floats",
    "Dark mode done right",
    "Code review etiquette for busy teams",
    "From monolith to modules, slowly",
    "Securing your API tokens in five minutes",
    "The case for boring technology",
    "Measuring frontend performance that users feel",
    "Building a design system from scratch",
    "Understanding database indexes visually",
    "My remote work setup after five years",
    "Feature flags without the mess",
    "An introduction to SurrealDB record links",
    "Debugging production with structured logs",
    "Mobile-first forms that people finish",
    "Open source maintenance is a job",
    "When to reach for an AI assistant and when not to",
    "Migrations that never lock your tables",
    "The joy of small pull requests",
    "Pagination patterns compared",
]

COMMENTS = [
    "Great write-up, thanks for sharing!",
    "This finally made it click for me.",
    "I disagree with the second point, but the rest is spot on.",
    "Do you have a repository with the example code?",
    "We ran into exactly this last month.",
    "Bookmarked. Sending this to my whole team.",
    "Could you expand on the trade-offs a bit more?",
    "Nice article, but the benchmark seems a bit synthetic.",
    "Tried this today and it worked on the first attempt.",
    "Any thoughts on how this scales past a million rows?",
    "The diagrams really help.",
    "I wish I had read this two years ago.",
    "Small typo in the third paragraph, otherwise perfect.",
    "How does this compare to the approach in your previous post?",
    "Solid advice. Boring technology wins again.",
]

SENTENCES = [
    "Most teams discover this the hard way, usually on a Friday afternoon.",
    "The trick is to make the right thing the easy thing.",
    "Start with the smallest change that could possibly work.",
    "Measure first, then decide what to optimise.",
    "Naming matters more than we like to admit.",
    "Every abstraction leaks eventually; plan for it.",
    "Your future self is the most important reader of your code.",
    "Defaults shape behaviour far more than documentation does.",
    "Nothing replaces talking to the people who use what you build.",
    "Automate the second time, not the first.",
    "Constraints in the database outlive every application that talks to it.",
    "Readable code is cheaper than clever code.",
]


def slugify(text):
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")


def key(text):
    return slugify(text).replace("-", "_")


def ts(dt):
    return 'd"' + dt.strftime("%Y-%m-%dT%H:%M:%SZ") + '"'


def between(start, end=NOW):
    span = (end - start).total_seconds()
    return start + timedelta(seconds=rng.uniform(0, span))


def q(text):
    return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'


def paragraph(n):
    return " ".join(rng.sample(SENTENCES, n))


out = [
    "-- Generated by tests/gen_seed.py — do not edit by hand.",
    "-- Load after schema.surql. Wipes and re-creates all Conduit data.",
    "USE NS app DB app;",
    "BEGIN TRANSACTION;",
    "DELETE article_tag; DELETE favorite; DELETE follow; DELETE comment; DELETE article; DELETE tag; DELETE user;",
]

# Users — created over the last year, a third never verified their email.
users = []
for username, name, bio in USERS:
    k = key(username)
    created = between(NOW - timedelta(days=365), NOW - timedelta(days=150))
    updated = created if rng.random() < 0.5 else between(created)
    verified = None if rng.random() < 0.3 else created + timedelta(minutes=rng.randint(2, 600))
    email = slugify(name).replace("-", ".") + "@example.com"
    fields = [f"username = {q(username)}", f"email = {q(email)}"]
    if bio:
        fields.append(f"bio = {q(bio)}")
    if rng.random() < 0.6:
        fields.append(f'image = "https://api.dicebear.com/9.x/initials/png?seed={k}"')
    if verified:
        fields.append(f"email_verified_at = {ts(verified)}")
    fields += [f"created_at = {ts(created)}", f"updated_at = {ts(updated)}"]
    out.append(f"CREATE user:{k} SET " + ", ".join(fields) + ";")
    users.append((k, created))

# Follows — $user->followers()->attach($users->random(rand(0, 5)))
for k, created in users:
    for fk, fcreated in rng.sample(users, rng.randint(0, 5)):
        if fk == k:
            continue
        at = between(max(created, fcreated))
        out.append(f"CREATE follow SET author = user:{k}, follower = user:{fk}, created_at = {ts(at)};")

# Tags
tags = []
for name in TAGS:
    created = between(NOW - timedelta(days=365), NOW - timedelta(days=160))
    out.append(f"CREATE tag:{key(name)} SET name = {q(name)}, created_at = {ts(created)}, updated_at = {ts(created)};")
    tags.append(key(name))

# Articles — mostly the last 120 days, so dashboards have a shape.
articles = []
for title in TITLES:
    author, author_created = rng.choice(users)
    created = between(max(author_created, NOW - timedelta(days=120)))
    updated = created if rng.random() < 0.75 else between(created)
    body = "\n\n".join(paragraph(rng.randint(3, 5)) for _ in range(rng.randint(2, 4)))
    k = key(title)
    out.append(
        f"CREATE article:{k} SET author = user:{author}, slug = {q(slugify(title))}, title = {q(title)}, "
        f"description = {q(paragraph(2))}, body = {q(body)}, "
        f"created_at = {ts(created)}, updated_at = {ts(updated)};"
    )
    articles.append((k, created))

# Tags and favorites per article
for k, created in articles:
    for t in rng.sample(tags, rng.randint(0, 6)):
        out.append(f"CREATE article_tag SET article = article:{k}, tag = tag:{t};")
    for u, _ in rng.sample(users, rng.randint(0, 8)):
        out.append(f"CREATE favorite SET article = article:{k}, user = user:{u}, created_at = {ts(between(created))};")

# Comments
comments = []
for _ in range(60):
    k, created = rng.choice(articles)
    author, _ = rng.choice(users)
    comments.append((between(created), k, author, rng.choice(COMMENTS)))
for i, (at, k, author, body) in enumerate(sorted(comments), start=1):
    out.append(
        f"CREATE comment:c{i:03d} SET article = article:{k}, author = user:{author}, "
        f"body = {q(body)}, created_at = {ts(at)}, updated_at = {ts(at)};"
    )

out.append("COMMIT TRANSACTION;")
print("\n".join(out))
