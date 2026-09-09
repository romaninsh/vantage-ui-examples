#!/usr/bin/env python3
"""Animated, never-ending muffin baker for the Vantage terminal demo.

Exercises the read-only VT terminal: spinners, in-place multi-bar
progress (cursor up/down redraws, like `docker pull`), 16/256/truecolor
ANSI, wide chars + emoji, and a long hyperlink that wraps.

It runs forever. SIGINT (Ctrl+C — what the dialog's Stop button sends) is
trapped for a *graceful* shutdown: the baker finishes the batch currently
in the oven, cools the oven down, and then exits. A second Stop in the UI
sends a hard kill if you're impatient.
"""

import itertools
import random
import signal
import sys
import time

# --- tiny ANSI toolkit -----------------------------------------------------

RESET = "\x1b[0m"
BOLD = "\x1b[1m"
DIM = "\x1b[2m"
CURSOR_UP = "\x1b[{n}A"
CLEAR_LINE = "\x1b[2K"


def c256(n):
    return f"\x1b[38;5;{n}m"


def rgb(r, g, b):
    return f"\x1b[38;2;{r};{g};{b}m"


def out(s):
    sys.stdout.write(s)
    sys.stdout.flush()


# --- graceful stop ---------------------------------------------------------

STOPPING = False


def on_sigint(_signum, _frame):
    # Don't abandon a half-baked batch: flag the request, let the current
    # batch finish, then the main loop cools the oven down and exits.
    global STOPPING
    if STOPPING:
        return
    STOPPING = True
    out(f"\r\n{BOLD}{c256(45)}🧊 stop received{RESET} — finishing this batch, "
        f"then cooling the oven down…\r\n")


signal.signal(signal.SIGINT, on_sigint)


# --- baking ----------------------------------------------------------------

FLAVOURS = [
    ("🫐", "blueberry", rgb(70, 90, 200)),
    ("🍫", "double-choc", rgb(120, 72, 40)),
    ("🍋", "lemon-poppy", rgb(220, 200, 40)),
    ("🎃", "pumpkin-spice", rgb(210, 120, 30)),
    ("🍎", "apple-cinnamon", rgb(190, 60, 50)),
    ("🥕", "carrot-walnut", rgb(200, 120, 40)),
]

SPINNER = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
RECIPE_URL = (
    "https://surreal-bakery.example.com/recipes/seasonal/blueberry-muffin"
    "?oven=preheated&batch={n}&ingredient=blueberries&note=extra-long-link-"
    "that-should-wrap-across-the-terminal-width-without-any-horizontal-scroll"
)


def preheat(target=220):
    out(f"\r\n{BOLD}🔥 Preheating oven{RESET} to {target}°C\r\n")
    temp = 18
    spin = itertools.cycle(SPINNER)
    while temp < target:
        temp = min(target, temp + random.randint(8, 22))
        bar = heat_bar(temp, target)
        out(f"\r{CLEAR_LINE}  {c256(214)}{next(spin)}{RESET} {bar} "
            f"{BOLD}{temp:>3}°C{RESET}")
        time.sleep(0.12)
    out(f"\r{CLEAR_LINE}  {c256(46)}✓{RESET} oven ready at {BOLD}{target}°C{RESET} 🔥\r\n\r\n")


def heat_bar(temp, target, width=24):
    filled = int(width * temp / target)
    cells = ""
    for i in range(width):
        if i < filled:
            # gradient blue→red as it heats
            frac = i / width
            cells += rgb(int(60 + 195 * frac), int(120 * (1 - frac)), int(200 * (1 - frac))) + "█"
        else:
            cells += DIM + "·"
    return cells + RESET


def bake_batch(n):
    trays = random.sample(FLAVOURS, k=random.randint(3, 5))
    progress = [0] * len(trays)
    speeds = [random.uniform(2.5, 7.0) for _ in trays]

    out(f"{BOLD}Batch #{n}{RESET}  {DIM}— {len(trays)} trays in the oven{RESET}\r\n")
    # Reserve one line per tray; we'll repaint them in place.
    for _ in trays:
        out("\r\n")

    while any(p < 100 for p in progress):
        # Jump back up to the first tray line and repaint each.
        out(CURSOR_UP.format(n=len(trays)))
        for i, (emoji, name, colour) in enumerate(trays):
            progress[i] = min(100, progress[i] + random.uniform(0, speeds[i]))
            out(f"\r{CLEAR_LINE}{tray_line(emoji, name, colour, progress[i])}\r\n")
        time.sleep(0.09)

    done = " ".join(emoji for emoji, _, _ in trays)
    out(f"{c256(46)}✓ Batch #{n} out of the oven{RESET}  {done}\r\n")
    if n % 3 == 0:
        out(f"{DIM}recipe:{RESET} {RECIPE_URL.format(n=n)}\r\n")
    out("\r\n")


def tray_line(emoji, name, colour, pct, width=28):
    filled = int(width * pct / 100)
    bar = colour + "▰" * filled + RESET + DIM + "▱" * (width - filled) + RESET
    status = f"{c256(46)}done 🧁{RESET}" if pct >= 100 else f"{int(pct):>3}%"
    return f"  {emoji} {BOLD}{name:<16}{RESET} [{bar}] {status}"


def cooldown(start=220, target=20):
    out(f"\r\n{BOLD}🧊 Cooling oven down{RESET}\r\n")
    temp = start
    spin = itertools.cycle(SPINNER)
    while temp > target:
        temp = max(target, temp - random.randint(8, 20))
        bar = heat_bar(temp, start)
        out(f"\r{CLEAR_LINE}  {c256(45)}{next(spin)}{RESET} {bar} "
            f"{BOLD}{temp:>3}°C{RESET}")
        time.sleep(0.1)
    out(f"\r{CLEAR_LINE}  {c256(46)}✓{RESET} oven cool at {BOLD}{target}°C{RESET}\r\n")
    out(f"\r\n{BOLD}Goodbye — thanks for baking 🧁{RESET}\r\n")


def main():
    out(f"{BOLD}{c256(213)}🧁 Surreal Bakery — test oven{RESET} "
        f"{DIM}(streaming from a PTY; Stop finishes the batch, then cools down){RESET}\r\n")
    preheat()
    n = 1
    # `STOPPING` is set by the SIGINT handler. We never cut a batch short:
    # finish whatever is in the oven, then drop out and cool down.
    while not STOPPING:
        bake_batch(n)
        if STOPPING:
            break
        time.sleep(random.uniform(0.4, 1.0))
        n += 1
    cooldown()


if __name__ == "__main__":
    main()
