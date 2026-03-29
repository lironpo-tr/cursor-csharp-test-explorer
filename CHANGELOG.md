# Changelog

## [0.8.5](https://github.com/lironpo-tr/cursor-csharp-test-explorer/compare/cursor-csharp-test-explorer-v0.8.4...cursor-csharp-test-explorer-v0.8.5) (2026-03-29)


### Bug Fixes

* only add numeric suffix for fractional values, not plain integers ([dad64e5](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/dad64e5355803363f52ebef5c926e30bae61e25d))
* only add numeric suffix for fractional values, not plain integers ([9a91ecf](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/9a91ecfe0a4e6c8d257adf0905a3ab917a7cc657))

## [0.8.4](https://github.com/lironpo-tr/cursor-csharp-test-explorer/compare/cursor-csharp-test-explorer-v0.8.3...cursor-csharp-test-explorer-v0.8.4) (2026-03-29)


### Bug Fixes

* format TestCase params using method signature types to match NUnit canonical names ([78b7280](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/78b7280a7da21b898f6f0c4f9cc24b0f18c09e87))
* format TestCase params using method signature types to match NUnit canonical names ([6d4c622](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/6d4c622d16a4ac29bd9d9a798813248ccb2fb536))
* strip enum prefixes and handle null in formatParamValue during discovery ([c4d3cb4](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/c4d3cb42243726aeaea74aeee2977577067b3d04))


### Miscellaneous

* convert workflow rules to on-demand skills ([8f4adba](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/8f4adba2b76bf72de0275d7d8eddd40d27a35234))
* convert workflow rules to on-demand skills ([cbe7048](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/cbe7048e4d853c8d5ffddb5df81851cae3783fe0))

## [0.8.3](https://github.com/lironpo-tr/cursor-csharp-test-explorer/compare/cursor-csharp-test-explorer-v0.8.2...cursor-csharp-test-explorer-v0.8.3) (2026-03-29)


### Bug Fixes

