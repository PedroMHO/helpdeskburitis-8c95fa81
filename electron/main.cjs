const { app, BrowserWindow, ipcMain, dialog, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { HelpDeskDatabase } = require('./database.cjs');

let database;
let session = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1024, minHeight: 700,
    title: 'HelpDesk Buritis', backgroundColor: '#eef4f3',
    webPreferences: { preload: path.join(__dirname,'preload.cjs'), contextIsolation:true, nodeIntegration:false, sandbox:false },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname,'renderer','index.html'));
}

app.whenReady().then(()=>{
  database=new HelpDeskDatabase(app.getPath('userData'));
  ipcMain.handle('helpdesk:invoke',(_event,{action,payload={}})=>{
    switch(action){
      case 'status': return {needsSetup:!database.hasUsers(),user:session};
      case 'setup': session=database.setup(payload); return session;
      case 'login': session=database.login(payload); return session;
      case 'logout': session=null; return true;
      case 'dashboard': return database.dashboard(session);
      case 'locations': return database.locations(session);
      case 'addLocation': return database.addLocation(session,payload);
      case 'users': return database.users(session);
      case 'createUser': return database.createUser(session,payload);
      case 'tickets': return database.tickets(session);
      case 'ticket': return database.ticket(session,payload.id);
      case 'createTicket': return database.createTicket(session,payload);
      case 'updateTicket': return database.updateTicket(session,payload);
      case 'addRequest': { const result=database.addRequest(session,payload); if(Notification.isSupported())new Notification({title:'HelpDesk Buritis',body:'Nova solicitação adicionada ao chamado.'}).show(); return result; }
      case 'updateRequest': return database.updateRequest(session,payload);
      case 'notifications': return database.notifications(session);
      case 'historyCount': return database.historyCount(session,payload);
      case 'purgeHistory': return database.purgeHistory(session,payload);
      default: throw new Error('Operação desconhecida.');
    }
  });
  ipcMain.handle('helpdesk:select-image',async()=>{const result=await dialog.showOpenDialog({properties:['openFile'],filters:[{name:'Imagens',extensions:['jpg','jpeg','png','webp']}]});return result.canceled?null:result.filePaths[0];});
  ipcMain.handle('helpdesk:backup',async()=>{database.assert(session,['admin']);const result=await dialog.showSaveDialog({defaultPath:`helpdesk-backup-${new Date().toISOString().slice(0,10)}.db`,filters:[{name:'Banco HelpDesk',extensions:['db']}]});if(result.canceled||!result.filePath)return false;database.db.exec('PRAGMA wal_checkpoint(FULL)');fs.copyFileSync(database.dbPath,result.filePath);return true;});
  createWindow();
});

app.on('window-all-closed',()=>{database?.close();if(process.platform!=='darwin')app.quit();});
app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});