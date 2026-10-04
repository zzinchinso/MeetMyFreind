// Small fakes of the Apps Script services server/Code.gs uses (Sheets, Drive, Properties, Lock, Utilities),
// shared by tests/server.cjs and tests/contract.cjs.
// Runs server/Code.gs against small fakes of the Apps Script services it uses, with the same
// payload shape app.js sends. It cannot prove a real deployment works (authorisation, quotas, CORS),
// but it does prove the save / retry / status / update logic, the dedicated tab, the one-off move
// and the per-applicant photo folders.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert'),crypto=require('crypto');
const source=fs.readFileSync(path.join(__dirname,'../server/Code.gs'),'utf8');

function fakeSheet(name,rows,maxColumns=26,maxRows=1000){
 const data=rows.map(r=>r.slice());const formats=new Map();let book=null;
 const filled=c=>c!==''&&c!=null;
 const sheet={
  _data:data,_formats:formats,_frozen:0,_bind(b){book=b;},
  getName:()=>name,getParent:()=>book,
  getMaxColumns:()=>maxColumns,getMaxRows:()=>maxRows,
  getLastRow(){for(let i=data.length-1;i>=0;i--)if(data[i].some(filled))return i+1;return 0;},
  getLastColumn(){let last=0;for(const r of data)for(let i=r.length-1;i>=0;i--)if(filled(r[i])){last=Math.max(last,i+1);break;}return last;},
  insertColumnsAfter(after,count){assert.equal(after,maxColumns);maxColumns+=count;},
  insertColumnAfter(after){assert(after>=1&&after<=maxColumns);maxColumns+=1;data.forEach(r=>{if(r.length>after)r.splice(after,0,'');});},
  insertRowsAfter(after,count){assert.equal(after,maxRows);maxRows+=count;},
  deleteRow(row){assert(row>=1&&row<=data.length);data.splice(row-1,1);},
  deleteColumn(col){assert(col>=1&&col<=maxColumns);maxColumns-=1;data.forEach(r=>{if(r.length>=col)r.splice(col-1,1);});},
  setFrozenRows(count){sheet._frozen=count;},
  getRange(row,col,numRows=1,numCols=1){
   const check=()=>{if(row<1||col<1||row+numRows-1>maxRows||col+numCols-1>maxColumns)throw Error('The coordinates of the range are outside the dimensions of the sheet.');};
   const each=fn=>{for(let r=0;r<numRows;r++){while(data.length<row+r)data.push([]);const target=data[row-1+r];for(let c=0;c<numCols;c++){while(target.length<col+c)target.push('');fn(target,col-1+c,r,c);}}};
   // Sheets drops a leading apostrophe and keeps the rest as text.
   const plain=v=>typeof v==='string'&&v.startsWith("'")?v.slice(1):v;
   const range={
    getValues(){check();return Array.from({length:numRows},(_,r)=>Array.from({length:numCols},(_,c)=>(data[row-1+r]||[])[col-1+c]??''));},
    setValues(values){check();assert.equal(values.length,numRows);values.forEach(line=>assert.equal(line.length,numCols));each((target,at,r,c)=>{target[at]=plain(values[r][c]);});return range;},
    setValue(value){check();each((target,at)=>{target[at]=plain(value);});return range;},
    setNumberFormat(format){check();for(let r=0;r<numRows;r++)formats.set(row+r,format);return range;},
    setFontWeight(){check();return range;},
    clearContent(){check();each((target,at)=>{target[at]='';});return range;},
    createTextFinder(text){let entire=false;return {matchEntireCell(flag){entire=flag;return this;},findNext(){for(let r=0;r<numRows;r++)for(let c=0;c<numCols;c++){const v=String((data[row-1+r]||[])[col-1+c]??'');if(entire?v===text:v.includes(text))return {getRow:()=>row+r};}return null;}};}
   };return range;}
 };
 return sheet;
}

