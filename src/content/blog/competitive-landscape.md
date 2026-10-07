---
title: "What Pearl, Overjet, and VideaHealth get right — and what's missing"
description: "An honest look at the leading dental AI vendors — what they've genuinely solved, and the structural gaps DentalMind is built to close."
date: "2025-09-22"
minutes: 5
tag: "Industry"
---

It's easy to write competitive content that's mostly marketing. We'd rather be useful, so this is an honest assessment of what the established dental AI vendors — Pearl, Overjet, and VideaHealth — actually do well, and where the structural gaps are that motivated DentalMind's design.

## What they get right

**Regulatory groundwork.** Pearl's Second Opinion and Overjet's platform both have FDA clearances for specific detection tasks, and that matters enormously in a clinical context. Getting a detection model through regulatory clearance is slow, expensive, and exacting — it forces a level of validation rigor that's easy to skip when you're optimizing for a benchmark leaderboard instead of a deployed product. Whatever else is true about these products, they've done real work earning clinical legitimacy.

**Clinical workflow integration.** Overjet and VideaHealth both integrate directly with practice management and imaging software dentists already use, rather than asking a clinic to adopt a separate standalone tool. That's a genuinely hard distribution problem, and solving it is a large part of why these companies have real deployed user bases instead of just a research demo.

**Detection accuracy on their core tasks.** On bitewing caries detection specifically — the most commercially mature use case in dental AI — these vendors have models trained on large proprietary datasets that perform well on the narrow task they target. This is the most crowded and most validated corner of dental AI, and it's crowded for a reason: it works.

## Where the gaps are

**Uneven modality coverage.** Most of the published validation for these vendors centres on 2D bitewing, periapical and panoramic imaging. Coverage is expanding (Pearl, for example, now lists a CBCT product, "Second Opinion 3D", and announced FDA clearance for panoramic pathology detection in December 2025), but 2D and 3D are still largely separate products rather than one pipeline that learns across modalities.

*Editor's note (October 2026): this paragraph was updated to reflect vendors' current product pages; the original version understated their CBCT and panoramic coverage.*

**Detection without correlation.** This is the gap we think matters most, and the one we wrote about in our [false positive piece](../false-positive-problem/) and our [clustering approach](../../product/#cluster). The dominant interaction pattern across these tools is still: detect a finding, draw a box, show a confidence score. What's largely missing is the layer that takes ten boxes scattered across one tooth and tells you that's actually one clinical situation — and tells you what to do about it, not just what was found. Overjet's clinical layer does some of this triage at the practice-management level (flagging cases for review), but it's a different thing from clustering at the image level before the finding ever reaches a person.

**Closed model ecosystems.** None of the major vendors publish open weights or open architectures for their core detection models. That's a reasonable commercial decision, but it means the field can't independently validate or build on their work, and clinics adopting these tools are trusting a black box with no external audit trail beyond whatever the vendor's regulatory filing discloses.

## Where this leaves us

We're not claiming DentalMind is ahead on detection accuracy — on a narrow, well-resourced task like bitewing caries detection, vendors with years of proprietary data and dedicated clinical validation teams have an advantage that's hard to argue with. What we're betting on is that detection accuracy is increasingly a solved problem at the margin, and the unaddressed opportunity is everything downstream of detection: cross-modality coverage, per-tooth clustering instead of disconnected boxes, and an open backbone (MMKD-CLIP) that the broader research community can inspect and improve. Time will tell whether that bet is right, but it's the gap we see and the one we're building toward.

*As with every output in the DentalMind pipeline: AI second opinion only. Final diagnosis subject to clinical judgment.*
