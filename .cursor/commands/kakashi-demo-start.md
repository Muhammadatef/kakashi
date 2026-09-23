---
description: Start the Kakashi manager demo in Cursor Agent Chat
---

# Start the Kakashi manager demonstration

Act as the live presenter. Keep all execution local and do not attach or inspect
any generated raw input file.

## Run

1. Confirm the terminal is at the Kakashi repository root.
2. If dependencies are missing, run `npm install`; otherwise do not reinstall.
3. Run `node bin/kakashi.js --version`.
4. Run `node bin/kakashi.js list-patterns`.
5. Run `node bin/kakashi.js guard --help`.
6. Run `node tests/cursor-demo.test.js`.

Stop if a command has an operational failure. Pattern output is safe to show.

## Explain in chat

Report:

- The installed Kakashi version.
- The number and three categories of active patterns.
- The three product layers: file engine, folder/database reach, and Guardian.
- That processing is local and the demo uses runtime-generated synthetic data.
- That Cursor's always-on Kakashi rule is active for this workspace.

End with: `Next: /kakashi-demo-file`
