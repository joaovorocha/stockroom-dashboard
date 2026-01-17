#!/bin/bash
#
# Test Script for AI Gameplan Generation
#

# 1. AUTHENTICATION
# Paste the cookie from `node test-auth.js` here:
COOKIE="userSession=7bd0d4e803d670d8daeba98320ebecace69aeddfa16ea434cfd5f9652501a688; Path=/; HttpOnly; SameSite=Lax" 

# 2. Get live employee and settings data
echo "Fetching employee and settings data..."
EMPLOYEES_JSON=$(curl -s --cookie "$COOKIE" http://localhost:3000/api/gameplan/employees)
SETTINGS_JSON=$(curl -s --cookie "$COOKIE" http://localhost:3000/api/gameplan/settings)

# Check if data was fetched
if [ -z "$SETTINGS_JSON" ]; then
    echo "Error: Failed to fetch settings. Is the cookie valid?"
    exit 1
fi

# 3. Extract the nested 'employees' object
EMPLOYEES_ONLY_JSON=$(echo $EMPLOYEES_JSON | jq .employees)

# 4. Construct the payload for the AI endpoint
DATE="2026-01-17"
PAYLOAD=$(jq -n --arg date "$DATE" \
                  --argjson employees "$EMPLOYEES_ONLY_JSON" \
                  --argjson settings "$SETTINGS_JSON" \
                  '{date: $date, employees: $employees, settings: $settings}')

# 5. Call the AI generation endpoint
echo "Generating AI assignments for $DATE..."
AI_RESPONSE=$(curl -s --cookie "$COOKIE" \
    -X POST http://localhost:3000/api/ai/generate-gameplan \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")

# 6. Display the result
echo "--- AI Response ---"
echo $AI_RESPONSE | jq .

# 7. Extract Decision ID for approval test
DECISION_ID=$(echo $AI_RESPONSE | jq .decision_id)
ASSIGNMENTS_JSON=$(echo $AI_RESPONSE | jq .assignments)

if [ "$DECISION_ID" == "null" ]; then
    echo "Error: Could not get Decision ID from AI response."
    exit 1
fi

echo -e "\n--- Testing Manager Approval ---"
echo "Decision ID: $DECISION_ID"

# 8. Simulate Manager Approval (Publishing the gameplan)
APPROVAL_PAYLOAD=$(jq -n --arg date "$DATE" \
                           --argjson assignments "$ASSIGNMENTS_JSON" \
                           '{date: $date, assignments: $assignments, metadata: {ai_generated: true, ai_decision_id: '$DECISION_ID'}}')

APPROVAL_RESPONSE=$(curl -s --cookie "$COOKIE" \
    -X POST http://localhost:3000/api/gameplan/daily \
    -H "Content-Type: application/json" \
    -d "$APPROVAL_PAYLOAD")

echo "Approval Response:"
echo $APPROVAL_RESPONSE | jq .


echo -e "\n--- Verifying Database Logs ---"
# 9. Verify the decision was logged in the database
echo "Checking 'ai_assignment_decisions' table..."
psql -U suit -d stockroom_dashboard -c "SELECT id, decision_date, model_version, fairness_score, manager_approved FROM ai_assignment_decisions WHERE id = $DECISION_ID;"

# 10. Verify the assignments were saved to the history
echo -e "\nChecking 'task_assignment_history' table for today's assignments..."
psql -U suit -d stockroom_dashboard -c "UPDATE ai_assignment_decisions SET manager_approved = true, approved_by = 'test@suitsupply.com', approved_at = NOW() WHERE id = $DECISION_ID; SELECT employee_id, assigned_zones, fitting_room, shift FROM task_assignment_history WHERE assignment_date = '$DATE' LIMIT 5;"

echo -e "\n--- Test Complete ---"
