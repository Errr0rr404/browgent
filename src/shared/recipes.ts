/**
 * Built-in hero recipes — copy into agent chat or use from the panel picker.
 * Keep prompts short so first success is likely.
 */

import type { AgentMode } from './policies'
import { SUMMARIZE_PAGE_PROMPT } from './summary'

export interface AgentRecipe {
  id: string
  title: string
  blurb: string
  mode: AgentMode
  /** Prompt sent to the agent */
  prompt: string
}

export const AGENT_RECIPES: AgentRecipe[] = [
  // Lead with the human-in-the-loop takeover recipe so first-run starters open on the "aha".
  {
    id: 'takeover-handoff',
    title: 'Takeover handoff',
    blurb: 'Demo human login mid-task',
    mode: 'act',
    prompt:
      'Navigate to https://github.com/login. When you hit a login form or wall, call ask_human explaining I should Takeover, complete login if I want, then Resume. After I answer, observe the page and report what you see. Do not invent credentials.'
  },
  {
    id: 'research-summary',
    title: 'Research summary',
    blurb: 'Read-only summary of the current page',
    mode: 'research',
    prompt: SUMMARIZE_PAGE_PROMPT
  },
  {
    id: 'form-smoke',
    title: 'Form smoke',
    blurb: 'Fill a public demo form (no submit)',
    mode: 'act',
    prompt:
      'Navigate to https://httpbin.org/forms/post. Prefer fill_form with useProfile if profile has data; otherwise type customer name "Browgent Demo", telephone "555-0100", email "demo@browgent.local". Do NOT submit unless I confirm. Summarize which fields you filled.'
  },
  {
    id: 'qa-smoke',
    title: 'QA smoke',
    blurb: 'After you log in, agent checks the app',
    mode: 'act',
    prompt:
      'I am already logged in on this tab. Observe the page. Confirm the URL and title. List primary nav items you can see (refs). Navigate to one secondary page if safe, observe again, then return. Stop and ask_human if you hit a paywall, CAPTCHA, or logout wall.'
  },
  {
    id: 'qa-assert-smoke',
    title: 'QA assert smoke',
    blurb: 'Assert URL + visible text on current app',
    mode: 'act',
    prompt:
      'You are smoke-testing the current webapp tab. get_url. assert_url host matches the current host. observe. assert_element with nameIncludes for a primary nav or main landmark if present. extract_text and assert_text for a word you actually see. Call done with a pass/fail table. ask_human on login walls.'
  },
  {
    id: 'fill-profile',
    title: 'Fill with profile',
    blurb: 'fill_form from User Hub (no submit)',
    mode: 'act',
    prompt:
      'Observe the form on this page. Call fill_form with useProfile true (dryRun true first if unsure). Then fill_form without dryRun. Do NOT submit. Report which refs were filled. ask_human if password fields are required.'
  },
  {
    id: 'export-trajectory',
    title: 'Export trajectory',
    blurb: 'Short task then export for evals',
    mode: 'act',
    prompt:
      'Navigate to https://example.com, observe, extract_text (max 500 chars), then call done with a one-line summary. Remind me to click Export trajectory for eval JSON.'
  },
  {
    id: 'mcp-check',
    title: 'MCP readiness',
    blurb: 'Confirm local co-browse is ready for Claude',
    mode: 'watch',
    prompt:
      'List open tabs and report the active URL/title. Tell me the status bar should show mcp · :17342 when the bridge is on, and that Claude Code can run: npm run mcp. Call done.'
  },
  {
    id: 'competitive-scrape',
    title: 'Competitive scrape',
    blurb: 'Capture pricing/features from a public page',
    mode: 'research',
    prompt:
      'Navigate to https://example.com (or keep current public marketing page). Observe, extract_text and extract_links. Produce a short competitive brief: product name if clear, 3 feature bullets, any pricing signals, and top outbound links. Read-only — no forms or clicks that change state.'
  },
  {
    id: 'inbox-triage',
    title: 'Inbox triage (HITL)',
    blurb: 'You open mail; agent summarizes after login',
    mode: 'act',
    prompt:
      'I will open my webmail or a demo inbox in this tab. If you see a login wall, call ask_human so I can Takeover and log in, then Resume. After I am in, observe the inbox list (do not open or send mail). Summarize up to 5 visible rows (sender/subject if present). Never invent credentials. Prefer ask_human over guessing.'
  },
  {
    id: 'sensitive-confirm',
    title: 'Sensitive confirm demo',
    blurb: 'Synthetic payment-like click needs policy gate',
    mode: 'act',
    prompt:
      'Navigate to https://httpbin.org/forms/post. Observe. Type "ORDER" into a visible text field if present. Then try to click any control whose label looks like submit/pay/purchase if present; if policy asks for confirm, wait for me. Summarize which confirms fired. Do not complete a real purchase anywhere.'
  }
]

export function getRecipe(id: string): AgentRecipe | undefined {
  return AGENT_RECIPES.find((r) => r.id === id)
}
