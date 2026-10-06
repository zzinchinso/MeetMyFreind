'use strict';
// Keep the original Apps Script endpoint and flat Korean-key JSON transport.
const ENDPOINT = 'https://script.google.com/macros/s/AKfycbyoY955vCmQSYgXuC2JgvWME4uSujfCapjPJFFwNZDsFtXEpRim_vQEdj_HYetex_-6Qw/exec';
// Fill with the operator's published privacy policy before accepting real applications.
const PRIVACY = {operator:'찐친소', retention:'1년', contact:'zzinchinso.official@gmail.com'};
const demo = new URLSearchParams(location.search).get('demo') === '1';
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const BLANK={연령대:'',유입경로:'',만족도:'',유용한점:'',추천의향:'',좋았던점:'',개선점:'',성별:''};
const base={...BLANK};   // shared pre-chat answers (성별)
let answers=base;        // inside a chat this points at that host's own answer set
let step=0, persona='f', photos=[], busy=false, submitted=false, view='form', editing=false;
let questionIndex=0;
let returnToReview=false;
let returnToEditor=false;
let submitPhase="";
let editSnapshot=null;
let introSlide=0;
let profilePersona='f';
let accountName='',accountPhone='',accountPassword='',accountPasswordConfirm='',accountApplications=[],profileReturnView='complete',currentApplicationStatus='';
const HOSTS={f:{name:'다현',job:'고려대 · IT기업',experience:'소개팅·미팅 주선 100회+',detail:'친구들 연애 상담 단골',quote:'편하게 얘기해줘. 잘 맞는 사람을 함께 찾아볼게.'},m:{name:'보검',job:'서울대 · 연구원',experience:'대기업·전문직 지인 다수',detail:'친구의 친구까지 넓은 인맥',quote:'어떤 사람을 만나고 싶어? 잘 맞을 만한 사람을 생각해볼게.'}};
function applicationStatus(value){return ({pending:'접수 완료 · 검토 중',철회:'철회'})[value]||value||'접수';}
// #31: character avatars replace the initial-letter circles everywhere a host is shown.
function avatar(id){return '<img class="avatar-img" src="assets/host-'+id+'.svg?v=2" alt="">';}
// #31: the host profile detail screen is out of spec for now. Set to true to let the list avatar open it again.
const PROFILE_DETAIL=false;
// #14/#15: one conversation per host — bubbles, position, answers and photos — kept side by side until the final submit.
// Text state also survives a reload via sessionStorage; photos stay in memory and are asked for again after a reload.
const SESSION_KEY='chinchinso-sessions'+(demo?'-demo':'');
let sessions={};
let history=[];
function locked(){return submitted&&!editing;}
function freshSession(id){return {history:[],step:3,questionIndex:-1,answers:{...BLANK,주선자:id},photos:[]};}
// A chat interrupted mid review-edit resumes at the review (step 10); one that lost its photos resumes at the photo step.
function normalize(s){if(s.history.some(h=>h.step>s.step||(h.step===s.step&&h.index>=s.questionIndex))){s.step=10;s.questionIndex=0;}if(s.step>11&&!s.photos.length){s.step=11;s.questionIndex=0;s.history=s.history.filter(h=>h.step<11);}return s;}
function startChat(id){if(busy||locked())return;persona=id;returnToReview=false;if(editing){answers.주선자=id;history=[];step=3;questionIndex=-1;answers.성별='';view='form';render();topScreen();return;}const existing=sessions[id];const s=normalize(existing||(sessions[id]=freshSession(id)));s.answers.주선자=id;if(!existing||s.step===3&&!s.history.length){s.step=3;s.questionIndex=-1;s.answers.성별='';}({history,step,questionIndex,answers,photos}=s);view='form';render();topScreen();}
// The two former partner questions (제외조건, 중요조건) are now one answer (상대조건). Applications and drafts
// saved before the change keep their text: it is folded into 상대조건 the first time they are loaded.
function mergePartner(a){if(a&&!String(a.상대조건||'').trim()){const legacy=[a.제외조건,a.중요조건].map(v=>String(v||'').trim()).filter(Boolean);if(legacy.length)a.상대조건=legacy.join(' / ');}return a;}
function persist(){try{sessionStorage.setItem(SESSION_KEY,JSON.stringify({flowVersion:6,성별:base.성별,sessions:Object.fromEntries(Object.entries(sessions).map(([id,s])=>[id,{history:s.history,step:s.step,questionIndex:s.questionIndex,answers:s.answers}]))}));}catch{}}
function forgetSessions(){sessions={};try{sessionStorage.removeItem(SESSION_KEY);}catch{}}
function restoreSessions(){try{const saved=JSON.parse(sessionStorage.getItem(SESSION_KEY));if(!saved||!saved.sessions)return;base.성별=saved.성별||'';for(const [id,s] of Object.entries(saved.sessions)){if(!HOSTS[id]||!s)continue;if(saved.flowVersion===4&&s.step>=9&&s.step<11){s.step=9;s.questionIndex=0;s.history=(s.history||[]).filter(h=>h.step<9);}else if(saved.flowVersion===4&&s.step>=11){s.history=(s.history||[]).map(h=>({...h,step:h.step===9?10:h.step===10?9:h.step})).sort((a,b)=>a.step-b.step||a.index-b.index);}else if(![4,5,6].includes(saved.flowVersion)&&s.step>=4){s.step=4;s.questionIndex=0;s.history=(s.history||[]).filter(h=>h.step<4);}mergePartner(s.answers);const restored=normalize({history:Array.isArray(s.history)?s.history:[],step:Number(s.step)||3,questionIndex:Number(s.questionIndex)||0,answers:{...BLANK,...(s.answers||{}),주선자:id},photos:[]});if(saved.flowVersion===5&&restored.step===3){if(!restored.history.length){restored.questionIndex=-1;restored.answers.성별='';}else if(restored.answers.성별){restored.step=4;restored.questionIndex=0;}}sessions[id]=restored;}if(Object.keys(sessions).length&&base.성별)step=2;}catch{}}
let lastPrompt="";
let receipt=null;
try{receipt=JSON.parse(sessionStorage.getItem('chinchinso-receipt'));if(receipt&&!demo){submitted=true;view='complete';}}catch{}
const name=()=>HOSTS[persona].name;
const copy=(f,m)=>persona==='f'?f:m;
const stages=['시작','먼저 하나만!','누구랑 얘기할래요?','반가워 👋','너부터 좀 알자','평소엔 뭐 하고 지내?','너는 어떤 사람이야?','그래서 어떤 사람이 좋아?','상대에게 바라는 조건은?','조금 현실적인 것도','내가 제대로 이해했나 봐봐','사진도 몇 장 줘 📸','마지막으로 몇 가지만','소개 진행 방식','개인정보 수집·이용 동의'];

