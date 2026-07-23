# Triage Bands

This document is the authoritative list of every Setu product decision layered on top
of NEWS2: the green/yellow/red band mapping, and every hard override rule that can set
or change a band or force manual review. It is the file `docs/NEWS2_REFERENCE.md`
points to when it says additional overrides "must be listed explicitly ... and labelled
as Setu-specific."

**The NEWS2 aggregate score itself is computed exactly as specified in
[`docs/NEWS2_REFERENCE.md`](./NEWS2_REFERENCE.md), unmodified.** Nothing in this
document changes how a parameter is scored or how the aggregate is summed. This
document governs only what happens *after* that unmodified score exists: how it is
bucketed into one of Setu's three bands, and what additional, non-NEWS2 signals can
override a band or force manual review regardless of the score.

> **Status (Phase 1).** The rules engine that will implement this document
> (`web/src/lib/triage/`) has not been built yet — Phase 1 is schema only. The rules
> below are recorded here as binding product decisions for that implementation, not as
> a description of shipped code.

---

## 1. Band mapping — green / yellow / red

NEWS2 defines four risk levels (Low, Low–Medium via a single red score, Medium,
High). Setu's UI shows three bands. Collapsing four levels into three requires a
mapping decision that NEWS2 itself does not make.

| Setu band | Condition |
|---|---|
| **red** | aggregate ≥ 7 |
| **yellow** | aggregate 5–6, **or** 3 in any single parameter |
| **green** | aggregate 0–4 with no single parameter scoring 3 |

**Relationship to NEWS2: deviation, more conservative.**

NEWS2's Chart 2 grades a single red score as *Low–Medium* risk, explicitly lower
than an aggregate of 5–6 (*Medium*) — the 2017 update downgraded the single-red-score
trigger specifically because escalating on it raised workload by ~40% for only ~3%
better detection. Setu folds the single red score into the *same* band as an
aggregate of 5–6 anyway.

**Reasoning:** three bands cannot represent four risk levels without collapsing two of
them together, and a single parameter scoring the maximum (3) — e.g. SpO₂ ≤ 91%, or a
patient who is unresponsive — is a plausible false negative for "urgent" if it were
grouped with *green* just because the aggregate stayed low. Setu accepts the
NHS-documented workload cost of over-escalating in order to avoid a rural, often
short-staffed clinic under-triaging a single severely abnormal vital. Erring upward is
the safer direction when a distinction has to be lost.

---

## 2. Hard override rules

These rules can force a band or a manual-review flag independent of, or in addition
to, the aggregate score. Each is labelled with its actual relationship to NEWS2 —
some are Setu-specific deviations, others are Setu's enforcement of a boundary NEWS2
already states for itself. Mislabelling the latter as a "deviation" would misrepresent
NEWS2 as altered when it has not been, so the two are called out separately.

### 2.1 A missing vital is never scored as normal

**Rule:** If a required parameter (respiratory rate, SpO₂, oxygen status, systolic
BP, pulse, consciousness, temperature) was not measured, the visit is never scored 0
for that parameter. The triage result is instead flagged `requires_manual_review =
true`.

**Relationship to NEWS2: Setu-specific deviation — extends NEWS2 into a case it
does not define.** NEWS2's charts have no representation for "not measured"; the
score is defined only over the seven parameters as recorded. An automated system that
defaults an absent value to a mid-range or zero score is silently fabricating data
NEWS2 was never given.

**Reasoning:** front-desk staff in a small or rural clinic frequently cannot capture
every vital — missing equipment, an uncooperative or unconscious patient, time
pressure during a surge (see `docs/DATA_MODEL.md`, `vitals`). Treating "we don't
know" as "normal" would let an unmeasured severely abnormal parameter pass through as
if it were healthy. Routing to manual review instead makes the data gap visible to
staff rather than letting the database paper over it.

*Schema support:* `vitals`'s seven clinical columns are nullable with no default;
`triage_results.requires_manual_review` is the flag this rule sets.

### 2.2 A manual clinician call always supersedes an automated band

**Rule:** A clinician can record a new `triage_results` row with `decided_by =
'manual'` at any time. The queue (`v_queue`) and any other consumer always reads the
*most recent* `triage_results` row for a visit, so a manual entry immediately
supersedes whatever the rules engine or model last produced — without deleting or
overwriting the automated row it supersedes.

**Relationship to NEWS2: not a deviation — this is Setu's direct implementation of
NEWS2's own instruction.** `docs/NEWS2_REFERENCE.md` quotes the RCP guidance verbatim:
"NEWS2 is an aid to clinical assessment, not a substitute for clinical judgement.
Concern about a patient should always override the score." Setu is not changing NEWS2
here; it is building the escape hatch NEWS2 itself requires to exist.

**Reasoning:** `triage_results` is append-only specifically so this override never
destroys the automated reasoning it replaces — the full history of what the rules
engine said, and what a clinician overrode it to, stays inspectable (see
`docs/DATA_MODEL.md`, `triage_results`).

