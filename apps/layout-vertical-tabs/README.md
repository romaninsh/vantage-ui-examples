# Northwind Support — vertical tabs

A small Vantage app for a live-chat support console. Open conversations are listed **down the
left side**, with a tool panel on the right that follows the conversation on screen. All the
data comes from the `faker` datasource.

## What to look at

- **A session list.** `nav: vtabs` on the left: one row per open conversation, with pin and
  close buttons, and "New launcher" at the top.
- **One row per conversation.** `key: 'page + ":" + args.id'` brings an open conversation
  forward instead of opening a duplicate tab. Past eight rows the one used longest ago closes;
  cmd-shift-t brings it back.
- **A tool panel.** `view/session_tools.yaml` follows the tab on screen: whichever
  conversation is open, it shows that conversation's customer — plan, lifetime value, country —
  plus a few quick replies. cmd-e hides it.
- **A waiting queue.** A `fifo` feed of new conversations landing, shown on the launcher and on
  its own page; it keeps moving without growing without bound.
- **Live edits keep your tabs.** Delete the `left:` block and save: the list moves inside the
  page area (`placement: vertical`), the project switcher moves to the title bar, and every tab
  stays open.

## The data

- **Customers** — plan, lifetime value and country.
- **Conversations** — topic, channel, status, when it started, the last message, unread count
  and CSAT; each links to a customer.
- **Messages** — every conversation fans out into a handful of messages from the customer and
  the agent, spread over the last two weeks.
- **Waiting queue** — a live feed of new chats landing, each with a topic and an opening
  message.

## Pages

Launcher, Dashboard, Conversations, Waiting queue and About. Open a conversation from the
Launcher or Conversations grid — double-click, or right-click a row for "Open conversation"
with a named tab — to see its messages in time order; the tools panel on the right fills in
with that conversation's customer.
