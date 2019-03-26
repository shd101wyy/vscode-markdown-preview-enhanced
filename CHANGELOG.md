## 0.10.2

* Upgrade vega to 5.3.2, vega-lite to 3.0.2 and vega-embed to 4.0.0
* Use JSDelivr as lib CDN instead of CloudFlare

## 0.10.1

* Downgrade vega from 5.3.0 to 5.1.0 to avoid `Error: Cycle detected in dataflow graph`

## 0.10.0

* New command: _Markdown Preview Enhanced with Litvis: Clear Cache_ (useful when need to upgrade Elm dependencies or when cache is corrupt)
* Fix a number of regressions in Elm output parsing and URL fetching
* Improve error handling in a couple of edge cases
* Upgrade vega to 5.3.0

## 0.9.0

* Upgrade vega to 5.0.0, vega-lite to 3.0.0-rc14 and vega-embed to 4.0.0-rc1 ([gicentre/mume-with-litvis#11bc9651](https://github.com/gicentre/mume-with-litvis/commit/11bc96514feedadd7e125398f3fee3fc5ff3a630))

## 0.8.0

* Add ability to highlight lines of code ([gicentre/litvis#9](https://github.com/gicentre/litvis/issues/9), [shd101wyy/mume#100](https://github.com/shd101wyy/mume/pull/100), [mume-with-litvis#5074ca39](https://github.com/gicentre/mume-with-litvis/commit/5074ca39a24ff86ef8ddc63c35f33b212e2da984))

## 0.7.0

* Upgrade vega to 4.4.0, vega-lite to 3.0.0-rc10 and vega-embed to 3.26.1 ([gicentre/mume-with-litvis#429dcf63](https://github.com/gicentre/mume-with-litvis/commit/429dcf6370191cfc8b421923a6283d4f7bdc7625))

* Fix a few minor bugs ([gicentre/litvis#11](https://github.com/gicentre/litvis/issue/11),
  [gicentre/litvis#12](https://github.com/gicentre/litvis/issue/12),
  [gicentre/litvis#13](https://github.com/gicentre/litvis/issue/13),
  [gicentre/litvis#14](https://github.com/gicentre/litvis/issue/14),
  [gicentre/litvis#15](https://github.com/gicentre/litvis/issue/15),
  [gicentre/litvis#16](https://github.com/gicentre/litvis/issue/16),
  [gicentre/litvis#17](https://github.com/gicentre/litvis/issue/17))

## 0.6.0

* Implement markdown output from litvis blocks ([gicentre/litvis#10](https://github.com/gicentre/litvis/pull/10))

## 0.3.0

* Improve parsing of narrative schemas, support label aliases and fix rules.
