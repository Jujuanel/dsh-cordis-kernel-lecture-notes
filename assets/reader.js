/* 阅读位置与书签：位置记为“章节 id + 章内第几个正文块 + 块内比例”，不受窗口宽度和其他章节改动影响 */
(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store={get(k,d){try{const v=localStorage.getItem(k);return v===null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const K_POS='cordis-v2-pos',K_BM='cordis-v2-bookmarks';
const BLOCKS='h2,h3,h4,p,li,pre,blockquote,tr,figure';
const READ_LINE=96; /* 顶栏 60px 之下的阅读基线 */
const SCROLL_PAD=84; /* 与 html 的 scroll-padding-top 一致 */

const content=$('#main .content');
const chapters=$$('section.chapter',content);
const chIndex=new Map(chapters.map((c,i)=>[c.id,i]));
const blockCache=new Map();
const blocksOf=ch=>{if(!blockCache.has(ch.id))blockCache.set(ch.id,$$(BLOCKS,ch));return blockCache.get(ch.id)};
const visible=el=>el.getClientRects().length>0;
const clean=s=>s.replace(/\s+/g,' ').trim();
const headText=h=>{const n=$('.num',h);return clean(n?n.textContent+' '+h.textContent.slice(n.textContent.length):h.textContent)};

/* ---------- 位置 ---------- */
function anchorAt(line){
  let ch=null;
  for(const c of chapters){if(c.getBoundingClientRect().top<=line)ch=c;else break}
  if(!ch)return null;
  const bs=blocksOf(ch);
  for(let i=0;i<bs.length;i++){
    const b=bs[i];if(!visible(b))continue;
    const r=b.getBoundingClientRect();
    if(r.bottom>line)return{ch:ch.id,i,f:r.height&&r.top<line?Math.min(1,(line-r.top)/r.height):0};
  }
  return{ch:ch.id,i:-1,f:0};
}
function resolve(a){
  const ch=document.getElementById(a.ch);if(!ch||!chIndex.has(a.ch))return null;
  const bs=blocksOf(ch);
  let i=Math.min(a.i,bs.length-1);
  while(i>=0&&!visible(bs[i]))i--;
  return i<0?ch:bs[i];
}
function yOf(a){
  const el=resolve(a);if(!el)return null;
  const r=el.getBoundingClientRect();
  return scrollY+r.top+(el.tagName==='SECTION'?0:(a.f||0)*r.height);
}
function cmp(a,b){return chIndex.get(a.ch)-chIndex.get(b.ch)||a.i-b.i||(a.f||0)-(b.f||0)}
function chLabel(id){
  const ch=document.getElementById(id);if(!ch)return'';
  const t=ch.dataset.title||'';
  if(/^c\d+$/.test(id))return id==='c00'?t:`第 ${parseInt(id.slice(1),10)} 章 · ${t}`;
  return`附录 ${ch.dataset.no||''} · ${t}`;
}
function describe(a){
  const ch=document.getElementById(a.ch),el=resolve(a);
  let h=null;
  if(el&&el!==ch){for(const x of $$('h3',ch)){if(x===el||(x.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING))h=x;else break}}
  const snip=el&&el!==ch&&!/^H[234]$/.test(el.tagName)?clean(el.textContent).slice(0,60):'';
  return{chapter:chLabel(a.ch),section:h?headText(h):'',snippet:snip};
}
/* 长文里平滑滚动太慢，跳转一律直接定位，再让目标段落闪一下 */
function jump(a){
  const y=yOf(a);if(y==null)return;
  scrollTo({top:Math.max(0,y-SCROLL_PAD),behavior:'instant'});
  const el=resolve(a);
  if(el&&el.tagName!=='SECTION'){el.classList.remove('rd-pulse');void el.offsetWidth;el.classList.add('rd-pulse')}
}
document.addEventListener('animationend',e=>{if(e.animationName==='rd-pulse')e.target.classList.remove('rd-pulse')});

/* ---------- 提示条 ---------- */
const toast=document.createElement('div');
toast.className='rd-toast';toast.setAttribute('role','status');toast.hidden=true;
document.body.appendChild(toast);
let toastTimer=0;
function showToast(html,{sticky=false,actions=[]}={}){
  clearTimeout(toastTimer);
  toast.innerHTML=`<div class="rd-toast-body">${html}</div>`+actions.map((x,i)=>`<button class="btn${x.pri?' pri':''}" type="button" data-i="${i}">${esc(x.label)}</button>`).join('')+
    `<button class="rd-x" type="button" aria-label="关闭"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="m4 4 8 8M12 4l-8 8"/></svg></button>`;
  $$('button[data-i]',toast).forEach(b=>b.addEventListener('click',()=>{hideToast();actions[+b.dataset.i].run()}));
  $('.rd-x',toast).addEventListener('click',hideToast);
  toast.hidden=false;
  if(!sticky)toastTimer=setTimeout(hideToast,2800);
}
function hideToast(){clearTimeout(toastTimer);toast.hidden=true}

/* ---------- 记住阅读位置 ---------- */
let saveTimer=0;
function savePos(){
  const a=anchorAt(READ_LINE);
  if(a)store.set(K_POS,{...a,t:Date.now()});
}
addEventListener('scroll',()=>{if(!saveTimer)saveTimer=setTimeout(()=>{saveTimer=0;savePos()},400)},{passive:true});
addEventListener('pagehide',savePos);

const lastPos=store.get(K_POS,null);
function offerResume(){
  if(!lastPos||location.hash||!chIndex.has(lastPos.ch))return;
  if(chapters[0].getBoundingClientRect().top<=READ_LINE)return; /* 浏览器已自行恢复到正文里 */
  const d=describe(lastPos);
  showToast(`<span class="rd-k">上次读到</span><b>${esc(d.chapter)}</b>${d.section?`<span class="rd-sub">${esc(d.section)}</span>`:''}`,
    {sticky:true,actions:[{label:'继续阅读',pri:true,run:()=>jump(lastPos)}]});
}

/* ---------- 书签 ---------- */
let marks=store.get(K_BM,[]);
const saveMarks=()=>{marks.sort(cmp);store.set(K_BM,marks)};
marks=marks.filter(m=>chIndex.has(m.ch));

const ICON_BM='<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M5.5 3h9a.5.5 0 0 1 .5.5V17l-5-3.4L5 17V3.5a.5.5 0 0 1 .5-.5z"/></svg>';
const ICON_X='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="m4 4 8 8M12 4l-8 8"/></svg>';
const btn=document.createElement('button');
btn.className='iconbtn rd-bm-btn';btn.id='bmBtn';btn.type='button';btn.setAttribute('aria-label','书签');btn.setAttribute('aria-expanded','false');btn.title='书签（M 打开，B 添加，[ ] 跳转）';
btn.innerHTML=ICON_BM+'<span class="rd-count" hidden></span>';
$('#themeBtn').before(btn);

const panel=document.createElement('div');
panel.className='rd-panel';panel.id='bmPanel';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','书签');
document.body.appendChild(panel);

function relTime(t){
  const s=(Date.now()-t)/1000;
  if(s<60)return'刚刚';if(s<3600)return`${Math.floor(s/60)} 分钟前`;if(s<86400)return`${Math.floor(s/3600)} 小时前`;
  const d=new Date(t);return`${d.getMonth()+1} 月 ${d.getDate()} 日`;
}
function renderPanel(){
  const items=marks.map((m,k)=>{
    const d=describe(m);
    return`<li data-k="${k}"><button class="rd-item" type="button">`+
      `<span class="rd-meta"><span>${esc(d.chapter)}</span><time>${esc(relTime(m.t))}</time></span>`+
      `<span class="rd-name">${esc(m.name||d.section||d.chapter)}</span>`+
      (d.snippet?`<span class="rd-snip"><mark>${esc(d.snippet)}</mark></span>`:'')+
      `</button><span class="rd-acts">`+
      `<button class="rd-act" type="button" data-act="rename" aria-label="重命名" title="重命名"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M10.5 2.5l3 3L5.5 13.5H2.5v-3z"/></svg></button>`+
      `<button class="rd-act" type="button" data-act="del" aria-label="删除" title="删除"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/></svg></button></span></li>`;
  }).join('');
  panel.innerHTML=`<div class="rd-head"><h5>书签${marks.length?`<span class="rd-n">${marks.length}</span>`:''}</h5>`+
    `<button class="rd-add" type="button">添加当前位置<kbd>B</kbd></button>`+
    `<button class="rd-close" type="button" aria-label="关闭">${ICON_X}</button></div>`+
    (marks.length?`<ol class="rd-list">${items}</ol>`:`<div class="rd-empty">${ICON_BM}<p>读到想回来的地方，按 <kbd>B</kbd> 添加书签。<br>书签处的文字会一直高亮。</p></div>`)+
    `<div class="rd-foot"><span><kbd>M</kbd> 打开或关闭</span><span><kbd>[</kbd><kbd>]</kbd> 上一个、下一个</span></div>`;
  $('.rd-add',panel).addEventListener('click',addMark);
  $('.rd-close',panel).addEventListener('click',()=>{closePanel();btn.focus()});
  $$('.rd-list li',panel).forEach(li=>{
    const m=marks[+li.dataset.k];
    $('.rd-item',li).addEventListener('click',()=>{closePanel();jump(m)});
    $('[data-act=del]',li).addEventListener('click',()=>{marks.splice(+li.dataset.k,1);saveMarks();refresh()});
    $('[data-act=rename]',li).addEventListener('click',()=>rename(li,m));
  });
}
function rename(li,m){
  const name=$('.rd-name',li);
  const inp=document.createElement('input');
  inp.className='rd-input';inp.value=name.textContent;inp.setAttribute('aria-label','书签名称');
  name.replaceWith(inp);inp.focus();inp.select();
  inp.addEventListener('click',e=>e.stopPropagation());
  let finished=false;
  const finish=ok=>{if(finished)return;finished=true;if(ok){const v=inp.value.trim();const d=describe(m);m.name=v&&v!==(d.section||d.chapter)?v:'';saveMarks()}refresh()};
  inp.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();finish(true)}else if(e.key==='Escape')finish(false)});
  inp.addEventListener('blur',()=>finish(true));
}
/* 书签所在的正文块常驻高亮 */
function renderHighlights(){
  $$('.rd-mark',content).forEach(el=>el.classList.remove('rd-mark'));
  marks.forEach(m=>{const el=resolve(m);if(el&&el.tagName!=='SECTION')el.classList.add('rd-mark')});
}
function refresh(){
  const c=$('.rd-count',btn);c.hidden=!marks.length;c.textContent=marks.length;
  if(!panel.hidden)renderPanel();
  renderHighlights();
}
function addMark(){
  const a=anchorAt(READ_LINE);
  if(!a||a.i<0){showToast('封面和章节开头之前不能加书签，先往下读一点');return}
  const m={ch:a.ch,i:a.i,f:0,name:'',t:Date.now()};
  const same=marks.find(x=>x.ch===m.ch&&x.i===m.i);
  if(same){showToast('这里已经有书签了');jump(same);return}
  marks.push(m);saveMarks();refresh();
  const d=describe(m);
  showToast(`<span class="rd-k">已添加书签</span><b>${esc(d.section||d.chapter)}</b>`,{actions:[{label:'撤销',run:()=>{marks=marks.filter(x=>x!==m);saveMarks();refresh()}}]});
}
function step(dir){
  if(!marks.length){showToast('还没有书签，按 B 添加');return}
  const cur=scrollY+SCROLL_PAD;
  const ys=marks.map(m=>[m,yOf(m)]).filter(x=>x[1]!=null);
  const hit=dir>0?ys.find(x=>x[1]>cur+8):[...ys].reverse().find(x=>x[1]<cur-8);
  if(!hit){showToast(dir>0?'后面没有书签了':'前面没有书签了');return}
  jump(hit[0]);
}
function openPanel(byKey){
  renderPanel();panel.hidden=false;btn.setAttribute('aria-expanded','true');btn.classList.add('on');
  if(byKey)($('.rd-item',panel)||$('.rd-add',panel)).focus();
}
function closePanel(){panel.hidden=true;btn.setAttribute('aria-expanded','false');btn.classList.remove('on')}
btn.addEventListener('click',e=>{e.stopPropagation();panel.hidden?openPanel(false):closePanel()});
document.addEventListener('click',e=>{if(!panel.hidden&&!panel.contains(e.target)&&!btn.contains(e.target))closePanel()});
panel.addEventListener('keydown',e=>{
  if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;
  const its=$$('.rd-item',panel);if(!its.length)return;
  e.preventDefault();
  const i=its.indexOf(document.activeElement);
  its[(i+(e.key==='ArrowDown'?1:-1)+its.length)%its.length].focus();
});
document.addEventListener('keydown',e=>{
  if(e.metaKey||e.ctrlKey||e.altKey)return;
  const t=e.target;if(t.closest&&t.closest('input,textarea,select,[contenteditable]'))return;
  if(e.key==='Escape'&&!panel.hidden){closePanel();btn.focus();return}
  const k=e.key.toLowerCase();
  if(k==='b'){e.preventDefault();addMark()}
  else if(k==='m'){e.preventDefault();panel.hidden?openPanel(true):closePanel()}
  else if(e.key===']'){e.preventDefault();step(1)}
  else if(e.key==='['){e.preventDefault();step(-1)}
});

refresh();
document.fonts.ready.then(offerResume);
})();