### 2.3 Patients under 16, and pregnancy ≥ 20 weeks, are unbanded — not forced red

**Rule:** A visit for a patient recorded with `age < 16`, or with
`pregnancyWeeks >= 20`, must not be band-assigned by the rules engine. `band` is
set to `null` and `requires_manual_review = true`. The NEWS2 aggregate score is
still computed and reported alongside the null band — it is not suppressed, only
marked as not valid for banding this patient.

An earlier version of this rule forced `band = 'red'` for these visits, on the
reasoning that erring upward is always the safer direction when a distinction has
to be lost (see §1). That was wrong: **severity and unscoreability are different
axes.** Red is supposed to mean "this patient's physiology is critical." A
paediatric or obstetric visit forced to red doesn't necessarily mean that — it
means "NEWS2 does not apply here and nobody has looked yet." Collapsing the two:

- **mis-ranks the queue.** A truly critical adult (aggregate ≥ 7) and an
  unassessed 10-year-old with normal-looking observations would sort identically,
  when only one of them is known to be in physiological crisis.
- **dilutes what red means** for every other patient in it. Clinical staff scanning
  the queue need red to reliably mean "act now, physiology says so" — not
  sometimes that, and sometimes "our scoring system doesn't apply to this
  patient."

`null` (unbanded) is a distinct, honest signal: *NEWS2 could not evaluate this
patient at all*, as opposed to yellow/green/red which all say *NEWS2 evaluated
this patient and concluded X*. `requires_manual_review = true` still guarantees
the visit surfaces to a human — see `v_queue`'s ordering below, which places
unbanded second (behind red, ahead of yellow/green), so it gets prompt attention
without outranking a patient who is known to be critical.

**Precedent for treating "escalate everything, just in case" as its own cost:**
this is the same tradeoff the RCP made when it downgraded the single-red-score
trigger in the 2017 NEWS2 update (see §1) — analysis showed that escalating
indiscriminately raised workload by ~40% for only ~3% better detection. Forcing
every paediatric/obstetric visit to red is the same kind of indiscriminate
escalation, just applied to a population NEWS2 was never validated against in the
first place, where "escalate" doesn't even carry the meaning of "physiologically
critical" to justify the cost.

**Relationship to NEWS2: not a deviation — this enforces a boundary NEWS2 already
states for itself.** `docs/NEWS2_REFERENCE.md`'s "Scope and exclusions" section
states NEWS2 is validated only for adults 16 and over, and only up to 20 weeks of
pregnancy (a dedicated obstetric score, e.g. MEOWS, should be used beyond that);
the RCP is explicit that a system with altered parameters or population may not be
called NEWS. Running the unmodified NEWS2 table against a child's physiology, or
against a pregnancy past 20 weeks, and still using its output to assign a Setu
band would misuse the score, not extend it.

**Reasoning:** children's physiological response to acute illness, and the
physiological changes of pregnancy past 20 weeks, differ enough from the general
adult population that the same thresholds are not validated to mean the same
thing. Excluding these populations from automated *banding* — while still
computing and showing the NEWS2 number for clinical context — keeps Setu's
"unmodified NEWS2" claim honest for every score it does show, and keeps `band`
meaningful for every visit where it isn't null.

*Schema support:* `patients.age` (0–130) is the field the paediatric check reads.
The obstetric check reads `pregnancyWeeks` from `AssessmentContext`, which is not
yet a persisted column on `patients` or `vitals` — see Known gaps below.

---

## 3. Known gaps — not yet enforceable

These are scope limits NEWS2 itself states, that Setu cannot currently apply because
the schema does not capture the data needed to detect the condition. They are listed
here so they are not silently forgotten once the rules engine is built.

- **Pregnancy ≥ 20 weeks — schema support pending.** The rules engine already
  implements this exclusion (§2.3) against `AssessmentContext.pregnancyWeeks`, but
  there is currently no pregnancy or gestational-age field in `patients` or
  `vitals`, so no caller can populate it from persisted data yet. Until that field
  exists, this rule can only fire if a caller supplies `pregnancyWeeks` from
  outside the schema.
- **Spinal cord injury.** NEWS2 says the score should be used "with caution" (may be
  unreliable) in patients with spinal cord injury, especially tetraplegia or
  high-level paraplegia, due to autonomic disruption. This is guidance for the
  clinician reading the score, not an exclusion — Setu has no plan to auto-detect this
  condition, but it should inform how the rules engine's output is *labelled* for such
  patients if/when this is captured.

---

## 4. Adding a new hard override

Any future hard override rule must be added to §2 of this file before or alongside
the code that implements it, with the same two things every rule above has: an
explicit **Relationship to NEWS2** line (deviation vs. enforcement of NEWS2's own
scope, and which direction — more or less conservative), and a **Reasoning** line.
This is what keeps Setu able to say, truthfully, that its NEWS2 aggregate score is
unmodified even as the product layers more decisions on top of it.
