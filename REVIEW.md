# OpenMakruk · Deployment Review

> รีวิว: 25 พ.ค. 2026 · openmakruk.com (production · Cloudflare Pages)
> Scope: UX/UI · SEO/Meta · Performance · Accessibility · Code/Architecture · Security

---

## TL;DR

โปรเจกต์อยู่ในระดับ **production-ready ในแง่ฟีเจอร์และความน่าเชื่อถือ** — vision ชัด, README/PROJECT_NOTES คุณภาพสูง, test pyramid ครบทั้ง E2E + worker integration, anti-cheat ทำจริง, privacy-first ด้วย opt-in cloud sync, PWA + COOP/COEP สำหรับ multi-threaded WASM ครบ.

จุดเร่งด่วนที่ควรแก้ก่อนจะเอาไปโปรโมตจริง:

1. **Piece SVGs ขนาด 1 MB ต่อไฟล์** — ต้อง run `svgo` ลด 100–1000 เท่า (ใหญ่สุดของหน้านี้คือชิ้นหมาก ไม่ใช่ engine)
2. **ไม่มี `robots.txt` / `sitemap.xml`** — Cloudflare ส่ง `index.html` (SPA fallback) ตอบกลับด้วย status 200 → crawler งง
3. **ไม่มี ESLint / Prettier** — โปรเจกต์ TS 16,800 บรรทัดควรมี lint config commit ไว้
4. **Accessibility ยังบาง** — `aria-label` 0, `aria-live` 0 ทั้งหน้าเล่น; เกมหมากรุกที่ต้องประกาศการเดินควรใส่
5. **Cache header ของ asset ที่มี hash** — ตั้ง `must-revalidate, max-age=14400` ทั้งที่ไฟล์เป็น content-addressed (`index-D8vvfzLb.js`) → ควรเป็น `immutable, max-age=31536000`

ที่เหลือคือคำแนะนำเชิง polish ซึ่งไม่กระทบเรื่องใช้งาน

---

## สิ่งที่ทำดีมาก

### Vision & docs

- README เปิดด้วย "origin story" (เด็กไทยอยากเล่นหมากรุกไทยกับคอมตั้งแต่ 30 ปีก่อน) — ทำให้คนอ่านเข้าใจ "ทำไม" ก่อน "อะไร" ในรอบเดียว
- **Differentiation ระบุชัด**: pychess = variant-generalist · เว็บไทยเดิม = multiplayer-only · OpenMakruk = training-first + Thai i18n
- **PROJECT_NOTES.md** บันทึก decisions พร้อม rationale (เลือก ffish-es6, ไม่เลือก @kaisukez/makruk-js เพราะ rules-engine consistency, ไม่ใช้ Next.js, ฯลฯ) เป็น artifact ที่ดีของกระบวนการคิด
- License + credit ของ piece SVGs ถูกต้องครบ (Yevrowl + Fulmene + belzedar_ · CC BY-SA 4.0)

### Architecture

- **2 ชั้น offline-first + optional cloud** — ความคิดถูกแล้ว: client ทำงานครบโดยไม่ต้องมี server, cloud เป็น opt-in สำหรับ leaderboard / multi-device
- **Engine plugin contract** (`MakrukEngine`) ทำให้เพิ่ม bot ใหม่เป็น side-effect register, ไม่ต้องแก้ core
- **Versioned localStorage** (`defineStore` wrapper `{v, d}`) — เห็นการเตรียมรับ schema migration ตั้งแต่ต้น
- **Pure-JS Makruk rules engine** ฝั่ง worker (`worker/src/rules.ts` 383 บรรทัด) เพื่อ replay verify โดยไม่ต้องโหลด WASM → ดีต่อ cold start + ต้นทุน
- **Anti-cheat replay** ใน `POST /api/games`: ตรวจ legal move + ตำแหน่งจบ + 422 ถ้าเดินผิด → leaderboard กรอง `verified=1` เท่านั้น เป็น design ที่ทำเองได้น้อยคน

