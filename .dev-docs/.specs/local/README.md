# .specs/local

Purpose

- Store machine- or developer-specific notes, private experiment files, and temporary scripts.

Visibility & git

- This directory is intended to remain local and should be ignored by git.
- The only file under `.specs/local/` intended for sharing is this `README.md`.

Recommended `.gitignore` entry

``` text
.specs/local/*
!.specs/local/README.md
```

Usage

- Put anything that must not be committed (credentials, local run scripts, scratch files) under `.specs/local/`.
- Keep the shared `README.md` minimal and use it to point other developers to local conventions.