* normalize enum prefixes and boolean casing in test name matching ([f3ae135](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/f3ae135b0a1980ffd7cfb903089274eba7e0b12a))
* normalize enum prefixes and boolean casing in test name matching ([0cd3483](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/0cd3483be478240d555462d97656d8366f7b9424)), closes [#53](https://github.com/lironpo-tr/cursor-csharp-test-explorer/issues/53)


### Miscellaneous

* add repository field to package.json ([1eb086c](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/1eb086c8f657af8a07a0563de3b855d06026fd7c))

## [0.8.2](https://github.com/lironpo-tr/cursor-csharp-test-explorer/compare/cursor-csharp-test-explorer-v0.8.1...cursor-csharp-test-explorer-v0.8.2) (2026-03-29)


### Bug Fixes

* prevent duplicate parameterized case nodes after test run ([b2360c2](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/b2360c2bb52d9375d320441db0cf518382ed2e56))
* prevent duplicate parameterized case nodes after test run ([a6f79fc](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/a6f79fcac83260857fd22a4a610582de43599154))
* quote dotnet test filter to prevent shell pipe interpretation ([b1bea1d](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/b1bea1deab494866bc736497408a7038214f707c))
* quote dotnet test filter to prevent shell pipe interpretation ([67da624](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/67da624500fd6b2b1f36b084971ca0705884e2ad))


### Miscellaneous

* add investigation workflow rule for cross-session findings ([d26bf8a](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/d26bf8ab1f7f9d63dd213dc9ba02250538f516df))
* add investigation workflow rule for cross-session findings ([a5dba0a](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/a5dba0a0b796f3d681822f6327a2295ded6f8ea9))
* add VSIX release workflow rule ([ed922ef](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/ed922efbcbfc0c33061d61fc3c3c477d01e49164))
* add VSIX release workflow rule ([09dc00b](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/09dc00b283ee1ea9b0540af1bb70e76037d20e0a))
* improve investigation workflow with explore-first and pause-before-implementation ([d0584bf](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/d0584bff0eea7ff71382daa91dd451313c00cd5e))
* improve investigation workflow with explore-first and pause-before-implementation ([73a6306](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/73a63067a731434a74b5732cb026506c4a27aa5a))

## [0.8.1](https://github.com/lironpo-tr/cursor-csharp-test-explorer/compare/cursor-csharp-test-explorer-v0.8.0...cursor-csharp-test-explorer-v0.8.1) (2026-03-28)


### Bug Fixes

* mark entire subtree as Running during test execution ([b5dc2a1](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/b5dc2a14295f930215a49184a7b6d607690a4462)), closes [#39](https://github.com/lironpo-tr/cursor-csharp-test-explorer/issues/39)
* match TestCaseSource results to discovered test nodes ([ac32bd0](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/ac32bd07831c4a8feab57a1bf673305f05f1b72e))
* match TestCaseSource results to discovered test nodes ([f9b735e](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/f9b735e5e06a6f9f898bf0d1cd53e078b766bcae))
* parent Running state + docs: user-facing README ([571932a](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/571932a3e4d26e0e0a15b77afd6ad4908cadba71))


### Documentation

* restructure README as user-facing Details page ([6044497](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/6044497af5850546d2a7af410670727d015643fe)), closes [#42](https://github.com/lironpo-tr/cursor-csharp-test-explorer/issues/42)


### Tests

* add multi-select result matching coverage for issue [#38](https://github.com/lironpo-tr/cursor-csharp-test-explorer/issues/38) ([b195563](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/b1955633f6143a819a9a534339380faf026740f4))
* verify multi-select test run results work correctly ([a2c6487](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/a2c64874e4d8da1c8606fb2e30f87dbb7085c51d))

## [0.8.0](https://github.com/lironpo-tr/cursor-csharp-test-explorer/compare/cursor-csharp-test-explorer-v0.7.0...cursor-csharp-test-explorer-v0.8.0) (2026-03-28)


### Features

* **execution:** support running multiple selected tests at once ([4e3c17f](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/4e3c17f88f18c3853bbf01d64b6bfa3af0e922e4))
* **execution:** support running multiple selected tests at once ([e050f7d](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/e050f7da3bba1b3a511fda233d2a8cf35dce30d7))
* **ui:** add search bar to filter tests by name ([01d8c35](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/01d8c352317bdb4d87b82985eed0ad36be8d3036))
* **ui:** add search bar to filter tests by name ([41b0bb0](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/41b0bb0348c76893050d1ad9c17b7ed3bc45c976))
* **ui:** collapse tree nodes by default for lazy-load UX ([2408b39](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/2408b3961b757e2b8be7130873d2244f3b6c7b7f))
* **ui:** collapse tree nodes by default for lazy-load UX ([0b51d94](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/0b51d94d038f3a9861919d102da1b5b2915adcbb))


### Bug Fixes

* capture errors in bare catch blocks and add trace logging for cleanup ([ef3e51a](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/ef3e51aab2ea9d1c1c14ead95b66e1683c57d703))
* handle bare catch blocks and improve error handling ([00fe311](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/00fe311b1c7e57d28886d1a6b9e7b61256c87513))
* isolate per-project errors in runAll to prevent skipping projects ([3661ea6](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/3661ea6cd506c223de7f71dd26fb266bfd0adb76))
* isolate per-project errors in runAll to prevent skipping projects ([dc67870](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/dc6787051cb13d83458149aaa2db4efd1e1805c8)), closes [#7](https://github.com/lironpo-tr/cursor-csharp-test-explorer/issues/7)
* replace require() with ES import in trxParser ([1898813](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/189881310db3bdf01343517a521201c2ea211a8e))
* replace require() with ES import in trxParser ([4cc3032](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/4cc30320b8cdcec827363a74fcfb3f9c516b70a8))
* resolve TRX results not found error by scanning directory and adding retry logic ([782d6b6](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/782d6b6d1ad6f5f5afabc7d6697c862a19e34c1d))
* resolve TRX results not found error on some test runs ([02956a0](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/02956a0bb3ae72962c91efb451a8196737666ac7))
* validate project path before test execution and use precise FQN filters ([dccb202](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/dccb202d4a025cd1eb2759918f41f5dd5acc2a84))
* validate project path before test execution and use precise FQN filters ([87f33e1](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/87f33e12e4f23d183df777ff1261ebb9b67d4045))


### Code Refactoring

* break up CSharpTestController god class (SRP) ([81baa1f](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/81baa1f658802e34ce62bf87aab5f5ceefc27e7e))
* break up CSharpTestController into focused modules (SRP) ([bce4c1a](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/bce4c1a1fb01dc0139a623d8d9bb2667c623da14)), closes [#12](https://github.com/lironpo-tr/cursor-csharp-test-explorer/issues/12)
* eliminate duplicated code (DRY violations) ([4736229](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/47362294b932be71473327ac55b085635e26ad47))
* extract markRunningNodesAsFailed helper and improve test robustness ([210b2c7](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/210b2c702d44753d24c839eede5ecb50a2b41f23))
* extract shared patterns and TestItem utilities to eliminate DRY violations ([8b08daa](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/8b08daa03fba6f9ecd1edfa956e49071fd28a0c1))
* make outputChannel injectable via Logger interface ([03848e8](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/03848e85dfefe9dddfccfcd72a09191921737ec6))
* make outputChannel injectable via Logger interface ([bed39c6](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/bed39c6d1ce76525bbfa9661052bf516d0d92f5e))
* **trx:** add type definitions for parsed TRX XML structure ([1e2a5f5](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/1e2a5f55abd126a068a47fe32b58dd3470188647))
* **trx:** add type definitions for parsed TRX XML structure ([65e6b14](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/65e6b141a9837122604940b925684889c5d857e8))
* use readonly arrays and as-const for immutable data ([1180f55](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/1180f55d8afd781c4a55f6ff68cb68d97f8bbb3a))
* use readonly arrays and as-const for immutable data ([6b6a0d7](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/6b6a0d7f41754c2ed1d2d3ef28631e4e1c2b4515))


### Miscellaneous

* add ESLint and Prettier configuration ([cc776d9](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/cc776d97851e35998c4a77bab5ae038db88b4eb4))
* add ESLint and Prettier configuration ([c8419fa](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/c8419fa57f02581a14da4ad9544fbb7ec35f99f3)), closes [#11](https://github.com/lironpo-tr/cursor-csharp-test-explorer/issues/11)
* add MIT license ([0248a49](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/0248a497994273abf7882bd08bf6e0a56f3c438f))
* add project context rule for faster issue onboarding ([d91fd78](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/d91fd789eae6b2b357cfa99a35745a4c9c4804e1))
* add release-please for automated versioning and changelog ([dbdc67b](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/dbdc67b7578925734aef216f9349627549b7f231))
* add release-please for automated versioning and changelog ([f9b13f6](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/f9b13f6bf99b19c82bb90db486d3bbfc267e98a7))
* add self code review step to GitHub issue workflow ([df64031](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/df640312d8943b5c58c453044011baeebbfc052e))
* add self code review step to GitHub issue workflow ([904e487](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/904e487421ed75491fcf7b5218309de50d95904c))
* auto-generate README settings and commands from package.json ([cf30eda](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/cf30eda1f2d72a70deb0c87dcac7e43d4e97e99b))
* improve repo structure, fix docs, and add missing tests ([33a4f31](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/33a4f311696e2f3594c02d7158b04768a5e0fc28))
* improve repo structure, fix docs, and add missing tests ([d898a9c](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/d898a9c27c23b69a6344b295a556c83534dd1b92))
* move VSIX build artifacts to releases/ directory ([8ff889d](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/8ff889d15b065cf8ad915d3113c80087f247d084))
* refine cursor rules for efficiency and completeness ([5961a59](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/5961a59108be261a9a7192bd275d546624983116))


### Documentation

* add auto-create PR rule to GitHub issue workflow ([d34ef55](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/d34ef55d82cb673fd7675a11f0d0ee5ef5278308))
* add GitHub issue workflow rule for branch naming and commits ([b249027](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/b2490277abd85dbfc8795fac72c5b86fdf25f357))
* add test status icon legend to README ([1bbdc96](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/1bbdc960df0751277572ef14f6b0b3ed7390609f))
* add test status icon legend to README ([64c9bb7](https://github.com/lironpo-tr/cursor-csharp-test-explorer/commit/64c9bb7e11134981debbe4396de5c76e0dfbee40))

## [0.7.0](https://github.com/lironpo/cursor-csharp-test-explorer/releases/tag/v0.7.0)

Initial tracked release.
