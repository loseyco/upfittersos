import * as admin from 'firebase-admin';

export class QbwcService {
  constructor(private tenantId: string) {
    if (!tenantId) {
      throw new Error('QbwcService requires a valid tenantId.');
    }
  }

  // Queue an item for QB sync (e.g. ItemInventoryAddRq or Mod)
  async syncItemToQBO(sku: string, name: string, description: string, price: number, qtyOnHand: number, assetAccountRef: string, incomeAccountRef: string, expenseAccountRef: string) {
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
  async adjustInventoryQuantity(qboItemId: string, qboAdjAccountRef: string, qtyDifference: number) {
     if (qtyDifference === 0) return null; // No adjustment needed
     
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
  async processResponse(action: string, parsedXml: any) {
    const db = admin.firestore();
    const batch = db.batch();
    
    try {
        const msgsRs = parsedXml?.QBXML?.QBXMLMsgsRs;
        if (!msgsRs) return;

        // Automatically determine how many elements were retrieved dynamically to broadcast to the Mission Control dashboard
        let syncedCount = 0;
        let syncedLabel = action.replace('Query', '') + 's';
        if (syncedLabel === 'Inventorys') syncedLabel = 'Inventory Items';
        
        const queryKey = `${action}Rs`;
        const queryRs = msgsRs[queryKey];
        if (queryRs) {
            const retKeys = Object.keys(queryRs).filter(k => k.endsWith('Ret'));
            retKeys.forEach(k => {
                let items = queryRs[k];
                if (!Array.isArray(items)) items = [items];
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
                let allItems: any[] = [];
                itemKeys.forEach(k => {
                    let itemsOfThisType = queryRs[k];
                    if (!Array.isArray(itemsOfThisType)) itemsOfThisType = [itemsOfThisType];
                    // tag them with itemType
                    itemsOfThisType.forEach((i: any) => { i._qbType = k.replace('Item', '').replace('Ret', ''); });
                    allItems = allItems.concat(itemsOfThisType);
                });

                allItems.forEach((item: any) => {
                    const ref = db.collection('businesses').doc(this.tenantId).collection('qb_items').doc(item.ListID);
                    batch.set(ref, {
                        ...item,
                        sku: item.Name || '',
                        name: item.FullName || item.Name || '',
                        description: item.SalesDesc || item.PurchaseDesc || '',
                        quantityOnHand: Number(item.QuantityOnHand) || 0,
                        quantityAllocated: 0,
                        quantityOnOrder: Number(item.QuantityOnOrder) || 0,
                        cost: Number(item.PurchaseCost) || Number(item.AverageCost) || 0,
                        price: Number(item.SalesPrice) || Number(item.Price) || 0,
                        location: '',
                        status: (item.IsActive === 'true' || item.IsActive === true) ? 'In Stock' : 'Inactive',
                        notes: `Imported via QBWC. Type: ${item._qbType || action.replace('Item', '').replace('Query', '')}`,
                        tenantId: this.tenantId,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                });
            }
        }

        if (action === 'CustomerQuery' && msgsRs.CustomerQueryRs?.CustomerRet) {
            let customers = msgsRs.CustomerQueryRs.CustomerRet;
            if (!Array.isArray(customers)) customers = [customers];

            customers.forEach((cust: any) => {
                const ref = db.collection('businesses').doc(this.tenantId).collection('qb_customers').doc(cust.ListID);
                batch.set(ref, {
                    ...cust,
                    firstName: cust.FirstName || '',
                    middleName: cust.MiddleName || '',
                    lastName: cust.LastName || '',
                    nickName: '',
                    company: cust.CompanyName || cust.FullName || '',
                    email: cust.Email?.Address || '',
                    mobilePhone: cust.Phone || '',
                    workPhone: cust.AltPhone || '',
                    sublevel: Number(cust.Sublevel) || 0,
                    parentRefId: cust.ParentRef?.ListID || '',
                    addressStreet: cust.BillAddress?.Addr1 || '',
                    addressCity: cust.BillAddress?.City || '',
                    addressState: cust.BillAddress?.State || '',
                    addressZip: cust.BillAddress?.PostalCode || '',
                    status: (cust.IsActive === 'true' || cust.IsActive === true) ? 'Active' : 'Inactive',
                    notes: cust.Notes || 'Imported via QBWC.',
                    tags: ['QuickBooks'],
                    tenantId: this.tenantId,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            });
        }

        if (action === 'VendorQuery' && msgsRs.VendorQueryRs?.VendorRet) {
            let vendors = msgsRs.VendorQueryRs.VendorRet;
            if (!Array.isArray(vendors)) vendors = [vendors];

            vendors.forEach((vendor: any) => {
                const ref = db.collection('businesses').doc(this.tenantId).collection('qb_vendors').doc(vendor.ListID);
                batch.set(ref, {
                    ...vendor,
                    listId: vendor.ListID,
                    name: vendor.Name,
                    fullName: vendor.FullName,
                    companyName: vendor.CompanyName || vendor.FullName,
                    email: vendor.Email?.Address || '',
                    phone: vendor.Phone || '',
                    balance: vendor.Balance || 0,
                    isActive: vendor.IsActive === 'true' || vendor.IsActive === true,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            });
        }

        if (action === 'EmployeeQuery' && msgsRs.EmployeeQueryRs?.EmployeeRet) {
            let employees = msgsRs.EmployeeQueryRs.EmployeeRet;
            if (!Array.isArray(employees)) employees = [employees];

            employees.forEach((emp: any) => {
                const ref = db.collection('businesses').doc(this.tenantId).collection('qb_employees').doc(emp.ListID);
                batch.set(ref, {
                    ...emp,
                    listId: emp.ListID,
                    firstName: emp.FirstName || '',
                    lastName: emp.LastName || '',
                    name: emp.Name,
                    email: emp.Email || '',
                    phone: emp.Phone || '',
                    isActive: emp.IsActive === 'true' || emp.IsActive === true,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            });
        }

        if (action === 'ClassQuery' && msgsRs.ClassQueryRs?.ClassRet) {
            let classes = msgsRs.ClassQueryRs.ClassRet;
            if (!Array.isArray(classes)) classes = [classes];

            classes.forEach((cls: any) => {
                const ref = db.collection('businesses').doc(this.tenantId).collection('qb_classes').doc(cls.ListID);
                batch.set(ref, {
                    ...cls,
                    listId: cls.ListID,
                    name: cls.Name,
                    fullName: cls.FullName,
                    isActive: cls.IsActive === 'true' || cls.IsActive === true,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            });
        }

        if (action === 'EstimateQuery' && msgsRs.EstimateQueryRs?.EstimateRet) {
            let estimates = msgsRs.EstimateQueryRs.EstimateRet;
            if (!Array.isArray(estimates)) estimates = [estimates];

            estimates.forEach((est: any) => {
                const ref = db.collection('businesses').doc(this.tenantId).collection('qb_estimates').doc(est.TxnID);
                batch.set(ref, {
                    ...est,
                    txnId: est.TxnID,
                    refNumber: est.RefNumber || '',
                    customerRef: est.CustomerRef?.ListID || '',
                    customerName: est.CustomerRef?.FullName || '',
                    txnDate: est.TxnDate || '',
                    totalAmount: est.TotalAmount || 0,
                    isStale: est.IsActive === 'false',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            });
        }

        if (action === 'InvoiceQuery' && msgsRs.InvoiceQueryRs?.InvoiceRet) {
            let invoices = msgsRs.InvoiceQueryRs.InvoiceRet;
            if (!Array.isArray(invoices)) invoices = [invoices];

            invoices.forEach((inv: any) => {
                const ref = db.collection('businesses').doc(this.tenantId).collection('qb_invoices').doc(inv.TxnID);
                batch.set(ref, {
                    ...inv,
                    txnId: inv.TxnID,
                    refNumber: inv.RefNumber || '',
                    customerRef: inv.CustomerRef?.ListID || '',
                    customerName: inv.CustomerRef?.FullName || '',
                    txnDate: inv.TxnDate || '',
                    subtotal: inv.Subtotal || 0,
                    balanceRemaining: inv.BalanceRemaining || 0,
                    isPaid: inv.IsPaid === 'true' || inv.IsPaid === true,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            });
        }

        if (action === 'PurchaseOrderQuery' && msgsRs.PurchaseOrderQueryRs?.PurchaseOrderRet) {
            let pos = msgsRs.PurchaseOrderQueryRs.PurchaseOrderRet;
            if (!Array.isArray(pos)) pos = [pos];

            pos.forEach((po: any) => {
                const ref = db.collection('businesses').doc(this.tenantId).collection('qb_purchase_orders').doc(po.TxnID);
                batch.set(ref, {
                    ...po,
                    txnId: po.TxnID,
                    refNumber: po.RefNumber || '',
                    vendorRef: po.VendorRef?.ListID || '',
                    vendorName: po.VendorRef?.FullName || '',
                    txnDate: po.TxnDate || '',
                    totalAmount: po.TotalAmount || 0,
                    isFullyReceived: po.IsFullyReceived === 'true' || po.IsFullyReceived === true,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            });
        }

        if (action === 'BillQuery' && msgsRs.BillQueryRs?.BillRet) {
            let bills = msgsRs.BillQueryRs.BillRet;
            if (!Array.isArray(bills)) bills = [bills];

            bills.forEach((bill: any) => {
                const ref = db.collection('businesses').doc(this.tenantId).collection('qb_bills').doc(bill.TxnID);
                batch.set(ref, {
                    ...bill,
                    txnId: bill.TxnID,
                    refNumber: bill.RefNumber || '',
                    vendorRef: bill.VendorRef?.ListID || '',
                    vendorName: bill.VendorRef?.FullName || '',
                    txnDate: bill.TxnDate || '',
                    amountDue: bill.AmountDue || 0,
                    isPaid: bill.IsPaid === 'true' || bill.IsPaid === true,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            });
        }

        // Broadcast System Event to Live Feed if anything was synced
        if (syncedCount > 0) {
            const feedRef = db.collection('businesses').doc(this.tenantId).collection('activity_feed').doc();
            batch.set(feedRef, {
                type: 'qbwc_sync',
                title: 'QuickBooks Integration',
                message: `Imported ${syncedCount} ${syncedLabel} automatically.`,
                severity: 'info',
                action: action,
                createdAt: new Date().toISOString(),
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        // Commit all extracted entities
        await batch.commit();
        console.log(`Successfully processed and saved ${syncedCount} ${syncedLabel} for ${action} from QBWC.`);
    } catch (e) {
        console.error(`Error processing QBWC response for ${action}:`, e);
    }
  }
}
