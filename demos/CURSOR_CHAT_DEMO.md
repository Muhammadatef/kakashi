# Running the Complete Kakashi Demo from Cursor Chat

Cursor automatically discovers the project commands in `.cursor/commands/`.
Use Cursor **Agent** mode so it can run the local terminal commands.

## Before the meeting

1. Open the Kakashi repository folder in Cursor.
2. Check out `feat/manager-demo-kit` or a branch containing this folder.
3. Open a new Agent Chat.
4. Type `/` and select `kakashi-demo-start`.
5. Approve local terminal execution when Cursor asks.

Do not attach demo files with `@`. The slash commands pass filesystem paths to
Kakashi so scanning happens before content could enter model context.

## Live sequence

Enter these commands one at a time in Cursor Chat:

```text
/kakashi-demo-start
/kakashi-demo-file
/kakashi-demo-folder
/kakashi-demo-database
/kakashi-demo-guardian
/kakashi-demo-sidecar
/kakashi-demo-operations
```

Each command runs the real local CLI, waits for assertions, explains the case in
manager-friendly language, and prints the next command. Generated source data
stays in the ignored `demos/.work/` directory and is never intentionally read
into the chat.

For a private rehearsal, run:

```text
/kakashi-demo-all
```

## What the manager sees

- Cursor is the visible chat interface and presenter.
- Kakashi runs locally through Cursor's terminal tool.
- Scan results expose counts rather than source values.
- Guardian gives Cursor an explicit release decision and safe artifact path.
- Cursor stops when approval is required or release is blocked.
- Reports and operational evidence are generated locally.

## If commands do not appear

Confirm that Cursor opened the repository root containing `.cursor/commands/`,
then start a new chat or reload the workspace. Project commands are detected
from that directory and appear in the `/` menu.
