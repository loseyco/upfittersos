"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.qbwcRoutes = void 0;
const express_1 = require("express");
const admin = __importStar(require("firebase-admin"));
const xml2js = __importStar(require("xml2js"));
const qbwc_service_1 = require("../services/qbwc.service");
exports.qbwcRoutes = (0, express_1.Router)();
// Configure the router to accept raw text/xml body
exports.qbwcRoutes.use(require('express').text({ type: ['text/xml', 'application/xml'] }));
// Helper to sanitize XML response
const buildSoapResponse = (method, result) => {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${method}Response xmlns="http://developer.intuit.com/">
      <${method}Result>${result}</${method}Result>
    </${method}Response>
  </soap:Body>
</soap:Envelope>`;
};
// Handle GET requests (Intuit Web Connector sends GET ?wsdl when installing the .qwc file)
exports.qbwcRoutes.get('/', (req, res) => {
    if (req.query.wsdl !== undefined) {
        return res.type('text/xml').send(`<?xml version="1.0" encoding="utf-8"?>
<definitions xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:s="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" targetNamespace="http://developer.intuit.com/">
  <types/>
  <message name="serverVersionIn"/>
  <message name="serverVersionOut"/>
  <portType name="QBWFS">
    <operation name="serverVersion">
      <input message="serverVersionIn"/>
      <output message="serverVersionOut"/>
    </operation>
  </portType>
  <binding name="QBWFS" type="QBWFS">
    <soap:binding transport="http://schemas.xmlsoap.org/soap/http" style="document"/>
    <operation name="serverVersion">
      <soap:operation soapAction="http://developer.intuit.com/serverVersion" style="document"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
  </binding>
  <service name="QBWFS">
    <port name="QBWFS" binding="QBWFS">
      <soap:address location="https://us-central1-saegroup-c6487.cloudfunctions.net/api/qbwc"/>
    </port>
  </service>
</definitions>`);
    }
    return res.status(200).send('SAE Group Web Connector Endpoint Active');
});
exports.qbwcRoutes.get('/download/:tenantId', (req, res) => {
    const tenantId = req.params.tenantId;
    if (!tenantId)
        return res.status(400).send('Missing tenant ID');
    const qwcXML = `<?xml version="1.0"?>
<QBWCXML>
  <AppName>SAE Group OS  - Live Integrator</AppName>
  <AppID></AppID>
  <AppURL>https://us-central1-saegroup-c6487.cloudfunctions.net/api/qbwc</AppURL>
  <AppDescription>Connects your Quickbooks Desktop natively to the SaaS dashboard.</AppDescription>
  <AppSupport>https://us-central1-saegroup-c6487.cloudfunctions.net/api/qbwc</AppSupport>
  <UserName>${tenantId}</UserName>
  <OwnerID>{E35D9B4A-7A12-4C3D-8B8E-1C2D3E4F5A6B}</OwnerID>
  <FileID>{57F3B9B1-5D12-4C3D-8B8E-1C2D3E4F5A6B}</FileID>
  <QBType>QBFS</QBType>
  <Scheduler>
    <RunEveryNMinutes>5</RunEveryNMinutes>
  </Scheduler>
</QBWCXML>`;
    res.setHeader('Content-Type', 'application/x-qbwc');
    res.setHeader('Content-Disposition', 'attachment; filename="SAE_QuickBooks_Connector.qwc"');
    return res.status(200).send(qwcXML);
});
// Intuit Web Connector SOAP Endpoint
exports.qbwcRoutes.post('/', async (req, res) => {
    var _a, _b, _c;
    try {
        let rawXml = req.body;
        // Google Cloud Functions might pass unparsed bodies (like text/xml) as a raw Buffer object.
        if (Buffer.isBuffer(rawXml)) {
            rawXml = rawXml.toString('utf8');
        }
        if (!rawXml || typeof rawXml !== 'string') {
            console.error('SOAP Bad Request - req.body is:', typeof req.body);
            return res.status(400).send('Invalid SOAP request');
        }
        const parser = new xml2js.Parser({ explicitArray: false });
        const parsed = await parser.parseStringPromise(rawXml);
        const body = ((_a = parsed === null || parsed === void 0 ? void 0 : parsed['soap:Envelope']) === null || _a === void 0 ? void 0 : _a['soap:Body']) || ((_b = parsed === null || parsed === void 0 ? void 0 : parsed['soapenv:Envelope']) === null || _b === void 0 ? void 0 : _b['soapenv:Body']);
        if (!body) {
            return res.status(400).send('Invalid SOAP Envelope/Body');
        }
        // Handle methods
        if (body.serverVersion) {
            return res.type('text/xml').send(buildSoapResponse('serverVersion', '1.0.0'));
        }
        if (body.clientVersion) {
            // Can return empty string or "W" for warning, "E" for error
            return res.type('text/xml').send(buildSoapResponse('clientVersion', ''));
        }
        if (body.authenticate) {
            // strUserName is the tenantId configured in the .qwc
            const tenantId = body.authenticate.strUserName;
            // Intentionally bypassing password check for simplicity; assume .qwc is securely distributed
            const ticket = admin.firestore().collection('qbwc_sessions').doc().id;
            // Create a session to link the ticket to the tenant
            await admin.firestore().collection('qbwc_sessions').doc(ticket).set({
                tenantId,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            // Enqueue initial sync tasks if this is the first time connecting
            const queueConfig = await admin.firestore().collection('businesses').doc(tenantId).get();
            const configData = queueConfig.data();
            if (queueConfig.exists && !(configData === null || configData === void 0 ? void 0 : configData.qbwcInitialized)) {
                const batch = admin.firestore().batch();
                const queueRef = admin.firestore().collection('qbwc_queue');
                batch.set(queueRef.doc(), { tenantId, status: 'pending', action: 'ItemQuery', qbxml: '<ItemQueryRq iterator="Start"><MaxReturned>5</MaxReturned></ItemQueryRq>', createdAt: new Date().toISOString() });
                batch.set(queueRef.doc(), { tenantId, status: 'pending', action: 'CustomerQuery', qbxml: '<CustomerQueryRq><MaxReturned>5</MaxReturned><OwnerID>0</OwnerID></CustomerQueryRq>', createdAt: new Date().toISOString() });
                batch.set(queueRef.doc(), { tenantId, status: 'pending', action: 'VendorQuery', qbxml: '<VendorQueryRq><MaxReturned>5</MaxReturned></VendorQueryRq>', createdAt: new Date().toISOString() });
                batch.set(queueRef.doc(), { tenantId, status: 'pending', action: 'EmployeeQuery', qbxml: '<EmployeeQueryRq><MaxReturned>5</MaxReturned></EmployeeQueryRq>', createdAt: new Date().toISOString() });
                batch.set(queueRef.doc(), { tenantId, status: 'pending', action: 'ClassQuery', qbxml: '<ClassQueryRq><MaxReturned>5</MaxReturned></ClassQueryRq>', createdAt: new Date().toISOString() });
                batch.set(queueRef.doc(), { tenantId, status: 'pending', action: 'EstimateQuery', qbxml: '<EstimateQueryRq><MaxReturned>5</MaxReturned><IncludeLineItems>true</IncludeLineItems></EstimateQueryRq>', createdAt: new Date().toISOString() });
                batch.set(queueRef.doc(), { tenantId, status: 'pending', action: 'InvoiceQuery', qbxml: '<InvoiceQueryRq><MaxReturned>5</MaxReturned><IncludeLineItems>true</IncludeLineItems></InvoiceQueryRq>', createdAt: new Date().toISOString() });
                batch.set(queueRef.doc(), { tenantId, status: 'pending', action: 'PurchaseOrderQuery', qbxml: '<PurchaseOrderQueryRq><MaxReturned>5</MaxReturned><IncludeLineItems>true</IncludeLineItems></PurchaseOrderQueryRq>', createdAt: new Date().toISOString() });
                // Mark initialized
                batch.update(admin.firestore().collection('businesses').doc(tenantId), { qbwcInitialized: true });
                await batch.commit();
            }
            else if (queueConfig.exists && (configData === null || configData === void 0 ? void 0 : configData.qbwcInitialized)) {
                // Determine FromModifiedDate from the db checkpoint
                // If by some anomaly the sync dropped before saving the timestamp, fallback to 24 hours ago to self-heal
                const fallbackDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
                const lastSync = (configData === null || configData === void 0 ? void 0 : configData.lastQbSyncTime) || fallbackDate;
                // QuickBooks requires UTC explicitly listed as -00:00 without any decimal/millisecond precision.
                const qbFormattedDate = lastSync.split('.')[0] + '-00:00';
                // Self-Heal: If there are jobs stuck in "processing" from a previous dropped session, bounce them back to "pending"
                const processingSnap = await admin.firestore().collection('qbwc_queue')
                    .where('tenantId', '==', tenantId)
                    .where('status', '==', 'processing')
                    .get();
                if (!processingSnap.empty) {
                    const healBatch = admin.firestore().batch();
                    processingSnap.docs.forEach(doc => {
                        healBatch.update(doc.ref, { status: 'pending' });
                    });
                    await healBatch.commit();
                }
                // Check if queue is already populated to avoid duplicate enqueueing if QBWC drops connection and re-polls
                const pendingSnap = await admin.firestore().collection('qbwc_queue')
                    .where('tenantId', '==', tenantId)
                    .where('status', '==', 'pending')
                    .limit(1).get();
                if (pendingSnap.empty) {
                    const batch = admin.firestore().batch();
                    const queueRef = admin.firestore().collection('qbwc_queue');
                    // We safely omit Accounts & Classes from 5-min intervals as they rarely change and may lack FromModifiedDate support in older QBs.
                    const dynamicQueries = [
                        { action: 'ItemQuery', xml: `<ItemQueryRq><FromModifiedDate>${qbFormattedDate}</FromModifiedDate></ItemQueryRq>` },
                        { action: 'CustomerQuery', xml: `<CustomerQueryRq><MaxReturned>5</MaxReturned><FromModifiedDate>${qbFormattedDate}</FromModifiedDate><OwnerID>0</OwnerID></CustomerQueryRq>` },
                        { action: 'VendorQuery', xml: `<VendorQueryRq><MaxReturned>5</MaxReturned><FromModifiedDate>${qbFormattedDate}</FromModifiedDate></VendorQueryRq>` },
                        { action: 'EmployeeQuery', xml: `<EmployeeQueryRq><MaxReturned>5</MaxReturned><FromModifiedDate>${qbFormattedDate}</FromModifiedDate></EmployeeQueryRq>` },
                        { action: 'EstimateQuery', xml: `<EstimateQueryRq><MaxReturned>5</MaxReturned><ModifiedDateRangeFilter><FromModifiedDate>${qbFormattedDate}</FromModifiedDate></ModifiedDateRangeFilter><IncludeLineItems>true</IncludeLineItems></EstimateQueryRq>` },
                        { action: 'InvoiceQuery', xml: `<InvoiceQueryRq><MaxReturned>5</MaxReturned><ModifiedDateRangeFilter><FromModifiedDate>${qbFormattedDate}</FromModifiedDate></ModifiedDateRangeFilter><IncludeLineItems>true</IncludeLineItems></InvoiceQueryRq>` },
                        { action: 'PurchaseOrderQuery', xml: `<PurchaseOrderQueryRq><MaxReturned>5</MaxReturned><ModifiedDateRangeFilter><FromModifiedDate>${qbFormattedDate}</FromModifiedDate></ModifiedDateRangeFilter><IncludeLineItems>true</IncludeLineItems></PurchaseOrderQueryRq>` },
                        { action: 'HostQuery', xml: `<HostQueryRq></HostQueryRq>` }
                    ];
                    dynamicQueries.forEach(q => {
                        batch.set(queueRef.doc(), { tenantId, status: 'pending', action: q.action, qbxml: q.xml, createdAt: new Date().toISOString() });
                    });
                    await batch.commit();
                }
            }
            const responseXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <authenticateResponse xmlns="http://developer.intuit.com/">
      <authenticateResult>
        <string>${ticket}</string>
        <string></string>
      </authenticateResult>
    </authenticateResponse>
  </soap:Body>
</soap:Envelope>`;
            return res.type('text/xml').send(responseXml);
        }
        if (body.sendRequestXML) {
            const ticket = body.sendRequestXML.ticket;
            const sessionDoc = await admin.firestore().collection('qbwc_sessions').doc(ticket).get();
            if (!sessionDoc.exists)
                return res.type('text/xml').send(buildSoapResponse('sendRequestXML', ''));
            const tenantId = (_c = sessionDoc.data()) === null || _c === void 0 ? void 0 : _c.tenantId;
            // Fetch next pending queue item
            // We use .limit(1) to save massive amounts of reads. 
            // The QB Web Connector generic queries don't depend strictly on order.
            const snapshot = await admin.firestore().collection('qbwc_queue')
                .where('tenantId', '==', tenantId)
                .where('status', '==', 'pending')
                .limit(1)
                .get();
            if (snapshot.empty) {
                // Successfully completed or empty queue! Checkpoint timestamp.
                const isoDate = new Date().toISOString();
                await admin.firestore().collection('businesses').doc(tenantId).update({ lastQbSyncTime: isoDate }).catch(e => console.error("Error setting timestamp empty queue:", e));
                return res.type('text/xml').send(buildSoapResponse('sendRequestXML', '')); // No more requests
            }
            const doc = snapshot.docs[0];
            // Construct full QBXML wrapping
            const reqXml = `<?xml version="1.0" encoding="utf-8"?>
<?qbxml version="13.0"?>
<QBXML>
  <QBXMLMsgsRq onError="continueOnError">
    ${doc.data().qbxml}
  </QBXMLMsgsRq>
</QBXML>`;
            // Mark as processing
            await doc.ref.update({ status: 'processing', ticketId: ticket });
            return res.type('text/xml').send(buildSoapResponse('sendRequestXML', reqXml.replace(/</g, '&lt;').replace(/>/g, '&gt;')));
        }
        if (body.receiveResponseXML) {
            const ticket = body.receiveResponseXML.ticket;
            const _responseXmlText = body.receiveResponseXML.response; // Intuit passes the response back here
            // const hresult = body.receiveResponseXML.hresult;
            try {
                // Find the doc currently processing for this ticket
                const snapshot = await admin.firestore().collection('qbwc_queue')
                    .where('ticketId', '==', ticket)
                    .where('status', '==', 'processing')
                    .get();
                if (!snapshot.empty) {
                    const doc = snapshot.docs[0];
                    await doc.ref.update({ status: 'completed', response: _responseXmlText, completedAt: admin.firestore.FieldValue.serverTimestamp() });
                    const tenantId = doc.data().tenantId;
                    const action = doc.data().action;
                    if (_responseXmlText) {
                        try {
                            const parser = new xml2js.Parser({ explicitArray: false });
                            const parsed = await parser.parseStringPromise(_responseXmlText);
                            const qbwcService = new qbwc_service_1.QbwcService(tenantId);
                            await qbwcService.processResponse(action, parsed);
                        }
                        catch (parseErr) {
                            console.error("Error parsing or processing QBWC response XML", parseErr);
                        }
                    }
                    // Check if there are more items pending to determine progress
                    // We use .limit(1) to guarantee exactly 1 read, instead of fetching the whole queue
                    const remainingSnap = await admin.firestore().collection('qbwc_queue')
                        .where('tenantId', '==', tenantId)
                        .where('status', '==', 'pending')
                        .limit(1)
                        .get();
                    const progress = remainingSnap.empty ? '100' : '50';
                    if (progress === '100') {
                        // Successfully completed extraction queue! Checkpoint timestamp.
                        const isoDate = new Date().toISOString();
                        await admin.firestore().collection('businesses').doc(tenantId).update({ lastQbSyncTime: isoDate }).catch(e => console.error("Error setting timestamp:", e));
                    }
                    return res.type('text/xml').send(buildSoapResponse('receiveResponseXML', progress));
                }
            }
            catch (e) {
                console.error("Error updating qbwc queue item", e);
            }
            // Return 100 to signal complete block
            return res.type('text/xml').send(buildSoapResponse('receiveResponseXML', '100'));
        }
        if (body.closeConnection) {
            const ticket = body.closeConnection.ticket;
            if (ticket) {
                await admin.firestore().collection('qbwc_sessions').doc(ticket).delete().catch(() => { });
            }
            return res.type('text/xml').send(buildSoapResponse('closeConnection', 'OK'));
        }
        if (body.getLastError) {
            return res.type('text/xml').send(buildSoapResponse('getLastError', 'No error'));
        }
        if (body.connectionError) {
            // QBWC failed to connect to the internal QuickBooks application (e.g., QB is closed or running as admin)
            // returning "DONE" tells the Web Connector to abort and wrap up cleanly without an HTTP crash
            return res.type('text/xml').send(buildSoapResponse('connectionError', 'DONE'));
        }
        return res.status(400).send('Unsupported method');
    }
    catch (e) {
        console.error('QBWC SOAP Error:', e);
        return res.status(500).send('Internal Server Error');
    }
});
exports.qbwcRoutes.get('/test-timestamp', async (req, res) => {
    var _a;
    const doc = await admin.firestore().collection('businesses').doc('test-tenant').get();
    res.json({ lastQbSyncTime: (_a = doc.data()) === null || _a === void 0 ? void 0 : _a.lastQbSyncTime });
});
// Endpoint to generate .qwc file
exports.qbwcRoutes.get('/config', (req, res) => {
    var _a, _b;
    const tenantId = req.query.tenantId;
    if (!tenantId)
        return res.status(400).send('tenantId required');
    const appName = "SAE Group OS - Tenant " + tenantId;
    // Dynamically build the AppURL whether running locally or on the live Firebase cloud
    const protocol = ((_a = req.get('host')) === null || _a === void 0 ? void 0 : _a.includes('localhost')) || ((_b = req.get('host')) === null || _b === void 0 ? void 0 : _b.includes('127.0.0.1')) ? 'http' : 'https';
    const host = req.get('host');
    const basePath = req.originalUrl.split('?')[0].replace('/config', '');
    const appUrl = `${protocol}://${host}${basePath}`;
    const fileId = "{90A44FB7-33D9-4815-AC85-BC87A7E7D1EB}"; // random GUID
    const ownerId = "{57F3B9B1-86F1-4FCE-B1AD-E1CEE344DE3E}"; // random GUID
    const qwc = `<?xml version="1.0"?>
<QBWCXML>
   <AppName>${appName}</AppName>
   <AppID></AppID>
   <AppURL>${appUrl}</AppURL>
   <AppDescription>Integration for SAE Group OS</AppDescription>
   <AppSupport>${appUrl}</AppSupport>
   <UserName>${tenantId}</UserName>
   <OwnerID>${ownerId}</OwnerID>
   <FileID>${fileId}</FileID>
   <QBType>QBFS</QBType>
   <Scheduler>
      <RunEveryNMinutes>5</RunEveryNMinutes>
   </Scheduler>
   <IsReadOnly>false</IsReadOnly>
</QBWCXML>`;
    res.set('Content-Type', 'application/x-qwc');
    res.set('Content-Disposition', `attachment; filename=sae_qbwc_${tenantId}.qwc`);
    res.send(qwc);
});
// Temp Debug
exports.qbwcRoutes.get('/debug', async (req, res) => {
    try {
        const queueSnap = await admin.firestore().collection('qbwc_queue').get();
        const records = queueSnap.docs.map(d => ({
            id: d.id,
            status: d.data().status,
            tenantId: d.data().tenantId,
            createdAt: d.data().createdAt
        }));
        return res.json({ count: records.length, records });
    }
    catch (e) {
        return res.status(500).json({ error: e.message });
    }
});
// Reset and Migration Endpoint
exports.qbwcRoutes.get('/reset', async (req, res) => {
    try {
        const tenantId = req.query.tenantId;
        if (!tenantId)
            return res.status(400).send('tenantId required');
        const db = admin.firestore();
        // Wipe all qb_ collections and their production equivalents for a clean slate during testing
        const collectionsToWipe = ['qb_customers', 'customers', 'qb_jobs', 'jobs', 'qb_items', 'inventory_items'];
        const wipeBatch = db.batch();
        let totalDeleted = 0;
        for (const collName of collectionsToWipe) {
            const snap = await db.collection(`businesses/${tenantId}/${collName}`).get();
            snap.forEach(doc => {
                wipeBatch.delete(doc.ref);
                totalDeleted++;
            });
        }
        // Wipe the tenant's queue
        const queueSnap = await db.collection('qbwc_queue').where('tenantId', '==', tenantId).get();
        queueSnap.forEach(doc => {
            wipeBatch.delete(doc.ref);
            totalDeleted++;
        });
        // Reset the timer and init flag
        await db.collection('businesses').doc(tenantId).update({
            qbwcInitialized: false,
            lastQbSyncTime: admin.firestore.FieldValue.delete()
        });
        // This assumes less than 500 documents since it's just testing 5 records.
        // For larger environments, we would chunk this batch deletion.
        await wipeBatch.commit();
        return res.json({ success: true, message: `Successfully wiped ${totalDeleted} records and reset the initialization timer.` });
    }
    catch (e) {
        return res.status(500).json({ error: e.message });
    }
});
exports.default = exports.qbwcRoutes;
//# sourceMappingURL=qbwc.routes.js.map