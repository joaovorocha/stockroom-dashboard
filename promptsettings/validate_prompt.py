#!/usr/bin/env python3
import sys
import re

def validate_prompt(prompt):
    issues = []
    
    # Check length
    if len(prompt) < 20:
        issues.append("Too short (<20 chars). Add more details.")
    
    # Check for action words
    action_words = ['fix', 'add', 'update', 'improve', 'create', 'test', 'check']
    if not any(word in prompt.lower() for word in action_words):
        issues.append("Missing action word (fix/add/update/etc.). Specify what to do.")
    
    # Check for context
    context_keywords = ['project', 'file', 'error', 'stockroom', 'mcp', 'node', 'python']
    if not any(word in prompt.lower() for word in context_keywords):
        issues.append("Missing context (project/file/error/etc.). Provide background.")
    
    # Check for structure
    if not (prompt.startswith('1.') or '-' in prompt or prompt.count('.') > 2):
        issues.append("Unstructured. Use bullets/numbers for multi-part requests.")
    
    # Check for typos (basic)
    if re.search(r'\b(lett|triopping|thas|comite|somenting|febore|propcesig|promts|pompsts|mcpmserver|pompts|bases|triopping|tikke)\b', prompt.lower()):
        issues.append("Possible typos detected. Proofread for clarity.")
    
    return issues

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python validate_prompt.py 'your prompt here'")
        sys.exit(1)
    
    prompt = sys.argv[1]
    issues = validate_prompt(prompt)
    
    if issues:
        print("Prompt issues found (fix before sending to avoid delays):")
        for issue in issues:
            print(f"- {issue}")
        print("\nSee promptsettings/prompt_guide.md for tips.")
        sys.exit(1)
    else:
        print("Prompt looks good! Sending...")