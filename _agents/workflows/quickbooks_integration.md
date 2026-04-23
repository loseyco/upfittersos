---
description: Implementation guide and research notes for integrating with QuickBooks Desktop on a local server via QuickBooks Web Connector
---

# Integrating with Local Server QuickBooks (Desktop)

When working with a local server hosting QuickBooks, the integration is different from the cloud-based QuickBooks Online API. A local QuickBooks Desktop instance does not provide a standard REST API. Instead, integration relies on a tool called the **QuickBooks Web Connector (QBWC)**.

### Key Concepts

1. **QuickBooks Web Connector (QBWC):**
   - A Windows application installed on the same machine/server as QuickBooks Desktop.
   - It periodically calls a predefined web service (your API) to exchange commands and data using SOAP.
   - You provide users with a configuration file (`.qwc`) so they can connect the Web Connector to your platform.

2. **qbXML Language:**
   - The data exchanged between the Web Connector and your web service must be formatted in **qbXML**.
   - Your backend will send qbXML queries (e.g., `CustomerQueryRq`, `InvoiceAddRq`) and receive qbXML responses.

3. **SOAP Web Service:**
   - The application must expose a SOAP endpoint with specific methods (e.g., `authenticate`, `sendRequestXML`, `receiveResponseXML`, `closeConnection`).
   - The Web Connector polls these endpoints on a schedule defined by the user.

### Next Steps for Implementation

1. **Deploy a SOAP Endpoint:** You will need to implement a SOAP API that implements Intuit's required QBWC interface.
2. **Build the `.qwc` configuration file:** Provide a mechanism to generate an XML file config that your administrators can use to set up the Web Connector on the local server.
3. **Queue Mechanism:** Create a queue or database table to hold the pending qbXML commands that the SOAP endpoint should fetch when the Web Connector asks for the next task.
4. **Learn qbXML SDK:** Reference Intuit's QuickBooks Desktop SDK to ensure proper syntax when sending or parsing qbXML requests.

*Note: Older tools historically called "QuickBooks Connect" refers more broadly to connection utilities, but QBWC is the canonical solution for local servers. Keep these constraints in mind when adapting the project's estimate and invoice flows to sync back to the local instance.*
