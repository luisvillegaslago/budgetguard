# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [0.14.2](https://github.com/luisvillegaslago/budgetguard/compare/v0.14.1...v0.14.2) (2026-03-18)


### Bug Fixes

* show transactions before categories on mobile dashboard ([be2f3b6](https://github.com/luisvillegaslago/budgetguard/commit/be2f3b6cbce5155427b83f7ae84429f259d6cea9))

## [0.14.1](https://github.com/luisvillegaslago/budgetguard/compare/v0.14.0...v0.14.1) (2026-03-18)


### Bug Fixes

* iOS-compatible background scroll lock and date input height normalization ([85ab5aa](https://github.com/luisvillegaslago/budgetguard/commit/85ab5aad52001896ddfb7307bce0f0b09f45882c))

## [0.14.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.13.1...v0.14.0) (2026-03-18)


### Features

* slide-in action buttons on hover for transaction rows ([ba9d665](https://github.com/luisvillegaslago/budgetguard/commit/ba9d66509d163c29ff76c9c0a1e4468685e9328c))

## [0.13.1](https://github.com/luisvillegaslago/budgetguard/compare/v0.13.0...v0.13.1) (2026-03-18)


### Bug Fixes

* prevent background scroll when modal is open and normalize date input size on mobile ([dfbd524](https://github.com/luisvillegaslago/budgetguard/commit/dfbd52408aefbf55a072c5ff705fd09dc528faca))

## [0.13.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.12.0...v0.13.0) (2026-03-16)


### Features

* simplify recurring expense form UX ([c764db4](https://github.com/luisvillegaslago/budgetguard/commit/c764db4088bb7d1a4fecab5ace6cc1fc9822b282))


### Bug Fixes

* shared expense doubling in fiscal link-transaction + improve modal layouts ([aa29a76](https://github.com/luisvillegaslago/budgetguard/commit/aa29a763660331266152e31829e18f97ff06cc1b))

## [0.12.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.11.0...v0.12.0) (2026-03-16)


### Features

* add `triggerClassName` prop to Tooltip component ([8c2cf8d](https://github.com/luisvillegaslago/budgetguard/commit/8c2cf8d1f460f51c0330f12cca109ab4ab51c3b3))
* add quick-create vendor button in OCR extraction modal ([3fbc251](https://github.com/luisvillegaslago/budgetguard/commit/3fbc2519f45748855e06bd28070a2f90ee8ebc80))
* add transaction status (paid/pending/cancelled) ([83aa10c](https://github.com/luisvillegaslago/budgetguard/commit/83aa10cc063cd9d6541e03180abff15804249f8f))
* improve AppSidebar collapsed state styling and tooltip behavior ([c9ad35d](https://github.com/luisvillegaslago/budgetguard/commit/c9ad35d2c442d5d8ea3a48cdd0d7d184fc91d033))

## [0.11.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.10.0...v0.11.0) (2026-03-16)


### Features

* generalize grouped expense button and improve modal layout ([8561f14](https://github.com/luisvillegaslago/budgetguard/commit/8561f1422d6eb4eb587d0ab7e8380cd86bc3104d))


### Bug Fixes

* responsive mobile layout for dashboard, transactions, and categories ([4ebee31](https://github.com/luisvillegaslago/budgetguard/commit/4ebee315c90a7a22b5a58aa16ec0a13a9dca5f2a))
* suppress hydration warning on auth layout wrapper div ([da9496a](https://github.com/luisvillegaslago/budgetguard/commit/da9496a9ab2f596d37e5e4ae4e558f19eb2fb442))

## [0.10.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.9.0...v0.10.0) (2026-03-15)


### Features

* expand LineItems.Description column to 2000 characters ([f9dad35](https://github.com/luisvillegaslago/budgetguard/commit/f9dad35e1af4d26ac82138ca9886f448b974df9d))
* internationalize API errors with error codes pattern ([137779b](https://github.com/luisvillegaslago/budgetguard/commit/137779b7f91251f0ff6cb2f21b4cec2292248e33))


### Bug Fixes

* preserve line breaks in LineItems.Description display ([fee59e0](https://github.com/luisvillegaslago/budgetguard/commit/fee59e0d810b0381068eb51c934682ec8aebd534))

## [0.9.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.8.0...v0.9.0) (2026-03-15)


### Features

* add company transactions, UI components, and schema updates ([70fc7b4](https://github.com/luisvillegaslago/budgetguard/commit/70fc7b4799243bdb44051cbfeb82b49512e0f915))
* add default hourly rate to billing profile with invoice form prepopulation ([6aa6f73](https://github.com/luisvillegaslago/budgetguard/commit/6aa6f7371da2b44e1e60d01063869c09584c8fd4))
* add invoice upload button to dashboard ([552ab7f](https://github.com/luisvillegaslago/budgetguard/commit/552ab7fd4ef68eb55b4cbee0fc47636cfea44f3d))
* add OCR extraction for fiscal documents with auto-transaction linking ([2a50179](https://github.com/luisvillegaslago/budgetguard/commit/2a501794a620f4fd78bcfb9a01210bdc9d28b071))
* add revert-to-draft for issued invoices and responsive action bar ([64cb039](https://github.com/luisvillegaslago/budgetguard/commit/64cb039ba32bb18e4b5721c38a65357d6b85e16e))
* auto-create linked transactions for individual skydive jumps and tunnel sessions ([fe3d9f5](https://github.com/luisvillegaslago/budgetguard/commit/fe3d9f57f43110c1df59b7a2adb2c9e0236ced67))
* auto-refresh draft invoice snapshot on PDF generation ([60d921b](https://github.com/luisvillegaslago/budgetguard/commit/60d921bbf9ea25e487e75c639dde94971d9b1811))
* implement fiscal documents and AEAT deadlines module ([d0d4439](https://github.com/luisvillegaslago/budgetguard/commit/d0d4439d7e5529893b5b60735d8b41577cb2ff68))
* implement invoice finalization, draft reversion, and company transaction detail ([09dc6d8](https://github.com/luisvillegaslago/budgetguard/commit/09dc6d8557b48ea11d439571d35215e0caf35acd))
* implement invoice finalize flow with PDF generation and blob storage ([3d1ee32](https://github.com/luisvillegaslago/budgetguard/commit/3d1ee32beeedd459ee4ce1bb5f67505a6f074a93))
* improve delete confirmation and OCR error handling ([79b6b48](https://github.com/luisvillegaslago/budgetguard/commit/79b6b48c8c9d483bb58cf733a9442f84eac20792))
* improve transaction form layout and company selector UX ([a64c8c2](https://github.com/luisvillegaslago/budgetguard/commit/a64c8c2eb4dd29d5eef04415f5d859fb10c6d0dc))
* include finalized invoices in fiscal reports before payment ([1d36748](https://github.com/luisvillegaslago/budgetguard/commit/1d367489bcadbcf1c7c9b2f90e9b975ee9ebc017))
* invoice lifecycle improvements and confirm dialogs ([29ea174](https://github.com/luisvillegaslago/budgetguard/commit/29ea1742d9628f0b6522ce072be55df6492759e4))
* locale-aware OCR descriptions and normalized document display names ([9297aa6](https://github.com/luisvillegaslago/budgetguard/commit/9297aa69a1c6540a189296866f5fa5d6d3e445ba))
* persist document filters in URL for improved navigation ([d8ba7c1](https://github.com/luisvillegaslago/budgetguard/commit/d8ba7c19d4d50f4c361d02558e7388faa8e50849))
* persist page filters in URL query params ([9479432](https://github.com/luisvillegaslago/budgetguard/commit/947943233534a51a343385f3d21078279b0f0b29))
* responsive tables, normalized tokens, and color consistency ([f9c1d60](https://github.com/luisvillegaslago/budgetguard/commit/f9c1d60d904fbbc7dc5d3bdc8d8a55b09c6f9c3c))
* separate companies into clients and providers with role-based sub-tabs ([e0a38ed](https://github.com/luisvillegaslago/budgetguard/commit/e0a38ed1d2ca272d9732aa25cfc519f30abdce9c))
* set invoice date before PDF generation ([45a052d](https://github.com/luisvillegaslago/budgetguard/commit/45a052d07a8346e89c151b91dc209fac7bbac766))
* show download link for filed modelos in fiscal page ([4564fc6](https://github.com/luisvillegaslago/budgetguard/commit/4564fc6d61921159b0c87ab85003c1091afff23b))


### Bug Fixes

* add dark mode support for checkbox input styling ([a1f9c24](https://github.com/luisvillegaslago/budgetguard/commit/a1f9c245e26f40d76d819ae04989da57282e8364))
* add invoice tables to database sync service ([a14a9ff](https://github.com/luisvillegaslago/budgetguard/commit/a14a9ff8f779438715f06fa8287613064c9429bf))
* ensure date-driven logic uses current date accurately ([03311bc](https://github.com/luisvillegaslago/budgetguard/commit/03311bc3b14a54318f5249a3b58ce105b6ee2dc3))
* improve OCR error messages and show delete option on failure ([6564d0e](https://github.com/luisvillegaslago/budgetguard/commit/6564d0ee1f761aa29ceb5009e0dc23d1c1aad2e5))
* mark uploaded invoices as filed with quarter after OCR extraction ([eb6a7ab](https://github.com/luisvillegaslago/budgetguard/commit/eb6a7ab20580a4834eae0196291e229602d31491))
* show error and delete option when OCR extraction fails ([adeb3c7](https://github.com/luisvillegaslago/budgetguard/commit/adeb3c738b1b6e60826ed4b3dc8aa6e962e2347e))
* simplify grouped transaction title to show only parent category ([9b42104](https://github.com/luisvillegaslago/budgetguard/commit/9b421040860b780f0b46b7ae083eb523ce025f45))

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
