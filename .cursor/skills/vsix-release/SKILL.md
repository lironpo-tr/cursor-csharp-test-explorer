---
name: vsix-release
description: Build and package a new VSIX release version. Use when the user asks to build a release, create a new version, package the VSIX, or publish the extension.
---

# VSIX Release Workflow

When asked to build a new VSIX version (or "create a release", "new version", "package vsix", etc.), follow these steps strictly.

## 1. Merge the Release PR

Find and merge the open release-please PR into `main`:

```powershell
gh pr list --label "autorelease: pending"
gh pr merge <pr-number> --merge
```

If no release PR exists, stop and inform the user.

## 2. Pull Latest Main

```powershell
git checkout main
git pull origin main
```

## 3. Build the VSIX

```powershell
npm run package
```

This compiles the extension and outputs the `.vsix` file into the `releases/` folder.

## 4. Confirm

Report to the user:
- The version number (from `package.json`).
- The path to the generated `.vsix` file in `releases/`.
