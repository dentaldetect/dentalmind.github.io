---
title: "From CBCT to bitewing: how one 3D scan trains five 2D models"
description: "How DRR generation turns a single labeled CBCT volume into hundreds of free 2D training images, and why that makes joint 2D+3D training worth the engineering cost."
date: "2025-10-18"
minutes: 4
tag: "Research"
---

> **Status (October 2026):** this post describes the joint 2D + 3D training strategy DentalMind is built around. CBCT detection in the current release is still experimental; see [Evidence](../../evidence/) for what is measured today.

CBCT annotation is expensive. A single volume can take a trained radiologist an hour or more to fully segment across dozens of anatomical structures, and that's before you account for inter-rater disagreement on ambiguous regions. If you need thousands of labeled CBCT volumes to train a 3D segmentation model from scratch, you have a budget problem before you have a modeling problem.

DentalMind's training strategy avoids that bottleneck by treating every labeled CBCT volume as two assets instead of one: a 3D training example, and a generator for an arbitrary number of 2D training examples.

## Digitally reconstructed radiographs

A digitally reconstructed radiograph (DRR) is a synthetic 2D X-ray-like projection computed directly from a 3D CT or CBCT volume, by simulating how X-rays would attenuate as they pass through the volume along a chosen angle. This is standard technique in radiotherapy planning, repurposed here for a different goal: data generation.

Once a CBCT volume is segmented — every tooth, every lesion, every region of bone loss labeled in 3D — we can project that volume into a 2D DRR at any angle, and the 3D labels project along with it. A single CBCT volume, projected at enough angles and crops, yields on the order of 500 distinct 2D training images, each with pixel-accurate labels inherited directly from the original 3D annotation. No additional human labeling required.

This matters because it changes the economics of the whole pipeline: **one labeled CBCT effectively buys 500 free 2D training images.** The expensive annotation step happens once, in 3D, where it's hardest — and pays out across every 2D modality the DRR projection can approximate.

## Why this beats training 2D models independently

The naive alternative is training five separate 2D detection heads — bitewing, panoramic, periapical, FMS, and a CBCT segmentation model — each on its own independently collected and labeled dataset. That approach has two costs DRR-based joint training avoids:

- **Annotation cost multiplies per modality.** Every modality needs its own labeled dataset at sufficient scale, and dental disease labeling is expensive, specialist work regardless of modality.
- **The models never share what they learn.** A bitewing model and a panoramic model trained independently can't transfer representations to each other, even though the underlying pathology — caries, bone loss, periapical lesions — looks visually similar across modalities once you control for projection geometry.

By projecting labeled CBCT volumes into synthetic 2D images and mixing them with real 2D radiographs during pretraining of the shared DentVFM-2D encoder, both problems get solved at once. The encoder learns representations that work across modalities because it's trained on a mix that spans modalities, and every CBCT label point contributes to all of the downstream 2D detection heads, not just the 3D one.

## The four-phase training strategy

In practice this looks like four phases: pretrain the 2D backbone broadly, generate DRRs from every labeled CBCT volume, fine-tune the shared encoder jointly on real 2D images and DRR-derived images side by side, and only then specialize per-modality detection heads on top of the now richly pretrained backbone. The expensive 3D annotation work happens once, upstream, and its value compounds across every modality downstream — which is the entire justification for building a joint 2D+3D pipeline instead of five independent ones.

*As with every output in the DentalMind pipeline: AI second opinion only. Final diagnosis subject to clinical judgment.*
