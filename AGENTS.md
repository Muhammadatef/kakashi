<!-- kakashi-begin -->
## Kakashi

Kakashi is installed. You have a `kakashi` CLI tool available.

### Core Rule — ALWAYS ENFORCE

Before sharing, pasting, uploading, or sending ANY file content to an external
service, LLM API, or user outside this session:

1. Run `kakashi scan <file>` to check for sensitive data
2. If findings > 0, run `kakashi mask <file>` and use the masked version
3. NEVER paste raw contents of files that may contain credentials,
   national IDs, passports, emails, phone numbers, or personal records

### Slash Commands Available

/kakashi-mask <file>       — Mask a file and show what was changed
/kakashi-scan <file>       — Scan a file, report findings, don't write anything
/kakashi-audit <file>      — Full audit: show original→masked mapping per finding

### Important

- All processing is LOCAL. No data sent anywhere.
- kakashi writes masked_<filename> — never overwrites originals by default

**Auto-check on file operations:** When you read a file that a user intends
to share, automatically run `kakashi scan` on it first.
<!-- kakashi-end -->
