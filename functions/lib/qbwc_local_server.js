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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const xml2js_1 = require("xml2js");
const fs = __importStar(require("fs"));
const app = (0, express_1.default)();
// Parse XML bodies
app.use(body_parser_1.default.text({ type: ['text/xml', 'application/xml'], limit: '50mb' }));
// A simple queue of queries we want to test locally. 
// When QB Web Connector asks for tasks, we pop them off this array.
let taskQueue = [
    '<ItemInventoryQueryRq requestID="2"><ActiveStatus>All</ActiveStatus></ItemInventoryQueryRq>',
    '<CustomerQueryRq requestID="3"><ActiveStatus>All</ActiveStatus></CustomerQueryRq>'
];
function buildSoapResponse(methodName, innerParams) {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <${methodName}Response xmlns="http://developer.intuit.com/">
      <${methodName}Result>${innerParams}</${methodName}Result>
    </${methodName}Response>
  </soap:Body>
</soap:Envelope>`;
}
app.post('/api/qbwc', async (req, res) => {
    var _a, _b;
    try {
        const rawXml = req.body;
        if (!rawXml)
            return res.status(400).send('No body');
        const parsed = await (0, xml2js_1.parseStringPromise)(rawXml, { explicitArray: false });
        const body = ((_a = parsed === null || parsed === void 0 ? void 0 : parsed['soap:Envelope']) === null || _a === void 0 ? void 0 : _a['soap:Body']) || ((_b = parsed === null || parsed === void 0 ? void 0 : parsed['soapenv:Envelope']) === null || _b === void 0 ? void 0 : _b['soapenv:Body']);
        if (!body)
            return res.status(400).send('Invalid SOAP Envelope');
        if (body.serverVersion) {
            return res.type('text/xml').send(buildSoapResponse('serverVersion', '1.0.0'));
        }
        if (body.clientVersion) {
            return res.type('text/xml').send(buildSoapResponse('clientVersion', ''));
        }
        if (body.authenticate) {
            console.log("==> Authenticate requested");
            // Return dummy ticket
            const responseXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <authenticateResponse xmlns="http://developer.intuit.com/">
      <authenticateResult>
        <string>LOCAL_DUMMY_TICKET</string>
        <string></string>
      </authenticateResult>
    </authenticateResponse>
  </soap:Body>
</soap:Envelope>`;
            return res.type('text/xml').send(responseXml);
        }
        if (body.sendRequestXML) {
            console.log("==> sendRequestXML requested");
            if (taskQueue.length === 0) {
                console.log("    Queue empty, finishing sync.");
                return res.type('text/xml').send(buildSoapResponse('sendRequestXML', ''));
            }
            const nextQuery = taskQueue.shift();
            console.log("    Sending query:", nextQuery);
            const reqXml = `<?xml version="1.0" encoding="utf-8"?>
<?qbxml version="13.0"?>
<QBXML><QBXMLMsgsRq onError="continueOnError">${nextQuery}</QBXMLMsgsRq></QBXML>`;
            return res.type('text/xml').send(buildSoapResponse('sendRequestXML', reqXml.replace(/</g, '&lt;').replace(/>/g, '&gt;')));
        }
        if (body.receiveResponseXML) {
            console.log("==> receiveResponseXML incoming...");
            const responseXmlText = body.receiveResponseXML.response;
            if (responseXmlText) {
                fs.appendFileSync('qbwc_local_dump.xml', "\n\n=== RESPONSE ===\n" + responseXmlText);
                console.log("    Successfully wrote response payload to 'qbwc_local_dump.xml'!");
            }
            // Return 100 to signal complete sync, or less if more pending
            const progress = taskQueue.length === 0 ? '100' : '50';
            return res.type('text/xml').send(buildSoapResponse('receiveResponseXML', progress));
        }
        if (body.closeConnection) {
            console.log("==> closeConnection requested");
            // reset queue for next time
            taskQueue = [
                '<ItemInventoryQueryRq requestID="2"><ActiveStatus>All</ActiveStatus></ItemInventoryQueryRq>',
                '<CustomerQueryRq requestID="3"><ActiveStatus>All</ActiveStatus></CustomerQueryRq>'
            ];
            return res.type('text/xml').send(buildSoapResponse('closeConnection', 'OK'));
        }
        if (body.getLastError) {
            return res.type('text/xml').send(buildSoapResponse('getLastError', 'No error'));
        }
        return res.status(400).send('Unsupported method');
    }
    catch (e) {
        console.error("Express Error:", e.message);
        return res.status(500).send("Internal Server Error");
    }
});
// WSDL
app.get('/api/qbwc', (req, res) => {
    res.type('text/xml').send('<?xml version="1.0" encoding="utf-8"?><definitions xmlns="http://schemas.xmlsoap.org/wsdl/"></definitions>');
});
app.listen(3005, () => {
    console.log("Local QBWC testing server running at http://localhost:3005/api/qbwc");
    console.log("Update your .qwc file AppURL and AppSupport to point to http://localhost:3005/api/qbwc");
});
//# sourceMappingURL=qbwc_local_server.js.map