# Gridline Sudoku

A minimal, soft-toned Sudoku game with a shared leaderboard, built as a single HTML page and hosted as a claude.ai Artifact.

## Features
- Four difficulties (Easy 38, Medium 32, Hard 28, Expert 24 givens), each puzzle generated in the browser with a unique solution
- Mistake check you can switch on or off: each flagged wrong number adds 10s
- Hints: each one fills a cell and adds 30s
- Pencil notes: Notes mode (button or N) or Shift+1–9 for a quick note; placing a number clears that digit from notes in its row, column and box
- Undo/redo, keyboard play (1–9, arrows, Backspace, N, Shift+1–9, Ctrl+Z / Ctrl+Shift+Z), and a touch number pad
- The clock pauses when the tab is hidden; an in-progress game survives a reload
- Leaderboard: top 20 runs per difficulty, ranked by clock time plus penalties, posted under a typed nickname

## Leaderboard storage
Scores are kept in the Artifact's `db` capability in the `scores` collection:
`{ name, difficulty, time, raw, mistakes, hints, givens, at }`, where `time` = `raw` + 10·mistakes + 30·hints, both in seconds.

Posting needs a signed-in viewer with Contributor access or higher. Viewers can see the board but not post.
