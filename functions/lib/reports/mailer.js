"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmailAsUser = sendEmailAsUser;
const googleapis_1 = require("googleapis");
/**
 * Dispatches an email on behalf of a specific user using Google Workspace Domain-Wide Delegation.
 *
 * @param subjectEmail - The email address of the Workspace user to impersonate (e.g. p.losey@saegrp.com)
 * @param toEmails - Array of recipient email addresses
 * @param subjectLine - Email subject line
 * @param htmlBody - The HTML payload of the email
 */
async function sendEmailAsUser(subjectEmail, toEmails, subjectLine, htmlBody) {
    console.log(`[Reporting Mailer] attempting to send email impersonating ${subjectEmail}...`);
    // Safety check: ensure secrets are configured
    const clientEmail = process.env.SA_GMAIL_CLIENT_EMAIL;
    const privateKey = process.env.SA_GMAIL_PRIVATE_KEY;
    if (!clientEmail || !privateKey) {
        console.warn(`[Reporting Mailer] CRITICAL: Environment variables SA_GMAIL_CLIENT_EMAIL and SA_GMAIL_PRIVATE_KEY are not set. Skipping real dispatch.`);
        return;
    }
    try {
        // Construct a JWT Auth Client using the DWD Service Account credentials
        // The 'subject' specifies which Google Workspace user we are impersonating
        const auth = new googleapis_1.google.auth.JWT({
            email: clientEmail,
            key: privateKey.replace(/\\n/g, '\n'), // Restore normalized newlines
            scopes: ['https://www.googleapis.com/auth/gmail.send'],
            subject: subjectEmail,
        });
        const gmail = googleapis_1.google.gmail({ version: 'v1', auth });
        // Construct raw RFC 2822 email
        const emailLines = [
            `From: ${subjectEmail}`,
            `To: ${toEmails.join(', ')}`,
            `Content-type: text/html;charset=utf-8`,
            `Subject: ${subjectLine}`,
            '',
            htmlBody,
        ];
        const emailRaw = emailLines.join('\n');
        // Gmail API requires URL-safe base64 encoding without padding
        const base64EncodedEmail = Buffer.from(emailRaw).toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        // Dispatch
        await gmail.users.messages.send({
            userId: 'me', // 'me' maps to the 'subject' assigned in the JWT
            requestBody: {
                raw: base64EncodedEmail
            }
        });
        console.log(`[Reporting Mailer] Email successfully injected into ${subjectEmail}'s outbox.`);
    }
    catch (error) {
        console.error(`[Reporting Mailer] Failed to inject email for ${subjectEmail}`, error.message || error);
        throw error;
    }
}
//# sourceMappingURL=mailer.js.map