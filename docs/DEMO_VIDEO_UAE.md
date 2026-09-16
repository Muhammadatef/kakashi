# Kakashi UAE Demo Video — Production Kit

**Target length:** 60 seconds
**Aspect ratio:** 1080×1080 (square) or 1080×1350 (4:5 vertical) — never 16:9
**Format:** Native `.mp4`, H.264, ≤200 MB
**Captions:** Burned onto every frame (75% of LinkedIn plays are muted)
**Voiceover:** Optional but recommended; bilingual (English + Arabic subtitles)
**Distribution:** LinkedIn native upload, UAE AI Award portal, GitHub README banner

---

## Purpose

Reinforces the **"Agentic AI Solutions Developed in the UAE"** category story by using UAE-specific data (Emirates ID, Arabic names, UAE mobile, UAE IBAN) in every frame.

---

## Shot list — 8 shots, 60 seconds

| # | Sec | Frame | Voiceover (EN) | Voiceover (AR) | On-screen caption |
| :-: | :-: | --- | --- | --- | --- |
| 1 | 0–3 | Split-screen: `customers_uae.csv` open in Excel (left, showing Ahmed Al Mansouri, Emirates ID 784-..., email, +971-50-...) + a 40-page contract PDF scrolling (right) | "You didn't read every cell. You didn't scroll every page." | "لم تقرأ كل خلية. لم تتصفح كل صفحة." | "You didn't read every cell." |
| 2 | 3–8 | Both files being dragged into a ChatGPT / Claude / Cursor chat window | "One paste. Real Emirates IDs, IBANs, and credentials — gone." | "لصقة واحدة. هويات إماراتية، إيبانات، واعتمادات — ذهبت." | "One paste. Real UAE data gone." |
| 3 | 8–15 | Cut to terminal running `kakashi scan customers_uae.csv` — categorised counts appear ("16 ID & docs · 10 personal info · 5 credentials") | "Kakashi scans locally first. Zero network calls. Ever." | "Kakashi يفحص محلياً أولاً. صفر مكالمات شبكية. أبداً." | "Kakashi scans LOCALLY. Zero network." |
| 4 | 15–22 | Same terminal running `kakashi scan long_contract.pdf` — findings pop up including a buried API key on "page 23" | "Even buried on page 23 — Kakashi finds it." | "حتى المدفون في الصفحة 23 — Kakashi يجده." | "Even on page 23 — Kakashi catches it." |
| 5 | 22–32 | `kakashi mask` runs on both files; `masked_customers_uae.csv` and `masked_long_contract.md` appear in the file manager | "Writes a safe-to-share version. The original stays untouched." | "يكتب نسخة آمنة للمشاركة. الأصل يبقى دون تغيير." | "Writes a safe copy. Original untouched." |
| 6 | 32–45 | Split-screen diff: original vs masked. Names → `[NON_LATIN_NAME_1]`, Emirates IDs → `[NATIONAL_ID_1]`, IBANs → `[UAE_IBAN_1]`, API keys → `[OPENAI_KEY_1]` | "Real data becomes typed tokens. Consistent across the file." | "بيانات حقيقية تتحول إلى رموز مطبعة. متسقة في الملف." | "Real data → typed tokens. Consistent." |
| 7 | 45–55 | Cursor / Claude chat window: typing `/kakashi-mask /path/to/file` — result renders inline. Cut to `kakashi agent-guard --watch ./project` running in a terminal, showing an HTTP GET /health response | "Inside 20+ AI agents. Plus a local privacy daemon any agent can consult." | "داخل أكثر من 20 وكيل ذكاء اصطناعي. بالإضافة إلى خدمة خصوصية محلية." | "20+ agents + local privacy daemon." |
| 8 | 55–60 | End card: Kakashi mask logo · UAE flag icon · text: "Sovereign privacy for agentic AI. `npm install -g @muhammadatef/kakashi`. Made in the UAE." | "Sovereign privacy for agentic AI. Open source. Made in the UAE." | "خصوصية سيادية للذكاء الاصطناعي. مفتوح المصدر. صُنع في الإمارات." | "Sovereign privacy. Made in the UAE." |

