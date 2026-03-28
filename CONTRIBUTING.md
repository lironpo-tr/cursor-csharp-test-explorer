# Contributing to C# Test Explorer

## Install from Source

```bash
git clone https://github.com/lironpo-tr/cursor-csharp-test-explorer.git
cd cursor-csharp-test-explorer
npm install
npm run compile
npx @vscode/vsce package --allow-missing-repository
# Then: Cursor → Extensions → ⋯ → Install from VSIX
```

## Development

```bash
npm install          # install dependencies
npm run compile      # build once (tsc)
npm run watch        # rebuild on changes
npm test             # run unit tests
npm run lint         # check for lint errors
npm run format       # format code with Prettier
```

Press **F5** in Cursor / VS Code to launch an Extension Development Host with the extension loaded.

### Auto-Generated README Sections

The **Extension Settings** and **Commands** sections in `README.md` are generated from `package.json` by `scripts/update-readme.mjs`. A pre-commit hook verifies they stay in sync. To update them:

```bash
npm run readme:update
```

## Tech Stack

- **TypeScript** (strict mode, ES2022, CommonJS output)
- **VS Code Extension API** (`^1.85.0`)
- **fast-xml-parser** — TRX result parsing
- **Vitest** — unit testing
- **ESLint + Prettier** — linting and formatting
- **@vscode/vsce** — VSIX packaging

## Architecture

```
src/
├── extension.ts            # Entry point: activates CSharpTestController, registers commands
├── testController.ts       # Core orchestrator: wires discovery + execution + debug
├── discovery/
│   ├── projectDetector.ts  # Finds .csproj files in the workspace
│   ├── dotnetDiscoverer.ts # Runs `dotnet test --list-tests` to discover tests
│   ├── sourceMapper.ts     # Maps discovered tests back to source file locations
│   └── patterns.ts         # Shared regex patterns for test attribute detection
├── execution/
│   ├── testRunner.ts       # Executes `dotnet test` with filters
│   ├── filterBuilder.ts    # Builds --filter expressions for dotnet test
│   ├── trxParser.ts        # Parses TRX result files
│   └── resultMatcher.ts    # Matches TRX results back to TestItems
├── debug/
│   └── debugLauncher.ts    # Launches dotnet test with debugger attached
├── ui/
│   ├── testTreeProvider.ts # TreeDataProvider for the sidebar test tree view
│   └── statusBarManager.ts # Status bar indicator for test runs
└── utils/
    ├── logger.ts           # Logger interface for injectable logging abstraction
    ├── outputChannel.ts    # OutputChannelLogger implementation + convenience wrappers
    ├── dotnetCli.ts        # Wrapper for spawning dotnet CLI processes
    └── testItemUtils.ts    # Shared helpers for TestItem tag storage and parent-chain lookups
```

### Key Flows

1. **Discovery**: projectDetector → dotnetDiscoverer → sourceMapper → testController builds TestItem tree
2. **Execution**: testController → filterBuilder → testRunner → trxParser → resultMatcher → updates TestItem states
3. **Debug**: testController → debugLauncher (attaches VS Code debugger to dotnet test process)