const QUESTIONS={
3:[['성별','성별이 어떻게 돼?',['여성','남성']]],
4:[['이름','이름이 뭐야?','홍길동'],['출생연도','몇 년생이야?','예: 1997','number'],['키','키는 몇이야?','예: 165','number'],['생활권','평소 어디서 지내? 집이나 회사 근처 정도면 돼.','강남 거주 분당 출퇴근'],['직업','어느 회사에서 무슨 일 해? 회사 이름과 맡고 있는 일을 알려줘.','예: 토스에서 PM으로 일하고 있어'],['학교','학교는 어디 나왔어?','서울대 통계학과'],['MBTI','MBTI도 알아?','예: ENFP','text',true]],
5:[['취미','쉬는 날엔 보통 뭐 해? 자주 하는 거 아무거나!','예: 러닝, 카페 가기','textarea'],['음주','술은?', ['아예 안 마셔','거의 안 마셔','가끔','자주 마셔']],['흡연','담배는?',['안 피워','가끔','피워']],['종교','종교는?',['없어','기독교','천주교','불교','기타'],'text',true]],
6:[['자기소개','네 매력이나 장점을 자랑해줘!','예: 잘 웃고 리액션이 좋아','textarea',true]],
9:[['연봉','연봉은?',['5천 미만','5–7천','7–9천','9천–1억','1억+'],'text',true],['자산','자산도 알려줄 수 있어?','대략적인 규모만 적어줘','text',true]],
12:[['같은회사제외','같은 회사나 학교처럼, 소개받기 부담스러운 곳이 있어?\n\n회사·학교명을 정확히 알려주면 같은 소속은 피해서 소개할게.','예: 토스 PM 직군은 피하고 싶어','textarea'],['추천인','추천해준 사람 있어?','이름이나 닉네임','text',true],['초대코드','지인 초대 코드가 있다면 알려줘.','','text',true],['연락처','연락받을 번호도 알려줘.\n\n매칭이 되거나 추가로 확인할 내용이 있을 때 연락할게.','숫자만 입력 (- 없이)','tel'],['이메일','이메일도 알려줄래?\n\n접수가 확인되었다는 안내를 보내는 데 사용할게.','예: hello@example.com','email']]
};
// D-03: the chat opens with a plain date stamp; the automated-question role lives in the ⓘ notice and the host profile.
function chatDate(){const d=new Date();return d.getFullYear()+'년 '+(d.getMonth()+1)+'월 '+d.getDate()+'일';}
const INTRO_CHOICES=['응, 상대에게 먼저 물어봐도 돼','아니, 나한테 먼저 물어봐줘'];
QUESTIONS[13]=[['프로필소개동의','잘 맞을 것 같은 사람이 있으면, 어떻게 진행할까?',INTRO_CHOICES]];
function currentQuestion(){return step===3&&questionIndex>0||step===10?null:QUESTIONS[step]?.[questionIndex];}
const TURNS=[3,4,5,6,7,8,9,10,11,12,13,14].reduce((n,s)=>n+(QUESTIONS[s]?.length||1),0);
function turnsDone(s){let n=0;for(let t=3;t<s.step;t++)n+=QUESTIONS[t]?.length||1;return Math.min(TURNS,n+(s.step===3?Math.min(s.questionIndex,1):s.questionIndex));}
function contactStatus(id,h){return `${h.job} · ${h.experience}`;}
function contactBadge(id){const s=sessions[id],done=s?turnsDone(s):0;return done?`<span class=contact-progress>진행 중 · ${done}/${TURNS}</span>`:'';}
function questionUI(){const [key,label,placeholder,type='text',optional=false]=currentQuestion();const context=step===9&&questionIndex===0?bubble(copy('소개할 때 참고할 수 있게 물어볼게. 불편하면 건너뛰어도 돼.\n\n소개를 진행하면 답해준 연봉과 자산도 상대방에게 전달돼.','조금 현실적인 것도 물어볼게. 괜찮으면 알려줘.\n\n소개를 진행하면 답해준 연봉과 자산도 상대방에게 전달돼.')):step===6?bubble(copy('이번엔 네 자랑을 들어볼 차례야.\n\n소개할 때 큰 도움이 되거든.','이번엔 네 얘기를 좀 더 듣고 싶어.\n\n소개할 때 참고하려고.')):'';return context+bubble(label)+(Array.isArray(placeholder)?choices(key,label,placeholder,optional):field(key,label,placeholder,type,optional))+(key==='같은회사제외'?choices(key,'피하고 싶은 사람이 없다면',['상관없어']):'');}
function remember(){const q=currentQuestion();const keys=q?[q[0]]:({7:['이상형'],8:['상대조건'],10:['상대조건','이상형','연봉','자산']}[step]||[]);history.push({step,index:questionIndex,prompt:q?q[1]:lastPrompt||stages[step],keys,reply:step===3?(questionIndex===0?answers.성별:'좋아, 얘기해볼게!'):step===11?'사진 '+photos.length+'장 선택했어':step===10?'응, 이렇게 기억해줘.':step===14?'개인정보 수집·이용에 동의해요':''});}
function transcript(){return history.map(h=>'<div class="past-turn">'+bubble(h.prompt)+'<div class="outgoing">'+esc(h.reply||h.keys.map(k=>answers[k]||'이건 넘어갈게').join(' · '))+'</div></div>').join('');}
function previous(){if(busy||locked())return;if(returnToEditor){returnToEditor=false;view='edit';render();topScreen();return;}if(returnToReview){returnToReview=false;step=10;questionIndex=0;render();topScreen();return;}if(editing){view='edit';render();topScreen();return;}if(QUESTIONS[step]&&questionIndex>0)questionIndex--;else{step=step===2?0:Math.max(0,step-1);questionIndex=QUESTIONS[step]?QUESTIONS[step].length-1:0;}while(history.length&&(history.at(-1).step>step||(history.at(-1).step===step&&history.at(-1).index>=questionIndex)))history.pop();render();topScreen();}