### Stack เลือกถูก

- Vite + React + TS ตรงโจทย์ (ไม่จำเป็นต้องมี SSR)
- Cloudflare Pages ตอบโจทย์ COOP/COEP (ต้องการสำหรับ `SharedArrayBuffer` ของ multi-threaded Fairy-Stockfish WASM) — เลือกถูก, GitHub Pages ไม่รองรับ header นี้
- Hono + D1 บน Worker — เบา, free-tier-friendly, integration กับ wrangler `db:apply` ครบ
- chessground (Lichess) — มาตรฐานวงการ, ไม่ต้องเขียน drag-drop เอง

### Testing & CI

- E2E 75+ tests + worker integration 26 tests (vitest + wrangler dev) — pyramid โอเค
- `.github/workflows/ci.yml` มี comment คุณภาพ docs: อธิบายว่าทำไม cache แบบนี้, ทำไม `npm ci` ไม่ใช่ `install`, ทำไมเก็บ Playwright report เป็น artifact
- `concurrency: cancel-in-progress` ตั้งไว้แล้ว — ไม่เปลือง CI minutes

### Privacy & PDPA

- ค่าเริ่มต้น = localStorage only, **0 personal data ส่งออก** → PDPA scope ใกล้ศูนย์
- Cloudflare Web Analytics (cookieless) ใช้ได้โดยไม่ต้องมี consent banner
- Opt-in cloud sync ใช้ bearer token แบบ opaque + SHA-256 hash → ตัวเลือกที่ถูกสำหรับโปรเจกต์ขนาดนี้
- Worker `index.ts` มี CORS allowlist ชัด (`localhost:5173/5174` + `openmakruk.com` + `www.openmakruk.com`) — ไม่ใช้ `*`

### Service worker

- `cache-first` สำหรับ app shell + `network-first` สำหรับ `/content/*.json` (puzzles/lessons) → balance ระหว่าง offline และเนื้อหาใหม่ถูกต้อง
- มี `CACHE_VERSION` bump strategy + cleanup เก่าใน `activate` → version migration เรียบร้อย

### UI/UX (สังเกตจากการเปิดเว็บจริง)

- Loading splash inline (CSS + spinner) ก่อน React boot → ไม่มี "blank white page"
- Welcome modal อธิบาย Makruk-specific rules (เม็ดเดินเฉียง 1, โคน fianchetto, จบเกมด้วยการนับ) ก่อนผู้เล่นแตะกระดาน — เป็น onboarding ที่จำเป็นมาก เพราะคนเล่นหมากรุกสากลจะเดาผิด
- Dark theme + Sarabun font ดูสบายตา
- Tab structure 9 tabs จัดกลุ่มตาม use-case (เล่น/ฝึก/ศึกษา/ปริศนา/ออกแบบ/คลัง/โปรไฟล์/ตั้งค่า/เกี่ยวกับ) — ครอบคลุม

---

## จุดที่ต้องแก้ (เรียงตามผลกระทบ)

### 🔴 1. Piece SVGs ขนาดเกิน 1 MB ต่อไฟล์

**สิ่งที่พบ:**

```
dist/pieces/
  Bia_white.svg          1.0M
  Bia_black.svg          1.0M
  Khun_white.svg         1.0M
  ... (14 ไฟล์ × 1 MB)
  fulmene/  (alt set)   13M
  makruk/   (alt set)   12M
  รวม: 40 MB
```

แต่ละไฟล์เป็น vector trace (potrace-style) ที่มี path data ยาวมาก ไม่ใช่ raster ฝังใน SVG. มาตรฐาน piece SVG ของ Lichess/chessground ทั้งชุด 12 ตัวรวมแล้ว ~50 KB

**ผลกระทบ:**

