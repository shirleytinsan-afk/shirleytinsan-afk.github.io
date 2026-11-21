import { evaluateValue, executeActions } from './state.js';
const params=new URLSearchParams(location.search),slug=params.get('app');
const allowed=['cosmo-player','cosmo-staff','ddr','sstudio','renraku'];
const stage=document.querySelector('#stage'),view=document.querySelector('#viewport'),status=document.querySelector('#status');
let renderedScreen,zoomed=false,data,screens,variables={},current,entry,history=[],overlays=[],timers=[],activation=0,fired=new Set(),variants=new Map(),keyBindings=[],deadlines=new Map();
const report=t=>{status.textContent=t;};
const rgba=c=>`rgba(${Math.round((c.r??c[0])*255)},${Math.round((c.g??c[1])*255)},${Math.round((c.b??c[2])*255)},${c.a??c[3]??1})`;
const paint=p=>{
 if(p.t==='c')return rgba(p.c);
 if(p.t==='i')return data.assets?.[p.h]?`url("${data.assets[p.h]}")`:'';
 if(p.s){let stops=p.s.map(([v,c])=>`${rgba(c)} ${v*100}%`).join(',');if(p.t==='GRADIENT_RADIAL')return `radial-gradient(ellipse at center,${stops})`;const m=p.tf||[[1,0,0],[0,1,0]];let a=Math.atan2(-m[0][1],m[1][1])*180/Math.PI+90;return `linear-gradient(${a}deg,${stops})`;}
 return '';
};
const blend=b=>({LINEAR_DODGE:'plus-lighter',PASS_THROUGH:'normal',NORMAL:'normal',COLOR_DODGE:'color-dodge',COLOR_BURN:'color-burn',HARD_LIGHT:'hard-light',SOFT_LIGHT:'soft-light'}[b]||b?.toLowerCase().replaceAll('_','-')||'normal');
function style(el,n,s){
 const binding=data.colorBindings?.[n[0]];if(binding){s=structuredClone(s);for(const [field,entries]of Object.entries(binding))for(const e of entries){const paints=s[field==='fills'?'f':'st'];if(paints?.[e.i]&&variables[e.id])paints[e.i]={t:'c',c:variables[e.id]};}}
 if(data.blend?.[n[0]])el.style.mixBlendMode=blend(data.blend[n[0]]);
 Object.assign(el.style,{left:n[3]+'px',top:n[4]+'px',width:n[5]+'px',height:n[6]+'px'});
 if(s.o!=null)el.style.opacity=s.o;
 if(s.rot)el.style.transform=`rotate(${-s.rot}deg)`;
 if(s.r)el.style.borderRadius=s.r+'px';if(n[2]==='ELLIPSE')el.style.borderRadius='50%';
 
 if(s.clip)el.style.overflow='hidden';const scroll=data.scroll?.[n[0]];if(scroll){el.style.overflowY=scroll==='HORIZONTAL'?'hidden':'auto';el.style.overflowX=scroll==='VERTICAL'?'hidden':'auto';el.style.scrollbarWidth='thin';}
 const fills=(s.f||[]).map(paint).filter(Boolean);
 // Keep scrolling frame fills on the viewport so they cannot scroll away.
 const viewportFill=scroll&&s.f?.length===1&&s.f[0].t==='c';
 if(viewportFill)el.style.backgroundColor=paint(s.f[0]);
 if(n[2]==='TEXT'){
  el.classList.add('text-layer');el.textContent=s.bc?(variables[s.bc]??n[8]):n[8];
  const f=s.font||{};el.style.fontFamily=`"${f.family||'Noto Sans JP'}",'Noto Sans JP',sans-serif`;
  el.style.fontSize=(typeof s.fs==='number'?s.fs:16)+'px';el.style.fontWeight=f.variationSettings?.wght||(/Black/.test(f.style)?900:/Extra.?Bold/.test(f.style)?800:/Bold/.test(f.style)?700:/Semi/.test(f.style)?600:/Medium/.test(f.style)?500:400);
  if(/Italic/.test(f.style))el.style.fontStyle='italic';
  el.style.lineHeight=s.lh?.unit==='PIXELS'?s.lh.value+'px':s.lh?.unit==='PERCENT'?s.lh.value/100:'1.3';
  if(s.ls?.value)el.style.letterSpacing=s.ls.unit==='PIXELS'?s.ls.value+'px':s.ls.value/100+'em';
  el.style.textAlign=(s.ta||'LEFT').toLowerCase();
  if(s.va==='CENTER'||s.va==='BOTTOM'){el.style.display='flex';el.style.flexDirection='column';el.style.justifyContent=s.va==='CENTER'?'center':'flex-end';}
  if(fills[0])el.style.color=fills[0];
 }else if(n[2]==='VECTOR'&&s.paths){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  // Straight vector strokes can have zero width or height in Figma.
  // Give SVG a nonzero viewport with room for the stroke on every side.
  const pad=Math.max(1,(s.sw||0)/2),w=n[5]+2*pad,h=n[6]+2*pad;
  svg.setAttribute('viewBox',`${-pad} ${-pad} ${w} ${h}`);svg.classList.add('graphic');
  Object.assign(svg.style,{inset:'auto',left:-pad+'px',top:-pad+'px',width:w+'px',height:h+'px'});
  for(const path of s.paths){const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',path.data);p.setAttribute('fill-rule',path.windingRule==='EVENODD'?'evenodd':'nonzero');p.setAttribute('fill',s.f?.[0]?.t==='c'?rgba(s.f[0].c):'none');if(s.st?.[0]?.t==='c'){p.setAttribute('stroke',rgba(s.st[0].c));p.setAttribute('stroke-width',s.sw||1);}svg.append(p);}el.append(svg);
 }else{
  for(const [i,p]of(s.f||[]).entries()){const value=paint(p);if(!value||viewportFill)continue;const bg=document.createElement('div');bg.className='paint-layer';Object.assign(bg.style,{position:'absolute',inset:'0',pointerEvents:'none',borderRadius:'inherit',backgroundImage:value.startsWith('rgba')?'linear-gradient('+value+','+value+')':value,backgroundSize:p.t==='i'&&p.m==='FIT'?'contain':'cover',backgroundPosition:'center',backgroundRepeat:'no-repeat'});if(p.t==='i'&&p.m==='CROP'&&p.tf&&Math.abs(p.tf[0][1])+Math.abs(p.tf[1][0])<0.0001){const a=p.tf[0][0],d=p.tf[1][1],x=p.tf[0][2],y=p.tf[1][2];if(a>0&&d>0){bg.style.backgroundSize=(100/a)+'% '+(100/d)+'%';bg.style.backgroundPosition=(Math.abs(1-a)<0.0001?50:x/(1-a)*100)+'% '+(Math.abs(1-d)<0.0001?50:y/(1-d)*100)+'%';}}const meta=data.paints?.[n[0]]?.[i];if(meta){bg.style.opacity=meta.o??1;bg.style.mixBlendMode=blend(meta.b);}el.append(bg);}
  if(s.st?.[0]?.t==='c')el.style.border=`${s.sw||1}px solid ${rgba(s.st[0].c)}`;
  if(n[2]==='LINE'){el.style.height='0';el.style.borderBottom=el.style.border;el.style.borderTop=el.style.borderLeft=el.style.borderRight='0';}
  if(n[2]==='STAR')el.style.clipPath='polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 95%,50% 73%,21% 95%,32% 57%,2% 35%,39% 35%)';
 }
 if((s.v===false&&!s.bv)||(s.bv&&!variables[s.bv]))el.style.display='none';
 if(slug==='renraku'&&n[2]==='TEXT'&&n[8]==='すべて'){el.style.whiteSpace='nowrap';el.dataset.fitText='true';}
 // A one-line source text box must stay one line with browser fallback fonts.
 const fontSize=typeof s.fs==='number'?s.fs:16;
 const sourceLineHeight=s.lh?.unit==='PIXELS'?s.lh.value:s.lh?.unit==='PERCENT'?fontSize*s.lh.value/100:fontSize*1.3;
 if(n[2]==='TEXT'&&!String(n[8]||'').includes('\n')&&n[6]<=sourceLineHeight+2){el.style.whiteSpace='nowrap';el.dataset.fitText='true';}
 if(s.bc&&slug==='ddr'){el.style.whiteSpace='nowrap';el.dataset.fitText='true';}
 if(s.e?.length){const blur=s.e.find(e=>e.type==='LAYER_BLUR');if(blur)el.style.filter='blur('+blur.radius+'px)';const sh=s.e.filter(e=>e.type==='DROP_SHADOW'||e.type==='INNER_SHADOW').map(e=>`${e.type==='INNER_SHADOW'?'inset ':''}${e.offset.x}px ${e.offset.y}px ${e.radius}px ${e.spread||0}px ${rgba(e.color)}`);if(sh.length){if(n[2]==='TEXT')el.style.textShadow=s.e.filter(e=>e.type==='DROP_SHADOW').map(e=>`${e.offset.x}px ${e.offset.y}px ${e.radius}px ${rgba(e.color)}`).join(',');else el.style.boxShadow=sh.join(',');}}
}
function bind(el,n,owner){for(const [i,r] of (n[9]||[]).entries()){
 const run=()=>act(r.actions,owner||n[0]);const t=r.trigger;if(!t)continue;
 if(t.type==='ON_CLICK'||t.type==='ON_PRESS'||t.type==='ON_DRAG'){el.classList.add('hotspot');el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-label',n[8]||el.textContent||'操作');el.addEventListener('click',e=>{e.stopPropagation();run();});el.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();run();}});}
 else if(t.type==='ON_KEY_DOWN')keyBindings.push({el,codes:t.keyCodes,run});
 else if(t.type==='AFTER_TIMEOUT'){
  const key=activation+':'+(owner||'')+':'+n[0]+':'+i;const animated=r.actions.some(a=>a.navigation==='CHANGE_TO');
  if(!fired.has(key)){if(!deadlines.has(key))deadlines.set(key,Date.now()+Math.max(50,t.timeout*1000));timers.push(setTimeout(()=>{deadlines.delete(key);if(!animated)fired.add(key);if(el.getClientRects().length)run();},Math.max(0,deadlines.get(key)-Date.now())));}
 }else if((t.type==='MOUSE_ENTER'||t.type==='ON_HOVER'))el.addEventListener('mouseenter',run,{once:true});
}}
function renderScene(id,owner){const scene=screens.get(id);if(!scene){report('この画面の読み込みに失敗しました。最初からやり直してください。');return document.createElement('div');}const wrapper=document.createElement('div');wrapper.className='scene';wrapper.style.width=scene.w+'px';wrapper.style.height=scene.h+'px';const elements=new Map();
 const nodeById=new Map(scene.nodes.map(n=>[n[0],n]));
 for(const n of scene.nodes){const el=document.createElement('div');el.className='layer';el.dataset.node=n[0];
  // Figma GROUP children share their group's parent coordinate space.
  // HTML children need coordinates relative to the group itself.
  const parentNode=nodeById.get(n[1]);
  const positioned=parentNode?.[2]==='GROUP'?[...n.slice(0,3),n[3]-parentNode[3],n[4]-parentNode[4],...n.slice(5)]:n;
  style(el,positioned,data.styles[n[7]]);const parent=elements.get(n[1])||wrapper;parent.append(el);elements.set(n[0],el);}
 for(const mask of data.masks||[]){const m=scene.nodes.find(n=>n[0]===mask.id),parent=elements.get(mask.parent),layer=elements.get(mask.id);if(m&&parent){parent.style.overflow='hidden';parent.style.borderRadius=m[2]==='ELLIPSE'?'50%':(data.styles[m[7]].r||0)+'px';if(layer)layer.style.visibility='hidden';}}
 for(const n of scene.nodes){const el=elements.get(n[0]);if(!owner&&variants.has(n[0])){const content=renderScene(variants.get(n[0]),n[0]);el.replaceChildren(content);}else bind(el,n,owner);}
 // Keep confirmation hover feedback local: replacing the scene on hover loses clicks.
 if(slug==='ddr'&&scene.nodes.some(n=>n[8]?.includes('セーブデータを削除'))){
  const labels=scene.nodes.filter(n=>n[8]==='はい'||n[8]==='いいえ');
  const choices=labels.map(n=>elements.get(n[1]));
  const selectedIndex=scene.name.includes('/ はい')?labels.findIndex(n=>n[8]==='はい'):labels.findIndex(n=>n[8]==='いいえ');
  const appearance=choices.map(el=>({border:el.style.border,shadow:el.style.boxShadow,paints:Array.from(el.children).filter(c=>c.classList.contains('paint-layer')).map(c=>c.cloneNode(true))}));
  const selected=appearance[selectedIndex],idle=appearance[1-selectedIndex];
  let activeChoice=selectedIndex;
  const confirm=()=>{const n=nodeById.get(labels[activeChoice][1]);act(n[9].find(r=>r.trigger.type==='ON_CLICK').actions,n[0]);};
  for(const binding of keyBindings)if(binding.codes?.includes(13))binding.run=confirm;
  for(const n of scene.nodes.filter(n=>n[8]==='決定')){const el=elements.get(n[0]);el.addEventListener('click',e=>{e.stopImmediatePropagation();e.stopPropagation();confirm();},true);}
  const select=index=>{activeChoice=index;choices.forEach((el,i)=>{const a=i===index?selected:idle;el.style.border=a.border;el.style.boxShadow=a.shadow;for(const c of Array.from(el.children))if(c.classList.contains('paint-layer'))c.remove();for(const c of [...a.paints].reverse())el.prepend(c.cloneNode(true));el.setAttribute('aria-pressed',String(i===index));});};
  choices.forEach((el,i)=>{el.addEventListener('mouseenter',()=>select(i));el.addEventListener('focus',()=>select(i));});
  keyBindings=keyBindings.filter(b=>!b.codes?.some(c=>c===37||c===39));
  for(const [code,label]of [[37,'いいえ'],[39,'はい']])keyBindings.push({el:wrapper,codes:[code],run:()=>select(labels.findIndex(n=>n[8]===label))});
  select(selectedIndex);
 }
 return wrapper;
}
function resize(){if(!current)return;const s=screens.get(current);const maxHeight=view.clientHeight;const fit=slug.startsWith('cosmo')||slug==='ddr'||(slug==='renraku'&&s.h<=1000);const scale=zoomed?1:Math.min(view.clientWidth/s.w,fit?maxHeight/s.h:1);stage.style.width=s.w+'px';stage.style.height=s.h+'px';stage.style.transform=`scale(${scale})`;document.querySelector('#sizer').style.width=s.w*scale+'px';document.querySelector('#sizer').style.height=s.h*scale+'px';}
function render(){const savedScroll=new Map();const focusId=document.activeElement?.dataset?.node;if(renderedScreen===current)for(const el of stage.querySelectorAll('[data-node]'))if(el.scrollTop||el.scrollLeft)savedScroll.set(el.dataset.node,[el.scrollTop,el.scrollLeft]);renderedScreen=current;timers.forEach(clearTimeout);timers=[];keyBindings=[];stage.replaceChildren(renderScene(current));const s=screens.get(current);document.querySelector('#screen-name').textContent=s.name;document.querySelector('#screen-picker').value=entry;
 for(const o of overlays){const back=document.createElement('div');back.className='overlay-backdrop';back.style.width=s.w+'px';back.style.height=s.h+'px';back.onclick=()=>{overlays.pop();render();};stage.append(back);const el=renderScene(o.id),os=screens.get(o.id);el.style.left=Math.max(0,(s.w-os.w)/2)+'px';el.style.top=Math.max(0,(Math.min(s.h,view.clientHeight/(view.clientWidth/s.w))-os.h)/2)+'px';stage.append(el);}
 fitSingleLineText();
 resize();for(const [id,pos]of savedScroll){const el=stage.querySelector(`[data-node="${CSS.escape(id)}"]`);if(el){el.scrollTop=pos[0];el.scrollLeft=pos[1];}}if(focusId)stage.querySelector(`[data-node="${CSS.escape(focusId)}"]`)?.focus({preventScroll:true});document.querySelector('#back').disabled=!history.length&&!overlays.length;
}
function navigate(id){if(!screens.has(id)){report('移行されていない画面があります。画面一覧を確認してください。');return;}renderedScreen=undefined;history.push(current);current=id;overlays=[];variants.clear();activation++;fired.clear();deadlines.clear();view.scrollTop=0;}
function act(actions,node){let changed=false;executeActions(actions,variables,{node:a=>{
 if(a.navigation==='CHANGE_TO'){if(screens.has(a.destinationId)){variants.set(node,a.destinationId);changed=true;}return;}
 if(a.navigation==='SCROLL_TO'){stage.querySelector(`[data-node="${CSS.escape(a.destinationId)}"]`)?.scrollIntoView({block:'start'});return;}
 if(a.navigation==='OVERLAY'){if(screens.has(a.destinationId)){overlays.push({id:a.destinationId});changed=true;}return;}
 if(a.navigation==='SWAP'){if(overlays.length)overlays[overlays.length-1]={id:a.destinationId};else navigate(a.destinationId);changed=true;return;}
 navigate(a.destinationId);changed=true;
 },back:()=>{if(overlays.length)overlays.pop();else if(history.length){current=history.pop();activation++;fired.clear();deadlines.clear();}changed=true;},close:()=>{overlays.pop();changed=true;},url:a=>{if(a.url?.startsWith('/')&&!a.url.startsWith('//'))window.top.location.href=a.url;else report('外部サービスへの移動はこのデモでは行いません。');},set:()=>{changed=true;}});if(changed)render();}
function reset(){renderedScreen=undefined;variables=structuredClone(data.variables||{});current=entry;history=[];overlays=[];variants.clear();activation++;fired.clear();deadlines.clear();view.scrollTop=0;report('');render();}
try{if(!allowed.includes(slug))throw Error('Unknown prototype');const response=await fetch(`${slug}.json`);if(!response.ok)throw Error('Missing data');data=await response.json();screens=new Map(data.screens.map(s=>[s.id,s]));entry=params.get('start')||data.start||data.screens[0].id;if(!screens.has(entry))throw Error('Missing starting screen');document.title=data.title||'Interactive prototype';
 const picker=document.querySelector('#screen-picker');for(const screen of data.entries||[]){const option=document.createElement('option');option.value=screen.id;option.textContent=screen.label;picker.append(option);}picker.onchange=()=>{entry=picker.value;reset();};
 const controls=slug==='cosmo-player'?[[67,'コイン'],[32,'決定'],[37,'←'],[39,'→'],[38,'↑'],[40,'↓']]:slug==='cosmo-staff'?[[38,'↑'],[40,'↓'],[37,'−'],[39,'＋'],[13,'決定'],[27,'戻る']]:slug==='ddr'?[[37,'←'],[39,'→'],[38,'↑'],[40,'↓'],[13,'決定'],[27,'戻る']]:[];for(const [code,label] of controls){const button=document.createElement('button');button.textContent=label;button.onclick=()=>dispatchKey(code);document.querySelector('#virtual-keys').append(button);}reset();}catch(e){report('プロトタイプを読み込めませんでした。ページを再読み込みしてください。');console.error(e);}
new ResizeObserver(resize).observe(view);document.querySelector('#reset').onclick=reset;document.querySelector('#back').onclick=()=>act([{type:'BACK'}]);document.querySelector('#hints').onclick=()=>stage.classList.toggle('show-hints');document.querySelector('#expand').onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();
window.addEventListener('keydown',e=>{if(e.target.closest('select,input,textarea'))return;if(e.target.closest('#controls,#play-controls')&&!(slug==='cosmo-player'&&[32,37,38,39,40,67].includes(e.keyCode)))return;const matches=keyBindings.filter(b=>b.codes?.includes(e.keyCode)&&b.el.getClientRects().length);if(matches.length){e.preventDefault();matches[matches.length-1].run();}else if(e.key==='Escape'&&overlays.length){e.preventDefault();act([{type:'CLOSE'}]);}});

function dispatchKey(code){const visible=keyBindings.filter(b=>b.codes?.includes(code)&&b.el.getClientRects().length);if(visible.length)visible[visible.length-1].run();}

document.querySelector('#zoom').onclick=()=>{zoomed=!zoomed;document.querySelector('#zoom').textContent=zoomed?'全体':'拡大';resize();};

function fitSingleLineText(){for(const el of stage.querySelectorAll('[data-fit-text]')){const base=Number(el.dataset.baseFontSize||parseFloat(el.style.fontSize));el.dataset.baseFontSize=base;el.style.fontSize=base+'px';if(el.clientWidth>0&&el.scrollWidth>el.clientWidth+1)el.style.fontSize=Math.max(8,Math.floor(base*el.clientWidth/el.scrollWidth*100)/100)+'px';}}
document.fonts.ready.then(fitSingleLineText);document.fonts.addEventListener('loadingdone',fitSingleLineText);
