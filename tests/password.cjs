// Applicant password: submitting with a password, logging in with it, and rejecting a wrong one.
// The Apps Script fakes reject the argument types the real Utilities service rejects, so a call that only
// works in Node (for example HMAC over bytes with a string key) fails here the same way it fails in production.
const assert=require('assert');
const {fakeSheet,environment}=require('./apps-script-fakes.cjs');
const env=environment({sheets:[fakeSheet('시트1',[])]});
const png='data:image/png;base64,'+Buffer.from('fake-png').toString('base64');
const application={_action:'submit',신청ID:'11111111-2222-3333-4444-555555555555',_password:'password123',성별:'여성',주선자:'f',이름:'홍길동',출생연도:'1997',키:'170',생활권:'서울',직업:'PM',학교:'○○대',취미:'러닝',음주:'가끔',흡연:'안 피워',이상형:'대화',상대조건:'비흡연',연락처:'010-1234-5678',이메일:'hello@example.com',프로필소개동의:'아니, 나한테 먼저 물어봐줘',개인정보동의:true,사진:[1,2,3].map(n=>({name:n+'.png',data:png}))};
const saved=env.post(application);
assert.equal(saved.ok,true,JSON.stringify(saved));
const login=password=>env.post({_action:'accountLogin',이름:'홍길동',연락처:'01012345678',_password:password});
const ok=login('password123');assert.equal(ok.ok,true,JSON.stringify(ok));assert.equal(ok.applications.length,1);
assert.equal(login('wrongpass1').ok,false,'a wrong password is rejected');
console.log('PASS: an application with a password is saved, the right password finds it, and a wrong one is rejected.');
// Hashes saved before the pure-JS HMAC must still match: compare with 10,000 rounds of HMAC-SHA256 from Node crypto,
// which is what Utilities.computeHmacSha256Signature(Byte[], Byte[]) produced.
{const fs=require('fs'),vm=require('vm'),path=require('path'),crypto=require('crypto');
 const src=fs.readFileSync(path.join(__dirname,'../server/Code.gs'),'utf8'),signed=b=>[...b].map(x=>x>127?x-256:x);
 const ctx=vm.createContext({Utilities:{newBlob:t=>({getBytes:()=>signed(Buffer.from(String(t),'utf8'))}),base64Encode:a=>Buffer.from(a.map(x=>x&255)).toString('base64')}});
 vm.runInContext(src.slice(0,src.indexOf('function receiptToken_')),ctx);const hash=vm.runInContext('passwordHash_',ctx);
 const reference=(pw,salt)=>{let v=Buffer.from(pw,'utf8');const k=Buffer.from(salt,'utf8');for(let i=0;i<10000;i++)v=crypto.createHmac('sha256',k).update(v).digest();return v.toString('base64');};
 for(const [pw,salt] of [['password123',crypto.randomUUID()+crypto.randomUUID()],['비밀번호한글','s'.repeat(64)],['x'.repeat(130),'s'.repeat(63)],['abcdefgh','s'.repeat(65)]])assert.equal(hash(pw,salt),reference(pw,salt),'hash changed for salt length '+salt.length);
 console.log('PASS: password hashes are identical to the earlier Utilities-based ones, so existing passwords keep working.');}
