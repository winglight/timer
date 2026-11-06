/* Ambient scene and procedural soundscape; independent from the breath timer. */
(() => {
 'use strict';
 const $ = id => document.getElementById(id);
 const world = $('ambient-world'), soundSelect = $('ambient-sound'), volume = $('ambient-volume'), volumeValue = $('ambient-volume-value');
 if (!world || !soundSelect || !volume) return;
 const KEY='breathing-ambience-v1';
 const defaults={scene:'none',sound:'off',volume:32};
 let settings={...defaults};
 try { settings={...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}; } catch (_) {}
 const scenes=['none','sunset','ocean','mountain','cabin'];
 const soundNames=['off','rain','ocean','forest','wind','fire','white','pink'];
 const sceneButtons=[...document.querySelectorAll('[data-scene]')];
 let context=null, source=null, master=null, filter=null, lfo=null, lfoGain=null, buffer=null, bufferKind=null, activeSound='off';
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 function save(){try{localStorage.setItem(KEY,JSON.stringify(settings));}catch(_){}}
 function applyScene(value){
  settings.scene=scenes.includes(value)?value:'none';
  world.className='ambient-world scene-'+settings.scene;
  world.classList.toggle('is-visible',settings.scene!=='none');
  document.body.dataset.scene=settings.scene;
  sceneButtons.forEach(button=>{const active=button.dataset.scene===settings.scene;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));});
  save();
 }
 function makeNoise(ctx,kind){
  const seconds=8, length=ctx.sampleRate*seconds, data=ctx.createBuffer(1,length,ctx.sampleRate), out=data.getChannelData(0);
  let last=0, brown=0;
  for(let i=0;i<length;i++){
   const white=Math.random()*2-1;
   if(kind==='pink'){last=.985*last+.015*white;out[i]=last*3.2;}
   else if(kind==='white') out[i]=white*.7;
   else {brown=(brown+.018*white)/1.018;let v=brown*3.5;
    if(kind==='rain') v=(v*.72+white*.28)*.72;
    if(kind==='ocean') v*=.85;
    if(kind==='wind') v*=.95;
    if(kind==='forest') v=(v*.6+white*.4)*.55;
    if(kind==='fire') v=(v*.35+white*.65)*.42;
    out[i]=Math.max(-1,Math.min(1,v));
   }
  }
  return data;
 }
 function stopSound(){
  activeSound='off';
  if(source){try{source.stop();}catch(_){}try{source.disconnect();}catch(_){}source=null;}
  if(lfo){try{lfo.stop();}catch(_){}try{lfo.disconnect();}catch(_){}lfo=null;}
  if(master){try{master.disconnect();}catch(_){}master=null;}
  if(filter){try{filter.disconnect();}catch(_){}filter=null;}
 }
 async function startSound(kind){
  if(!soundNames.includes(kind)||kind==='off'){stopSound();settings.sound='off';save();return;}
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio){soundSelect.value='off';return;}
  if(!context)context=new Audio({latencyHint:'playback'});
  await context.resume();
  stopSound();
  if(!buffer||buffer.sampleRate!==context.sampleRate||bufferKind!==kind){buffer=makeNoise(context,kind);bufferKind=kind;}
  source=context.createBufferSource();source.buffer=buffer;source.loop=true;
  filter=context.createBiquadFilter();filter.type=kind==='fire'?'highpass':kind==='white'?'allpass':'lowpass';
  filter.frequency.value=kind==='rain'?4200:kind==='forest'?3600:kind==='fire'?1800:kind==='wind'?850:kind==='ocean'?700:kind==='pink'?1200:18000;
  master=context.createGain();master.gain.value=Number(volume.value)/100*.22;
  source.connect(filter);filter.connect(master);master.connect(context.destination);
  if(['ocean','wind','rain','fire'].includes(kind)){
   lfo=context.createOscillator();lfo.type='sine';lfo.frequency.value=kind==='ocean'?.085:kind==='wind'?.045:kind==='fire'?.7:.19;
   lfoGain=context.createGain();lfoGain.gain.value=(Number(volume.value)/100)*(kind==='fire'?.055:.11);
   lfo.connect(lfoGain);lfoGain.connect(master.gain);lfo.start();
  }
  source.start();activeSound=kind;settings.sound=kind;save();
 }
 function setVolume(value){
  const n=Math.max(0,Math.min(100,Number(value)||0));settings.volume=n;
  volume.value=String(n);volumeValue.value=n+'%';volumeValue.textContent=n+'%';
  if(master)master.gain.setTargetAtTime(n/100*.22,context.currentTime,.08);
  if(lfoGain)lfoGain.gain.setTargetAtTime(n/100*(activeSound==='fire'?.055:.11),context.currentTime,.08);
  save();
 }
 function applyLanguage(){
  const en=document.documentElement.lang==='en';
  document.querySelectorAll('[data-zh][data-en]').forEach(el=>{el.textContent=en?el.dataset.en:el.dataset.zh;});
  const labels={
   off:en?'Off':'关闭声音',rain:en?'Rain':'细雨',ocean:en?'Ocean waves':'海浪',forest:en?'Forest birds':'森林鸟鸣',
   wind:en?'Mountain wind':'山间微风',fire:en?'Fireplace':'篝火',white:en?'White noise':'白噪音',pink:en?'Pink noise':'粉红噪音'
  };
  [...soundSelect.options].forEach(option=>option.textContent=labels[option.value]);
  soundSelect.setAttribute('aria-label',en?'Choose ambient sound':'选择环境声音');
  volume.setAttribute('aria-label',en?'Ambient volume':'环境音量');
 }
 sceneButtons.forEach(button=>button.addEventListener('click',()=>applyScene(button.dataset.scene)));
 soundSelect.addEventListener('change',()=>startSound(soundSelect.value).catch(()=>{soundSelect.value='off';}));
 volume.addEventListener('input',()=>setVolume(volume.value));
 new MutationObserver(applyLanguage).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 applyScene(settings.scene);
 const savedSound=soundNames.includes(settings.sound)?settings.sound:'off';
 soundSelect.value=savedSound;
 setVolume(settings.volume);
 if(savedSound!=='off'){
  // Browsers block autoplay: restore the selection, then resume on the first user gesture.
  const resume=()=>{document.removeEventListener('pointerdown',resume);document.removeEventListener('keydown',resume);startSound(savedSound).catch(()=>{soundSelect.value='off';});};
  document.addEventListener('pointerdown',resume,{once:true});
  document.addEventListener('keydown',resume,{once:true});
 }
 applyLanguage();
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&context&&context.state==='running')context.suspend();else if(!document.hidden&&activeSound!=='off'&&context?.state==='suspended')context.resume();});
})();
