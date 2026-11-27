# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Users
Cashiers at a busy café counter (Djoeragan Kopitiam outlets in Indonesia), ringing up mostly counter and take-away orders during rush hours; speed, big touch targets and reading the order at a glance matter most. Managers use the same tablet for approvals (manager PIN), shifts, refunds and small menu edits.

## Product Purpose
Orda is the café's own point-of-sale app: take orders, print kitchen tickets and receipts, take payment, run cash shifts, and keep working offline, syncing to the owner's backoffice when online.

## Operating Context
- Shared counter tablet (Samsung Galaxy Tab A11, landscape) unlocked per employee with a 4-digit PIN; also runs on phones (e.g. Galaxy S26 Ultra, portrait).
- Receipt printers over Bluetooth, Wi-Fi or USB; charging always prints any unsent order tickets.
- Bilingual UI: English and Indonesian.

## Capabilities and Constraints
- React Native / Expo, Android only; custom in-app components only (no native dropdowns or pickers).
- Performance on low-cost tablets is a hard constraint: memoised menu tiles and order lines, stable list props, POS page kept mounted, animations on the native driver.

## Brand Commitments
- Djoeragan Kopitiam logo and the existing deep green accent stay.
- Refine the current look (menu left, order right on tablets), not a redesign.

## Product Principles
- Speed at the counter beats decoration: the next tap is always obvious.
- One clear primary action per screen (Charge on the POS page).
- Calm, uncluttered screens that stay legible in a busy, brightly lit café.
