# Homepage image and real-case plan

## Current implementation

The homepage uses `public/brand/dental-panorama-synthetic.png`, generated with the built-in image-generation tool. It is a synthetic radiograph-style marketing illustration, not a patient scan, validated anatomy, model prediction, or diagnostic evidence. The original generated PNG is kept intact. The static Astro site serves this asset beneath its configured GitHub Pages base path.

The image stays still while an optional scan sweep and a six-second guided tour animate the interface. Selecting a tooth or finding pauses the tour. Reduced-motion preferences disable the initial tour and scan animation. Annotations can be hidden. English and Persian text are supported. The image orientation stays fixed in both languages: patient right is image left.

Five authored example areas are linked to review context: tooth 16 crown defect, tooth 21 root-tip review, tooth 36 crown defect, tooth 48 impaction, and tooth 46 previous root canal treatment. The root-tip example is deliberately described as an area to review, not a confirmed lesion. Generated anatomical accuracy and FDI assignments require clinician review before any educational or clinical use.

## Replace with verified real problems

1. Obtain a de-identified panoramic study with explicit permission for public website use. Keep the original study in a private source store; inspect image pixels for burned-in identifying information as well as metadata. Do not promote existing sample files to public real-patient examples without confirming their provenance and usage rights.
2. Have a dental clinician review the image, confirm tooth numbering, and annotate the actual findings. Use separate representative cases when one study does not contain all the desired findings; never add fabricated lesions to a real scan.
3. Store each case with an asset version, image dimensions, source/permission record, reviewer and review date. Store findings with normalized coordinates or polygons, FDI number, observation, review status, and clinician-approved explanatory copy. Separate treatment history from possible disease.
4. Bind the review panel and overlay to that case data. Preserve aspect ratio and patient orientation; test registration across desktop, mobile, and RTL. Supply case-specific alt text and source captions. Keep synthetic and clinician-reviewed cases visibly distinct.
5. If connecting inference, adapt the demo API output into this structure. Show model output as unreviewed until a clinician confirms it. Display confidence only when supplied by the model and supported by a documented calibration process; never invent confidence percentages.
6. Before publication, obtain clinical review of the final image, labels and explanatory text together. Verify every overlay against the original image, keyboard navigation, touch controls, reduced motion and image-loading failure handling.

## Generation prompt

Mode: built-in image-generation tool, new image, opaque background.

+ Use case: scientific-educational.
 Asset type: main panoramic dental image for an interactive dental research website.
 Primary request: Create the most lifelike, anatomically believable synthetic panoramic dental radiograph possible. It should look like an excellent real dental panoramic X-ray, NOT a diagram, NOT a cartoon, NOT rows of identical stock tooth icons, NOT a glossy plastic 3D model.
 Subject and framing: A full adult maxillary and mandibular dentition in a wide panoramic view, frontal patient-facing orientation, patient's right is image left. Natural curved dental arches, realistic varied incisors, slender canines, premolars and large molars. Rounded enamel contours, uneven natural cusp anatomy, irregular curved tapered roots, upper molars with diverging roots, lower molars with two roots, subtle pulp chambers and canals. Teeth occupy the central 85% of the image width and 65% of its height; include the mandible and supporting alveolar bone with delicate authentic trabecular texture. Keep both rows separated enough to read the individual crowns. Include natural small anatomical asymmetries and realistic radiographic overlap without exaggerated distortion.
 Visible illustrative findings: On image left upper first molar (patient tooth 16, about 25% across), an irregular dark deep carious defect in the crown. At the root tip of the upper central incisor just right of image center (tooth 21), a subtle dark oval periapical radiolucency. On image right lower first molar (tooth 36, about 75% across), a smaller dark occlusal defect. At far image left lower third molar (tooth 48), a clear mesioangular impaction leaning toward the adjacent molar. Image-left lower first molar (tooth 46, about 25% across) has realistic thin bright radiopaque root-canal fillings and a small coronal restoration. All other teeth look natural, with no random holes.
 Style/medium: exceptionally realistic grayscale radiographic medical image with rich tonal depth, fine film grain, detailed enamel/dentin density, credible periodontal spaces and bony texture. Black-charcoal backdrop, neutral ivory-gray teeth, almost imperceptible green-gray shadow cast compatible with a dark teal website.
 Composition: landscape 16:9, centered complete jaws with generous dark margins on all sides for overlay annotations. No cutoff teeth. No labels, no text, no numbers, no UI, no borders, no colored highlighting, no arrows, no circles, no watermark. This is a synthetic educational visualization, not an actual patient's scan. Prioritize natural realism and individually differentiated tooth anatomy.
