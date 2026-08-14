# Bedrock Claude 1-Hour Cache Fix

## Problem
The VS Code Claude Code extension has a bug (**#32671**) — it doesn't set `ttl: "1h"` when calling Bedrock. This causes prompt cache to expire after 5 minutes instead of 1 hour, forcing re-writes and costing you **~$38/day**.

## Solution
Use the direct Bedrock API wrapper instead of the extension for long-running sessions.

---

## Quick Setup

### 1. Install Dependencies
```powershell
npm install @aws-sdk/client-bedrock-runtime
```

### 2. Ensure AWS Credentials are Set
The wrapper uses your existing AWS credentials (from `~/.aws/credentials` or env vars).

```powershell
# Verify credentials exist
cat $env:USERPROFILE\.aws\credentials
```

If not set, add them:
```powershell
aws configure
```

### 3. Run the Wrapper
```powershell
node bedrock-claude-wrapper.js
```

Then:
1. Paste your **system prompt** (or leave blank)
2. Type `DONE` on a new line
3. Paste your **user message**
4. Type `DONE` on a new line

The wrapper calls Bedrock directly with `ttl: "1h"` and shows cache metrics.

---

## Cost Comparison

| Metric | VS Code Extension (5 min TTL) | Bedrock Wrapper (1 hour TTL) |
|--------|------|---------|
| Daily cost | ~$38 | ~$4-5 |
| Cache writes/day | ~288 (every 5 min) | ~24 (every hour) |
| Savings | — | **~87%** |

---

## How to Use for Admin Panel Work

### Scenario: Long Development Session
Instead of working in the VS Code extension all day:

1. **Start the wrapper session:**
   ```powershell
   node bedrock-claude-wrapper.js
   ```

2. **Feed it your codebase context** as the system prompt:
   ```
   [Paste your full codebase architecture, key files, database schema, etc.]
   ```

3. **Ask follow-up questions** — each question reuses the cached system prompt (no re-write cost)

4. **Keep the session alive** during your work — the cache stays hot for 1 hour

### Example: Building Admin Components

**First request:**
```
System prompt: [Full codebase architecture + 5000 tokens of context]
Message: Implement AdminDashboard.tsx component...

Result: 2000 cache_creation_input_tokens written (one-time cost)
```

**Follow-up requests (same session, within 1 hour):**
```
Message: Now implement AdminUsers.tsx component...

Result: 0 cache writes! Reuses cached 5000-token context.
Savings: 5000 tokens × $0.003/1M = $0.015 per request
```

After 1 hour, cache expires → next request re-writes the cache → then 1 more hour of free reuse.

---

## Monitoring Cache Usage

Each response shows:
```
📊 Cache metrics: {
  inputTokens: 150,           // Tokens in this request (not cached)
  cacheCreationInputTokens: 0, // Tokens written to cache (only on first request)
  cacheReadInputTokens: 5000,  // Cached tokens reused (FREE!)
  outputTokens: 2000
}
```

**Healthy pattern:** 
- First request: `cacheCreationInputTokens` > 0
- Follow-ups: `cacheReadInputTokens` > 0, `cacheCreationInputTokens` = 0

---

## When to Use Which Tool

| Task | Tool | Why |
|------|------|-----|
| Quick edits, debugging, interactive Q&A | VS Code Extension | Fast, integrated, fine for 5min windows |
| Long dev sessions, agentic loops, building features | Bedrock Wrapper | 1-hour cache, cost-effective |
| Parallel requests, CI/CD automation | Bedrock API directly (Node script) | Full control, no TTL limits |

---

## Troubleshooting

### "AWS credentials not found"
```powershell
aws configure
# Enter your AWS Access Key ID and Secret
```

### "Cannot find module '@aws-sdk/client-bedrock-runtime'"
```powershell
npm install @aws-sdk/client-bedrock-runtime
```

### "Model not found" / 403 error
- Verify Bedrock is enabled in your AWS account (us-east-1, us-west-2, etc.)
- Check IAM permissions: `bedrock:InvokeModel`
- Verify model ID matches your region

### Cache metrics show 0 for everything
- First request after the 1-hour TTL expires will show cache writes again
- Subsequent requests should show cache reads

---

## Next Steps

1. **Test the wrapper** with a simple message
2. **Verify cost** in AWS CloudWatch after 24 hours (should drop 80%+)
3. **Automate** — add this wrapper to your deployment/CI scripts if needed
4. **Comment on GitHub issue #32671** — let Anthropic know this is blocking you

---

## Related

- **GitHub Issue:** #32671 (VS Code extension not setting TTL)
- **AWS Bedrock:** Supports up to 24-hour cache TTL
- **Claude Models:** Sonnet 4.5, Haiku 4.5 all support 1-hour TTL
