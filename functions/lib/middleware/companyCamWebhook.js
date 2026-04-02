"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateCompanyCamWebhook = void 0;
const crypto_1 = __importDefault(require("crypto"));
const validateCompanyCamWebhook = (req, res, next) => {
    const signature = req.headers['x-companycam-signature'];
    if (!signature) {
        res.status(401).json({ error: 'Missing X-CompanyCam-Signature header' });
        return;
    }
    const webhookSecret = process.env.COMPANYCAM_WEBHOOK_SECRET;
    if (!webhookSecret) {
        console.error('COMPANYCAM_WEBHOOK_SECRET is not configured');
        res.status(500).json({ error: 'Internal Server Error' });
        return;
    }
    // Firebase Functions populate req.rawBody automatically, which is perfect for exact hashing.
    const rawBody = req.rawBody;
    if (!rawBody) {
        res.status(400).json({ error: 'Raw body required for signature validation' });
        return;
    }
    try {
        const hash = crypto_1.default.createHmac('sha1', webhookSecret)
            .update(rawBody)
            .digest('base64');
        if (!crypto_1.default.timingSafeEqual(Buffer.from(hash), Buffer.from(signature))) {
            res.status(401).json({ error: 'Invalid signature' });
            return;
        }
        next();
    }
    catch (error) {
        console.error('Error during webhook signature validation:', error);
        res.status(500).json({ error: 'Signature validation failed' });
    }
};
exports.validateCompanyCamWebhook = validateCompanyCamWebhook;
//# sourceMappingURL=companyCamWebhook.js.map