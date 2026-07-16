# Claude memory backup

Claude Code stores per-project memory notes keyed to the project's **folder path**, so
renaming/moving the project folder starts that memory context fresh. This folder is a
portable copy of those notes so they survive the move.

## Restore after moving/renaming the folder

After reopening the project at its new path (e.g. `D:\Personal Websites\rodict`), tell
Claude: **"restore the memory notes from docs/claude-memory"**. Claude will re-create each
`.md` file here into the new session's memory directory and rebuild the `MEMORY.md` index.

Files here are the raw memory notes (with their frontmatter) exactly as stored.
