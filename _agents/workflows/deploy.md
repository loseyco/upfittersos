---
description: How to deploy the application to live and dev environments
---
# Deployment Workflow

The user requires manual deployment for the SAEGroup project bypassing GitHub Actions or automated CI/CD for Firebase Hosting. 
When asked to "push to live" or "push to dev", you should use the Firebase CLI to execute a production build and deploy.

## Deployment Steps
// turbo-all
## Deployment Scenarios & Steps
Always clarify or infer from the user's request which environment (dev/live/both) and which targets (hosting/functions/rules) they want to deploy.

// turbo-all
**1. Code Backup (Git)**
Commit changes and push to the requested branches (e.g. `dev`, `master` for live, or both).
```bash
git add . ; git commit -m "Deployment update" ; git push origin <branch_name>
```
*(If pushing to both, push to dev, checkout master, merge dev, push master, checkout dev again).*

**2. Building React App (If deploying Hosting)**
Only necessary if the user is deploying frontend UI changes (`hosting`).
```bash
npm run build
```

**3. Firebase Deployment**
Target the specific services requested.
*   **Web App (Frontend):** `firebase deploy --only hosting`
*   **Backend Functions:** `firebase deploy --only functions`
*   **Database Rules:** `firebase deploy --only firestore:rules`
*   **All of the above:** `firebase deploy`

Use the appropriate Firebase alias or project context if required.

*Note: Since the user usually develops on a local Windows PowerShell environment, chain commands with `;` rather than `&&` when executing synchronously in terminal.*

*Note: Since the user usually develops on a local Windows powershell, do not chain these commands with `&&`. Chain them with `;` instead if executing them synchronously in terminal.*

Example Execution:
```bash
npm run build ; firebase deploy --only hosting
```
