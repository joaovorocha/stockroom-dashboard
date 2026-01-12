# Prompt Improvement Guide
Use this before sending prompts to avoid delays and get better responses.

## Be Specific and Contextual
- Instead of "fix those issues," say: "Fix the MCP config errors in VS Code Copilot. The error is: [paste exact error]."
- Include file paths, error messages, and expected outcomes.

## Structure for Clarity
- Use bullet points or numbered steps for multi-part requests.
- Example: "1. Check if MCP servers are running. 2. Test the radio server with `get_radio_status`. 3. If errors, provide logs."

## Provide Context Upfront
- Mention the project (stockroom dashboard), languages (Node.js, Python), and tools (MCP servers).
- If asking for code changes, specify the file and exact lines.

## Avoid Typos and Ambiguity
- Proofread for clarity (e.g., clarify "lett triopping" as "less tripping" or "better tripping" – smoother responses or fewer errors).
- Use full words: "improve the MCP server and my prompts based on what you've seen."

## Iterate Based on Responses
- If a response isn't what you want, reply with: "That helped, but I need [specific adjustment]."

## Quick Check Script
Run `python validate_prompt.py "your prompt"` before sending to flag issues early.