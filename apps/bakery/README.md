# Breg 🥐 — five minutes that show you what Vantage is

## Running on the real thing

- You're on **SurrealDB** right now. Don't take our word for it — hit the layers button in the title bar: there's the container, its health, its log, and a Stop button.
- Vantage started it, Vantage will stop it when you quit — and it'll be back, *data intact*, when you return.
- Local is just the default: flip the **profile** and this same app runs against *your* SurrealDB server with *your* auth. Nothing else changes.

## An empty database, on purpose 🎬

The database starts **empty** because filling it is the show. Vantage executes commands for you — **inside docker containers**, so nothing touches your machine — and every one is inspectable on the Services tab while it runs.

- **Actions take forms.** Seeding asks for a size; the campaign asks for a slogan. That form stays identical even when the action behind it moves to a cloud service — the button neither knows nor cares where the work happens.
- **The terminal is the real thing.** Full TTY, colours, progress bars redrawing in place, instant feedback. And it never holds you hostage: while a command runs, every grid keeps refreshing on its own.

## Now the fun part ✨

There are **no clients yet**. Go to the Clients tab and hit **✨ More clients**: pick a slogan, tick some channels, launch.

> Watch Sue Doe spot your billboard, sign up, order, and — sometimes — ghost her invoice.

Send the campaign to the **background** and wander: dashboard, orders, invoices, all rippling in real time. Stop it from Services whenever you've seen enough.

*One honest footnote:* plenty of columns here are **calculated** — a client's balance is invoices minus payments, worked out on read. SurrealDB won't tell us to reload a client when an invoice's status flips; that's solvable with custom change handling, and deliberately out of scope for this demo.
