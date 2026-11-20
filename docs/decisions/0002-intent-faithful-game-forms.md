# 0002 — Intent-faithful game forms using independent axes

**Status:** Accepted existing product decision, recorded retrospectively.
**Recorded:** November 18, 2026 (America/New_York).
**Decision source/date:** [Game Intelligence standard](../game-intelligence/README.md), established November 18, 2026, and [Bubble Gum PR #40](https://github.com/jzwyrzyk/family-game-factory/pull/40). Source reviewed at application `493eb9ce2a98de5f3be8f6d17e63dfe2f6a7e3a7`.

## Context

The Bubble Gum review exposed a mismatch: a physical workshop complicated a simple sticker-assembly idea and its launch payoff. A robot route puzzle likewise needs clear discrete actions, while a hill-driving game may need real suspension and grip. An available engine or the theme of a game is insufficient reason to choose its simulation.

## Decision

Capture the requested action, state change, feedback, goal or free-play behavior and essential payoff. Choose rendering, input, simulation, style and play mode separately. Use the simplest method that preserves those requirements. Rule-driven 2D suits many ideas; physical simulation is appropriate when material physical causes determine the experience or physics is explicitly requested.

A true 3D requirement cannot be represented as fulfilled by an isometric picture or 2D animation. Ambiguous or unsupported essentials remain unresolved until clarified or supported. When editing an existing game, preserve its verified form unless an explicit migration is requested and reviewed.

## Consequences and limits

- The requested memorable outcome is an acceptance requirement, not optional decoration.
- An architecture recommendation is not proof that the resulting game works. Independently observe the requested controls and consequences.
- Keep idea fidelity, form fit, technical playability and actual child experience separate; no composite score can conceal an untested dimension.
- PR #40 made sticker construction the new Bubble Gum default while preserving old physical and original saved versions. That choice does not claim to repair all defects in the older physics engine.
- The lexical Game Intelligence implementation is a bounded proposal mechanism. Its reference fixtures do not prove arbitrary intent understanding, novel-game reliability or fun. Runtime support and worker integration remain facts to verify separately.

## Evidence and related documents

- [O2 game-form contract and explicit contrasts](../game-intelligence/objective-02-game-form.md).
- [Cross-vertical review and failure examples](../game-intelligence/cross-vertical-standard.md).
- [Game Intelligence objective evidence](../game-intelligence/objective-roadmap.md).
- [Current architecture](../../ARCHITECTURE-CURRENT.md) and [delivery state](../../DELIVERY-STATE.md) own current capabilities and operational evidence.
