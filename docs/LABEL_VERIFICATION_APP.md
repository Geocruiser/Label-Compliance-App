## PRD: AI-Powered Alcohol Label Verification App (Variant A)

### 1) Overview
**Problem:** TTB label review is largely manual “matching” work, and agents are overloaded.

**Goal:** Build a **standalone** app that helps agents review labels faster and more consistently, with results returned in **~5 seconds**.

**Scope choice:** Variant A (single-label processing, no batch, no COLA integration).

---

### 2) Users and primary use case
**Primary user:** TTB compliance agents with varied tech comfort; the UI must be extremely simple and obvious.

**Primary workflow:**
1. Agent uploads **label image**
2. Agent uploads **application JSON**
3. System extracts key fields from the label and compares to JSON
4. System returns per-field status + highlights evidence on the label image

---

### 3) In-scope requirements (MVP)

#### 3.1 Inputs
- **Label image upload** (single image per run)
- **Application upload (JSON)** (required)
- The app must work without reliance on outbound cloud ML APIs.

#### 3.2 Fields to verify (core)
- Brand name
- Class/type designation
- Alcohol content (with exceptions for certain wine/beer)
- Net contents
- Name/address of bottler/producer
- Country of origin (imports)
- Government Health Warning Statement

#### 3.3 Output states (per field)
Each field must return exactly one of:
- **Pass**
- **Fail**
- **Needs Review** (preferred over false positives)
- **Missing** (field not detected on label)

#### 3.4 Evidence / explainability UI
- Display extracted value(s) per field and the application JSON value side-by-side.
- Draw **bounding boxes** around label text used for each extracted field.
- **Hover interaction:** mousing over a field highlights its corresponding bounding box; optionally hovering a box highlights the field row.
- Show OCR confidence (or similar) to justify Needs Review.

#### 3.5 Government warning validation (special handling)
- Warning text must be **word-for-word**.
- Prefix **“GOVERNMENT WARNING:” must be ALL CAPS**.
- **Bold** requirement: MVP treats as **manual verification** (report as Needs Review unless you implement a best-effort heuristic).

#### 3.6 Image quality handling
- Apply preprocessing and degrade gracefully to Needs Review/Missing if image quality prevents confident extraction.

---

### 4) Match rules (TTB-class aware)
**Principle:** match rules vary by alcohol class, and the system should prefer **Needs Review** over an incorrect Pass.

#### 4.1 Normalization (applies broadly)
- Trim whitespace, normalize Unicode, collapse repeated spaces
- Case-insensitive comparison where permitted
- Punctuation normalization where permitted
- Numeric normalization (e.g., parse “45% Alc./Vol.” to 45.0)

#### 4.2 Field-specific approach (default behavior)
- **Brand name:** normalized + fuzzy match; borderline → Needs Review
- **Class/type designation:** normalized + fuzzy match; borderline → Needs Review
- **Alcohol content:** parse ABV/proof; compare against JSON based on beverage class rules
- **Net contents:** parse numeric + unit; compare; if unit conversion isn’t supported in MVP, mismatched units → Needs Review
- **Name/address:** string match with normalization + fuzzy; no legal/registry validation
- **Country of origin:** required for imports; policy depends on whether JSON indicates import

> Note: The PRD should include a per-class “required vs optional” matrix once class-specific rules are finalized.

---

### 5) Non-functional requirements

#### 5.1 Performance
- **Target:** p95 ≤ **5 seconds** per label on CPU.

#### 5.2 Usability
- Extremely simple UI; no hidden controls.

#### 5.3 Security / retention
- Do not store images/results beyond the session; process transiently and delete artifacts after producing results.

---

### 6) Out of scope (explicit)
- **COLA integration**
- **Batch upload / bulk processing**
- **Complex producer address validation** beyond text matching (no USPS/geo/API validation, no permit/registry cross-checks)
- **Universal layout coverage** across every possible label design (MVP targets your test assets; novel layouts may degrade)

---

### 7) Proposed JSON schema (MVP)

#### Top-level
- `application_id` (string)
- `alcohol_class` (enum: `wine` | `beer` | `distilled_spirits` | `other`)
- `fields` (object)

#### `fields` keys
- `brand_name` (string)
- `class_type_designation` (string)
- `alcohol_content` (object)
  - `abv_percent` (number | null)
  - `proof` (number | null)
  - `display_text` (string | null) — optional for exact compare
- `net_contents` (object)
  - `value` (number | null)
  - `unit` (string | null) — e.g., `mL`, `L`, `fl_oz`
  - `display_text` (string | null)
- `producer` (object)
  - `name_address` (string | null)
- `country_of_origin` (string | null)
- `government_warning_text` (string) — expected full warning text including punctuation

#### Optional (future-proofing)
- `is_import` (boolean)
- `required_fields_override` (object)

---

### 8) UX spec (MVP screens)

#### Single screen layout
1. **Uploads panel**
   - Upload Label Image
   - Upload Application JSON
   - “Run Verification” primary button
2. **Results panel**
   - Checklist table: Field | Application | Label Extracted | Status | Confidence
   - Hovering a row highlights the box on the image
3. **Label preview canvas**
   - Draw bounding boxes by status
   - Toggle “show all boxes” / “show selected only”

---

### 9) Success criteria and acceptance tests

**Success definition:** On your test assets, every in-scope field is:
- extracted and evaluated into **Pass/Fail/Needs Review**, or
- labeled **Missing** if not detected.

**Minimum acceptance tests:**
- Runs end-to-end on all provided test assets
- Produces per-field statuses + bounding boxes for extracted fields
- Warning statement: detects any text deviation as Fail/Needs Review (strict) and enforces ALL CAPS prefix check
- Meets latency target on representative images

---

### 10) Recommended implementation notes
- Local OCR + preprocessing (e.g., PaddleOCR + OpenCV)
- Conservative fuzzy matching thresholds to prefer Needs Review
- Front-end canvas overlay for bounding boxes + hover interactions
- Log only non-sensitive timing + error metrics

