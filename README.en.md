# Magpie Agent for Trae CN

[中文](README.md)

Use Magpie models and routing groups from Trae CN's own model picker. This is an unofficial **Agent adapter**, separate from the community Trae subscription provider.

## Compatibility and installation

Supports verified Windows builds of Trae CN 3.4.18 and 3.4.20, plus the verified macOS arm64 build of Trae CN 3.4.20. The 3.4.18 build was tested with Magpie 0.1.3078; the 3.4.20 builds with Magpie 0.1.3960 (Windows) and 0.1.4574 (macOS). Internal model APIs and native credential encoding are build dependent. Version and SHA-256 guards reject unknown client builds. Linux and Trae international are not supported yet.

On macOS, `trae-paths.mjs` resolves `/Applications/Trae CN.app` and `~/Library/Application Support/Trae CN`, the native codec material comes from `libharness.dylib` / `libai_agent.dylib`, and `x-device-type` is `mac`. The adapter does **not** patch `out/main.js` on macOS: that file is sealed by the Developer ID signature, so appending a loader breaks `codesign`. Trae already refreshes the catalog when the model menu opens (`refreshModelListForCurrentAgent`, plus a 10-minute poll), so new entries appear without restarting Trae.

Two things on macOS are decided by Magpie itself rather than this adapter. First, the agent descriptor runs in moejs, which has no `process.platform`, so `dir` in `trae.agent.js` still reads `$APPDATA/Trae CN`; the first connect (the switch on the Agents page, or `magpie trae-local provider magpie`) writes `connection.json`, and from then on `magpie ls` finds Trae. Second, `library.mcp` also starts with `$APPDATA`, which is empty on macOS, so the expanded path is relative and Magpie drops it: **the Library's MCP servers are not written into Trae yet**, while rules and skills (`~` paths) sync as usual.

Version 0.3.4 restores model additions after updating Trae to 3.4.20 and adapts the client refresh component to that build. Both native DLLs remain hash guarded. Client entry-point backups are stored separately for each Trae version, so rollback uses the matching original file.

Install and sign in to Trae CN, configure working models in Magpie, then run:

```sh
magpie plugin add "github:lmy414/magpie-agent-trae#v0.3.4"
```

Enable Trae on Magpie's Agents page. Expand the remaining agents if the row is collapsed. On Windows, restart Trae once after the refresh component is first installed or reinstalled after a Trae upgrade; on macOS no client change is needed. Then choose a model ending in `· Magpie`. Keep Magpie running and Trae signed in. Install only one of the standalone and community packages.

## Behavior

- Synchronizes catalog additions, capability changes and removals. Model selection stays in Trae.
- Preserves streaming, images, tool calls and reasoning parameters through a loopback bridge.
- Deletes unmodified entries it created when removed or disconnected; restores entries it adopted. Manual changes are preserved and reported.
- Journals writes and verifies the native catalog before confirming success, including recovery after lost responses.
- Uses Magpie's Library contract for selected MCP servers, skills and rules.

The bridge listens only on `127.0.0.1:3498`, forwards to the local Magpie gateway, and rejects browser origins. Upstream account, quota and model capability limits still apply.

Trae stores custom models in its account service. The adapter reads the current local Trae sign-in and calls the client's internal model APIs; it does not modify SQLite or sign in to other accounts. Native encoding parameters are read from hash-verified installed files. Client binaries, native codec secrets and user credentials are not distributed.

TraeWork session orchestration still runs in Trae's cloud. Model requests reach the loopback bridge through Trae's reverse tunnel, then Magpie calls the selected upstream. A local model URL does not make the entire TraeWork session local.

## Client refresh and rollback

On Windows, for open-window updates, the adapter backs up Trae's `out/main.js`, appends a loader and installs `out/magpie-model-refresh.cjs`. The component watches a credential-free catalog revision and emits Trae's existing model-management notification. It does not select models, focus windows, edit prompts or open a debugger port. Unknown builds are left unchanged. On macOS the client is never modified; `cli.mjs restore-client` reports `state: "not_needed"`.

Disconnect the Agent and wait for `disconnected` before uninstalling. Keep the recovery journal until restoration completes. User-edited entries are left intact with `model_edited_in_trae`.

After uninstalling, restore the separate refresh component from the source checkout with `node cli.mjs restore-client`, then restart Trae. Journals and backups are under `%USERPROFILE%\.config\magpie-trae`. Never upload that directory: some files contain credentials.

From a source checkout, `node cli.mjs status` reports synchronization and `node cli.mjs models` lists the bridge catalog.

## Validation

No npm dependencies are required. Run `npm test` on Node.js 20 or newer. `npm run acceptance` requires the installed Magpie executable and its Bun host; it uses a temporary home and local fixture servers, without calling real model accounts.

Version 0.3.3 passed 54 unit tests, nine isolated Magpie integration checks and live TraeWork catalog add, replace and disconnect checks. Menu refresh took about 1.1–1.6 seconds after synchronization completed. Real DeepSeek chat was verified separately; other upstream models require their own validation.

Version 0.3.4 passes 56 unit tests on Node and Bun, including upgrade backup/restore and refusal of unverified DLL builds, plus nine isolated Magpie integration checks. On Trae CN 3.4.20, native model creation, updates, deletion and readback were verified, and the temporary entry was removed. The user confirmed model additions, removals and open-window menu refresh after restarting Trae.

This compatibility update does not fix the long-session `3003 / SSE finish` failure. Diagnostics observed a failed continuation after a tool result was submitted and HTTP 500 responses from Trae's cloud; the root cause remains unconfirmed, including whether context size contributed.

The source also includes an optional, hash-guarded cancellation race patch in `scripts/trae-cancel-patch.mjs`, with `--check`, `--apply` and `--restore`. **It supports only the verified 3.4.18 build, not 3.4.20.** It is not automatically applied or included in the runtime package. `npm run test:cancel` checks the installed source against six regression cases on 3.4.18. Full manual cancellation acceptance is still pending. Restart Trae after applying or restoring it, retain its backup, and revalidate after client upgrades.

## License

[MIT](LICENSE). See [THIRD_PARTY.md](THIRD_PARTY.md) for the reused community login-state decoder and [ASSET_NOTICE.md](ASSET_NOTICE.md) for the Trae icon. No Trae client binaries are included.
