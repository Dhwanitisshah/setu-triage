# NEWS2 Reference

**This file is the authoritative source for every clinical threshold in Setu's rules engine.**
Code in `web/src/lib/triage/news2-table.ts` must match this file exactly. If the two ever
disagree, this file wins and the code is a bug.

## Source

Royal College of Physicians. *National Early Warning Score (NEWS) 2: Standardising the
assessment of acute-illness severity in the NHS. Updated report of a working party.*
London: RCP, 2017. ISBN 978-1-86016-682-2.

Scoring table transcribed from Chart 1; trigger thresholds from Chart 2.

**Copyright.** The RCP places no copyright restriction on reproducing material from this
publication, but requires acknowledgement as copyright holder. The RCP's own FAQ confirms
that converting NEWS for use in an electronic system carries the same position — acknowledge
the RCP. The official NEWS2 *observation charts* are a separate matter: they must be
reproduced in colour and must not be modified or amended. Setu does not reproduce the charts.

**Naming.** The RCP is explicit that a system with altered parameters or altered scoring may
not be called NEWS. Setu therefore computes the NEWS2 aggregate score **exactly as specified
below, unmodified**. Setu's own green/yellow/red triage banding is a separate layer applied
*on top of* an unmodified NEWS2 score — see "Setu band mapping" at the end.

---

## Scope and exclusions

NEWS2 is validated for **adults aged 16 and over**. It must not be used for:

- **Children under 16.** Physiological response to acute illness differs.
- **Pregnancy.** NEWS may be used up to 20 weeks; from 20 weeks a dedicated obstetric score
  (e.g. MEOWS) should be used instead.

Use with caution — the score may be unreliable — in patients with **spinal cord injury**,
especially tetraplegia or high-level paraplegia, because autonomic disruption distorts pulse,
temperature and blood pressure.

NEWS2 is an aid to clinical assessment, **not a substitute for clinical judgement**. Concern
about a patient should always override the score.

---

## Chart 1 — Scoring system

### Respiration rate (breaths per minute)

| Range | Score |
|---|---|
| ≤ 8 | 3 |
| 9 – 11 | 1 |
| 12 – 20 | 0 |
| 21 – 24 | 2 |
| ≥ 25 | 3 |

### SpO₂ Scale 1 (%) — use for the majority of patients

| Range | Score |
|---|---|
| ≤ 91 | 3 |
| 92 – 93 | 2 |
| 94 – 95 | 1 |
| ≥ 96 | 0 |

### SpO₂ Scale 2 (%) — hypercapnic respiratory failure only

Target saturation range 88–92%. **Only** for patients confirmed to have hypercapnic
respiratory failure on blood gas analysis, and **only** under the direction of a qualified
clinician, with the decision recorded in the patient's notes. In all other circumstances use
Scale 1.

| Range | Score |
|---|---|
| ≤ 83 | 3 |
| 84 – 85 | 2 |
| 86 – 87 | 1 |
| 88 – 92 | 0 |
| ≥ 93 on air | 0 |
| 93 – 94 on oxygen | 1 |
| 95 – 96 on oxygen | 2 |
| ≥ 97 on oxygen | 3 |

Note that Scale 2 requires **both** the SpO₂ value and whether the patient is on air or
oxygen to resolve a score at values of 93 and above.

### Air or oxygen

| State | Score |
|---|---|
| Air | 0 |
| Oxygen | 2 |

The +2 for supplemental oxygen applies regardless of which SpO₂ scale is in use.
"Supplemental oxygen" here means routine delivery by mask or nasal cannula.

### Systolic blood pressure (mmHg)

| Range | Score |
|---|---|
| ≤ 90 | 3 |
| 91 – 100 | 2 |
| 101 – 110 | 1 |
| 111 – 219 | 0 |
| ≥ 220 | 3 |

Diastolic blood pressure is **not** part of the score.

### Pulse (beats per minute)

