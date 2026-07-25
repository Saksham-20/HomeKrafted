# Homekrafted — Claude Code Handoff

A multi-service home-craft platform: **Gifting Marketplace**, **Laundry / Cleaning / Ironing**, **Snacks (WhatsApp)**, **Food Delivery (app promo)**, unified by a **single Wallet** and shared account layer.

This folder is a self-contained handoff package for engineering.

## Contents

| Path | What it is |
|------|-----------|
| `README.md` | This file — start here |
| `design-system/design-system.md` | Full visual language: color, type, spacing, components, states |
| `design-system/tokens.css` | Design tokens as CSS custom properties — drop into any build |
| `design-system/tokens.json` | Same tokens as JSON (for JS/Tailwind/Style Dictionary) |
| `design-system/components.md` | Component inventory with anatomy + prop notes |
| `specs/features.md` | Complete product spec (all modules, channel rules) |
| `specs/screens.md` | Screen-by-screen breakdown of the prototype |
| `specs/image-specs.md` | Exact photo / reel / QR dimensions per slot |
| `prototype/Homekrafted.dc.html` | The working hi-fi prototype (reference implementation) |

## Design principles

1. **White-first, warm accents.** Backgrounds are white/near-white; warmth comes from pine-green, gold and terracotta accents — never from beige fills.
2. **One home, three crafts.** Marketplace, Laundry and Snacks share chrome, wallet, and account. Keep the visual family tight.
3. **Channel honesty.** Some flows are web, some app-only, some WhatsApp. Always label the channel (badges: "Book online now", "On the app · Coming soon", "Order on WhatsApp").
4. **Placeholders, not fake art.** Every image is a labelled slot at a fixed ratio (see `specs/image-specs.md`). Don't ship illustrated food.

## Stack-agnostic

Tokens and components are framework-neutral. The prototype is a single-file reference; rebuild in your framework of choice using `tokens.css` + `components.md` as the contract.
