# DentalMind Android app implementation prompt

Copy the following prompt into an implementation chat opened on the DentalMind
application repository. This is a request to build the app, not evidence that
the work below has already been completed.

---

Extend the existing DentalMind Android application into a working research app
for dental X-ray analysis and linked 3D atlas review. Inspect the existing code
and backend contracts first. Preserve working patient/doctor flows and improve
them in place; do not replace the project with a new scaffold.

## Existing projects and visual reference

- Android: `medclip/android`, Kotlin, Jetpack Compose, Material 3, MVVM/StateFlow,
  Hilt, Retrofit, Room, DataStore and WorkManager. Read its README, implementation
  checklist and backend-gap audit, then verify those notes against current code.
- Python model service: `medclip/dentalmine/pipeline/local_backend.py`,
  `pipeline/atlas/`, `service/`, and `contracts/v1.py`.
- Web application/BFF: `medclip/dentalmind-web`. Its API and session contract
  differ from the Python service. Audit real route implementations before use.
- Atlas source: the sibling `dentalmind-pages` repository, `src/dentition/` and
  `tools/atlas-match/`. Reuse its tested renderer, stable FDI IDs, licensed model,
  condition visualizations and evidence semantics.
- Design: https://dentaldetect.github.io/dentalmind.github.io/ and its `/atlas/`
  viewer. Use a consistent warm off-white background, teal controls, clear type,
  generous spacing and accessible touch targets. Support English and Persian
  with RTL controls; never mirror radiograph pixels or patient-side anatomy.

## Implement the full workflow

1. Let a user select a dental image with Android Photo Picker or the camera,
   preview it, choose the modality and explicitly submit it for analysis.
   Validate image size/type, handle orientation consistently, and avoid
   excessive decoding/upload memory. Preserve the correct coordinate transform
   between the displayed image and normalized boxes.
2. Show asynchronous UI state around the existing synchronous HTTP requests.
   Use WorkManager for background completion/retry and store completed reports
   in Room. Do not invent a polling endpoint. Distinguish failed, cancelled,
   unsupported, unavailable-model and unassessable-image outcomes.
3. Show the original radiograph, tooth boxes and findings separately. Display
   identity score, disease finding score, uncertainty, provenance and review
   state accurately. Selection in the image and the 3D atlas must stay linked
   by FDI. Duplicate/conflicting/unassigned identities require explicit review.
4. Embed the 3D atlas locally using WebViewAssetLoader, or an equivalently
   secure local renderer. Bundle its model, scripts and licence. Use a narrowly
   typed bridge restricted to trusted bundled content; validate message IDs,
   FDI numbers and condition values. Disable arbitrary file access, mixed
   content and navigation that could expose the bridge to remote pages.
5. Show amber `!` markers/tints for provisional AI findings, blue `?` for
   uncertain observations and purple `S` for manual simulations. Display a
   legend and per-tooth evidence. Unmarked teeth are unassessed, not healthy.
   Treatment history such as a restoration or root canal is not automatically
   disease. Keep uncertain observations visible without fabricating damage.
6. Provide manually selected examples of caries, a chipped crown, periapical
   findings, restoration, root canal treatment and a missing tooth. Label them
   as simulations; clearing them must restore original geometry/materials.
   Save them in a separate `visualization_scenario` field, never in AI findings.
   Keep roots, canal traces and apical halos hidden until the user explicitly
   enables anatomy mode. Retain pan/rotate/zoom/reset, arch views, tooth details
   and accessible 2D tooth-chart selection.
7. Implement report history, reopen, export and deletion. Preserve the existing
   patient/doctor features where their actual authenticated server routes work.
   If an endpoint is missing, document the gap or implement a concrete tested
   contract; do not claim a Room-only demo feature is synchronized server state.

## Integrate the actual available APIs

Verify request/response bodies against source and tests before writing DTOs:

- `GET /health/ready`: local Python readiness.
- `GET /v1/atlas/catalog`: model/atlas availability by modality.
- `POST /v1/atlas/analyze`: multipart `file`, `modality=panoramic`,
  `orientation=standard_panorama`; returns atlas-match-1.0 tooth links plus
  optional structured calibrated findings. Preserve `atlas_fdi=null` when an
  observation cannot be linked unambiguously; do not guess another tooth.
- `POST /v1/atlas/presence`: multipart `file`, `modality=periapical`,
  `orientation=standard_intraoral`; returns image-level FDI hypotheses, not
  tooth locations, disease detections or patient-wide tooth presence.
- `POST /v1/atlas/map`, `/match`, `/series/map` and `/cbct/register`: inspect the
  existing typed requests. Keep manually reviewed mappings distinct from
  learned results. CBCT registration uses measured physical landmarks; it is
  not automatic volume segmentation or single-image reconstruction.
- `/inference/v1/analyze` and `/inference/v1/forecast` expose the native model
  contract, while `/v1/analyze` adapts it to the web DTO. They have different
  response shapes and authentication requirements. Do not mix them.
- Forecasts are experimental model estimates, separate from image findings.
  Use the real profile contract (including `ageYears`), eligibility and interval
  fields if this feature is included. Never present estimates as outcomes.

Only panoramic automatic tooth/finding models are currently configured.
Periapical has image-level visibility support. Bitewing, occlusal, cephalometric
and automatic CBCT tasks must show actual capability status and explicit
unavailable states until separately validated models exist. The atlas contains
32 permanent teeth; primary teeth are unsupported and third-molar geometry is
approximate. A single radiograph does not determine exact 3D roots, lesion
depth, surface location or bone loss. Every 3D problem effect is schematic.

## Networking, authentication and deployment

Use distinct configurable origins for the app/BFF and Python model service.
The emulator can use `http://10.0.2.2:8082/`; a physical debug device can use
`adb reverse tcp:8082 tcp:8082` with `http://127.0.0.1:8082/`. Keep cleartext
exceptions in debug builds only. Verify each route against the chosen origin.

GitHub Pages is the public static website, not an inference endpoint. Production
needs an authenticated HTTPS gateway/backend. Audit existing end-user sessions
and patient/doctor authorization; the model service's shared bearer token is
not mobile-user authentication. Never embed that shared token, an SSH key,
cloud credentials or a signing key in an APK or committed configuration. If a
gateway or mobile session contract is missing, build and test the required
server change explicitly and document its deployment requirements.

Keep patient images app-private, minimize logs and do not add analytics or
third-party image uploads by default. Use explicit upload actions, secure
session storage, appropriate retention controls and production authorization.
Do not bundle the 258 MB server model package into the APK without a separate
on-device inference requirement. CPU inference should work on the planned
8-core/16-GB-RAM/80-GB server; make GPU acceleration an optional deployment
profile. Training stays on DML2. Do not expose the developer's local service
publicly or deploy production infrastructure as part of app development.

## Verification and deliverables

Run meaningful unit and instrumented checks for DTO parsing, unsupported
modalities, normalized-box alignment, FDI selection, unknown/unassigned teeth,
manual-vs-AI provenance, roots hidden by default, simulation cleanup, network
failure, offline history and English/Persian layouts. Demonstrate a real local
panoramic inference and the periapical visibility-only path. Keep all demo
fixtures explicitly labelled; never silently substitute them for a failed API.

Build the appropriate debug APK using the project's existing Gradle wrapper,
run its relevant tests and report exact APK paths and results. Provide setup
instructions, the verified API configuration, screenshots of upload/results/
3D atlas, a concise changed-file summary, and remaining backend/model gaps.
Do not claim a release-ready clinical system or publish an APK without review.
Persist through implementation and verification; deliver working code and the
APK rather than only a plan.
