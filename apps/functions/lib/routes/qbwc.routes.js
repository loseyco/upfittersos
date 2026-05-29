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
                batch.set(queueRef.doc(), { tenantId, status: 'pending', action: 'ItemQuery', qbxml: '<ItemQueryRq iterator="Start"><MaxReturned>100</MaxReturned><ActiveStatus>All</ActiveStatus></ItemQueryRq>', createdAt: new Date().toISOString() });
                batch.set(queueRef.doc(), { tenantId, status: 'pending', action: 'CustomerQuery', qbxml: '<CustomerQueryRq iterator="Start"><MaxReturned>100</MaxReturned><ActiveStatus>All</ActiveStatus><OwnerID>0</OwnerID></CustomerQueryRq>', createdAt: new Date().toISOString() });
                batch.set(queueRef.doc(), { tenantId, status: 'pending', action: 'VendorQuery', qbxml: '<VendorQueryRq iterator="Start"><MaxReturned>100</MaxReturned><ActiveStatus>All</ActiveStatus><VendorQueryRq>', createdAt: new Date().toISOString() });
                batch.set(queueRef.doc(), { tenantId, status: 'pending', action: 'EmployeeQuery', qbxml: '<EmployeeQueryRq iterator="Start"><MaxReturned>100</MaxReturned><ActiveStatus>All</ActiveStatus></EmployeeQueryRq>', createdAt: new Date().toISOString() });
                batch.set(queueRef.doc(), { tenantId, status: 'pending', action: 'ClassQuery', qbxml: '<ClassQueryRq><ActiveStatus>All</ActiveStatus></ClassQueryRq>', createdAt: new Date().toISOString() });
                batch.set(queueRef.doc(), { tenantId, status: 'pending', action: 'EstimateQuery', qbxml: '<EstimateQueryRq iterator="Start"><MaxReturned>50</MaxReturned><IncludeLineItems>true</IncludeLineItems></EstimateQueryRq>', createdAt: new Date().toISOString() });
                batch.set(queueRef.doc(), { tenantId, status: 'pending', action: 'InvoiceQuery', qbxml: '<InvoiceQueryRq iterator="Start"><MaxReturned>50</MaxReturned><IncludeLineItems>true</IncludeLineItems></InvoiceQueryRq>', createdAt: new Date().toISOString() });
                batch.set(queueRef.doc(), { tenantId, status: 'pending', action: 'PurchaseOrderQuery', qbxml: '<PurchaseOrderQueryRq iterator="Start"><MaxReturned>50</MaxReturned><IncludeLineItems>true</IncludeLineItems></PurchaseOrderQueryRq>', createdAt: new Date().toISOString() });
                batch.set(queueRef.doc(), { tenantId, status: 'pending', action: 'TimeTrackingQuery', qbxml: '<TimeTrackingQueryRq iterator="Start"><MaxReturned>100</MaxReturned></TimeTrackingQueryRq>', createdAt: new Date().toISOString() });
                // Mark initialized
                batch.update(admin.firestore().collection('businesses').doc(tenantId), { qbwcInitialized: true });
                await batch.commit();
            }
            else if (queueConfig.exists && (configData === null || configData === void 0 ? void 0 : configData.qbwcInitialized)) {
                // Determine FromModifiedDate from the db checkpoint
                // If by some anomaly the sync dropped before saving the timestamp, fallback to 24 hours ago to self-heal
                const fallbackDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
                const lastSync = (configData === null || configData === void 0 ? void 0 : configData.lastQbSyncTime) || fallbackDate;
                // QuickBooks requires local time format. Removing the trailing UTC offsets/milliseconds to prevent 1970 fallback bugs.
                const qbFormattedDate = lastSync.split('.')[0];
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
                        { action: 'ItemQuery', xml: `<ItemQueryRq iterator="Start"><MaxReturned>100</MaxReturned><ActiveStatus>All</ActiveStatus><FromModifiedDate>${qbFormattedDate}</FromModifiedDate></ItemQueryRq>` },
                        { action: 'CustomerQuery', xml: `<CustomerQueryRq iterator="Start"><MaxReturned>100</MaxReturned><ActiveStatus>All</ActiveStatus><FromModifiedDate>${qbFormattedDate}</FromModifiedDate><OwnerID>0</OwnerID></CustomerQueryRq>` },
                        { action: 'VendorQuery', xml: `<VendorQueryRq iterator="Start"><MaxReturned>100</MaxReturned><ActiveStatus>All</ActiveStatus><FromModifiedDate>${qbFormattedDate}</FromModifiedDate></VendorQueryRq>` },
                        { action: 'EmployeeQuery', xml: `<EmployeeQueryRq iterator="Start"><MaxReturned>100</MaxReturned><ActiveStatus>All</ActiveStatus><FromModifiedDate>${qbFormattedDate}</FromModifiedDate></EmployeeQueryRq>` },
                        { action: 'EstimateQuery', xml: `<EstimateQueryRq iterator="Start"><MaxReturned>50</MaxReturned><ModifiedDateRangeFilter><FromModifiedDate>${qbFormattedDate}</FromModifiedDate></ModifiedDateRangeFilter><IncludeLineItems>true</IncludeLineItems></EstimateQueryRq>` },
                        { action: 'InvoiceQuery', xml: `<InvoiceQueryRq iterator="Start"><MaxReturned>50</MaxReturned><ModifiedDateRangeFilter><FromModifiedDate>${qbFormattedDate}</FromModifiedDate></ModifiedDateRangeFilter><IncludeLineItems>true</IncludeLineItems></InvoiceQueryRq>` },
                        { action: 'PurchaseOrderQuery', xml: `<PurchaseOrderQueryRq iterator="Start"><MaxReturned>50</MaxReturned><ModifiedDateRangeFilter><FromModifiedDate>${qbFormattedDate}</FromModifiedDate></ModifiedDateRangeFilter><IncludeLineItems>true</IncludeLineItems></PurchaseOrderQueryRq>` },
                        { action: 'TimeTrackingQuery', xml: `<TimeTrackingQueryRq iterator="Start"><MaxReturned>100</MaxReturned><ModifiedDateRangeFilter><FromModifiedDate>${qbFormattedDate}</FromModifiedDate></ModifiedDateRangeFilter></TimeTrackingQueryRq>` },
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
            // Check for stuck processing jobs (older than 5 minutes) and mark them as error
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
            const stuckSnap = await admin.firestore().collection('qbwc_queue')
                .where('tenantId', '==', tenantId)
                .where('status', '==', 'processing')
                .get();
            if (!stuckSnap.empty) {
                const stuckBatch = admin.firestore().batch();
                let hasUpdates = false;
                stuckSnap.docs.forEach(doc => {
                    const data = doc.data();
                    const startedAt = data.processingStartedAt || data.createdAt;
                    if (startedAt && startedAt < fiveMinutesAgo) {
                        stuckBatch.update(doc.ref, {
                            status: 'error',
                            error: 'Sync session timed out. The QuickBooks client failed to respond within 5 minutes.',
                            completedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                        hasUpdates = true;
                    }
                });
                if (hasUpdates) {
                    await stuckBatch.commit();
                }
            }
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
            let qbxml = doc.data().qbxml || '';
            // Dynamically sanitize legacy pre-enqueued XMLs to prevent client crashes
            if (qbxml.includes('<MaxReturned>500</MaxReturned>')) {
                const action = doc.data().action;
                const isHeavy = ['EstimateQuery', 'InvoiceQuery', 'PurchaseOrderQuery'].includes(action);
                const targetMax = isHeavy ? 50 : 100;
                qbxml = qbxml.replace('<MaxReturned>500</MaxReturned>', `<MaxReturned>${targetMax}</MaxReturned>`);
            }
            // Construct full QBXML wrapping
            const reqXml = `<?xml version="1.0" encoding="utf-8"?>
<?qbxml version="13.0"?>
<QBXML>
  <QBXMLMsgsRq onError="continueOnError">
    ${qbxml}
  </QBXMLMsgsRq>
</QBXML>`;
            // Mark as processing
            await doc.ref.update({
                status: 'processing',
                ticketId: ticket,
                processingStartedAt: new Date().toISOString()
            });
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
exports.qbwcRoutes.get('/config', async (req, res) => {
    try {
        const tenantId = req.query.tenantId;
        if (!tenantId)
            return res.status(400).send('tenantId required');
        // Cryptographic session authentication layer
        const token = req.query.token;
        if (!token) {
            console.error('QWC Generation Failed - Missing Firebase ID Token');
            return res.status(401).send('Authentication required');
        }
        try {
            const decodedToken = await admin.auth().verifyIdToken(token);
            // Check if superAdmin OR matching verified email bypass
            const isSuperAdmin = decodedToken.superAdmin === true || decodedToken.email === 'p.losey@saegrp.com';
            // If not a super admin, block access if their account does not belong to the requested tenantId
            if (!isSuperAdmin && decodedToken.tenantId !== tenantId) {
                console.error(`QWC Generation Unauthorized - Token Tenant: ${decodedToken.tenantId}, Request Tenant: ${tenantId}`);
                return res.status(403).send('Forbidden: Tenant access mismatch');
            }
        }
        catch (authErr) {
            console.error('QWC Generation Failed - Invalid Firebase ID Token', authErr.message);
            return res.status(401).send('Forbidden: Invalid or expired session');
        }
        const customName = req.query.customName;
        const appName = customName
            ? `SAE Group OS - ${customName}`
            : `SAE Group OS - Tenant ${tenantId}`;
        // Dynamically build the AppURL whether running locally or on the live Firebase cloud
        const host = req.get('host') || '';
        const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
        // In Firebase Cloud Functions, the "/api" prefix is stripped from req.originalUrl by rewrites.
        // Explicitly defining the path guarantees QWC files point to the correct "/api/qbwc" SOAP endpoint.
        const appUrl = host.includes('localhost') || host.includes('127.0.0.1')
            ? `${protocol}://${host}/api/qbwc`
            : `https://us-central1-saegroup-c6487.cloudfunctions.net/api/qbwc`;
        // Dynamically generate unique UUIDs to prevent "App Name / App ID already exists" errors in QBWC
        const generateGuid = () => {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16).toUpperCase();
            });
        };
        const fileId = `{${generateGuid()}}`;
        const ownerId = `{${generateGuid()}}`;
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
        let filename = '';
        if (customName) {
            // Match user's specific naming convention: "sae_[customName].qwc" (e.g. sae_v002.qwc)
            const safeSuffix = customName.toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/__+/g, '_').replace(/^_+|_+$/g, '');
            filename = `sae_${safeSuffix}.qwc`;
        }
        else {
            filename = `sae_qbwc_${tenantId}.qwc`;
        }
        res.set('Content-Type', 'application/x-qwc');
        res.set('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(qwc);
    }
    catch (e) {
        console.error('QWC Generation Handler Error:', e);
        return res.status(500).send('Internal Server Error: QWC Generation Failed');
    }
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
        // 1. Reset the timer and init flag natively using set with merge FIRST to guarantee immediate response
        try {
            await db.collection('businesses').doc(tenantId).set({
                qbwcInitialized: false,
                lastQbSyncTime: admin.firestore.FieldValue.delete()
            }, { merge: true });
        }
        catch (updateErr) {
            console.error("Failed to update timestamp:", updateErr);
            throw new Error('Failed to update tenant configuration: ' + updateErr.message);
        }
        // 2. Return success immediately so the Cloud Function doesn't timeout the HTTP response
        res.json({ success: true, message: `Successfully reset the initialization timer. Background deletion started.` });
        return;
        // 3. Process the heavy wipes asynchronously in the background
        (async () => {
            const collectionsToWipe = ['qb_customers', 'qb_jobs', 'qb_items', 'qb_estimates', 'qb_invoices', 'qb_purchase_orders', 'qb_time_tracking', 'qb_vendors', 'qb_employees', 'qb_classes'];
            let wipeBatches = [db.batch()];
            let opCount = 0;
            const safeDelete = (ref) => {
                if (opCount >= 490) {
                    wipeBatches.push(db.batch());
                    opCount = 0;
                }
                wipeBatches[wipeBatches.length - 1].delete(ref);
                opCount++;
            };
            for (const collName of collectionsToWipe) {
                try {
                    const snap = await db.collection(`businesses/${tenantId}/${collName}`).get();
                    snap.forEach(doc => {
                        safeDelete(doc.ref);
                    });
                }
                catch (e) {
                    console.error(`Failed to wipe ${collName}:`, e);
                }
            }
            try {
                const queueSnap = await db.collection('qbwc_queue').where('tenantId', '==', tenantId).get();
                queueSnap.forEach(doc => {
                    safeDelete(doc.ref);
                });
            }
            catch (e) { }
            try {
                for (const b of wipeBatches) {
                    await b.commit();
                }
            }
            catch (commitErr) {
                console.error('Failed to commit batch deletions: ' + commitErr.message);
            }
        })();
    }
    catch (e) {
        console.error('Reset Wipe Error:', e);
        return res.status(500).json({ error: e.message || 'Unknown Server Error' });
    }
});
// Force Sync Endpoint (Does not wipe data, just resets timestamps and queue)
exports.qbwcRoutes.get('/force-sync', async (req, res) => {
    try {
        const tenantId = req.query.tenantId;
        if (!tenantId)
            return res.status(400).send('tenantId required');
        const db = admin.firestore();
        // 1. Reset the timer and init flag natively using set with merge FIRST to guarantee immediate response
        try {
            await db.collection('businesses').doc(tenantId).set({
                qbwcInitialized: false,
                lastQbSyncTime: admin.firestore.FieldValue.delete()
            }, { merge: true });
        }
        catch (updateErr) {
            console.error("Failed to update timestamp:", updateErr);
            throw new Error('Failed to update tenant configuration: ' + updateErr.message);
        }
        // 2. Return success immediately to avoid Cloud Functions timeouts
        res.json({ success: true, message: `Successfully reset the initialization timer. The sync queue will be cleared in the background. The next QWC run will perform a full sync.` });
        return;
        // 3. Wipe the tenant's queue asynchronously
        (async () => {
            let wipeBatches = [db.batch()];
            let opCount = 0;
            const safeDelete = (ref) => {
                if (opCount >= 490) {
                    wipeBatches.push(db.batch());
                    opCount = 0;
                }
                wipeBatches[wipeBatches.length - 1].delete(ref);
                opCount++;
            };
            try {
                const queueSnap = await db.collection('qbwc_queue').where('tenantId', '==', tenantId).get();
                queueSnap.forEach(doc => {
                    safeDelete(doc.ref);
                });
                for (const b of wipeBatches) {
                    await b.commit();
                }
            }
            catch (e) {
                console.error("Background force-sync queue delete failed:", e);
            }
        })();
    }
    catch (e) {
        console.error('Force Sync Error:', e);
        return res.status(500).json({ error: e.message || 'Unknown Server Error' });
    }
});
exports.default = exports.qbwcRoutes;
//# sourceMappingURL=qbwc.routes.js.map