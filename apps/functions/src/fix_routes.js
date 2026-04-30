const fs = require('fs');
const path = require('path');

const routeFiles = [
    'vehicles', 'units', 'time', 'tasks', 'scan', 'qbo', 'jobs', 'inventory', 'customers', 'areas'
].map(f => path.join('c:/_Projects/SAEGroup/functions/src/routes', f + '.routes.ts'));

for (const f of routeFiles) {
    if (!fs.existsSync(f)) continue;
    let content = fs.readFileSync(f, 'utf8');
    
    // Fix caller.role === 'super_admin'
    content = content.replace(/caller\.role === 'super_admin'/g, `(caller.role === 'system_owner' || caller.role === 'super_admin')`);
    
    // Fix callerRoles.includes('super_admin')
    content = content.replace(/callerRoles\.includes\('super_admin'\)/g, `(callerRoles.includes('system_owner') || callerRoles.includes('super_admin'))`);
    
    // Fix caller.role !== 'super_admin'
    content = content.replace(/caller\.role !== 'super_admin'/g, `caller.role !== 'system_owner' && caller.role !== 'super_admin'`);

    // Fix time.routes.ts line 154: (caller.role !== 'admin' && caller.role !== 'workspace_admin' && caller.role !== 'super_admin')
    // Handled by the above !== replacement? Wait.
    // caller.role !== 'admin' && caller.role !== 'workspace_admin' && caller.role !== 'system_owner' && caller.role !== 'super_admin'
    
    fs.writeFileSync(f, content, 'utf8');
    console.log('Fixed ' + f);
}
