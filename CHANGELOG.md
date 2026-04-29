# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [0.29.1](https://github.com/luisvillegaslago/budgetguard/compare/v0.29.0...v0.29.1) (2026-04-29)


### Bug Fixes

* **crypto:** polish module — async CSV import, stuck-job guard, stablecoins as F ([890e705](https://github.com/luisvillegaslago/budgetguard/commit/890e7059c7753cedd599ed356e9d3b9a2db6a524))

## [0.29.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.28.0...v0.29.0) (2026-04-28)


### Features

* **crypto:** add AEAT guide, CSV importer and disposals export (Phase 5) ([aac20f6](https://github.com/luisvillegaslago/budgetguard/commit/aac20f6497cdb07874a1c5b0f8ea4ded979b25da))

## [0.28.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.27.0...v0.28.0) (2026-04-28)


### Features

* **crypto:** add fifo engine and Modelo 100 fiscal aggregation (Phase 4) ([00f8e41](https://github.com/luisvillegaslago/budgetguard/commit/00f8e41750418ff7f23a2f6ac953f135e960eb6e))

## [0.27.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.26.0...v0.27.0) (2026-04-28)


### Features

* **crypto:** normalize raw events into TaxableEvents with EUR pricing (Phase 3) ([f38619a](https://github.com/luisvillegaslago/budgetguard/commit/f38619a869f2ae58c8ad57d95d0512211e2da6ec))


### Bug Fixes

* **vercel:** limit deployment region to `fra1` in `vercel.json` ([9292902](https://github.com/luisvillegaslago/budgetguard/commit/9292902100c4e193a601420c5cac75ac17c69a80))

## [0.26.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.25.0...v0.26.0) (2026-04-28)


### Features

* **crypto:** add full Binance sync with raw event ingestion (Phase 2) ([4b82613](https://github.com/luisvillegaslago/budgetguard/commit/4b826133f4817062c20297eb0faf1e44251751f2))

## [0.25.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.24.0...v0.25.0) (2026-04-27)


### Features

* **crypto:** add Binance read-only credential connection (Phase 1) ([6995c72](https://github.com/luisvillegaslago/budgetguard/commit/6995c728ca3046836fcb9a4b5a9522d9c767f09e))

## [0.24.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.23.1...v0.24.0) (2026-04-27)


### Features

* **fiscal:** normalize modelo filenames to canonical format on upload ([86e502e](https://github.com/luisvillegaslago/budgetguard/commit/86e502e09b9c08fde353220d54eb39f6b0fa4faf))
* **invoices:** add optional bank fee on mark-as-paid with per-client default ([6ec02a1](https://github.com/luisvillegaslago/budgetguard/commit/6ec02a103faeb86b1508b66d8b0066b6ad8926fe))

## [0.23.1](https://github.com/luisvillegaslago/budgetguard/compare/v0.23.0...v0.23.1) (2026-04-18)


### Bug Fixes

* **invoices:** propagate billing profile and company changes to draft invoices ([94ccdb3](https://github.com/luisvillegaslago/budgetguard/commit/94ccdb3565feb5193914bf4a49cd4ea9314179ac))

## [0.23.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.22.1...v0.23.0) (2026-04-16)


### Features

* **fiscal:** add Modelo 100 expense breakdown by AEAT casilla ([7bfd784](https://github.com/luisvillegaslago/budgetguard/commit/7bfd78455ead608ee63b787811b4d6b92b8756e4))
* **fiscal:** show deferral reminder popup after filing Modelo 130 ([6d59943](https://github.com/luisvillegaslago/budgetguard/commit/6d59943cbad5a5f64b769fe5b5ff96ce1da73e7d))


### Bug Fixes

* **fiscal:** add spacing between deadline banner and quarter selector ([5be77ac](https://github.com/luisvillegaslago/budgetguard/commit/5be77ac605897ee635bd3315f3e64afad7f07865))
* **fiscal:** fix label truncation and double-click selection in modelo cards ([f50a7d8](https://github.com/luisvillegaslago/budgetguard/commit/f50a7d89c76cf0cf98bdacc54871cc033434991c))
* **fiscal:** fix label truncation in annual modelo cards ([87f0726](https://github.com/luisvillegaslago/budgetguard/commit/87f0726b3c9afafcafafb4cb919519342a7bebb6))
* **fiscal:** separate currency symbol from value for clean double-click selection ([b840792](https://github.com/luisvillegaslago/budgetguard/commit/b840792eab55ae75d73b67789168985a1a074409))
* **fiscal:** show category as fallback when expense description is empty ([fb1720d](https://github.com/luisvillegaslago/budgetguard/commit/fb1720de034e0f87e52e1a00eb0a679a40c6e2b8))
* **fiscal:** use casilla 120/110 instead of 60/104 for non-EU services ([b0039a7](https://github.com/luisvillegaslago/budgetguard/commit/b0039a71e9a4e47248f6e0fd2704268b23f97907))

## [0.22.1](https://github.com/luisvillegaslago/budgetguard/compare/v0.22.0...v0.22.1) (2026-04-15)


### Bug Fixes

* **invoices:** hide hours columns in invoice preview for flat-rate invoices ([06becce](https://github.com/luisvillegaslago/budgetguard/commit/06beccef510c0005cd83b53ce0a9ab0840a61812))

## [0.22.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.21.0...v0.22.0) (2026-04-15)


### Features

* **invoices:** add flat-rate billing mode to emit single-concept invoices ([b3e5c64](https://github.com/luisvillegaslago/budgetguard/commit/b3e5c6426f52b20afdfb569a28aa9e15046631db))

## [0.21.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.20.0...v0.21.0) (2026-04-13)


### Features

* **trips:** sort upcoming trips by closest start date first ([237ce27](https://github.com/luisvillegaslago/budgetguard/commit/237ce27e04d75e916678f9881509a70520df6640))

## [0.20.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.19.0...v0.20.0) (2026-04-11)


### Features

* **trips:** default expense date to trip start date for future trips ([853aaa6](https://github.com/luisvillegaslago/budgetguard/commit/853aaa655be2af3bea555ac5f09a0de4b0057122))

## [0.19.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.18.1...v0.19.0) (2026-04-09)


### Features

* **trips:** show month(s) and year in trip card titles ([a3a0cce](https://github.com/luisvillegaslago/budgetguard/commit/a3a0cce3da7e580523d4d0db3d7d0effbe6f1b9c))

## [0.18.1](https://github.com/luisvillegaslago/budgetguard/compare/v0.18.0...v0.18.1) (2026-04-09)


### Bug Fixes

* **trips:** order trips by StartDate instead of CreatedAt ([bac3b6b](https://github.com/luisvillegaslago/budgetguard/commit/bac3b6bf40eff890ac8053367fec827ecb479869))

## [0.18.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.17.4...v0.18.0) (2026-04-08)


### Features

* **invoices:** defer invoice number assignment to finalization ([560c64b](https://github.com/luisvillegaslago/budgetguard/commit/560c64b5913908a84e85fbafaf08e792174f79d4))


### Bug Fixes

* **ui:** normalize RecurringPendingPanel style to match other dashboard banners ([75fa6a8](https://github.com/luisvillegaslago/budgetguard/commit/75fa6a83436ec00eb53c1c97597f5eb6ddf8c5c2))

## [0.17.4](https://github.com/luisvillegaslago/budgetguard/compare/v0.17.3...v0.17.4) (2026-04-08)


### Bug Fixes

* **trips:** fix category color bar not visible and inconsistent card alignment ([8a86e7b](https://github.com/luisvillegaslago/budgetguard/commit/8a86e7b41028d1fe110bb3eb78e7192f989802d5))
* **ui:** improve text wrapping and category bar rendering ([e04641d](https://github.com/luisvillegaslago/budgetguard/commit/e04641d21e46a9da046c6eea5de8b6397f07aca8))

## [0.17.3](https://github.com/luisvillegaslago/budgetguard/compare/v0.17.2...v0.17.3) (2026-04-08)


### Bug Fixes

* **forms:** default end date from start date in date range pickers ([7fa5535](https://github.com/luisvillegaslago/budgetguard/commit/7fa5535656f6b527b04a531f0736293bff8a3566))

## [0.17.2](https://github.com/luisvillegaslago/budgetguard/compare/v0.17.1...v0.17.2) (2026-04-03)


### Bug Fixes

* **dashboard:** convert pending expenses banner to collapsible panel ([f860247](https://github.com/luisvillegaslago/budgetguard/commit/f860247c8270c8fce31734e03a57bd944ec53dfc))

## [0.17.1](https://github.com/luisvillegaslago/budgetguard/compare/v0.17.0...v0.17.1) (2026-03-29)


### Bug Fixes

* **dashboard:** show description in grouped transaction headers ([40f0cd4](https://github.com/luisvillegaslago/budgetguard/commit/40f0cd4e15c6510a557ffee0dd4a31cba94b9865))

## [0.17.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.16.0...v0.17.0) (2026-03-29)


### Features

* **dashboard:** improve mobile responsiveness and collapsible panels ([8c07bc6](https://github.com/luisvillegaslago/budgetguard/commit/8c07bc63f6af8d3ab054dfae62f875badf0436bf))
* **nav:** always show expanded sidebar on xl+ screens ([e0c03e6](https://github.com/luisvillegaslago/budgetguard/commit/e0c03e6aa114fbf192e5df85316a3d0a0035a588))


### Bug Fixes

* **fiscal:** add bottom margin to deadline banner ([89b58a5](https://github.com/luisvillegaslago/budgetguard/commit/89b58a5ec47b056d3afce122708d8b4a0bd9b13d))
* **recurring:** prevent skip/confirm of future occurrences and add action tooltips ([7c5e190](https://github.com/luisvillegaslago/budgetguard/commit/7c5e19051258ffbf0b4f94cc653c7b558ec8f6e7))

## [0.16.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.15.1...v0.16.0) (2026-03-28)


### Features

* **trips:** add active trip quick-access banner and button on dashboard ([cb7e66b](https://github.com/luisvillegaslago/budgetguard/commit/cb7e66b16e280c6b623f7fd9f38ae41f8f551d95))

## [0.15.1](https://github.com/luisvillegaslago/budgetguard/compare/v0.15.0...v0.15.1) (2026-03-27)


### Bug Fixes

* **seed:** reorder and clean up default expense categories ([7fa59a1](https://github.com/luisvillegaslago/budgetguard/commit/7fa59a1d261dc177a67ab0580141ed15fd8cdba8))
* **trips:** ensure category selector renders correctly in TripExpenseForm ([c8eacd4](https://github.com/luisvillegaslago/budgetguard/commit/c8eacd4872940737640f744751c0f90d3f13d23e))

## [0.15.0](https://github.com/luisvillegaslago/budgetguard/compare/v0.14.4...v0.15.0) (2026-03-21)


### Features

* **trips:** add explicit StartDate/EndDate with 3-way classification ([7453ddf](https://github.com/luisvillegaslago/budgetguard/commit/7453ddfc65d4dd60b9821a3ddb9053f47c70ef6f))

## [0.14.4](https://github.com/luisvillegaslago/budgetguard/compare/v0.14.3...v0.14.4) (2026-03-20)


### Bug Fixes

* always display trips as grouped items even with single transaction ([6bec099](https://github.com/luisvillegaslago/budgetguard/commit/6bec09926da820672e491c46182f54bc7221c43e))
* **test:** silence jsdom and expected error noise in test output ([61e4dc0](https://github.com/luisvillegaslago/budgetguard/commit/61e4dc0d798ef3143d15f573b04b66d359515c0a))

## [0.14.3](https://github.com/luisvillegaslago/budgetguard/compare/v0.14.2...v0.14.3) (2026-03-18)


### Bug Fixes

* show action button labels on all screen sizes ([36f3be8](https://github.com/luisvillegaslago/budgetguard/commit/36f3be88def75cd7c6f6a989d23964d6c843d69b))

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
