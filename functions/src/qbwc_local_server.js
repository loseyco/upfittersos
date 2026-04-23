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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = __importDefault(require("express"));
var body_parser_1 = __importDefault(require("body-parser"));
var xml2js_1 = require("xml2js");
var fs = __importStar(require("fs"));
var app = (0, express_1.default)();
// Parse XML bodies
app.use(body_parser_1.default.text({ type: ['text/xml', 'application/xml'], limit: '50mb' }));
// A simple queue of queries we want to test locally. 
// When QB Web Connector asks for tasks, we pop them off this array.
var taskQueue = [
    '<ItemInventoryQueryRq requestID="2"><ActiveStatus>All</ActiveStatus></ItemInventoryQueryRq>',
    '<CustomerQueryRq requestID="3"><ActiveStatus>All</ActiveStatus></CustomerQueryRq>'
];
function buildSoapResponse(methodName, innerParams) {
    return "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xmlns:xsd=\"http://www.w3.org/2001/XMLSchema\">\n  <soap:Body>\n    <".concat(methodName, "Response xmlns=\"http://developer.intuit.com/\">\n      <").concat(methodName, "Result>").concat(innerParams, "</").concat(methodName, "Result>\n    </").concat(methodName, "Response>\n  </soap:Body>\n</soap:Envelope>");
}
app.post('/api/qbwc', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var rawXml, parsed, body, responseXml, nextQuery, reqXml, responseXmlText, progress, e_1;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _c.trys.push([0, 2, , 3]);
                rawXml = req.body;
                if (!rawXml)
                    return [2 /*return*/, res.status(400).send('No body')];
                return [4 /*yield*/, (0, xml2js_1.parseStringPromise)(rawXml, { explicitArray: false })];
            case 1:
                parsed = _c.sent();
                body = ((_a = parsed === null || parsed === void 0 ? void 0 : parsed['soap:Envelope']) === null || _a === void 0 ? void 0 : _a['soap:Body']) || ((_b = parsed === null || parsed === void 0 ? void 0 : parsed['soapenv:Envelope']) === null || _b === void 0 ? void 0 : _b['soapenv:Body']);
                if (!body)
                    return [2 /*return*/, res.status(400).send('Invalid SOAP Envelope')];
                if (body.serverVersion) {
                    return [2 /*return*/, res.type('text/xml').send(buildSoapResponse('serverVersion', '1.0.0'))];
                }
                if (body.clientVersion) {
                    return [2 /*return*/, res.type('text/xml').send(buildSoapResponse('clientVersion', ''))];
                }
                if (body.authenticate) {
                    console.log("==> Authenticate requested");
                    responseXml = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\">\n  <soap:Body>\n    <authenticateResponse xmlns=\"http://developer.intuit.com/\">\n      <authenticateResult>\n        <string>LOCAL_DUMMY_TICKET</string>\n        <string></string>\n      </authenticateResult>\n    </authenticateResponse>\n  </soap:Body>\n</soap:Envelope>";
                    return [2 /*return*/, res.type('text/xml').send(responseXml)];
                }
                if (body.sendRequestXML) {
                    console.log("==> sendRequestXML requested");
                    if (taskQueue.length === 0) {
                        console.log("    Queue empty, finishing sync.");
                        return [2 /*return*/, res.type('text/xml').send(buildSoapResponse('sendRequestXML', ''))];
                    }
                    nextQuery = taskQueue.shift();
                    console.log("    Sending query:", nextQuery);
                    reqXml = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<?qbxml version=\"13.0\"?>\n<QBXML><QBXMLMsgsRq onError=\"continueOnError\">".concat(nextQuery, "</QBXMLMsgsRq></QBXML>");
                    return [2 /*return*/, res.type('text/xml').send(buildSoapResponse('sendRequestXML', reqXml.replace(/</g, '&lt;').replace(/>/g, '&gt;')))];
                }
                if (body.receiveResponseXML) {
                    console.log("==> receiveResponseXML incoming...");
                    responseXmlText = body.receiveResponseXML.response;
                    if (responseXmlText) {
                        fs.appendFileSync('qbwc_local_dump.xml', "\n\n=== RESPONSE ===\n" + responseXmlText);
                        console.log("    Successfully wrote response payload to 'qbwc_local_dump.xml'!");
                    }
                    progress = taskQueue.length === 0 ? '100' : '50';
                    return [2 /*return*/, res.type('text/xml').send(buildSoapResponse('receiveResponseXML', progress))];
                }
                if (body.closeConnection) {
                    console.log("==> closeConnection requested");
                    // reset queue for next time
                    taskQueue = [
                        '<ItemInventoryQueryRq requestID="2"><ActiveStatus>All</ActiveStatus></ItemInventoryQueryRq>',
                        '<CustomerQueryRq requestID="3"><ActiveStatus>All</ActiveStatus></CustomerQueryRq>'
                    ];
                    return [2 /*return*/, res.type('text/xml').send(buildSoapResponse('closeConnection', 'OK'))];
                }
                if (body.getLastError) {
                    return [2 /*return*/, res.type('text/xml').send(buildSoapResponse('getLastError', 'No error'))];
                }
                res.status(400).send('Unsupported method');
                return [3 /*break*/, 3];
            case 2:
                e_1 = _c.sent();
                console.error("Express Error:", e_1.message);
                res.status(500).send("Internal Server Error");
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
// WSDL
app.get('/api/qbwc', function (req, res) {
    res.type('text/xml').send('<?xml version="1.0" encoding="utf-8"?><definitions xmlns="http://schemas.xmlsoap.org/wsdl/"></definitions>');
});
app.listen(3005, function () {
    console.log("Local QBWC testing server running at http://localhost:3005/api/qbwc");
    console.log("Update your .qwc file AppURL and AppSupport to point to http://localhost:3005/api/qbwc");
});
