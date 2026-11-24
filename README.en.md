# Magpie Agent for Trae CN

[中文](README.md)

Use Magpie models and routing groups from Trae CN's own model picker. This is an unofficial **Agent adapter**, separate from the community Trae subscription provider.

## Compatibility and installation

Supports verified Windows builds of Trae CN 3.4.18 and 3.4.20. The former was tested with Magpie 0.1.3078; the latter with Magpie 0.1.3960. Native catalog sync uses these verified builds in the default Windows installation and checks client file hashes before writing.

| Platform | Integration | Coverage |
| --- | --- | --- |
| Windows, other installation paths or builds | Manually add a custom model | Installation discovery and the local bridge have fixture coverage |
| macOS arm64 | Manually add a custom model | CI exercises the package and gateway. TraeWork chat and menu refresh timing need a Mac desktop test |
| Linux | Portable unit tests | Desktop integration is unverified |

Thanks to **CN-P5** for the multi-drive Windows installation discovery and optional client refresh work in [Magpie Trae Evergreen](https://github.com/CN-P5/magpie-trae-evergreen). These ideas informed this adapter. Set `TRAE_APP` to the resources directory containing `product.json`, or let Windows check the default installation, Program Files and registry App Paths. Set `MAGPIE_TRAE_NO_CLIENT_PATCH=1` and restart Magpie to skip installing the Windows refresh component.

Version 0.3.4 restores model additions after updating Trae to 3.4.20 and adapts the client refresh component to that build. Both native DLLs remain hash guarded. Client entry-point backups are stored separately for each Trae version, so rollback uses the matching original file.

Install and sign in to Trae CN, configure working models in Magpie, then run:

```sh
magpie plugin add "github:lmy414/magpie-agent-trae#main"
```

Enable Trae on Magpie's Agents page. Expand the remaining agents if the row is collapsed. For Windows native sync, restart Trae once after the refresh component is first installed or reinstalled after a Trae upgrade, then choose a model ending in `· Magpie`. Keep Magpie running and Trae signed in. Install only one of the standalone and community packages.

For manual setup, run `node cli.mjs setup` and `node cli.mjs models` in the source checkout. In Trae's model settings, add an OpenAI Chat Completions custom model with the full URL option, the loopback URL and public bridge token shown by setup, and an ID from models. Remove manually created entries in Trae. On macOS, `magpie trae-local provider magpie` also enables the first connection. Library rules and skills use home-relative paths. Automatic MCP configuration currently covers Windows. Restart Magpie after moving or upgrading Trae. [Trae model settings](https://docs.trae.cn/work_models)

## Sessions and usage

The gateway records calls under `trae-local`. The bridge maps a valid incoming session ID to `X-Magpie-Session`. Calls without an ID count toward usage individually. The bridge does not import old Trae history. Run `node cli.mjs status` after a turn to see the header name in `lastRequest.sessionHeader` or `null` if the call had no supported session header. Magpie manages consent for recording conversation text.

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

For open-window updates, the adapter backs up Trae's `out/main.js`, appends a loader and installs `out/magpie-model-refresh.cjs`. The component watches a credential-free catalog revision and emits Trae's existing model-management notification. It does not select models, focus windows, edit prompts or open a debugger port. Unknown builds are left unchanged.

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