function environment({sheets,bound=true,properties={}}){
 const props=new Map(Object.entries(properties));
 const book={getName:()=>'신청 응답',getSheetByName:n=>sheets.find(s=>s.getName()===n)||null,getSheets:()=>sheets.slice(),
  insertSheet(name,index=sheets.length){assert(!book.getSheetByName(name));const sheet=fakeSheet(name,[]);sheet._bind(book);sheets.splice(index,0,sheet);return sheet;}};
 sheets.forEach(s=>s._bind(book));
 const files=new Map(),folders=new Map();let counter=0;
 const makeFolder=(name,parent=null)=>{const id='folder-'+(++counter);const folder={_parent:parent,_trashed:false,getId:()=>id,getName:()=>name,setName(next){name=next;return folder;},setSharing(){},getSharingAccess:()=>'PRIVATE',isTrashed:()=>folder._trashed,setTrashed(flag){folder._trashed=flag;},
   createFolder:child=>makeFolder(child,folder),
   createFile(blob){const fileId='file-'+(++counter);let fileName=blob.getName();const file={_parent:folder,trashed:false,getId:()=>fileId,getName:()=>fileName,setName(next){fileName=next;return file;},getMimeType:()=>blob.getContentType(),moveTo(target){file._parent=target;return file;},setSharing(){},setTrashed(flag){file.trashed=flag;},getBlob:()=>blob};files.set(fileId,file);return file;}};
  folders.set(id,folder);return folder;};
 const bytes=value=>Buffer.isBuffer(value)?value:Array.isArray(value)?Buffer.from(value):Buffer.from(String(value),'utf8');
 const newBlob=(content,type,name)=>({getContentType:()=>type,getBytes:()=>content,getName:()=>name});
 const context=vm.createContext({console:{log(){},warn(){},error(){}},
  ContentService:{MimeType:{JSON:'application/json'},createTextOutput:text=>({text,setMimeType(){return this;}})},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.has(k)?props.get(k):null,setProperty:(k,v)=>{props.set(k,String(v));}})},
  SpreadsheetApp:{getActiveSpreadsheet:()=>bound?book:null,openById:id=>{if(id!=='sheet-id')throw Error('Unexpected spreadsheet id');return book;}},
  LockService:{getScriptLock:()=>{let held=false;return {waitLock(){held=true;},hasLock:()=>held,releaseLock(){held=false;}};}},
  Session:{getScriptTimeZone:()=>'Asia/Seoul'},
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'},
   computeDigest:(algorithm,text)=>[...crypto.createHash(algorithm).update(String(text),'utf8').digest()],
   computeHmacSha256Signature:(value,key)=>[...crypto.createHmac('sha256',key).update(value).digest()],
   base64Encode:value=>bytes(value).toString('base64'),
   base64EncodeWebSafe:value=>bytes(value).toString('base64').replace(/\+/g,'-').replace(/\//g,'_'),
   base64Decode:text=>[...Buffer.from(text,'base64')],
   getUuid:()=>crypto.randomUUID(),newBlob,
   formatDate:()=>'2026-10-04 12:00:00'},
  DriveApp:{Access:{PRIVATE:'PRIVATE'},Permission:{NONE:'NONE'},createFolder:name=>makeFolder(name),
   getFolderById:id=>{if(!folders.has(id))throw Error('No folder');return folders.get(id);},
   getFileById:id=>{if(!files.has(id))throw Error('No file');return files.get(id);}}});
 vm.runInContext(source,context);
 const call=name=>(...args)=>vm.runInContext(name,context)(...args);
 const post=payload=>JSON.parse(call('doPost')({postData:{contents:JSON.stringify(payload)}}).text);
 const live=()=>[...files.values()].filter(f=>!f.trashed);
 return {post,get:()=>JSON.parse(call('doGet')().text),setup:call('setup'),files,folders,props,sheets,newBlob,
  tab:n=>sheets.find(s=>s.getName()===n),columns:vm.runInContext('COLUMNS',context),
  // the photo root as the server created it, or a pre-existing one for tests that start with stored photos
  root:()=>folders.get(props.get('PHOTO_FOLDER_ID')),
  seedRoot(){const root=makeFolder('친친소 비공개 신청 사진');props.set('PHOTO_FOLDER_ID',root.getId());return root;},
  peopleFolders(){const root=folders.get(props.get('PHOTO_FOLDER_ID'));return [...folders.values()].filter(f=>f._parent===root&&!f._trashed);},
  photosIn:folder=>live().filter(f=>f._parent===folder),live};
}

module.exports={fakeSheet,environment};