---

## Voiceover script — full

### English (approx. 45 seconds when spoken at a natural pace)

> "You didn't read every cell. You didn't scroll every page.
>
> One paste — and real Emirates IDs, IBANs, and credentials leave your machine forever.
>
> Kakashi scans locally first. Zero network calls, ever. Even buried on page 23 of a contract — Kakashi finds it.
>
> It writes a safe-to-share version. The original stays untouched. Real data becomes typed tokens, consistent across the file.
>
> Kakashi lives inside 20+ AI agents — Cursor, Claude, Copilot, Codex — plus a local privacy daemon any agent can consult before shipping data.
>
> Sovereign privacy for agentic AI. Open source. Made in the UAE."

### Arabic (approx. 45 seconds — for a bilingual cut)

> "لم تقرأ كل خلية. لم تتصفح كل صفحة.
>
> لصقة واحدة — وهويات إماراتية حقيقية، وإيبانات، واعتمادات، تغادر جهازك للأبد.
>
> Kakashi يفحص محلياً أولاً. صفر مكالمات شبكية. حتى المدفون في الصفحة 23 من عقد — Kakashi يجده.
>
> يكتب نسخة آمنة للمشاركة. الأصل يبقى دون تغيير. بيانات حقيقية تتحول إلى رموز مطبعة، متسقة في الملف.
>
> Kakashi يعيش داخل أكثر من 20 وكيل ذكاء اصطناعي — Cursor و Claude و Copilot و Codex — بالإضافة إلى خدمة خصوصية محلية يمكن لأي وكيل استشارتها قبل شحن البيانات.
>
> خصوصية سيادية للذكاء الاصطناعي. مفتوح المصدر. صُنع في الإمارات."

---

## Fixture files to prepare (before recording)

Use only SYNTHETIC UAE-shaped data. Never record real files.

1. **`customers_uae.csv`** — 20 rows of `id, name (mix EN + AR), emirates_id, email, phone, iban`. Ready-made in `tests/fixtures/uae_sample.md` (adapt to CSV).
2. **`long_contract.pdf`** — a 40-page PDF where page 23 contains an "OPENAI_API_KEY = sk-proj-..." line buried in an appendix table. Generate with LibreOffice or from Markdown via `pandoc`.
3. **`board_deck.pptx`** — one slide with a screenshot of a database export table. Optional; only needed if you want to demo PPTX support in-camera.

---

## Filming tips (UAE-specific)

- **Framing:** shoot on a screen that shows the Cursor UI in Arabic — with `Kakashi` still visible in English, the bilingual signal is instant.
- **Color:** avoid the UAE flag colors as UI accents — they're saturated and can look like an official government asset when they're not.
- **Music:** licensed royalty-free electronic-Arabic fusion — Envato has good tracks tagged "UAE ambient." Keep volume at –18 LUFS so the voiceover cuts through.
- **Terminal font:** JetBrains Mono at 24pt — reads on a 6-inch phone.

---

## Publish checklist

- [ ] Video is ≤60 seconds
- [ ] 1080×1080 or 1080×1350 aspect ratio confirmed
- [ ] Captions burned onto every frame (no auto-CC dependency)
- [ ] All UAE data in the video is synthetic (no real Emirates IDs, no real phone numbers)
- [ ] End card visible for ≥3 seconds
- [ ] Bilingual variant exported separately for the Arabic-first LinkedIn audience
- [ ] LinkedIn native upload (NOT a YouTube link)
- [ ] GitHub README banner (`docs/assets/demo.gif`) — 800×800, ≤3 MB
- [ ] Submitted to the UAE AI Award portal as supporting evidence
