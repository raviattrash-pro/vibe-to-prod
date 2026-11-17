# Coding-agent compatibility

AgencyOS skills use the portable `SKILL.md` folder format. The sync script publishes the same skills to each supported workspace location:

```sh
npm run sync:skills
```

- **Codex:** `.agents/skills/` (project skills) and repository guidance in `AGENTS.md`.
- **Claude Code:** `.claude/skills/` and repository guidance in `CLAUDE.md`.
- **Google Antigravity:** `.agents/skills/` and workspace guidance in `AGENTS.md`.

Codex and Antigravity use `.agents/skills`; Claude Code uses `.claude/skills`. Start a new agent session after synchronization so it discovers updated skills.

## Run a task

- **Codex:** Studio can launch the locally installed Codex CLI after a confirmation. It uses `codex exec`, the selected repository as its working root, `workspace-write` sandboxing, approval review, and an ephemeral session. Run status, bounded stdout/stderr events, and final output are stored in project history. The Studio resumes polling persisted running tasks after a browser reload while the AgencyOS server remains available. A run still marked active when a new server instance starts is marked `orphaned` with an unknown outcome; inspect repository changes before retrying. Duplicate runs for the same task are blocked while a run is active or orphaned. These events are process output, not a semantic tool-call trace. It does not mark the workflow task complete; review the diff and checks, then record completion evidence.
- **Claude Code:** Studio can launch the locally installed `claude` CLI after explicit confirmation. It uses headless print mode, `dontAsk`, no permission prompt handler, no session persistence, and only `Read`, `Edit`, `Write`, `Glob`, and `Grep` tools; shell commands and all other unapproved tools are denied. This requires Claude Code v2.1.259 or later for `--permission-prompts none`. This is not a filesystem sandbox; Claude can read and write within the configured workspace. The subprocess inherits no API key environment variables. The user's Claude CLI authentication must already be configured.
- **Antigravity:** Studio can launch the locally installed `agy` CLI after explicit confirmation. It uses headless `stream-json`, `accept-edits`, the CLI terminal sandbox, a 15-minute limit, and records semantic step/tool events. Workspace edits are allowed within the configured repository. In headless mode, actions requiring approval may be soft-denied while the CLI exits successfully; inspect the events and resulting diff before marking the workflow complete. The sandbox availability and behavior depend on the installed CLI and host OS. The local Antigravity CLI authentication must already be configured.

Never enable a bypass-permissions mode for unattended runs. User credentials are not stored by AgencyOS. Codex CLI must already be installed and authenticated in the local user environment. The default `OPENAI_API_KEY` environment variable is deliberately not forwarded to the subprocess; configure Codex through its own supported authentication.

Official references:

- [OpenAI Codex skill workflow and project skill paths](https://developers.openai.com/blog/skills-agents-sdk)
- [OpenAI Agent Skills documentation](https://developers.openai.com/plugins/concepts/skills)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
- [Google Antigravity Agent Skills](https://antigravity.google/docs/skills)
- [Codex as a platform](https://developers.openai.com/blog/codex-as-a-platform)
- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference)
- [Claude Code permission modes](https://code.claude.com/docs/en/permissions#permission-modes)
- [Antigravity CLI headless mode](https://antigravity.google/docs/cli/headless/)
- [Antigravity CLI execution modes](https://antigravity.google/docs/cli/modes)

Before adding platform-specific hooks, plugins, or tool configuration, recheck that platform's current official documentation. Do not put credentials or untrusted external instructions into a skill package.