- หน้าแรกที่ render กระดาน 32 ตัว → fetch SVG 14 ครั้ง × ~1 MB → blob ~12 MB
- บน 3G/EDGE (โทรศัพท์ในต่างจังหวัด) ใช้เวลาโหลดกระดานนาทีกว่า — ทำลายข้อความ "เล่นได้เลยไม่ต้องสมัคร"
- กิน quota Cloudflare bandwidth เร็วโดยไม่จำเป็น

**แก้ยังไง:**

```bash
# ลอง svgo ก่อน — มักลดได้ 70-95% โดย path ยังคมเหมือนเดิม
npx svgo -f public/pieces --multipass

# ถ้ายังใหญ่ ลอง simplify path:
npx svgo -f public/pieces --multipass \
  --enable=convertPathData \
  --config='{plugins:[{name:"convertPathData",params:{floatPrecision:1}}]}'
```

ตั้งเป้าให้แต่ละไฟล์ ≤ 20 KB. ถ้า trace ละเอียดเกินจริงจนลดไม่ได้ พิจารณาใช้ piece set ที่ออกแบบเป็น vector clean ตั้งแต่แรก (Cburnett, Pirat, Chesscom Makruk set ฯลฯ)

ผลที่คาดหวัง: หน้าแรกลดจาก ~15 MB → ~500 KB (30 เท่า)

---

### 🔴 2. ไม่มี `robots.txt` และ `sitemap.xml`

**สิ่งที่พบ:**

```bash
curl https://openmakruk.com/robots.txt  → 200 OK + HTML ของ index.html (SPA fallback)
curl https://openmakruk.com/sitemap.xml → 200 OK + HTML ของ index.html
```

Cloudflare Pages ตั้ง catch-all → คืน `index.html` ทุก path ที่ไม่ใช่ static asset ผลคือ Google/Line/Twitter crawler ได้ HTML เป็น sitemap.xml — งง และอาจถูก demote

**แก้ยังไง — เพิ่มไฟล์ใน `public/`:**

`public/robots.txt`:
```
User-agent: *
Allow: /
Sitemap: https://openmakruk.com/sitemap.xml
```

`public/sitemap.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://openmakruk.com/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
```

(เนื่องจาก routing เป็น hash-based `/#/puzzles` crawler มอง URL แค่ตัวเดียวอยู่แล้ว — sitemap ตัวเดียวพอ)

ถ้าอนาคตอยากให้ Google index หน้าแต่ละ tab แยกกัน ต้องเปลี่ยน routing เป็น HTML5 history + pre-rendering (เกินขอบเขต v0.1)

---

### 🔴 3. ไม่มี ESLint / Prettier config

```bash
ls .eslintrc* .prettierrc* eslint.config.*   → No such file
```

โปรเจกต์ TS 16,843 บรรทัด · App.tsx เดียว 2,772 บรรทัด → ไม่มี lint จะ regress เร็วเมื่อ contributor เข้ามา

**แก้ยังไง:** เพิ่ม minimal config:

```bash
npm i -D eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser \
  eslint-plugin-react eslint-plugin-react-hooks prettier
```

`eslint.config.js` ใช้ flat config + react-hooks/exhaustive-deps + @typescript-eslint/no-unused-vars เป็น error · เพิ่ม `npm run lint` ใน CI ก่อน build

---

### 🟡 4. Accessibility

**สิ่งที่พบ:**

```
document.querySelectorAll('[aria-label]').length  → 0
document.querySelectorAll('[aria-live]').length   → 0
```

สำหรับ chess game ปกติต้องมี:

- `aria-live="polite"` บนพื้นที่บอกตา/eval — เพื่อให้ screen reader อ่านตาเดินขึ้นมา
- `aria-label` บนปุ่ม icon-only (♔, 🎓, ⚙️ tabs ปัจจุบันมี text กำกับอยู่ — ดี — แต่ปุ่ม flip board, hint, undo อาจไม่มี)
- `role="grid"` + `aria-rowindex/colindex` บนกระดาน (chessground อาจไม่ใส่ให้ ต้อง wrap)
- Keyboard navigation: ตอนนี้กระดานคลิกอย่างเดียว — ผู้ใช้ keyboard เล่นไม่ได้

