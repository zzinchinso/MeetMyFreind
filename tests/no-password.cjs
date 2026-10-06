// Applications are saved without any password; the removed password actions are rejected; setup drops the old columns.
const assert=require('assert');
const {fakeSheet,environment}=require('./apps-script-fakes.cjs');
const png='data:image/png;base64,'+Buffer.from('fake-png').toString('base64');
const application={_action:'submit',신청ID:'11111111-2222-3333-4444-555555555555',성별:'여성',주선자:'f',이름:'홍길동',출생연도:'1997',키:'170',생활권:'서울',직업:'PM',학교:'○○대',취미:'러닝',음주:'가끔',흡연:'안 피워',이상형:'대화',상대조건:'비흡연',연락처:'010-1234-5678',이메일:'hello@example.com',프로필소개동의:'아니, 나한테 먼저 물어봐줘',개인정보동의:true,사진:[1,2,3].map(n=>({name:n+'.png',data:png}))};
{const env=environment({sheets:[fakeSheet('시트1',[])]});
 const saved=env.post(application);assert.equal(saved.ok,true,JSON.stringify(saved));
 const status=env.post({_action:'status',신청ID:saved.id,_token:saved.token});assert.equal(status.ok,true);assert.equal(status.answers.이름,'홍길동');assert(!('hasPassword' in status));
 assert.equal(env.post({...application,신청ID:'22222222-2222-3333-4444-555555555555',_password:'anything1'}).ok,true,'a page cached with a password field still saves');
 for(const action of ['accountLogin','setPassword'])assert.equal(env.post({_action:action,이름:'홍길동',연락처:'01012345678',_password:'password123',신청ID:saved.id,_token:saved.token}).ok,false,action+' is gone');
 const headers=env.tab('신청')._data[0];assert(!headers.includes('비밀번호솔트')&&!headers.includes('비밀번호해시'));}
{const head=['제출시각','심사상태','이름','신청ID','접수토큰해시','비밀번호솔트','비밀번호해시'];
 const tab=fakeSheet('신청',[head,['2026-10-06 19:00:00','pending','이전','aaaaaaaa-0000-4000-8000-000000000001','h','salt','hash']]),env=environment({sheets:[tab]});
 const message=env.setup();assert(message.includes('비밀번호솔트')&&message.includes('비밀번호해시'),message);
 assert(!tab._data[0].includes('비밀번호솔트')&&!tab._data[0].includes('비밀번호해시'));assert.equal(tab._data[1][tab._data[0].indexOf('이름')],'이전');}
console.log('PASS: applications save without a password; password login and password setting are gone; setup removes the old password columns.');