function field(key,label,placeholder='',type='text',optional=false){return `<label class="field"><span>${label} ${optional?'<small>선택</small>':''}</span>${type==='textarea'?`<textarea aria-label="${esc(label)}" data-key="${key}" enterkeyhint="send" placeholder="${esc(placeholder)}" maxlength="2000">${esc(answers[key])}</textarea>`:`<input aria-label="${esc(label)}" data-key="${key}" type="${type}" enterkeyhint="send" ${type==='number'?'inputmode="numeric"':''} value="${esc(answers[key])}" placeholder="${esc(placeholder)}" maxlength="200">`}</label>`;}
function choices(key,label,options,optional=false,questionInBubble=false){return `<fieldset aria-label="${esc(label)}">${questionInBubble?'':`<legend>${label} ${optional?'<small>선택</small>':''}</legend>`}<div class="choices">${options.map(o=>`<button type="button" class="chip" data-key="${key}" data-value="${o}" aria-pressed="${answers[key]===o}">${o}</button>`).join('')}</div></fieldset>`;}
function bubble(text){lastPrompt=text;return `<div class="incoming"><span class="message-avatar" aria-hidden="true">${avatar(persona)}</span><div class="message-stack">${text.split(/\n\n/).map(part=>'<div class="bubble">'+esc(part)+'</div>').join('')}</div></div>`;}
function revealIncomingMessages(){const active=$('activeTurn');if(!active)return;const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;const bubbles=[...active.querySelectorAll('.incoming:not(.review-message) .bubble')];if(!bubbles.length)return;if(bubbles.length>1)bubbles.slice(1).forEach(message=>message.hidden=true);const motion=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion'))||0;const interval=reduceMotion?500:motion*6;let index=0;const reveal=()=>{const message=bubbles[index];if(!message?.isConnected)return;const screen=$('screen'),nearBottom=screen.scrollHeight-screen.scrollTop-screen.clientHeight<=screen.clientHeight/4;message.hidden=false;if(!reduceMotion)message.classList.add('message-arrival');if(nearBottom)screen.scrollTop=screen.scrollHeight;index++;if(index<bubbles.length)setTimeout(reveal,interval);else{const startButton=$('next');if(startButton?.dataset.revealAfterMessages==='true'){startButton.hidden=false;delete startButton.dataset.revealAfterMessages;}}};reveal();}


const REVIEW_FIELDS=[['이름','이름',4,0],['성별','성별',1,0],['출생연도','출생연도',4,1],['키','키',4,2],['생활권','생활권',4,3],['직업','하는 일',4,4],['학교','학력',4,5],['MBTI','MBTI',4,6],['취미','취미',5,0],['음주','술',5,1],['흡연','담배',5,2],['종교','종교',5,3],['자기소개','내 매력 · 장점',6,0],['연봉','연봉',9,0],['자산','자산',9,1],['이상형','만나고 싶은 사람',7,0],['상대조건','상대에게 바라는 조건',8,0]];
// Any answered value in these fields is tagged as shared. Optional fields stay untagged when skipped.
const SHAREABLE_KEYS=new Set(['출생연도','키','생활권','직업','학교','MBTI','취미','음주','흡연','종교','자기소개','연봉','자산']);
const OPTIONAL_SHARE_KEYS=new Set(['MBTI','종교','연봉','자산']);
function shareClass(key){return SHAREABLE_KEYS.has(key)&&String(answers[key]||'').trim()?' share-highlight':'';}
function shareBadge(key){return shareClass(key)?'<span class="share-badge">전달</span>':'';}
function sharingDisclosure(){const consent=answers.프로필소개동의;const title=consent===INTRO_CHOICES[0]?'상대방에게 전달될 내용':consent===INTRO_CHOICES[1]?'소개팅 제안 승낙 시, 상대에게 전달될 내용':'상대방에게 전달될 수 있는 내용';const body=consent===INTRO_CHOICES[0]?'항목은 상대방에게 전달돼요. 나머지 정보는 전달하지 않아요.':consent===INTRO_CHOICES[1]?'항목은 소개팅 제안을 승낙한 뒤 상대방에게 전달돼요. 나머지 정보는 전달하지 않아요.':'항목은 소개를 진행하면 상대방에게 전달돼요. 진행 방식을 선택하면 전달 시점을 안내할게요. 나머지 정보는 전달하지 않아요.';return '<aside class="sharing-disclosure"><strong>'+esc(title)+'</strong><p><span class="share-badge">전달</span> 배지가 달린 '+esc(body)+'</p></aside>';}
function fullReview(){return '<div class="incoming review-message"><span class="message-avatar" aria-hidden="true">'+avatar(persona)+'</span><div class="message-stack">'+REVIEW_FIELDS.map(([key,label],i)=>'<div class="bubble review-bubble"><div class="review-label"><span>'+esc(label)+'</span><button type="button" class="review-edit" data-review="'+i+'" aria-label="'+esc(label)+' 수정">수정</button></div><div class="review-answer">'+esc(answers[key]?String(answers[key])+(key==='키'?'cm':key==='출생연도'?'년생':''):'건너뛰었어')+'</div></div>').join('')+'</div></div>';}

const EDIT_FIELDS=[...REVIEW_FIELDS,['사진','사진',11,0],['같은회사제외','피하고 싶은 회사·학교',12,0],['추천인','추천인',12,1],['초대코드','초대 코드',12,2],['연락처','연락처',12,3],['이메일','이메일',12,4],['프로필소개동의','소개 진행 방식',13,0],['개인정보동의','개인정보 수집·이용',14,0]];
function editorReview(){return sharingDisclosure()+EDIT_FIELDS.map(([key,label],i)=>'<div class="summary'+shareClass(key)+'"><b>'+esc(label)+shareBadge(key)+'</b><button type="button" class="review-edit" data-edit-field="'+i+'" aria-label="'+esc(label)+' 수정">수정</button><p>'+esc(key==='사진'?photos.length+'장':key==='개인정보동의'?(answers[key]?'동의함':'미동의'):answers[key]||'아직 알려주지 않았어요')+'</p></div>').join('');}
function beginEdit(){if(busy||(!demo&&!answers.이름))return;editSnapshot={answers:{...answers},photos:[...photos]};editing=true;returnToReview=false;returnToEditor=false;history=[];view='edit';questionIndex=0;render();topScreen();}
function summary(keys){return sharingDisclosure()+keys.map(([key,label])=>`<div class="summary${shareClass(key)}"><b>${label}${shareBadge(key)}</b><p>${esc(answers[key]||(OPTIONAL_SHARE_KEYS.has(key)?'건너뛰었어':'아직 알려주지 않았어요'))}</p></div>`).join('');}
function error(message){$('error').textContent=message;}
function render(){
 const oldScroll=$('screen').scrollTop;
 if(locked()&&view==='form')view='complete';
 if(view==='form'&&step>=3&&!editing&&sessions[persona]){Object.assign(sessions[persona],{history,step,questionIndex,answers,photos});persist();}
 document.body.dataset.persona=persona;
 document.body.dataset.view=view;
 document.body.dataset.screen=view==='form'?(editing&&step===1?'result':step<2?'intro':step===2?'list':'chat'):view==='host'?'host':'result';
 $('brand').innerHTML=step>=3&&view==='form'?'<button id=chatBack class=icon-button aria-label=대화목록으로>‹</button><span class=header-avatar>'+avatar(persona)+'</span><span>'+name()+'<small>편하게 얘기해줘</small></span>':'찐친소<span class=spark>✳</span>'; 
 $('headerNote').textContent='믿을 수 있는 지인의 지인과, 소개팅부터 소규모 모임까지';
 document.body.dataset.complete=String(['complete','profile','edit'].includes(view));
 if(['complete','profile','edit'].includes(view)){$('brand').textContent='찐친소';$('headerNote').textContent='믿을 수 있는 지인의 지인과, 소개팅부터 소규모 모임까지';}
 if(['account','history'].includes(view))$('headerNote').textContent='';
 const completed=submitted?TURNS:Math.max(0,turnsDone({step,questionIndex}));
 $('progress').style.width=(completed/TURNS*100)+'%';
 $('progress').setAttribute('role','progressbar');$('progress').setAttribute('aria-label','전체 신청 진행률');$('progress').setAttribute('aria-valuemin','0');$('progress').setAttribute('aria-valuemax',String(TURNS));$('progress').setAttribute('aria-valuenow',String(completed));
 let html=demo&&!['account','history'].includes(view)?'<div class="demo">체험 모드 · 서버에 전송되지 않아요</div>':'';
 if(view==='form'){
 html+=step===2?'':step<3?`<div class="eyebrow">${step===2?'02 / CHOOSE YOUR PERSON':'01 / A LITTLE HELLO'}</div>`:'<div class="chat-date">'+chatDate()+'</div>'+transcript()+'<div id=activeTurn class=active-turn>';
 if(step<1&&!(editing&&step===1)){html=`<section class="onboarding" aria-label="찐친소 서비스 소개"><div class="onboard-brand">찐친소</div><div class="onboard-art" aria-hidden="true"><img src="assets/onboarding-tiger.png?v=2" alt="" width="3762" height="3762"></div><div id="introSlides" class="intro-slides" tabindex="0" aria-label="서비스 소개, 좌우로 넘겨보세요">`+[
 ['믿을 수 있는 지인의 지인과,<br>소개팅부터 소규모 모임까지','고려대·서울대 출신의 폭넓은 인맥에서<br>잘 맞는 자리를 찾아봐요'],
 ['부탁하는 부담 없이,<br>지치는 만남 없이','친구에겐 말하기 눈치 보였던 조건도<br>여기선 편하게 얘기해요.'],
 ['내 취향도, 내 프라이버시도','친구의 마음으로 취향을 꼼꼼히 살펴 소개해요.<br>내 프로필은 동의 없이 전달되지 않아요.']
 ].map(([title,body],i)=>'<article class="intro-slide" aria-label="'+(i+1)+' / 3"><h1>'+title+'</h1><p>'+body+'</p></article>').join('')+'</div><div class="slide-controls"><button id="slidePrev" class="slide-arrow" aria-label="이전 소개">‹</button><div class="slide-dots">'+[0,1,2].map(i=>'<button class="slide-dot" data-slide="'+i+'" aria-label="소개 '+(i+1)+' 보기" aria-current="'+(i===introSlide)+'"><span></span></button>').join('')+'</div><button id="slideNext" class="slide-arrow" aria-label="다음 소개">›</button></div><button type="button" class="process-link" id="processOpen">어떻게 진행되나요?</button><dialog id="processDialog" class="process-dialog" aria-labelledby="processTitle"><button type="button" class="process-close" id="processClose" aria-label="닫기">×</button><h2 id="processTitle">어떻게 진행되나요?</h2><p class="process-intro">풀에 등록하시면 저희가 직접 잘 맞는 자리를 만들어서 추천해 드릴게요.<br>소개팅은 매칭당 2만원 (지인 추천 코드 입력시 할인), 모임은 컨셉/장소에 따라 개별 안내해 드릴 거예요.</p><section><h3>소개팅</h3><ol><li>문자로 상대 제안<br><small>간략한 프로필을 함께 보내드려요.</small></li><li>서로 만나볼 의사가 있으면 사진 교환</li><li>최종 매칭</li><li>입금</li><li>안내된 장소에서 만남</li></ol></section><section><h3>소규모 모임</h3><ol><li>이상형 및 취향에 맞는 모임 제안</li><li>참여 여부 결정</li><li>회비 입금</li><li>장소와 콘셉트에 따라 달라 개별 안내해요. <small>(약 3-4만원)</small></li><li>안내된 장소에서 모임</li></ol></section></dialog></section>';}

 else {
 switch(step){
 case 1:html+=choices('성별','성별이 어떻게 돼요?',['여성','남성']);break;
 case 2:html+='<aside class="conversation-banner" aria-label="대화 상대 선택 안내"><div class="banner-copy"><strong>누구한테 소개받을래?</strong><p>주선자를 골라 대화를 시작해봐</p></div><svg class="banner-art" viewBox="0 0 96 80" fill="none" aria-hidden="true"><path d="M5 29C5 14 17 6 33 6s28 8 28 23-12 23-28 23H21L9 61l2-20a23 23 0 0 1-6-12Z" fill="var(--incoming)"/><path d="M38 48c0-14 11-23 26-23s27 9 27 23-12 23-27 23H54l-11 7 1-16c-4-4-6-9-6-14Z" fill="var(--outgoing)"/><circle cx="24" cy="28" r="2" fill="var(--ink)"/><circle cx="40" cy="28" r="2" fill="var(--ink)"/><path d="M27 36q5 5 10 0" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"/><circle cx="54" cy="48" r="2" fill="var(--ink)"/><circle cx="64" cy="48" r="2" fill="var(--ink)"/><circle cx="74" cy="48" r="2" fill="var(--ink)"/></svg></aside><div class="contacts">'+Object.entries(HOSTS).map(([id,h])=>`<div class="contact-row">${PROFILE_DETAIL?`<button class="contact-avatar ${id}" data-host="${id}" aria-label="${h.name} 프로필 보기">${avatar(id)}</button>`:`<span class="contact-avatar ${id}" aria-hidden="true">${avatar(id)}</span>`}<button class="contact-content" data-persona="${id}" aria-label="${h.name}과 대화하기"><span class="contact-copy"><span class="contact-heading"><strong>${h.name}</strong>${contactBadge(id)}</span><span class="contact-status" title="${esc(contactStatus(id,h))}">${esc(contactStatus(id,h))}</span></span><svg class="contact-chat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/></svg></button></div>`).join('')+'</div>';break;
 case 3:if(questionIndex===-1)html+=bubble('내 주변에 좋은 사람 많은데, 잘 왔어!\n\n편하게 얘기해주면 잘 맞을 것 같은 사람이 있을 때 소개팅이나 모임에 초대할게.\n\n네 허락 없이 프로필을 공유하지 않을 테니 걱정 마.\n\n편하게 얘기해줘. 잘 맞는 사람을 함께 찾아볼게.');else if(questionIndex===0)html+=bubble('성별이 어떻게 돼?')+choices('성별','성별이 어떻게 돼?',['여성','남성'],false,true);else html+=bubble('성별을 알려줘서 고마워!');break;
 case 4:html+=questionUI();break;
 case 5:html+=questionUI();break;
 case 6:html+=questionUI();break;
 case 7:html+=bubble(copy('이제 네가 만나고 싶은 사람 얘기를 들어볼게.\n\n너는 어떤 사람 만나고 싶어?\n\n조건이어도 느낌이어도 좋아. 편하게 말해줘!','자, 이제 중요한 거.\n\n어떤 사람을 만나고 싶어?\n\n조건이나 성격 모두 좋아. 편하게 얘기해줘.'))+field('이상형','어떤 사람이 좋아?','강아지상을 선호하고 운동하는 사람이 좋아','textarea');break;
 case 8:html+=bubble(copy('반대로 이것도 엄청 중요해.\n\n절대 안 되는 것, 꼭 맞았으면 하는 걸 알려줘.\n\n흡연이나 연락 빈도 같은 거!\n\n이유는 없어도 돼. 솔직할수록 좋아!','좋아하는 것만큼 안 맞는 것도 중요하거든.\n\n절대 안 되는 조건이나 꼭 맞아야 하는 게 있어?\n\n흡연, 연락 빈도 같은 것도 좋아.'))+field('상대조건','상대에게 바라는 조건','예: 비흡연, 연락이 잘 되는 사람','textarea');break;
 case 9:html+=questionUI();break;
 case 10:html+=bubble(copy('지금까지 들려준 이야기를 모아봤어.\n\n틀린 게 있으면 고쳐줘!','지금까지 얘기해준 내용 정리해봤어.\n\n쭉 보고 다른 부분 있으면 고쳐줘.'))+fullReview();break;
 case 10:html+=questionUI();break;
 case 11:html+=bubble(copy('사진도 함께 보내줄래?\n\n최근 사진으로 3~5장 골라주면 돼.\n\n얼굴 잘 보이는 거랑 평소 느낌 사진이면 충분해!','최근 사진도 3~5장 보내줄래?\n\n얼굴이 잘 보이는 사진과 평소 모습이면 좋아.'))+'<div class="privacy"><strong>🔒 사진은 동의 없이 공개하지 않아</strong>등록한 사진은 동의 없이 다른 사람에게 공개되지 않아요.<br>잘 맞을 것 같은 사람이 생겨도 먼저 너한테 물어보고, 네가 괜찮다고 했을 때만 보여줄게.</div><label class="field"><span>사진 올리기 · 3~5장</span><input id="photoInput" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><small>JPG · PNG · WebP · 3~5장 · 큰 사진은 자동으로 줄여서 보내요</small><div class="photos">'+photos.map((p,i)=>`<div class="photo"><img src="${p.data}" alt="선택한 사진 ${i+1}"><button data-remove="${i}" aria-label="사진 ${i+1} 삭제">×</button></div>`).join('')+'</div>';break;
 case 12:html+=questionUI();break;
 case 14:html+=bubble(copy('이제 등록에 필요한 동의를 확인해줘.\n\n네 이야기는 소개를 준비하고 연락하는 데 쓸게.','마지막으로 등록에 필요한 동의만 확인할게.\n\n남겨준 내용은 소개 준비와 연락에 사용할게.'))+'<section class="privacy consent-card" aria-label="개인정보 수집·이용 동의"><strong>소중한 정보, 필요한 곳에만 사용할게요.</strong>남겨주신 정보는 신청 검토와 맞는 인연을 찾기 위한 연락에 사용해요. 신청 내역 조회·수정·철회를 위해 비밀번호는 암호화한 값으로만 보관해요. 앞에서 선택한 소개 방식과 별개로, 사진이나 프로필을 상대에게 전달할 때는 별도 동의를 받아요.<details><summary>수집·이용 내용 보기</summary><p>목적: 신청 검토, 이메일 접수 확인 안내, 소개 가능 여부 확인 및 매칭·추가 확인 연락, 본인 신청 내역 조회·수정·철회\n항목: 이름, 성별, 출생연도, 키, 생활권, 직업, 학교, 취미, 생활습관, 자기소개, 선호조건, 사진, 연락처, 이메일, 비밀번호 확인용 암호화 값 및 선택 입력 항목\n선택 항목은 입력하지 않아도 신청할 수 있어요. 동의를 거부할 수 있으며, 필수정보 수집에 동의하지 않으면 신청할 수 없어요.</p><p>'+esc('처리자: '+PRIVACY.operator+' / 보유기간: '+PRIVACY.retention+'\n문의채널: '+PRIVACY.contact)+'</p></details><label class="consent"><input id="consent" type="checkbox" '+(answers.개인정보동의?'checked':'')+'>개인정보 수집·이용에 동의해요</label></section><label class="field"><span>신청 내역 확인 비밀번호</span><input id="accountPassword" type="password" autocomplete="new-password" minlength="8" placeholder="8자 이상"></label><small>다음에 이름과 휴대폰 번호, 이 비밀번호로 신청 내역을 확인하고 수정하거나 철회할 수 있어요.'+(editing?' 비밀번호를 바꾸지 않으려면 비워두세요.':'')+'</small><label class="field"><span>비밀번호 확인</span><input id="accountPasswordConfirm" type="password" autocomplete="new-password" minlength="8" placeholder="비밀번호를 다시 입력"></label>';break;
 case 13:html+=bubble('잘 맞을 것 같은 사람이 있으면, 어떻게 진행할까?\n\n네 취향이나 관심사를 간단히 소개하고,\n상대에게 만나볼 생각이 있는지 먼저 물어봐도 될까?\n\n사진이나 연락처는 별도 허락 없이 전달하지 않을게.')+choices('프로필소개동의','소개 진행 방식',INTRO_CHOICES);break;
 }}
 }else if(view==='account'){
 html+='<h1>신청 내역 조회</h1><p>신청하실 때 입력한 이름, 휴대폰 번호, 비밀번호를 입력해 주세요.</p><label class="field"><span>이름</span><input id="accountName" autocomplete="name" value="'+esc(accountName)+'"></label><label class="field"><span>휴대폰 번호</span><input id="accountPhone" type="tel" autocomplete="tel" value="'+esc(accountPhone)+'"></label><label class="field"><span>비밀번호</span><input id="loginPassword" type="password" autocomplete="current-password"></label><button class="primary" id="accountLogin">내 신청 내역 확인</button><p class="hint">이전 신청 내역 확인이 어려운 경우에는 <a href="mailto:'+esc(PRIVACY.contact)+'">'+esc(PRIVACY.contact)+'</a>으로 문의해주세요.</p>';
 }else if(view==='history'){
 html+='<h1>내 신청 내역</h1><p>신청을 선택하면 내용을 확인하고 수정하거나 철회할 수 있어.</p>'+accountApplications.map((a,i)=>'<article class="summary history-item"><b>'+esc(a.host)+' · '+esc(a.submittedAt||'접수 내역')+'</b><p>상태: '+esc(applicationStatus(a.status))+'</p><button class="secondary" data-open-application="'+i+'">내용 보기</button></article>').join('');
 }else if(view==='host'){
 const h=HOSTS[profilePersona];
 // C-09: identity → first message preview → labelled facts → role note; the row list keeps its own click contract.
 html+='<section class="host-profile" aria-label="'+esc(h.name)+' 소개"><div class="host-avatar '+profilePersona+'" aria-hidden="true">'+avatar(profilePersona)+'</div><h1>'+esc(h.name)+'</h1><p class="host-role">주선자</p><div class="incoming host-quote"><span class="message-avatar" aria-hidden="true">'+avatar(profilePersona)+'</span><div class="message-stack"><div class="bubble">'+esc(h.quote)+'</div></div></div><dl class="host-facts">'+[['소속',h.job],['주선 경험',h.experience],['이런 사람',h.detail]].map(([k,v])=>'<div><dt>'+k+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl><p class="host-note">대화는 자동 질문으로 진행되고,<br>남긴 이야기는 '+esc(h.name)+'이 직접 확인해요.</p></section>';
 }else if(view==='edit'){
 html+='<h2>내 정보 수정</h2><p>바꾸고 싶은 항목을 골라줘. 기존 답변과 사진은 그대로 남아 있어.</p>'+editorReview();
 }else if(view==='profile'){
 const reviewedKeys=new Set(REVIEW_FIELDS.map(([key])=>key));const profileExtras=Object.entries(answers).filter(([k,v])=>v&&!reviewedKeys.has(k)&&!['주선자','개인정보동의','제외조건','중요조건','프로필소개동의일시','개인정보동의일시'].includes(k)).map(([k])=>[k,k==='프로필소개동의'?'소개 진행 방식':k==='자기소개'?'내 매력 · 장점':k==='상대조건'?'상대에게 바라는 조건':k]);
 html+='<h2>내가 얘기한 내용</h2><p>신청 상태: '+esc(applicationStatus(currentApplicationStatus))+'</p>'+summary([['연령대','연령대'],...REVIEW_FIELDS.map(([key,label])=>[key,label]),...profileExtras].filter(([key])=>key!=='연령대'||answers.연령대))+'<section class="privacy"><strong>신청 내역 관리</strong>비밀번호를 기억하면 다음에도 신청 내역을 확인할 수 있어요.<label class="field"><span>비밀번호 설정 또는 변경</span><input id="setAccountPassword" type="password" autocomplete="new-password" minlength="8" placeholder="8자 이상"></label><button class="secondary" id="saveAccountPassword">비밀번호 저장</button></section>';
 }else{
 html+='<div class="eyebrow">접수 완료</div><h1>접수 완료! 잘 받았어.</h1>';
 html+=bubble(copy(...['편하게 얘기해줘서 고마워. 네 이야기 잘 접수됐어.\n\n1~2일 정도 검토하고, 접수 확인은 이메일로 안내할게.\n\n등록만으로 사진 공개나 만남이 정해지진 않아.\n\n잘 맞을 자리가 생기면 그때 따로 연락할게.','얘기해준 내용 잘 받았어. 접수는 정상적으로 됐어.\n\n1~2일 정도 검토하고 접수 확인은 이메일로 안내할게.\n\n등록만으로 만남이 정해지는 건 아니야.\n\n맞는 자리가 생기면 그때 다시 연락할게.']));
 html+=bubble('등록은 무료야. 마음에 드는 초대가 오면 그때 결정하면 돼.')+bubble('궁금한 게 있으면 zzinchinso.official@gmail.com으로 메일 줘.');
 if(receipt?.id)html+='<p class="hint receipt-id">접수번호 '+esc(receipt.id)+'</p>';
 }
 if(view==='form'&&step>=3)html+='</div>';
 html+='<p id="error" class="error" role="alert"></p>';
 $('screen').innerHTML=html;
 $('nav').innerHTML=view==='form'?`${step?'<button class="secondary" id="back">이전</button>':''}<button class="primary" id="next">${busy?'처리 중…':step===0?'얘기해볼게요 ↗':step===10?'전부 확인했어':step===13?(editing?'수정 내용 저장':'내 얘기 맡겨두기'):step===9?'다음 · 넘어가도 괜찮아':'다음 →'}</button>`:view==='edit'?'<button class="secondary" id="editReturn">수정 취소</button><button class="primary" id="editSave">수정 내용 저장</button>':view==='profile'?'<button class="secondary" id="return">내 신청 내역</button>'+ (currentApplicationStatus==='철회'?'':'<button class="primary" id="edit">수정하기</button><button class="secondary" id="withdraw">신청 철회</button>'):view==='history'?'<button class="secondary" id="accountLogout">처음으로</button>':view==='account'?'<button class="secondary" id="accountBack">돌아가기</button>':'<button class="primary" id="profile">내 정보 보기</button>';
 if(view==='form'&&step===2){$('brand').innerHTML='<button class="icon-button" id="back" aria-label="소개로 돌아가기">‹</button><span>대화 <small class="contact-count">2</small></span>';$('headerNote').textContent='';$('nav').innerHTML='';}
 if(view==='form'&&step>=3&&step<=12){$('next').textContent=step===3?'좋아, 시작하자 →':step===10?'전부 확인했어 →':currentQuestion()?.[4]?'보내기 / 건너뛰기 ↑':'보내기 ↑';}
 if(view==='form'&&step<1&&!(editing&&step===1))$('nav').innerHTML='<div class="start-panel"><button data-start="register" class="start-gender register-cta">찐친소 풀에 등록하기</button><button type="button" class="process-link" id="accountOpen">신청 내역 조회 및 수정</button></div>';
 if(view==='host'){$('brand').innerHTML='<button id="hostBack" class="icon-button" aria-label="친구 목록으로">‹</button><span>프로필</span>';$('headerNote').textContent='';$('nav').innerHTML='<button class="secondary" id="hostList">목록으로</button><button class="primary" data-persona="'+profilePersona+'">'+esc(HOSTS[profilePersona].name)+'과 대화하기</button>';}
 mountComposer();
 revealIncomingMessages();
 if(submitPhase){const notice=document.createElement('p');notice.id='submitNotice';notice.className='submit-notice';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.textContent=submitPhase;$('nav').appendChild(notice);if($('next'))$('next').textContent='저장 중…';}
 bind();
 $('screen').scrollTop=oldScroll;
}

function mountComposer(){
 const chatting=view==='form'&&step>=3;
 if(!chatting)return;
 $('brand').innerHTML='<button id="chatBack" class="icon-button" aria-label="대화 목록으로">‹</button><div class="chat-person"><span class="header-avatar">'+avatar(persona)+'</span><strong>'+name()+'</strong></div>';
 $('headerNote').innerHTML='<button id="chatInfo" class="info-button" aria-label="대화 안내">ⓘ</button>';
 const active=$('activeTurn');
 if(!active?.querySelectorAll)return;
 const fields=active.querySelectorAll('.field');
 const plain=fields.length===1&&fields[0].querySelector('input:not([type=file]),textarea');
 const options=active.querySelector('fieldset');
 const nextButton=$('next'),backButton=$('back');
 if(step===3&&questionIndex===-1){nextButton.hidden=true;nextButton.dataset.revealAfterMessages='true';}
 const err=$('error');
 $('nav').innerHTML='<div id="actionPanel" class="action-panel"></div><div id="replyTools" class="reply-tools"></div><div id="composer" class="composer"></div><div id="composerMeta" class="composer-meta"></div><div class="home-indicator" aria-hidden="true"></div>';
 $('nav').appendChild(err);
 if(options)$('replyTools').appendChild(options);
 if(plain){
  const entry=fields[0].querySelector('input,textarea');
  entry.classList.add('chat-entry');
  if(entry.tagName==='TEXTAREA')entry.rows=1;
  if(!entry.placeholder&&entry.dataset.key!=='초대코드')entry.placeholder='메시지를 입력하세요';
  $('composer').appendChild(entry);fields[0].remove();
  nextButton.textContent='➤';nextButton.className='send-message';nextButton.setAttribute('aria-label','메시지 보내기');
 }else if(options){
  const entry=document.createElement('input');entry.className='chat-entry';entry.id='choiceEntry';entry.type='text';entry.readOnly=true;entry.value=answers[currentQuestion()[0]]||'';entry.placeholder='답변을 골라주세요';entry.setAttribute('aria-label','선택한 답변');
  $('composer').appendChild(entry);nextButton.textContent='➤';nextButton.className='send-message';nextButton.setAttribute('aria-label','메시지 보내기');
 }else{
  const caption=document.createElement('span');caption.className='composer-caption';caption.textContent=options?'위에서 답변을 골라주세요':step===11?(photos.length?photos.length+'장 선택 (3~5장)':'앨범에서 3~5장 골라줘'):step===13?'동의하고 내 얘기 맡기기':step===10?'내 얘기를 확인해주세요':'편하게 시작해볼까요?';
  $('composer').appendChild(caption);
  nextButton.textContent=step===3?'시작하기':step===13?'등록':step===10?'확인':'↑';nextButton.className='send-message'+([3,10,13].includes(step)?' send-label':'');nextButton.setAttribute('aria-label','답변 보내기');
 }
 if(step===11){
  const fileLabel=active.querySelector('.field');if(fileLabel)fileLabel.hidden=true;
  // Lucide Image icon (ISC); see THIRD_PARTY_NOTICES.txt.
  const add=document.createElement('button');add.className='attach-button';add.type='button';add.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.586-4.586a2 2 0 0 0-2.828 0L3 21"/></svg>';add.setAttribute('aria-label','앨범에서 사진 선택');add.title='앨범에서 사진 선택';add.onclick=()=>{if(!busy)$('photoInput').click();};$('composer').prepend(add);
  nextButton.textContent='➤';nextButton.className='send-message';nextButton.setAttribute('aria-label','선택한 사진 보내기');
  $('composer').appendChild(nextButton);
 }else if((plain||options)){$('composer').appendChild(nextButton);}
 else{
  $('composer').hidden=true;
  nextButton.textContent=step===3?'대화 시작하기':step===10?'전부 확인했어':step===14?(returnToEditor?'동의 내용 확인':editing?'수정 내용 저장하기':'동의하고 등록하기'):step===13?(returnToEditor?'선택 내용 확인':'다음'):'선택 확인하기';nextButton.className='action-confirm';nextButton.setAttribute('aria-label',nextButton.textContent);$('actionPanel').appendChild(nextButton);
 }
 backButton.textContent='이전 답변 수정';backButton.className='previous-answer';$('composerMeta').appendChild(backButton);
 // C-11: optional questions get one explicit skip chip, always right above the composer for both choice and typed replies.
 if(currentQuestion()?.[4]){const row=document.createElement('div');row.className='skip-row';const skip=document.createElement('button');skip.id='skipReply';skip.type='button';skip.className='chip skip-reply';skip.textContent='이건 넘어갈게';skip.setAttribute('aria-label','이 질문은 건너뛰기');skip.onclick=()=>{if(busy)return;answers[currentQuestion()[0]]='';next(true);};const line=$('replyTools').querySelector('.choices');if(line){skip.classList.add('skip-inline');line.appendChild(skip);}else{row.appendChild(skip);$('replyTools').appendChild(row);}}
 const entry=$('composer').querySelector('input,textarea');
 if(entry){const resize=()=>{if(entry.tagName==='TEXTAREA'){entry.style.height='auto';entry.style.height=Math.min(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--entry-max')),entry.scrollHeight)+'px';}nextButton.disabled=busy||!entry.value.trim();};entry.addEventListener('input',resize);resize();}
}

function showIntroSlide(index){introSlide=Math.max(0,Math.min(2,index));const track=$('introSlides');if(track?.scrollTo)track.scrollTo({left:track.clientWidth*introSlide,behavior:'smooth'});updateIntroDots();}
function updateIntroDots(){document.querySelectorAll('[data-slide]').forEach(el=>el.setAttribute('aria-current',String(Number(el.dataset.slide)===introSlide)));}
function bind(){
 document.querySelectorAll('[data-start]').forEach(el=>el.onclick=()=>{if(returnToReview){base.성별=answers.성별=el.dataset.start;persist();returnToReview=false;step=10;}else step=2;questionIndex=0;render();topScreen();});
 if($('processOpen'))$('processOpen').onclick=()=>{$('processDialog').showModal();};
 if($('processClose'))$('processClose').onclick=()=>{$('processDialog').close();};
 if($('processDialog'))$('processDialog').onclick=e=>{if(e.target===$('processDialog'))$('processDialog').close();};
 document.querySelectorAll('[data-slide]').forEach(el=>el.onclick=()=>showIntroSlide(Number(el.dataset.slide)));
 const track=$('introSlides');if(track?.addEventListener){track.scrollLeft=track.clientWidth*introSlide;track.addEventListener('scroll',()=>{if(track.clientWidth){introSlide=Math.round(track.scrollLeft/track.clientWidth);updateIntroDots();}});track.onkeydown=e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();showIntroSlide(introSlide+(e.key==='ArrowRight'?1:-1));}};}
 if($('slidePrev'))$('slidePrev').onclick=()=>showIntroSlide(introSlide-1);
 if($('slideNext'))$('slideNext').onclick=()=>showIntroSlide(introSlide+1);

 if($('chatInfo'))$('chatInfo').onclick=()=>{const notice=$('chatNotice');if(notice){notice.remove();return;}const el=document.createElement('div');el.id='chatNotice';el.className='chat-notice';el.innerHTML='<p>대화는 미리 준비된 질문으로 진행돼요. 신청을 마치면 '+esc(name())+'이 남겨준 이야기를 직접 확인해요.</p><p>사진과 프로필을 다른 참여자에게 전달할 때는 누구에게 어떤 정보를 보여줄지 안내하고, 먼저 동의를 받아요.</p><p>궁금한 점은 <a href="mailto:'+esc(PRIVACY.contact)+'">'+esc(PRIVACY.contact)+'</a>으로 편하게 문의해 주세요.</p>';$('screen').prepend(el);$('screen').scrollTop=0;};
 if($('chatBack'))$('chatBack').onclick=()=>{if(busy||locked())return;if(editing){returnToEditor=false;view='edit';render();topScreen();return;}returnToReview=false;step=2;questionIndex=0;render();topScreen();};
 document.querySelectorAll('input[data-key],textarea[data-key]').forEach(el=>{el.oninput=()=>{answers[el.dataset.key]=el.value;document.querySelectorAll('button[data-value]').forEach(button=>{if(button.dataset.key===el.dataset.key)button.setAttribute('aria-pressed',String(button.dataset.value===el.value));});};el.onkeydown=e=>{if(sendsOnEnter(e)){e.preventDefault();next();}};});
 document.querySelectorAll('button[data-value]').forEach(el=>el.onclick=()=>{if(busy)return;const k=el.dataset.key;answers[k]=el.dataset.value;if(k==='성별')base.성별=el.dataset.value;el.closest('fieldset').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b===el));if(k==='같은회사제외'){const entry=$('composer')?.querySelector('textarea');if(entry)entry.value=el.dataset.value;next();}else if($('choiceEntry')){$('choiceEntry').value=el.dataset.value;next();}});
 document.querySelectorAll('[data-persona]').forEach(el=>{if(el.tagName==='BUTTON')el.onclick=()=>startChat(el.dataset.persona);});
 document.querySelectorAll('[data-host]').forEach(el=>el.onclick=()=>{profilePersona=el.dataset.host;view='host';render();topScreen();});
 for(const id of ['hostBack','hostList'])if($(id))$(id).onclick=()=>{view='form';step=2;render();topScreen();};
 document.querySelectorAll('[data-remove]').forEach(el=>el.onclick=()=>{if(busy)return;photos.splice(Number(el.dataset.remove),1);render();});
 if($('next')){const entry=$('composer')?.querySelector?.('.chat-entry');$('next').disabled=busy||!!(entry&&!entry.value.trim());$('next').onclick=next;}
 if($('back')){$('back').disabled=busy;$('back').onclick=previous;}
 document.querySelectorAll('[data-review]').forEach(el=>el.onclick=()=>{const item=REVIEW_FIELDS[Number(el.dataset.review)];returnToReview=true;step=item[2];questionIndex=item[3];render();topScreen();});
 if($('secret'))$('secret').onclick=()=>{answers.자산='비밀';render();};
 if($('consent')){$('consent').disabled=busy;$('consent').onchange=e=>answers.개인정보동의=e.target.checked;}
 if($('accountPassword'))$('accountPassword').oninput=e=>accountPassword=e.target.value;
 if($('accountPasswordConfirm'))$('accountPasswordConfirm').oninput=e=>accountPasswordConfirm=e.target.value;
 if($('accountName'))$('accountName').oninput=e=>accountName=e.target.value;
 if($('accountPhone'))$('accountPhone').oninput=e=>accountPhone=e.target.value;
 if($('accountOpen'))$('accountOpen').onclick=()=>{view='account';render();topScreen();};
 if($('accountBack'))$('accountBack').onclick=()=>{view='form';step=0;render();topScreen();};
 if($('accountLogin'))$('accountLogin').onclick=async()=>{if(busy)return;const password=$('loginPassword')?.value||'';busy=true;render();try{const result=await request({_action:'accountLogin',이름:accountName,연락처:accountPhone,_password:password});accountApplications=result.applications||[];if(!accountApplications.length)throw Error('신청 내역이 없어요.');view='history';}catch(err){view='account';render();error(err.message||'신청 내역을 확인하지 못했어요.');return;}finally{busy=false;}render();topScreen();};
 if($('accountLogout'))$('accountLogout').onclick=()=>{accountApplications=[];receipt=null;submitted=false;try{sessionStorage.removeItem('chinchinso-receipt');}catch{}view='form';step=0;render();topScreen();};
 document.querySelectorAll('[data-open-application]').forEach(el=>el.onclick=async()=>{if(busy)return;const item=accountApplications[Number(el.dataset.openApplication)];if(!item)return;receipt={id:item.id,token:item.token};try{sessionStorage.setItem('chinchinso-receipt',JSON.stringify(receipt));}catch{}submitted=true;editing=false;profileReturnView='history';view='profile';await loadReceipt();topScreen();});
 if($('saveAccountPassword'))$('saveAccountPassword').onclick=async()=>{const password=$('setAccountPassword')?.value||'';if(password.length<8){error('비밀번호는 8자 이상 입력해줘.');return;}busy=true;render();let message='';try{await request({_action:'setPassword',신청ID:receipt.id,_token:receipt.token,_password:password});message='비밀번호를 저장했어. 다음에는 이름, 휴대폰 번호와 비밀번호로 신청 내역을 확인할 수 있어.';}catch(err){message=err.message;}finally{busy=false;render();if(message)error(message);}};
 if($('withdraw'))$('withdraw').onclick=async()=>{if(busy||!window.confirm('이 신청을 철회할까요? 철회 후에도 기록은 신청 내역에 남아요.'))return;busy=true;render();let message='';try{await request({_action:'withdraw',신청ID:receipt.id,_token:receipt.token});currentApplicationStatus='철회';accountApplications=accountApplications.map(a=>a.id===receipt.id?{...a,status:'철회'}:a);view='profile';}catch(err){message=err.message;}finally{busy=false;render();topScreen();if(message)error(message);}};
 if($('photoInput'))$('photoInput').onchange=selectPhotos;
 if($('profile')){$('profile').disabled=busy;$('profile').onclick=async()=>{if(busy)return;profileReturnView='complete';if(!demo&&!answers.이름){if(!await loadReceipt())return;}view='profile';render();topScreen();};}
 if($('return'))$('return').onclick=()=>{view=profileReturnView;render();topScreen();};
 if($('edit')){$('edit').disabled=busy||(!demo&&!answers.이름);$('edit').onclick=beginEdit;}
 if($('editReturn'))$('editReturn').onclick=()=>{if(editSnapshot){answers={...editSnapshot.answers};photos=[...editSnapshot.photos];editSnapshot=null;}editing=false;view='profile';render();topScreen();};
 if($('editSave'))$('editSave').onclick=()=>{returnToEditor=false;view='form';step=13;questionIndex=0;render();topScreen();};
 document.querySelectorAll('[data-edit-field]').forEach(el=>el.onclick=()=>{const item=EDIT_FIELDS[Number(el.dataset.editField)];returnToEditor=true;view='form';step=item[2];questionIndex=item[3];render();topScreen();});
}
// Enter sends in both input and textarea; Shift+Enter inserts a newline; IME composition never sends.
function sendsOnEnter(e){return e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229;}
function topScreen(){const screen=$('screen');if(view==='form'&&step>=3){if(step===10||step===13||step===14){const active=$('activeTurn');if(active?.getBoundingClientRect)screen.scrollTop+=active.getBoundingClientRect().top-screen.getBoundingClientRect().top;}else screen.scrollTop=screen.scrollHeight;}else screen.scrollTop=0;}

function legacyValidate(){const required={1:['성별'],2:['주선자'],3:['성별'],4:['이름','출생연도','키','생활권','직업','학교'],5:['취미','음주','흡연'],7:['이상형'],8:['상대조건'],10:['이상형','상대조건'],12:['같은회사제외','연락처']};if((required[step]||[]).some(k=>!String(answers[k]||'').trim()))return '아직 답하지 않은 항목을 채워줘.';
 if(step===4){const year=Number(answers.출생연도),height=Number(answers.키);if(!Number.isInteger(year)||year<1900||year>new Date().getFullYear()-19)return '출생연도 4자리를 확인해줘. 출생연도 기준 19세 이상만 신청할 수 있어.';if(height<100||height>250)return '키는 cm 단위로 확인해줘 (100~250).';if(answers.MBTI&&!/^[IE][NS][FT][JP]$/i.test(answers.MBTI.trim()))return 'MBTI 네 글자를 확인하거나 비워줘.';}
 if(step===11){const count=photoCountMessage();if(count)return count;}
 if(step===12&&!/^01[016789]\d{7,8}$/.test(answers.연락처.replace(/[-\s]/g,'')))return '연락받을 휴대폰 번호를 확인해줘.';
 if(step===14&&!answers.개인정보동의)return '개인정보 수집·이용에 동의해야 신청할 수 있어.';return '';}
function validEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||'').trim());}
function validate(){if(step===14){if(!answers.개인정보동의)return '개인정보 수집·이용 동의를 확인해줘.';if(!INTRO_CHOICES.includes(answers.프로필소개동의))return '소개 진행 방식을 골라줘.';if(!editing&&!accountPassword)return '신청 내역 확인 비밀번호를 설정해줘.';if(accountPassword&&(accountPassword.length<8||accountPassword!==accountPasswordConfirm))return '비밀번호는 8자 이상이고, 확인란과 같아야 해.';}if(step===0)return '';if(step===1)return answers.성별?'':'성별을 선택해주세요.';const q=currentQuestion();if(!q)return legacyValidate();const [key,,,type,optional]=q;const value=String(answers[key]||'').trim();if(!optional&&!value)return '답변을 입력하거나 골라줘.';if(key==='출생연도'&&(!/^\d{4}$/.test(value)||+value<1900||+value>new Date().getFullYear()-19))return '출생연도 4자리를 확인해줘. 출생연도 기준 19세 이상만 신청할 수 있어.';if(key==='키'&&(+value<100||+value>250))return '키는 100~250cm 사이로 입력해줘.';if(key==='MBTI'&&value&&!/^[IE][NS][FT][JP]$/i.test(value))return 'MBTI 네 글자를 확인하거나 비워줘.';if(key==='이메일'&&!validEmail(value))return '안내받을 이메일 주소를 확인해줘.';if(key==='연락처'&&!/^01[016789]\d{7,8}$/.test(value.replace(/[-\s]/g,'')))return '휴대폰 번호를 확인해줘.';return '';}
async function next(allowSkip=false){if(busy)return;if(step===3&&questionIndex===-1){questionIndex=0;render();topScreen();return;}const choice=currentQuestion();if(Array.isArray(choice?.[2])&&!answers[choice[0]]&&!(allowSkip===true&&choice[4])){error('답변을 골라줘.');return;}const msg=validate();if(msg){error(msg);return;}if(returnToReview){returnToReview=false;step=10;questionIndex=0;render();topScreen();return;}if(returnToEditor){returnToEditor=false;view='edit';render();topScreen();return;}if(step<2){step=2;questionIndex=0;}else if(step===14){await submit();return;}else{if(step>=3)remember();if(step===3&&questionIndex===0){step=4;questionIndex=0;}else if(QUESTIONS[step]&&questionIndex<QUESTIONS[step].length-1)questionIndex++;else{step++;questionIndex=0;}}render();topScreen();}
const PHOTO_LIMIT={min:3,max:5,edge:1600,quality:0.85,bytes:4*1024*1024,types:{'image/jpeg':'JPG','image/png':'PNG','image/webp':'WebP'}};
// Mirrors server/Code.gs: JPG/PNG/WebP, 3–5 photos. No size limit for the user: anything larger than `edge` px or `bytes` is shrunk in the browser before upload (server still caps one decoded photo at 5MB). Type falls back to the extension because some Android pickers leave file.type empty.
function photoType(file){if(PHOTO_LIMIT.types[file.type])return file.type;const ext=String(file.name||'').toLowerCase().match(/\.(jpe?g|png|webp)$/);return ext?{jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'}[ext[1]]:'';}
function checkPhoto(file){const label=file.name?`'${file.name}'`:'이 파일';if(!photoType(file))return /heic|heif/i.test(file.type+' '+file.name)?label+'은 HEIC 형식이야. 아이폰 카메라 설정을 호환성 우선으로 바꾸거나 JPG로 저장해서 올려줘.':label+'은 JPG, PNG, WebP만 올릴 수 있어.';return '';}
function photoCountMessage(){const n=photos.length;if(n<PHOTO_LIMIT.min)return `사진 ${PHOTO_LIMIT.min-n}장 더 올려줘. (지금 ${n}장, ${PHOTO_LIMIT.min}~${PHOTO_LIMIT.max}장 필요)`;if(n>PHOTO_LIMIT.max)return `사진은 ${PHOTO_LIMIT.max}장까지만 보낼 수 있어. ${n-PHOTO_LIMIT.max}장 지워줘.`;return '';}
async function loadBitmap(file){if(typeof createImageBitmap==='function'){try{return await createImageBitmap(file,{imageOrientation:'from-image'});}catch{}}const url=URL.createObjectURL(file);try{return await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=url;});}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}}
// Returns {type,data}. Small photos pass through untouched; large ones are downscaled to PHOTO_LIMIT.edge and re-encoded as JPEG under PHOTO_LIMIT.bytes.
async function shrinkPhoto(file){const type=photoType(file);const bitmap=await loadBitmap(file);const w=bitmap.naturalWidth||bitmap.width,h=bitmap.naturalHeight||bitmap.height;if(!w||!h)throw Error('decode');const readOriginal=()=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve('data:'+type+';base64,'+String(r.result).split(',')[1]);r.onerror=()=>reject(Error('read'));r.readAsDataURL(file);});if(file.size<=PHOTO_LIMIT.bytes&&Math.max(w,h)<=PHOTO_LIMIT.edge)return {type,data:await readOriginal()};const scale=Math.min(1,PHOTO_LIMIT.edge/Math.max(w,h));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));const g=canvas.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,canvas.width,canvas.height);g.drawImage(bitmap,0,0,canvas.width,canvas.height);if(bitmap.close)bitmap.close();let data='';for(const q of [PHOTO_LIMIT.quality,0.75,0.65,0.55,0.45]){data=canvas.toDataURL('image/jpeg',q);if(data.length*0.75<=PHOTO_LIMIT.bytes)break;}return {type:'image/jpeg',data};}
async function selectPhotos(e){const files=[...e.target.files];e.target.value='';if(!files.length)return;const room=PHOTO_LIMIT.max-photos.length;if(room<=0){error(`이미 ${PHOTO_LIMIT.max}장을 다 올렸어. 바꾸려면 먼저 한 장 지워줘.`);return;}if(files.length>room){error(`사진은 최대 ${PHOTO_LIMIT.max}장이야. 지금은 ${room}장 더 올릴 수 있어.`);return;}busy=true;$('next').disabled=true;$('back').disabled=true;const incoming=[],rejected=[];for(const file of files){const why=checkPhoto(file);if(why){rejected.push(why);continue;}try{const {type,data}=await shrinkPhoto(file);incoming.push({name:file.name,type,data});}catch{rejected.push(`'${file.name}'은 열 수 없는 사진이야. 다른 파일을 골라줘.`);}}photos.push(...incoming);busy=false;render();if(rejected.length)error(rejected[0]+(rejected.length>1?` (외 ${rejected.length-1}장)`:''));}
async function request(payload){const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),60000);try{const response=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),signal:controller.signal});if(!response.ok)throw Error('서버에 연결하지 못했어. 잠시 후 다시 눌러줘.');let result;try{result=await response.json();}catch{throw Error('서버의 저장 확인을 받지 못했어. 운영자의 새 신청 양식 연동이 필요해.');}if(result.schemaVersion!==2||!result.ok)throw Error(result.error||'서버가 새 신청 양식을 지원하지 않아. 운영자에게 확인해줘.');return result;}finally{clearTimeout(timeout);}}
let submissionId=crypto.randomUUID();
async function submit(){if(busy)return;if(!validEmail(answers.이메일)){step=12;questionIndex=4;view='form';render();topScreen();error('접수 확인을 받을 이메일 주소를 알려줘.');return;}answers.이메일=answers.이메일.trim();if(!demo&&(!PRIVACY.operator||!PRIVACY.retention)){error('개인정보 처리방침을 준비하고 있어요. 정식 접수는 준비가 끝나면 열릴 예정이에요.');return;}if(!INTRO_CHOICES.includes(answers.프로필소개동의)||!answers.개인정보동의){error('개인정보 동의와 소개 진행 방식을 확인해줘.');return;}const editingFromHistory=editing&&profileReturnView==='history';busy=true;submitPhase='안전하게 저장하고 있어. 사진 전송으로 최대 1~2분 걸릴 수 있어. 이 화면에서 잠시 기다려줘.';render();try{
 answers.연령대=Math.floor((new Date().getFullYear()-Number(answers.출생연도))/10)*10+'대';
 answers.프로필소개동의일시=new Date().toISOString();
 if(!demo){const capabilities=await request({_action:'capabilities'});if(!capabilities.emailCollection)throw Error('이메일 저장 기능을 준비 중이야. 잠시 후 다시 시도해줘.');if(!capabilities.profileIntroductionConsent)throw Error('소개 동의 저장 기능을 준비 중이야. 잠시 후 다시 시도해줘.');if(!capabilities.selfIntroduction||!capabilities.partnerCondition)throw Error('새 질문 저장 기능을 준비 중이야. 잠시 후 다시 시도해줘.');if(!capabilities.accountAccess)throw Error('신청 내역 확인 기능을 준비 중이야. 운영자의 서버 업데이트가 필요해.');const result=await request({...answers,신청ID:receipt?.id||submissionId,사진:photos,_password:accountPassword,개인정보동의일시:new Date().toISOString(),_action:editing?'update':'submit',_token:receipt?.token});if(!result.id||!result.token)throw Error('접수번호를 확인하지 못했어. 다시 시도해줘.');receipt={id:result.id,token:result.token};try{sessionStorage.setItem('chinchinso-receipt',JSON.stringify(receipt));}catch{}}
 submitted=true;editing=false;editSnapshot=null;accountPassword='';accountPasswordConfirm='';if(editingFromHistory){currentApplicationStatus='pending';accountApplications=accountApplications.map(a=>a.id===receipt?.id?{...a,status:'pending'}:a);view='profile';}else view='complete';forgetSessions();
 }catch(err){busy=false;submitPhase='';render();error(err.name==='AbortError'?'저장 확인이 지연되고 있어. 입력 내용은 그대로야. 잠시 후 다시 눌러줘.':err instanceof TypeError?'연결이 잠시 끊겼어. 입력 내용은 그대로니 다시 시도해줘.':err.message);$('next').textContent='다시 보내기';return;}busy=false;submitPhase='';render();topScreen();}
