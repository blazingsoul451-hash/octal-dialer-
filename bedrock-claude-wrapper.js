#!/usr/bin/env node
/**
 * Bedrock Claude API Wrapper with 1-hour Prompt Caching
 *
 * Bypasses the VS Code extension bug (issue #32671) that doesn't set TTL.
 * Calls Bedrock invoke-model directly with ttl: "1h" for cost savings.
 *
 * Usage:
 *   node bedrock-claude-wrapper.js
 *
 * Then type your prompt. Multi-line input supported.
 * Type "DONE" on a new line to submit.
 */

const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const readline = require("readline");

// Configuration
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const MODEL_ID = process.env.BEDROCK_MODEL_ID || "global.anthropic.claude-sonnet-4-5-20250929-v1:0"; // Sonnet 4.5 inference profile with 1h TTL support
const CACHE_TTL = "1h"; // 1 hour (vs 5 min default)

// Initialize Bedrock client
const client = new BedrockRuntimeClient({ region: AWS_REGION });

async function invokeClaudeWithCaching(systemPrompt, userMessage) {
  try {
    console.log("\n📡 Sending to Bedrock with 1-hour prompt caching...\n");

    const requestBody = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: {
            type: "ephemeral",
            ttl: CACHE_TTL // 1 hour TTL - this is the critical fix
          }
        }
      ],
      messages: [
        {
          role: "user",
          content: userMessage
        }
      ]
    };

    const command = new InvokeModelCommand({
      modelId: MODEL_ID,
      body: JSON.stringify(requestBody)
    });

    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    // Log cache usage for cost visibility
    const cacheMetrics = response.$metadata.httpHeaders || {};
    console.log("✅ Response received");
    console.log(`📊 Cache metrics:`, {
      inputTokens: responseBody.usage?.input_tokens || 0,
      cacheCreationInputTokens: responseBody.usage?.cache_creation_input_tokens || 0,
      cacheReadInputTokens: responseBody.usage?.cache_read_input_tokens || 0,
      outputTokens: responseBody.usage?.output_tokens || 0
    });

    return responseBody;
  } catch (error) {
    console.error("❌ Error invoking Bedrock:", error.message);
    throw error;
  }
}

async function promptUser(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(query, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

async function readMultilineInput(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    console.log(prompt);
    console.log('(Type "DONE" on a new line to submit)\n');

    let input = "";
    rl.on("line", line => {
      if (line.trim() === "DONE") {
        rl.close();
        resolve(input.trim());
      } else {
        input += line + "\n";
      }
    });
  });
}

async function main() {
  console.log("🚀 Bedrock Claude API Wrapper with 1-Hour Prompt Caching");
  console.log("⏱️  TTL: 1 hour (vs 5 min in VS Code extension)");
  console.log("💰 This should reduce your daily costs from $38 to ~$4-5\n");

  try {
    // Get system prompt
    const systemPrompt = await readMultilineInput("📝 Enter system prompt (or leave blank):");

    // Get user message
    const userMessage = await readMultilineInput("\n📝 Enter your message:");

    if (!userMessage.trim()) {
      console.error("❌ Message cannot be empty. Please enter some text before typing DONE.");
      process.exit(1);
    }

    // Invoke Claude with caching
    const response = await invokeClaudeWithCaching(systemPrompt, userMessage);

    // Display response
    console.log("\n" + "=".repeat(60));
    console.log("💬 Claude Response:");
    console.log("=".repeat(60));
    if (response.content && response.content[0]) {
      console.log(response.content[0].text);
    }
    console.log("=".repeat(60) + "\n");

  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main();
