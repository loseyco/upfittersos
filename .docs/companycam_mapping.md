# CompanyCam Integration Mapping

As part of the **Standalone First** architecture mapped in V2, CompanyCam is treated as an optional edge-node integration rather than the core media engine. A shop without CompanyCam should seamlessly utilize UpfittersOS Firebase Storage via our new `MultiImageUploader`.

If a shop *does* have a CompanyCam access token bonded to their Tenant configuration, this mapping applies.

## 1. Webhook Signatures
V1 relied heavily on native CompanyCam webhooks to instantly push photos taken on their mobile app directly into UpfittersOS.
- **Endpoint:** `POST /api/webhooks/companycam`
- **Verification:** Always validate the `X-CompanyCam-Signature` header securely against the stored Firebase Secret `COMPANYCAM_WEBHOOK_SECRET`.

## 2. External Job Routing
CompanyCam Projects operate distinctly from QuickBooks Jobs, however, they must be synchronized to unify the shop floor data.
- Whenever UpfittersOS creates a Job (or clones a Job from QuickBooks), a background queue must immediately fire a standard `POST /v2/projects` to CompanyCam to ensure the media-bucket exists.
- The `external_id` pushed to CompanyCam *must* be identical to the UpfittersOS Job Document ID stored natively in `/businesses/{tenantId}/jobs/{jobId}` to maintain an immutable join mapping.

## 3. Data Scaffolding
**UpfittersOS Media Linkage Array:**
```json
// Inside /businesses/{tenantId}/jobs/{jobId}
{
  "companyCam": {
    "linkedProjectId": "string (CC Project ID)",
    "shareUrl": "string (Client-facing generic link)",
    "lastSyncTimestamp": "datetime"
  }
}
```

Whenever a webhook pushes a `'photo.created'` event, capture the absolute URL payload and inject it natively into a nested `gallery` array directly on the target Job, allowing UpfittersOS to render the CompanyCam photos natively without repeatedly polling their API.
