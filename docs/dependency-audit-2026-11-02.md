# Dependency audit — 2026-11-02

## Update after remediation

The original scan below is retained as the pre-remediation inventory. Compatible lockfile updates and targeted overrides for `shell-quote` and `minimatch` reduced the subsequent `npm audit` result to zero reported vulnerabilities. The minimatch override crosses a major version because the affected lint dependencies still request version 10; it therefore requires clean-install lint and test validation. Re-run the audit as advisory data changes.

`npm audit --json` reported 24 affected packages: 2 critical, 5 high, 17 moderate. `npm audit --omit=dev --json` reported 8 affected packages: 3 high and 5 moderate. Counts include transitive effects and do not prove application exploitability.

The audit reads package-lock.json. Installed node_modules was not in sync with the lockfile at audit time, so local test results are not verification of a clean lockfile installation.

## Inventory

| Package | Locked version | Severity | Production audit | Advisory or dependency | npm suggested fix |
| --- | --- | --- | --- | --- | --- |
| @eslint-community/eslint-utils | 4.10.1 | moderate | no | dependency: eslint | typescript-eslint 8.14.0 (major) |
| @eslint/config-array | 0.23.5 | moderate | no | dependency: minimatch | typescript-eslint 8.14.0 (major) |
| @eslint/js | 10.0.1 | moderate | no | dependency: eslint | @eslint/js 9.39.5 (major) |
| @hono/node-server | 2.1.1 | moderate | yes | [@hono/node-server](https://github.com/advisories/GHSA-rmxm-3fg6-px4f) (>=1.19.10 <2.1.3) | available |
| @modelcontextprotocol/sdk | 1.30.0 | high | yes | [@modelcontextprotocol/sdk](https://github.com/advisories/GHSA-6qxp-vccf-f47h) (>=1.12.0 <1.31.0); [@modelcontextprotocol/sdk](https://github.com/advisories/GHSA-22jm-h49p-29qw) (>=1.24.0 <1.32.0); [@modelcontextprotocol/sdk](https://github.com/advisories/GHSA-6prh-2h8m-c8cw) (<1.32.0); [@modelcontextprotocol/sdk](https://github.com/advisories/GHSA-46jr-4wx8-v453) (>=1.3.0 <1.32.0); [@modelcontextprotocol/sdk](https://github.com/advisories/GHSA-rvq5-wwqv-78pq) (>=1.6.0 <1.32.0); [@modelcontextprotocol/sdk](https://github.com/advisories/GHSA-f897-62hf-6gxq) (>=1.10.0 <1.30.1) | available |
| @typescript-eslint/eslint-plugin | 8.70.1 | moderate | no | dependency: @typescript-eslint/parser; dependency: @typescript-eslint/type-utils; dependency: @typescript-eslint/utils; dependency: eslint | typescript-eslint 8.14.0 (major) |
| @typescript-eslint/parser | 8.70.1 | moderate | no | dependency: @typescript-eslint/typescript-estree; dependency: eslint | typescript-eslint 8.14.0 (major) |
| @typescript-eslint/type-utils | 8.70.1 | moderate | no | dependency: @typescript-eslint/typescript-estree; dependency: @typescript-eslint/utils; dependency: eslint | typescript-eslint 8.14.0 (major) |
| @typescript-eslint/typescript-estree | 8.70.1 | moderate | no | dependency: minimatch | typescript-eslint 8.14.0 (major) |
| @typescript-eslint/utils | 8.70.1 | moderate | no | dependency: @eslint-community/eslint-utils; dependency: @typescript-eslint/typescript-estree; dependency: eslint | typescript-eslint 8.14.0 (major) |
| body-parser | 2.3.0 | high | yes | [body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828) (>=2.0.0 <2.4.0) | available |
| concurrently | 9.2.4 | critical | no | dependency: shell-quote | available |
| eslint | 10.11.0 | moderate | no | dependency: @eslint-community/eslint-utils; dependency: @eslint/config-array; dependency: minimatch | typescript-eslint 8.14.0 (major) |
| eslint-plugin-react-refresh | 0.5.7 | moderate | no | dependency: eslint | none reported |
| fast-uri | 3.1.8 | moderate | yes | [fast-uri](https://github.com/advisories/GHSA-w74x-v6f9-j3xg) (>=3.0.0 <3.1.9); [fast-uri](https://github.com/advisories/GHSA-xhq7-xmqj-769h) (>=3.0.0 <3.1.9); [fast-uri](https://github.com/advisories/GHSA-wjr9-j795-jxcr) (>=3.1.3 <3.1.9); [fast-uri](https://github.com/advisories/GHSA-333x-w4r6-6crp) (>=3.0.0 <3.1.9) | available |
| hono | 4.13.8 | moderate | yes | [hono](https://github.com/advisories/GHSA-5r4p-p66f-jhc7) (>=4.12.4 <4.13.11) | available |
| ip-address | 10.7.2 | moderate | yes | [ip-address](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5) (<=10.7.3) | available |
| minimatch | 10.2.6 | moderate | no | [minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249) (<11.0.1) | typescript-eslint 8.14.0 (major) |
| qs | 6.16.0 | moderate | yes | [qs](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw) (>=6.7.0 <=6.16.0) | available |
| shell-quote | 1.9.0 | critical | no | [shell-quote](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) (>=1.8.4 <1.11.0) | available |
| source-map-js | 1.2.1 | high | no | [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) (>=1.0.0 <1.2.2) | available |
| typescript-eslint | 8.70.1 | moderate | no | dependency: @typescript-eslint/eslint-plugin; dependency: @typescript-eslint/parser; dependency: @typescript-eslint/typescript-estree; dependency: @typescript-eslint/utils; dependency: eslint | typescript-eslint 8.14.0 (major) |
| vite | 8.3.0 | high | no | [vite](https://github.com/advisories/GHSA-698v-4r3x-3vcv) (>=8.3.0 <=8.3.2); [vite](https://github.com/advisories/GHSA-r825-w8mm-5pxw) (>=8.3.0 <=8.3.2); [vite](https://github.com/advisories/GHSA-587h-7wmj-h5pm) (>=8.3.0 <=8.3.2); [vite](https://github.com/advisories/GHSA-9jrq-w75r-8gcw) (>=8.3.0 <=8.3.2); [vite](https://github.com/advisories/GHSA-rq7h-c2jc-7f22) (>=8.3.0 <=8.3.2); [vite](https://github.com/advisories/GHSA-vfpm-58rq-9qcg) (>=8.3.0 <=8.3.2) | available |
| zod | 4.6.5 | high | yes | [zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) (<4.6.6) | available |

## Triage

- The MCP SDK and its Zod dependency are used by the MCP servers. SDK advisories cover specific HTTP, OAuth and validation features; reachability in this application still requires review.
- body-parser enters through Express; review compressed request handling on the public API before assigning exposure.
- The critical shell-quote advisory enters through the development tool concurrently. Its presence is not evidence that an attacker controls its input.
- Vite and source-map-js are development/build paths; review deployed artifacts separately from the development server.
- Fix availability is npm audit guidance, not an approval to apply forced major upgrades. Re-audit after compatible lockfile updates and validate with a clean install.
