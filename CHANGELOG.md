# Changelog

## [2.0.2](https://github.com/tada5hi/confinity/compare/v2.0.1...v2.0.2) (2026-08-10)


### Bug Fixes

* **deps:** bump the minorandpatch group across 1 directory with 4 updates ([#108](https://github.com/tada5hi/confinity/issues/108)) ([27d7b70](https://github.com/tada5hi/confinity/commit/27d7b70bf44508316a403a9a481867b78d378fba))

## [2.0.1](https://github.com/tada5hi/confinity/compare/v2.0.0...v2.0.1) (2026-07-29)


### Bug Fixes

* **deps:** require pathtrace 2.2.2 ([#101](https://github.com/tada5hi/confinity/issues/101)) ([626fb48](https://github.com/tada5hi/confinity/commit/626fb489a84e92f62732e1411dab2c698155f8ed))

## [2.0.0](https://github.com/tada5hi/confinity/compare/v1.0.0...v2.0.0) (2026-07-29)


### ⚠ BREAKING CHANGES

* `get`/`getSync` default to `T = unknown` instead of `T = any`, and `Element.data`/`MergeFn` are typed over `unknown`. An unannotated read no longer mints `any`; annotated call sites are unaffected.
* the Container class is removed. Use createStore(options), which returns an FSStore with the same load/loadFile/get methods.

### Features

* add synchronous loadSync/loadFileSync loaders ([#99](https://github.com/tada5hi/confinity/issues/99)) ([56cfb05](https://github.com/tada5hi/confinity/commit/56cfb054cef4702696bdf879f081a71c991b2333))
* harden the v2 api before release ([#100](https://github.com/tada5hi/confinity/issues/100)) ([3c380de](https://github.com/tada5hi/confinity/commit/3c380de463be1b77bb0c9e29648729e45669342d))


### Code Refactoring

* restructure into Store/FSStore with a read-only Container view ([#97](https://github.com/tada5hi/confinity/issues/97)) ([da92ca8](https://github.com/tada5hi/confinity/commit/da92ca8a8538be5909a2fcbc596d1a0cf9eeb359))

## [1.0.0](https://github.com/tada5hi/confinity/compare/v1.0.0-beta.1...v1.0.0) (2026-07-22)


### Features

* expand wildcard and glob path ([7feef86](https://github.com/tada5hi/confinity/commit/7feef86af1b9402042b606a5d2ea162bf5902fd7))


### Bug Fixes

* **deps:** bump locter from 2.1.1 to 2.1.2 ([#32](https://github.com/tada5hi/confinity/issues/32)) ([28cdec6](https://github.com/tada5hi/confinity/commit/28cdec6baf9aa225f0b569176f58a3b9f263abf7))

## 1.0.0-beta.1 (2024-09-02)


### Bug Fixes

* **deps:** bump pathtrace to v1.0.0 ([e834798](https://github.com/tada5hi/confinity/commit/e834798b58c2371b8d69104a22dbff390529a4d7))


### Features

* initialize repository from source ([4d2d92b](https://github.com/tada5hi/confinity/commit/4d2d92be207f13f06db3c2ad9a31f2fd386fe29b))
* replace internal path helper with pathtrace ([b39eec9](https://github.com/tada5hi/confinity/commit/b39eec94e70c1f73ded9eb63324132149b39da0b))
* use last matching output for getter ([52c6753](https://github.com/tada5hi/confinity/commit/52c6753e9f4afdeb99e2087881fc66f1012c1075))
