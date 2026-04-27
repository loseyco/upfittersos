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
exports.QbwcService = void 0;
const admin = __importStar(require("firebase-admin"));
class QbwcService {
    constructor(tenantId) {
        this.tenantId = tenantId;
        if (!tenantId) {
            throw new Error('QbwcService requires a valid tenantId.');
        }
    }
    // Queue an item for QB sync (e.g. ItemInventoryAddRq or Mod)
    async syncItemToQBO(sku, name, description, price, qtyOnHand, assetAccountRef, incomeAccountRef, expenseAccountRef) {
        const db = admin.firestore();
        // Build qbXML specifically for QuickBooks Desktop
        // Note: This is an ItemInventoryAddRq. For existing items, you'd need an ItemInventoryModRq.
        // Assuming 'Add' for simplicity, or we can enqueue a generic "Sync" job and let the worker figure it out.
        const xml = `
      <ItemInventoryAddRq>
        <ItemInventoryAdd>
          <Name>${name.substring(0, 31)}</Name>
          <IsActive>true</IsActive>
          <SalesDesc>${(description || name).substring(0, 4000)}</SalesDesc>
          <SalesPrice>${price.toFixed(2)}</SalesPrice>
          <IncomeAccountRef>
            <ListID>${incomeAccountRef}</ListID>
          </IncomeAccountRef>
          <PurchaseDesc>${(description || name).substring(0, 4000)}</PurchaseDesc>
          <COGSAccountRef>
            <ListID>${expenseAccountRef}</ListID>
          </COGSAccountRef>
          <AssetAccountRef>
            <ListID>${assetAccountRef}</ListID>
          </AssetAccountRef>
        </ItemInventoryAdd>
      </ItemInventoryAddRq>
    `;
        await db.collection('qbwc_queue').add({
            tenantId: this.tenantId,
            status: 'pending',
            action: 'ItemInventoryAdd',
            qbxml: xml,
            createdAt: new Date().toISOString()
        });
        return { queued: true };
    }
    // Queue an inventory adjustment (QtyDiff)
    async adjustInventoryQuantity(qboItemId, qboAdjAccountRef, qtyDifference) {
        if (qtyDifference === 0)
            return null; // No adjustment needed
        const db = admin.firestore();
        // InventoryAdjustmentAddRq for Desktop
        const xml = `
        <InventoryAdjustmentAddRq>
            <InventoryAdjustmentAdd>
                <AccountRef>
                    <ListID>${qboAdjAccountRef}</ListID>
                </AccountRef>
                <InventoryAdjustmentLineAdd>
                    <ItemRef>
                        <ListID>${qboItemId}</ListID>
                    </ItemRef>
                    <QuantityAdjustment>
                        <QuantityDifference>${qtyDifference}</QuantityDifference>
                    </QuantityAdjustment>
                </InventoryAdjustmentLineAdd>
            </InventoryAdjustmentAdd>
        </InventoryAdjustmentAddRq>
     `;
        await db.collection('qbwc_queue').add({
            tenantId: this.tenantId,
            status: 'pending',
            action: 'InventoryAdjustmentAdd',
            qbxml: xml,
            createdAt: new Date().toISOString()
        });
        return { queued: true };
    }
    // Parse and process incoming data from QBWC response
    async processResponse(action, parsedXml) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const db = admin.firestore();
        // Firebase limits atomic batches to 500 operations. For massive enterprise payloads, we must dynamically split operations.
        let batches = [db.batch()];
        let operationCount = 0;
        const safeBatchSet = (ref, data, opts) => {
            if (operationCount >= 490) {
                batches.push(db.batch());
                operationCount = 0;
            }
            if (opts) {
                batches[batches.length - 1].set(ref, data, opts);
            }
            else {
                batches[batches.length - 1].set(ref, data);
            }
            operationCount++;
        };
        try {
            const msgsRs = (_a = parsedXml === null || parsedXml === void 0 ? void 0 : parsedXml.QBXML) === null || _a === void 0 ? void 0 : _a.QBXMLMsgsRs;
            if (!msgsRs)
                return;
            // Automatically determine how many elements were retrieved dynamically to broadcast to the Mission Control dashboard
            let syncedCount = 0;
            let syncedLabel = action.replace('Query', '') + 's';
            if (syncedLabel === 'Inventorys')
                syncedLabel = 'Inventory Items';
            const queryKey = `${action}Rs`;
            const queryRs = msgsRs[queryKey];
            if (queryRs) {
                const retKeys = Object.keys(queryRs).filter(k => k.endsWith('Ret'));
                retKeys.forEach(k => {
                    let items = queryRs[k];
                    if (!Array.isArray(items))
                        items = [items];
                    syncedCount += items.length;
                });
            }
            // Discarding AccountQuery entirely as per user request to not store Chart of Accounts
            // Discarding HostQuery because it's a dummy hack simply appended to clear Web Connector UI warnings
            if (action === 'AccountQuery' || action === 'HostQuery') {
                return;
            }
            if (['ItemInventoryQuery', 'ItemServiceQuery', 'ItemNonInventoryQuery', 'ItemQuery'].includes(action)) {
                const queryKey = `${action}Rs`;
                // ItemQueryRs can return multiple types of Item...Ret all mixed together!
                // We should just look at all keys that end with 'Ret' inside ItemQueryRs.
                const queryRs = msgsRs[queryKey];
                if (queryRs) {
                    const itemKeys = Object.keys(queryRs).filter(k => k.endsWith('Ret'));
                    let allItems = [];
                    itemKeys.forEach(k => {
                        let itemsOfThisType = queryRs[k];
                        if (!Array.isArray(itemsOfThisType))
                            itemsOfThisType = [itemsOfThisType];
                        // tag them with itemType
                        itemsOfThisType.forEach((i) => { i._qbType = k.replace('Item', '').replace('Ret', ''); });
                        allItems = allItems.concat(itemsOfThisType);
                    });
                    allItems.forEach((item) => {
                        const ref = db.collection('businesses').doc(this.tenantId).collection('qb_items').doc(item.ListID);
                        const prodRef = db.collection('businesses').doc(this.tenantId).collection('inventory_items').doc(item.ListID);
                        const itemData = Object.assign(Object.assign({}, item), { sku: item.Name || '', name: item.FullName || item.Name || '', description: item.SalesDesc || item.PurchaseDesc || '', quantityOnHand: Number(item.QuantityOnHand) || 0, quantityAllocated: 0, quantityOnOrder: Number(item.QuantityOnOrder) || 0, cost: Number(item.PurchaseCost) || Number(item.AverageCost) || 0, price: Number(item.SalesPrice) || Number(item.Price) || 0, location: '', status: (item.IsActive === 'true' || item.IsActive === true) ? 'In Stock' : 'Inactive', notes: `Imported via QBWC. Type: ${item._qbType || action.replace('Item', '').replace('Query', '')}`, tenantId: this.tenantId });
                        safeBatchSet(ref, itemData, { merge: true });
                        safeBatchSet(prodRef, itemData, { merge: true });
                    });
                }
            }
            if (action === 'CustomerQuery' && ((_b = msgsRs.CustomerQueryRs) === null || _b === void 0 ? void 0 : _b.CustomerRet)) {
                let customers = msgsRs.CustomerQueryRs.CustomerRet;
                if (!Array.isArray(customers))
                    customers = [customers];
                customers.forEach((cust) => {
                    var _a, _b, _c, _d, _e, _f;
                    // Parse Custom Fields natively
                    const qbCustomFields = {};
                    if (cust.DataExtRet) {
                        let exts = cust.DataExtRet;
                        if (!Array.isArray(exts))
                            exts = [exts];
                        exts.forEach((e) => {
                            if (e.DataExtName && e.DataExtValue) {
                                qbCustomFields[e.DataExtName] = e.DataExtValue;
                            }
                        });
                    }
                    const sublevel = Number(cust.Sublevel) || 0;
                    const isJob = sublevel > 0;
                    const commonData = Object.assign(Object.assign({}, cust), { firstName: cust.FirstName || '', middleName: cust.MiddleName || '', lastName: cust.LastName || '', nickName: '', company: cust.CompanyName || cust.FullName || '', email: ((_a = cust.Email) === null || _a === void 0 ? void 0 : _a.Address) || '', mobilePhone: cust.Phone || '', workPhone: cust.AltPhone || '', sublevel: sublevel, parentRefId: ((_b = cust.ParentRef) === null || _b === void 0 ? void 0 : _b.ListID) || '', addressStreet: ((_c = cust.BillAddress) === null || _c === void 0 ? void 0 : _c.Addr1) || '', addressCity: ((_d = cust.BillAddress) === null || _d === void 0 ? void 0 : _d.City) || '', addressState: ((_e = cust.BillAddress) === null || _e === void 0 ? void 0 : _e.State) || '', addressZip: ((_f = cust.BillAddress) === null || _f === void 0 ? void 0 : _f.PostalCode) || '', status: (cust.IsActive === 'true' || cust.IsActive === true) ? 'Active' : 'Inactive', notes: cust.Notes || 'Imported via QBWC.', tags: ['QuickBooks'], tenantId: this.tenantId, qbCustomFields });
                    if (isJob) {
                        // Extract vehicle based on fuzzy matching of custom fields
                        let vehicle = null;
                        if (Object.keys(qbCustomFields).length > 0) {
                            let make = '', model = '', year = '', vin = '';
                            Object.entries(qbCustomFields).forEach(([k, v]) => {
                                const keyLower = k.toLowerCase();
                                if (keyLower === 'vin' || keyLower.includes('v.i.n') || keyLower.includes('vin num'))
                                    vin = v;
                                else if (keyLower.includes('make') || keyLower.includes('brand'))
                                    make = v;
                                else if (keyLower.includes('model') && !keyLower.includes('year'))
                                    model = v;
                                else if (keyLower.includes('year'))
                                    year = v;
                            });
                            if (make || model || vin || year)
                                vehicle = { make, model, year, vin };
                        }
                        const jobData = Object.assign(Object.assign({}, commonData), { jobName: cust.Name || '', vehicle });
                        const ref = db.collection('businesses').doc(this.tenantId).collection('qb_jobs').doc(cust.ListID);
                        const prodRef = db.collection('businesses').doc(this.tenantId).collection('jobs').doc(cust.ListID);
                        safeBatchSet(ref, jobData, { merge: true });
                        safeBatchSet(prodRef, jobData, { merge: true });
                    }
                    else {
                        const ref = db.collection('businesses').doc(this.tenantId).collection('qb_customers').doc(cust.ListID);
                        const prodRef = db.collection('businesses').doc(this.tenantId).collection('customers').doc(cust.ListID);
                        safeBatchSet(ref, commonData, { merge: true });
                        safeBatchSet(prodRef, commonData, { merge: true });
                    }
                });
            }
            if (action === 'VendorQuery' && ((_c = msgsRs.VendorQueryRs) === null || _c === void 0 ? void 0 : _c.VendorRet)) {
                let vendors = msgsRs.VendorQueryRs.VendorRet;
                if (!Array.isArray(vendors))
                    vendors = [vendors];
                vendors.forEach((vendor) => {
                    var _a;
                    const ref = db.collection('businesses').doc(this.tenantId).collection('qb_vendors').doc(vendor.ListID);
                    safeBatchSet(ref, Object.assign(Object.assign({}, vendor), { listId: vendor.ListID, name: vendor.Name, fullName: vendor.FullName, companyName: vendor.CompanyName || vendor.FullName, email: ((_a = vendor.Email) === null || _a === void 0 ? void 0 : _a.Address) || '', phone: vendor.Phone || '', balance: vendor.Balance || 0, isActive: vendor.IsActive === 'true' || vendor.IsActive === true }), { merge: true });
                });
            }
            if (action === 'EmployeeQuery' && ((_d = msgsRs.EmployeeQueryRs) === null || _d === void 0 ? void 0 : _d.EmployeeRet)) {
                let employees = msgsRs.EmployeeQueryRs.EmployeeRet;
                if (!Array.isArray(employees))
                    employees = [employees];
                employees.forEach((emp) => {
                    const ref = db.collection('businesses').doc(this.tenantId).collection('qb_employees').doc(emp.ListID);
                    safeBatchSet(ref, Object.assign(Object.assign({}, emp), { listId: emp.ListID, firstName: emp.FirstName || '', lastName: emp.LastName || '', name: emp.Name, email: emp.Email || '', phone: emp.Phone || '', isActive: emp.IsActive === 'true' || emp.IsActive === true }), { merge: true });
                });
            }
            if (action === 'ClassQuery' && ((_e = msgsRs.ClassQueryRs) === null || _e === void 0 ? void 0 : _e.ClassRet)) {
                let classes = msgsRs.ClassQueryRs.ClassRet;
                if (!Array.isArray(classes))
                    classes = [classes];
                classes.forEach((cls) => {
                    const ref = db.collection('businesses').doc(this.tenantId).collection('qb_classes').doc(cls.ListID);
                    safeBatchSet(ref, Object.assign(Object.assign({}, cls), { listId: cls.ListID, name: cls.Name, fullName: cls.FullName, isActive: cls.IsActive === 'true' || cls.IsActive === true }), { merge: true });
                });
            }
            if (action === 'EstimateQuery' && ((_f = msgsRs.EstimateQueryRs) === null || _f === void 0 ? void 0 : _f.EstimateRet)) {
                let estimates = msgsRs.EstimateQueryRs.EstimateRet;
                if (!Array.isArray(estimates))
                    estimates = [estimates];
                estimates.forEach((est) => {
                    var _a, _b;
                    const ref = db.collection('businesses').doc(this.tenantId).collection('qb_estimates').doc(est.TxnID);
                    safeBatchSet(ref, Object.assign(Object.assign({}, est), { txnId: est.TxnID, refNumber: est.RefNumber || '', customerRef: ((_a = est.CustomerRef) === null || _a === void 0 ? void 0 : _a.ListID) || '', customerName: ((_b = est.CustomerRef) === null || _b === void 0 ? void 0 : _b.FullName) || '', txnDate: est.TxnDate || '', totalAmount: est.TotalAmount || 0, isStale: est.IsActive === 'false' }), { merge: true });
                });
            }
            if (action === 'InvoiceQuery' && ((_g = msgsRs.InvoiceQueryRs) === null || _g === void 0 ? void 0 : _g.InvoiceRet)) {
                let invoices = msgsRs.InvoiceQueryRs.InvoiceRet;
                if (!Array.isArray(invoices))
                    invoices = [invoices];
                invoices.forEach((inv) => {
                    var _a, _b;
                    const ref = db.collection('businesses').doc(this.tenantId).collection('qb_invoices').doc(inv.TxnID);
                    safeBatchSet(ref, Object.assign(Object.assign({}, inv), { txnId: inv.TxnID, refNumber: inv.RefNumber || '', customerRef: ((_a = inv.CustomerRef) === null || _a === void 0 ? void 0 : _a.ListID) || '', customerName: ((_b = inv.CustomerRef) === null || _b === void 0 ? void 0 : _b.FullName) || '', txnDate: inv.TxnDate || '', subtotal: inv.Subtotal || 0, balanceRemaining: inv.BalanceRemaining || 0, isPaid: inv.IsPaid === 'true' || inv.IsPaid === true }), { merge: true });
                });
            }
            if (action === 'PurchaseOrderQuery' && ((_h = msgsRs.PurchaseOrderQueryRs) === null || _h === void 0 ? void 0 : _h.PurchaseOrderRet)) {
                let pos = msgsRs.PurchaseOrderQueryRs.PurchaseOrderRet;
                if (!Array.isArray(pos))
                    pos = [pos];
                pos.forEach((po) => {
                    var _a, _b;
                    const ref = db.collection('businesses').doc(this.tenantId).collection('qb_purchase_orders').doc(po.TxnID);
                    safeBatchSet(ref, Object.assign(Object.assign({}, po), { txnId: po.TxnID, refNumber: po.RefNumber || '', vendorRef: ((_a = po.VendorRef) === null || _a === void 0 ? void 0 : _a.ListID) || '', vendorName: ((_b = po.VendorRef) === null || _b === void 0 ? void 0 : _b.FullName) || '', txnDate: po.TxnDate || '', totalAmount: po.TotalAmount || 0, isFullyReceived: po.IsFullyReceived === 'true' || po.IsFullyReceived === true }), { merge: true });
                });
            }
            // Broadcast System Event to Live Feed if anything was synced
            if (syncedCount > 0) {
                const feedRef = db.collection('businesses').doc(this.tenantId).collection('activity_feed').doc();
                safeBatchSet(feedRef, {
                    type: 'qbwc_sync',
                    title: 'QuickBooks Integration',
                    message: `Imported ${syncedCount} ${syncedLabel} automatically.`,
                    severity: 'info',
                    action: action,
                    createdAt: new Date().toISOString(),
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                });
            }
            // Commit all extracted entities natively across chunked segments
            for (const b of batches) {
                await b.commit();
            }
            console.log(`Successfully processed and saved ${syncedCount} ${syncedLabel} for ${action} from QBWC.`);
        }
        catch (e) {
            console.error(`Error processing QBWC response for ${action}:`, e);
        }
    }
}
exports.QbwcService = QbwcService;
//# sourceMappingURL=qbwc.service.js.map