ไม่ต้องทำครบทันที แต่อย่างน้อย:
1. ใส่ `aria-label` ให้ทุกปุ่ม icon-only
2. ใส่ `aria-live="polite"` ให้ "ตาของคุณ / ตาคอม" indicator
3. เพิ่มหน้า lesson "ใช้งานกับ screen reader" ใน About

---

### 🟡 5. Cache headers ของ asset ที่มี hash

```
GET /assets/index-D8vvfzLb.js
Cache-Control: public, max-age=14400, must-revalidate   ← เพิ่งโหลดใหม่ทุก 4 ชม.
```

ไฟล์ที่ Vite output มี content hash ในชื่อ (`index-D8vvfzLb.js`) → ไม่มีวันเปลี่ยนเนื้อหา → ควรเป็น `immutable` cache 1 ปี

**แก้ยังไง — `public/_headers` (Cloudflare Pages):**

```
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/*.wasm
  Cache-Control: public, max-age=31536000, immutable

/pieces/*
  Cache-Control: public, max-age=2592000

/content/*
  Cache-Control: public, max-age=300, must-revalidate

/
  Cache-Control: public, max-age=0, must-revalidate
```

ผลที่คาดหวัง: repeat visit ไม่ revalidate JS/WASM → page load ใน <300 ms แทนที่จะรอ 304s

---

### 🟡 6. App.tsx ยาว 2,772 บรรทัด

State `useState` 20+ ตัวใน component เดียว · effect chains หลายชั้น · เป็นจุดที่ refactor เปอร์เซ็นต์สูงสุดในระยะยาว

**แก้ยังไง (ไม่เร่ง):**

- แตก `useGameState()`, `useReview()`, `useExploreVariation()`, `useClock()` เป็น hooks แยก
- ย้าย UI ของ side panel (rating, recommended level, recent games) ไปเป็น component ของตัวเอง
- ตั้งกฎ: ไม่เพิ่ม useState ใหม่ใน App.tsx ตั้งแต่ commit ถัดไป — ถ้าจำเป็นให้แตก hook ก่อน

---

### 🟡 7. Security headers ที่ขาด

`/` response มี COOP/COEP + `referrer-policy: strict-origin-when-cross-origin` + `x-content-type-options: nosniff` (ดี) แต่ยังขาด:

- **Content-Security-Policy** — แม้แค่ `report-only` ก็ช่วย catch XSS ในอนาคต
- **Strict-Transport-Security** — แนะนำ `max-age=15552000; includeSubDomains; preload`
- **Permissions-Policy** — ปิด feature ที่ไม่ใช้ (camera, geolocation, payment ฯลฯ)

เพิ่มใน `public/_headers`:

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  Strict-Transport-Security: max-age=15552000; includeSubDomains
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://*.workers.dev; worker-src 'self' blob:
```

(หา origin ของ NNUE network ที่โหลดจาก jsDelivr มาเติมใน connect-src)

---

### 🟢 8. Tap targets เล็กบน mobile

```js
[...document.querySelectorAll('button,a')]
  .filter(e => { const r = e.getBoundingClientRect(); return r.width<32 || r.height<32; })
  .length  → 2