| Range | Score |
|---|---|
| ≤ 40 | 3 |
| 41 – 50 | 1 |
| 51 – 90 | 0 |
| 91 – 110 | 1 |
| 111 – 130 | 2 |
| ≥ 131 | 3 |

### Consciousness (ACVPU)

| State | Score |
|---|---|
| **A** — Alert | 0 |
| **C** — new Confusion, disorientation, delirium, or any acute reduction in GCS | 3 |
| **V** — responds to Voice | 3 |
| **P** — responds to Pain | 3 |
| **U** — Unresponsive | 3 |

A patient who is awake but confused or disorientated is **not** "Alert" — they score 3 under
C. Where it is unclear whether confusion is new or the patient's normal state, it must be
assumed to be new until confirmed otherwise. Assessment is done in sequence and only one
outcome is recorded.

### Temperature (°C)

| Range | Score |
|---|---|
| ≤ 35.0 | 3 |
| 35.1 – 36.0 | 1 |
| 36.1 – 38.0 | 0 |
| 38.1 – 39.0 | 1 |
| ≥ 39.1 | 2 |

---

## Chart 2 — Thresholds and triggers

| NEW score | Clinical risk |
|---|---|
| Aggregate 0 – 4 | Low |
| **Red score** — 3 in any single parameter | Low – medium |
| Aggregate 5 – 6 | Medium — key threshold for urgent response |
| Aggregate 7 or more | High |

A single red score is explicitly **not** given the same weighting as an aggregate of 5 or
more. This changed in the 2017 update: analysis showed that escalating on a single
parameter scoring 3 would raise workload by around 40% while improving detection of adverse
outcomes by only about 3%.

An aggregate of 5 or more in a patient with known, suspected, or high risk of infection
should raise suspicion of **sepsis**.

---

## Easy to get wrong

These are the transcription errors most likely to slip through code review. Check each one
against the tables above before shipping.

- **Temperature ≥ 39.1 scores 2, not 3.** Temperature is the only parameter whose top band is
  not 3.
- **Pulse 41–50 scores 1, not 2.** The pulse scale is asymmetric around normal.
- **Respiration 9–11 scores 1 but 21–24 scores 2.** Also asymmetric.
- **Systolic BP has no score-2 band on the high side.** It jumps 0 → 3 at 220.
- **All of C, V, P and U score 3 identically.** NEWS2 does not distinguish severity within
  them.
- **Scale 2 is not Scale 1 shifted.** It is a different table with a different shape, and
  three of its bands depend on air-vs-oxygen.

## Implementation notes

- **Boundaries are inclusive.** A respiration rate of exactly 24 scores 2; exactly 25 scores 3.
  Every band in this file includes both endpoints.
- **Temperature is the only decimal parameter.** All others are integers.
- **A missing parameter must never be scored 0.** Absence of data is not evidence of a normal
  value. Setu records it as missing and flags the assessment for manual review.
- **Do not modify the score.** Any change to parameters, bands, or aggregation invalidates the
  score and means it may no longer be called NEWS.

---

## Setu band mapping

Setu presents three bands where NEWS2 defines four risk levels, so a mapping decision is
required. This mapping is **Setu's product decision, not part of NEWS2**, and is documented
separately in `docs/TRIAGE_BANDS.md`.

| Setu band | Condition |
|---|---|
| red | aggregate ≥ 7 |
| yellow | aggregate 5 – 6, or 3 in any single parameter |
| green | aggregate 0 – 4 with no single parameter scoring 3 |

Placing a single red score in yellow alongside an aggregate of 5–6 is **more conservative
than NEWS2**, which grades a single red score as low–medium and an aggregate of 5–6 as
medium. Three bands cannot represent four levels; erring upward is the safer direction.

Any additional hard override rules Setu applies beyond NEWS2 must be listed explicitly in
`docs/TRIAGE_BANDS.md` and labelled as Setu-specific, so that Setu's NEWS2 score remains
honestly describable as unmodified NEWS2.
