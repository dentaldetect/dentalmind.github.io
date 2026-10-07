---
title: "Why dental AI tools have a false positive problem — and how we fixed it"
description: "A look at why detection-only dental AI erodes clinician trust, and how DentalMind's C2 consistency filter catches false positives before they reach a dentist."
date: "2025-11-03"
minutes: 5
tag: "Engineering"
---

Every dental AI vendor advertises a detection accuracy number — 87% caries sensitivity, 0.85 mAP on panoramic disease detection, and so on. What none of them advertise is the false positive rate dentists actually experience in daily use, because it's the number that determines whether the tool gets used at all.

## The trust cliff

A detector with 90% sensitivity sounds impressive until you account for the denominator. Run that detector across a full-mouth series — 18 images, dozens of teeth, hundreds of candidate regions — and even a 5% false positive rate per image compounds into a report full of noise. The dentist's job shifts from "treat what the AI found" to "figure out which of these findings are real," which is strictly more work than reading the films cold.

We call this the trust cliff: once a dentist catches the AI flagging something that obviously isn't there — calculus on a crown margin, caries on a filling — they stop trusting every subsequent flag from that tool, real or not. A handful of bad calls poisons the well for the entire session. This is why detection accuracy in isolation is the wrong metric to optimize. What matters is precision at the point the dentist actually looks at the screen.

## Where false positives come from

Most false positives in dental radiograph AI come from three sources:

1. **Single-view ambiguity.** A radiolucency that looks like a periapical lesion in one projection can be a normal anatomical structure (the mental foramen, an incisive canal) seen at an unusual angle.
2. **Imaging artifacts.** Cone cuts, overlap, and exposure variation create shadows that mimic caries or bone loss, especially on bitewings.
3. **Domain shift.** A model trained on one sensor/clinic's image characteristics degrades on another's, producing confident-looking but wrong detections.

None of these are solved by training a bigger or more accurate single-shot detector. They're solved by giving the model a way to check itself before it commits to a finding.

## C2: the consistency filter

DentalMind's pipeline includes a dedicated stage — C2, the consistency filter — that runs after initial detection and before any finding is allowed into a report. Its job is narrow: take every candidate detection and ask whether the evidence holds up under cross-examination.

For CBCT and full-mouth series, that means checking a candidate finding against neighboring slices or views of the same tooth. A radiolucency that appears in one slice but vanishes two slices later isn't a lesion — it's noise, and C2 drops it. For single-image modalities like an isolated bitewing, C2 falls back to symmetry priors and known-anatomy masks: a "lesion" sitting exactly where the mental foramen should be gets suppressed.

This is deliberately a filter, not a second detector. It doesn't add new findings or try to improve recall — its only job is to remove findings that don't survive scrutiny, trading a small amount of sensitivity for a meaningful gain in precision where it counts: at the point a human reads the report.

## What this means in practice

In our internal evaluation set, C2 removes a meaningful fraction of borderline detections before they reach the per-tooth clustering stage (C3) — exactly the noisy, low-confidence findings that are most likely to be false positives and most damaging to trust when they're wrong. The findings that do survive are the ones worth a dentist's attention, which is the entire point of an AI second opinion.

A tool that's right 80% of the time and tells you which 20% to double-check is more useful than a tool that's right 90% of the time and tells you nothing about its own uncertainty. C2 is our attempt to build the first kind of tool, and it's a core reason every other component in the pipeline — per-tooth clustering, treatment prompts — produces output a dentist can actually act on without re-verifying everything from scratch.

*As with every output in the DentalMind pipeline: AI second opinion only. Final diagnosis subject to clinical judgment.*
