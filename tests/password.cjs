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
