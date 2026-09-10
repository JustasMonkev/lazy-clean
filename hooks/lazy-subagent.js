#!/usr/bin/env node
// lazy — Claude Code SubagentStart hook
//
// SessionStart context is parent-thread only and never reaches subagents, so
// without this every Task-spawned agent runs lazy-unaware (issue #252).
// When lazy mode is active, inject the same ruleset into each subagent.
//
// Scoping (opt-in, issue #506): set LAZY_SUBAGENT_MATCHER to a regex and
// the ruleset is injected only into subagents whose agent_type matches. The
// regex is unanchored and case-insensitive — "explore|general" matches either,
// "^general$" is exact. Unset means inject into every subagent, as before.

const { getSubagentInstructions } = require('./lazy-instructions');
const { getSessionState, writeHookOutput } = require('./lazy-runtime');
const { readHookInput } = require('./lazy-input');

readHookInput((data) => {
  const mode = getSessionState(data && data.session_id).readMode();
  if (!mode || mode === 'off') return;
  let matcher = null;
  try {
    if (process.env.LAZY_SUBAGENT_MATCHER) matcher = new RegExp(process.env.LAZY_SUBAGENT_MATCHER, 'i');
  } catch (e) { /* an invalid matcher fails open */ }
  const agentType = data ? String(data.agent_type || '').trim() : '';
  if (matcher && agentType && !matcher.test(agentType)) return;
  try {
    writeHookOutput('SubagentStart', mode, getSubagentInstructions(mode));
  } catch (e) { /* a closed output pipe must not break the host */ }
});
