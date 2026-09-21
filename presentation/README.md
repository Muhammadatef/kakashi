# Kakashi Manager Presentation

Files:

- `Kakashi_Manager_Briefing.pptx` — editable PowerPoint presentation.
- `Kakashi_Manager_Briefing.pdf` — portable backup for the meeting.
- `Kakashi_Manager_Briefing.fodp` — editable open presentation source.
- `SPEAKER_NOTES.md` — concise notes and transitions for every slide.
- `build.js` — dependency-free source generator for the `.fodp` deck.

The deck follows the six independently runnable cases in `demos/` and avoids
claims that Kakashi guarantees or certifies legal compliance.

## Rebuild

On a machine with Node.js and LibreOffice:

```bash
node presentation/build.js
libreoffice --headless --convert-to pptx --outdir presentation \
  presentation/Kakashi_Manager_Briefing.fodp
libreoffice --headless --convert-to pdf --outdir presentation \
  presentation/Kakashi_Manager_Briefing.fodp
```

Open the PowerPoint once before the meeting to confirm that the installed fonts
have not caused line wrapping. The design uses a common sans-serif family with
safe substitutes across Linux, Windows, and macOS.