```

WCAG แนะนำ touch target ≥ 44×44 px. ที่พบ ≤ 32 px จะเล็กเกินไป — เช็คว่าเป็นปุ่ม "ข้าม X" ของ welcome modal หรือเปล่า (น่าจะใช่)

---

### 🟢 9. OG image เป็น SVG

```
og:image: https://openmakruk.com/og.svg
```

Facebook + LINE บางครั้งไม่ render SVG บน share preview. ทำ PNG fallback 1200×630 (build step: `sharp og.svg -o og.png`) แล้วชี้ `og:image` ไป PNG, เก็บ SVG เป็น primary ของ Twitter ได้

---

### 🟢 10. PROJECT_NOTES.md มี v0.6+ plans ปนกับ v0.1 reality

อ่านแล้วต้องตีความว่า "Sync code 128-bit" คือ done หรือ planned (จริงๆ planned · ตอนนี้ใช้ bearer token แล้ว). แยกเป็นสองไฟล์:

- `DECISIONS.md` — สิ่งที่ตัดสินใจแล้วและเป็นจริงในโค้ด
- `ROADMAP.md` — v0.2+ plans

หรือใส่ status tag `[DONE]` / `[PLANNED]` / `[REJECTED]` หัวแต่ละ section

---

## คะแนนแยกหมวด (1–5)

| หมวด | คะแนน | หมายเหตุ |
|---|---|---|
| Vision & docs | 5 | README + PROJECT_NOTES คุณภาพหายากในโปรเจกต์ portfolio |
| Architecture | 5 | offline-first + opt-in cloud + plugin contracts ครบ |
| Code quality | 3.5 | TS ครบ, comment เยอะดี, แต่ไม่มี lint + App.tsx ยาวเกิน |
| Testing & CI | 4.5 | E2E + integration ครบ, CI ระดับมืออาชีพ |
| Performance | 2.5 | JS bundle เล็ก แต่ piece SVGs 14 MB กลบทุกอย่าง |
| SEO | 2 | meta tags ดี แต่ไม่มี robots/sitemap + hash routing |
| Accessibility | 2 | semantic HTML พื้นฐานมี แต่ aria/keyboard ว่าง |
| Security | 4 | COOP/COEP + CORS scoped + token hashing ดี, ขาด CSP/HSTS |
| Privacy | 5 | PDPA-friendly by default, cookieless analytics |
| **รวม** | **3.7** | production-ready, มี 3-4 จุดให้แก้แล้วขึ้น 4.5+ |

---

## ลำดับงานที่แนะนำ

**สัปดาห์นี้ (≤ 1 วัน):**

1. ✂️ `svgo` piece SVGs (1 ชม.)
2. 📄 เพิ่ม `public/robots.txt` + `public/sitemap.xml` (10 นาที)
3. 🔒 ปรับ `_headers` ให้ assets `immutable` + เพิ่ม HSTS/Permissions-Policy (30 นาที)
4. 🎨 PNG fallback ของ `og.svg` สำหรับ Facebook/LINE share (15 นาที)

**สัปดาห์หน้า (≤ 1 วัน):**

5. 🧹 เพิ่ม ESLint + Prettier + pre-commit hook + `npm run lint` ใน CI
6. ♿ ใส่ `aria-label` ปุ่ม icon-only + `aria-live="polite"` บน turn indicator
7. 🧪 เพิ่ม Lighthouse CI ใน workflow (gate PR ถ้า perf < 90)

**v0.2 roadmap:**

8. แตก App.tsx เป็น hooks/components — ตั้ง budget ≤ 800 บรรทัด
9. CSP enforce (จาก Report-Only ก่อนแล้วค่อย enforce)
10. Keyboard navigation บนกระดาน (chessground มี API)

---

## สรุป

โปรเจกต์มีคุณภาพระดับที่ **เกินมาตรฐาน portfolio ทั่วไป** — มี vision, มี decisions log, มี test pyramid จริง, มี anti-cheat ที่ทำงานจริง, ออกแบบ privacy ตั้งแต่ต้น

ที่ทำให้ "ดูยังไม่ขัด" คือ piece SVGs + ขาด robots/sitemap — แก้สองอย่างนี้ใช้เวลาไม่ถึง 2 ชม. แต่จะเปลี่ยน first-impression อย่างมาก

ส่วนงาน refactor App.tsx + accessibility เป็น marathon ระยะยาว ปล่อยไว้ใน roadmap v0.2 ได้
