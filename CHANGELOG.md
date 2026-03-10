# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [0.8.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.7.1...v0.8.0) (2026-03-10)


### Features

* add invoice generation module with PDF export, billing profiles, and i18n support ([3891d3f](https://github.com/luisvillegaslago/budgetguard/commit/3891d3fb5537eb10d1baaa749d7f0b75a59d8199))
* add light/dark theme selector in settings with localStorage persistence ([6d842a3](https://github.com/luisvillegaslago/budgetguard/commit/6d842a389ae0d79daed60501be74d48d4b1edeff))

## [0.7.1](https://github.com/luisvillegaslago/budgetguard/compare/v0.7.0...v0.7.1) (2026-03-09)


### Bug Fixes

* resolve trip color bar invisible segments and assign unique category colors ([30b39a1](https://github.com/luisvillegaslago/budgetguard/commit/30b39a15aebcd820a46e1b3e9ccc42abfe89f8c5))

## [0.7.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.6.0...v0.7.0) (2026-03-09)


### Features

* add Companies entity with sync triggers, SSE sync progress, and skydiving sync ([c9d0795](https://github.com/luisvillegaslago/budgetguard/commit/c9d07956a8ed54dfe5c0b1ee827652d3239b562c))

## [0.6.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.5.0...v0.6.0) (2026-03-09)


### Features

* add fiscal fields and permanent delete for recurring expenses ([f270dbc](https://github.com/luisvillegaslago/budgetguard/commit/f270dbcf76aceb421fe1bb244be680fe3c5a1186))


### Bug Fixes

* improve login UX with error feedback and loading state ([2fac87b](https://github.com/luisvillegaslago/budgetguard/commit/2fac87bf3fbfb6bfec236ad9535571ea3af272c6))

## [0.5.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.4.1...v0.5.0) (2026-03-09)


### Features

* add persistent navigation, movements page, and UI improvements ([f2ba7ef](https://github.com/luisvillegaslago/budgetguard/commit/f2ba7ef46dbba17c57dd0aa72acd968e634e642d))

## [0.4.1](https://github.com/luisvillegaslago/budgetguard/compare/v0.4.0...v0.4.1) (2026-03-09)


### Bug Fixes

* filter recurring expenses by occurrence date ([3be4288](https://github.com/luisvillegaslago/budgetguard/commit/3be4288b40967c1e933c2f2718e0af953c98f2a4))
* remove unused search_path param for Neon pool connections ([de5ee38](https://github.com/luisvillegaslago/budgetguard/commit/de5ee382d58c7d345648528a960835b2c54b0c0b))


### Performance Improvements

* add category search functionality ([115b2f7](https://github.com/luisvillegaslago/budgetguard/commit/115b2f7d531cfddb2b929d90b6df97554ba54f87))
* improve DbSyncPanel UX and ensure fresh compare data on load ([ce352af](https://github.com/luisvillegaslago/budgetguard/commit/ce352afbac871ca433c60b52a0cd289facfa8463))

## [0.4.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.3.0...v0.4.0) (2026-03-08)


### Features

* add settings page with bidirectional database sync ([0fde832](https://github.com/luisvillegaslago/budgetguard/commit/0fde8329e1c656fb78a7ceebf6f5df4b7cf03b9a))
* add skydiving module with jump log, tunnel sessions, and CSV import ([033c15a](https://github.com/luisvillegaslago/budgetguard/commit/033c15a2146d09805f102ec616af74142888764f))
* display app version in footer and login page ([92d796a](https://github.com/luisvillegaslago/budgetguard/commit/92d796a9280da9c1472f988e31b586228befe547))
* introduce fetchApi wrapper and replace fetch across hooks ([451acfc](https://github.com/luisvillegaslago/budgetguard/commit/451acfc21b243ea853f2bc8428cc3b4ed16afc2e))


### Bug Fixes

* disable UpdatedAt triggers during database sync to preserve timestamps ([b4bd5e4](https://github.com/luisvillegaslago/budgetguard/commit/b4bd5e4edf310de8c6cce1f59fefa027fc833510))
* resolve timezone off-by-one error in date handling ([e6a5d7f](https://github.com/luisvillegaslago/budgetguard/commit/e6a5d7fe21465ecd440e56b2e5fa8171c0497686))
* skip search_path startup param for Neon pooler connections ([d4afbcf](https://github.com/luisvillegaslago/budgetguard/commit/d4afbcf73f687e602c9365458573129087e78d40))

## [0.3.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.2.0...v0.3.0) (2026-03-08)


### Features

* add multi-user support with Google OAuth authentication ([d8d4183](https://github.com/luisvillegaslago/budgetguard/commit/d8d418322261123c6473b49a3d57c2587d327e90))
* add support for local PostgreSQL with `pg` package ([f4ac539](https://github.com/luisvillegaslago/budgetguard/commit/f4ac5394c137b38b96feb8a89f4b2f74f60d16f9))

## [0.2.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.1.0...v0.2.0) (2026-03-07)


### Features

* migrate database from MSSQL to PostgreSQL (Neon) ([194ba86](https://github.com/luisvillegaslago/budgetguard/commit/194ba86a35865d24a8447277954e5e9c597ee6d9))

## 0.1.0 (2026-03-07)


### Features

* add category history page and API for transaction analysis ([0f6fa4a](https://github.com/luisvillegaslago/budgetguard/commit/0f6fa4a9a4b8de1eae5fb4718e3cbb894f6238f0))
* add detailed documentation for architecture, API, and money handling ([220d0d6](https://github.com/luisvillegaslago/budgetguard/commit/220d0d62adcecfdc941b74874db0d2bca03254b3))
* add fiscal module for quarterly tax reporting ([b8c90c5](https://github.com/luisvillegaslago/budgetguard/commit/b8c90c51fa3f216a46b289ef5dbb8ca7df450bee))
* add initial setup for husky hooks, database, and testing strategy ([3d89eef](https://github.com/luisvillegaslago/budgetguard/commit/3d89eeffde9313fd3279a678b0b1d1dd2b0ffe4e))
* add XLSX library to dependencies for Excel file handling ([0bcd0b5](https://github.com/luisvillegaslago/budgetguard/commit/0bcd0b5ca8c47f5fa3e8a38970942456a37c2d42))
* extend database schema with recurring expenses and trip tracking ([eaa39bb](https://github.com/luisvillegaslago/budgetguard/commit/eaa39bb3030618675a2579e59d69fee7df240e6f))

# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.
