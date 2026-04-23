import fetch from 'node-fetch';
import * as fs from 'fs';

const ENDPOINT = 'https://us-central1-saegroup-c6487.cloudfunctions.net/api/qbwc';
const TENANT_ID = 'test-tenant'; // Set this to the tenant you are syncing!

async function sendSoap(body: string) {
    const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body
    });
    return await res.text();
}

async function runLocalTest() {
    console.log(`[1] Simulating Web Connector Authentication for ${TENANT_ID}...`);
    
    // 1. Authenticate Request
    const authReq = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <authenticate xmlns="http://developer.intuit.com/">
      <strUserName>${TENANT_ID}</strUserName>
      <strPassword>dummy</strPassword>
    </authenticate>
  </soap:Body>
</soap:Envelope>`;

    const authRes = await sendSoap(authReq);
    
    // Extract ticket using simple regex for testing
    const ticketMatch = authRes.match(/<string>(.*?)<\/string>/);
    if (!ticketMatch || !ticketMatch[1]) {
        console.error("Failed to authenticate! Response:", authRes);
        return;
    }
    const ticket = ticketMatch[1];
    console.log(`✅ Authenticated! Received Ticket: ${ticket}\n`);

    console.log(`[2] Simulating sendRequestXML (asking what we should extract next)...`);
    
    // 2. Fetch Pending Queue XML
    const nextReq = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <sendRequestXML xmlns="http://developer.intuit.com/">
      <ticket>${ticket}</ticket>
      <strHCPResponse></strHCPResponse>
      <strCompanyFileName></strCompanyFileName>
      <qbXMLCountry>US</qbXMLCountry>
      <qbXMLMajorVers>13</qbXMLMajorVers>
      <qbXMLMinorVers>0</qbXMLMinorVers>
    </sendRequestXML>
  </soap:Body>
</soap:Envelope>`;

    const nextRes = await sendSoap(nextReq);
    
    const xmlMatch = nextRes.match(/<sendRequestXMLResult>([\s\S]*?)<\/sendRequestXMLResult>/);
    if (xmlMatch && xmlMatch[1]) {
        const decodedXml = xmlMatch[1]
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .trim();
        
        if (decodedXml === '') {
            console.log("No pending tasks in the queue!");
        } else {
             console.log(`✅ Received XML Request from Server! Writing to qbwc_server_request.xml...`);
             fs.writeFileSync('qbwc_server_request.xml', decodedXml);
             console.log(`File saved. The server is asking for: \n${decodedXml.split('\\n')[2] || decodedXml}`);
        }
    } else {
         console.log("Could not parse next XML result.");
    }
}

runLocalTest().catch(console.error);
