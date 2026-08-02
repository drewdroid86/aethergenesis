---
name: astrobiology
description: Use when working on AstrobiologyEngine.ts, habitability scoring, HabitabilityState, extinction events, life emergence triggers, habitable zone migration, atmosphere retention, snowball states, moist greenhouse threshold, or the astrobiology panel UI components. Also triggers when Gemini is being prompted to answer habitability questions.
version: 1.0.0
---

# Astrobiology Skill

## Habitability Score Components

All scores are 0.0–1.0. compositeScore is a weighted product.

| Score | Condition for 1.0 |
|---|---|
| orbitalScore | Planet inside HZ bounds |
| thermalScore | Surface T between 273–373 K |
| atmosphereScore | Escape velocity > thermal velocity of H₂O |
| stellarActivityScore | UV flux below sterilization threshold |
| ageScore | System age > 1 Gyr (life needs time) |

## Key Thresholds

| Event | Condition |
|---|---|
| Snowball state | T_surface < 233 K |
| Moist greenhouse | T_surface > 340 K |
| Atmosphere loss | v_esc < 6 × v_thermal |
| Sterilization | Supernova within 25 ly |
| Life emergence | compositeScore > 0.65 for > 500 Myr |

## Gemini Integration Rule

When Gemini analyzes habitability, it must receive the full
HabitabilityState JSON — not just a phase name or a summary.
The prompt must include: compositeScore, isInHabitableZone,
extinctionRiskLevel, and triggered_at_yr for each event.
