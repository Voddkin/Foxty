# FOxty — Gemini Bootstrap

Version: 0.1

## PURPOSE

This repository is the foundational specification of the Foxty project.

Foxty is not yet implemented.

The Markdown documents in this repository define the conceptual,
behavioral, architectural, privacy, and operational requirements
for the future Discord bot.

The repository is the primary source of truth for the project.

---

## AUTHORITY ORDER

When interpreting project requirements, use this order:

1. explicit current user instructions;
2. this repository's documentation;
3. later approved project decisions;
4. implementation conventions.

Do not invent project requirements when the documentation has not
defined them.

---

## IMPORTANT DISTINCTION

This repository currently contains SPECIFICATION, not a finished
application.

The first implementation phase is intentionally incomplete.

Do not mistake absence of code for missing requirements.

---

## PROJECT CHARACTER

Foxty is intended to become:

- a Discord-resident character;
- a purple anthropomorphic male fox;
- highly contextual;
- observant;
- intelligent;
- playful;
- occasionally chaotic;
- capable of spontaneous interaction;
- capable of tools and real Discord actions;
- powered conversationally by DeepSeek;
- controlled operationally by deterministic application code.

---

## ARCHITECTURAL PRINCIPLE

AI interprets.

Core validates.

Tools execute.

Memory persists.

Events orchestrate.

Discord materializes.

The language model must never receive unrestricted direct control
over the Discord API.

---

## DEVELOPMENT PRINCIPLE

Do not reduce Foxty into a conventional chatbot.

Do not reduce Foxty into a collection of slash commands.

Do not reduce the personality system into random phrase selection.

Do not reduce memory into an indiscriminate message archive.

Do not reduce behavioral analysis into keyword matching.

---

## CURRENT STATUS

Phase:
FOUNDATION → IMPLEMENTATION

The next objective is to build the technical skeleton capable of
supporting the documented systems.

Do not attempt to implement every future feature at once.

---

## EXPECTED INITIAL RESULT

The first implementation should establish:

- project structure;
- configuration system;
- secrets handling;
- Discord adapter;
- core engine;
- event engine;
- memory abstraction;
- state abstraction;
- personality abstraction;
- behavioral analysis abstraction;
- DeepSeek adapter;
- structured model output;
- tool abstraction;
- tool validation;
- protected-channel system;
- logging;
- tests.

---

## UI

Foxty is primarily a Discord bot.

If the Build environment requires a visual application preview,
create only the smallest possible technical/diagnostic shell.

Do not turn Foxty into a web product.

Do not spend implementation effort on:

- landing pages;
- marketing;
- dashboards;
- decorative interfaces;
- fake Discord interfaces;
- meaningless buttons.

The Discord bot is the actual product.

---

## DOCUMENTATION BEHAVIOR

Before implementing a subsystem, identify the relevant
documentation files and use them as the specification.

When documentation conflicts with an implementation convenience,
preserve the documented behavior and adapt the implementation.

When the documentation is genuinely ambiguous,
identify the ambiguity instead of silently inventing a rule.

---

## FUTURE EXPANSION

The architecture must support future addition of:

- richer memory;
- behavioral analysis;
- spontaneous events;
- rarity;
- Minecraft-related context;
- additional Discord tools;
- SakuraMail integration;
- audio;
- generated files;
- more sophisticated state;
- additional DeepSeek capabilities.

Do not implement all of these during the first phase unless
explicitly requested.

---

## FINAL PRINCIPLE

Build the body first.

The personality will later inhabit it.