// The legacy status endpoint also returns the authenticated application. Only the application is used.
async function loadReceipt(){if(demo||busy)return false;busy=true;if($('profile')){$('profile').disabled=true;$('profile').textContent='내 정보 불러오는 중…';}let message='';try{const result=await request({_action:'status',신청ID:receipt.id,_token:receipt.token});if(!result.answers||!Array.isArray(result.photos))throw Error('내 정보를 불러오지 못했어. 잠시 후 내 정보 보기를 다시 눌러줘.');Object.assign(answers,result.answers);mergePartner(answers);persona=answers.주선자||'f';photos=result.photos;currentApplicationStatus=result.status||'접수';return true;}catch(err){message='내 정보를 불러오지 못했어. 잠시 후 내 정보 보기를 다시 눌러줘.';return false;}finally{busy=false;render();if(message)error(message);}}

// iOS/WKWebView can both shrink and pan the visual viewport on focus.
// Keep the app in that visible rectangle; only #screen scrolls, never the document.
// Do not resize/reposition the shell during pinch zoom, so users can still magnify it.
let viewportFrame=0;
function fitKeyboard(){
 const viewport=window.visualViewport;
 if(viewport&&Math.abs(viewport.scale-1)>0.01)return;
 const screen=$('screen');
 const nearBottom=screen.scrollHeight-screen.scrollTop-screen.clientHeight<=screen.clientHeight/4;
 const previousTop=screen.scrollTop;
 const height=viewport?.height||window.innerHeight;
 if(!height)return;
 document.documentElement.style.setProperty('--viewport-height',height+'px');
 document.documentElement.style.setProperty('--viewport-top',Math.max(0,viewport?.offsetTop||0)+'px');
 if(view==='form'&&step>=3&&nearBottom)screen.scrollTop=screen.scrollHeight;
 else screen.scrollTop=previousTop;
}
function scheduleViewportFit(){if(viewportFrame)return;viewportFrame=window.requestAnimationFrame(()=>{viewportFrame=0;fitKeyboard();});}
window.visualViewport?.addEventListener('resize',scheduleViewportFit);
window.visualViewport?.addEventListener('scroll',scheduleViewportFit);
window.addEventListener?.('resize',scheduleViewportFit);
window.addEventListener?.('pageshow',scheduleViewportFit);
document.addEventListener?.('focusin',scheduleViewportFit);
document.addEventListener?.('focusout',scheduleViewportFit);
if(!submitted)restoreSessions();
render();if(window.visualViewport)fitKeyboard();if(receipt&&!demo)loadReceipt();
