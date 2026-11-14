/* Photographic ambience and real field recordings. No synthesized noise. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const world=$('ambient-world'),volume=$('ambient-volume'),volumeValue=$('ambient-volume-value');
 const sceneMenu=$('scene-menu'),soundMenu=$('sound-menu');
 if(!world||!volume||!volumeValue)return;
 const KEY='breathing-ambience-v2',LEGACY_KEY='breathing-ambience-v1';
 const sceneLabels={none:['关闭','Off'],sunset:['日落湖畔','Sunset lake'],ocean:['海浪与晚霞','Ocean at dusk'],mountain:['云海山顶','Sea of clouds'],cabin:['细雨林中小屋','Rainy forest cabin'],forest:['森林晨雾','Misty forest'],waterfall:['静谧溪谷','Quiet waterfall'],starlight:['星空夜色','Starry night'],blossom:['樱花微风','Cherry blossoms'],desert:['沙漠暮色','Desert dusk']};
 const tracks={
  ocean:{label:['海浪轻拍沙滩','Gentle ocean waves'],url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Oceanwavescrushing.ogg'},
  rain:{label:['轻柔雨声','Soft rainfall'],url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Sound_of_light_rainfall.ogg'},
  birds:{label:['清晨林间鸟鸣','Morning forest birds'],url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Birdsong_morning_01.ogg'},
  forest:{label:['森林环境声','Forest ambience'],url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/20090610_0_ambience.ogg'},
  brook:{label:['林间溪流','Forest brook'],url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Forest_lawn_creek.ogg'},
  fire:{label:['篝火轻响','Soft campfire'],url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Campfire_sound_ambience.ogg'},
  breeze:{label:['微风与鸟鸣','Gentle breeze & birds'],url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Gentle_breeze_and_birds_singing.ogg'}
 };
 const soundButtons=[...document.querySelectorAll('[data-sound]')],sceneButtons=[...document.querySelectorAll('[data-scene]')];
 const sceneCurrent=$('scene-current'),soundCurrent=$('sound-current');
 let stored={};
 try{
  const current=JSON.parse(window.localStorage.getItem(KEY)||'{}');
  const old=JSON.parse(window.localStorage.getItem(LEGACY_KEY)||'{}');
  stored={...(old&&typeof old==='object'?old:{}),...(current&&typeof current==='object'?current:{})};
 }catch(_){}
 const validScenes=Object.keys(sceneLabels),validSounds=['off',...Object.keys(tracks)];
 let scene=validScenes.includes(stored.scene)?stored.scene:'none';
 let selectedSound=validSounds.includes(stored.sound)?stored.sound:(stored.sound==='forest'?'birds':'off');
 let volumeLevel=Math.max(0,Math.min(100,Number.isFinite(Number(stored.volume))?Number(stored.volume):24));
 // Older preferences did not save playback intent. A selected recording should
 // resume on the next visit, while an explicit pause or Off remains silent.
 let playbackDesired=selectedSound!=='off'&&stored.enabled!==false;
 let audio=null,playbackState=selectedSound==='off'?'off':'paused';
 let playVersion=0,pendingPlay=null,removeAudioListeners=null,pageHidden=false,audioErrorTimer=null;
 function persist(){try{window.localStorage.setItem(KEY,JSON.stringify({scene,sound:selectedSound,volume:volumeLevel,enabled:playbackDesired}));return true;}catch(_){return false;}}
 function langIndex(){return document.documentElement.lang==='en'?1:0;}
 function labelForScene(id){return sceneLabels[id][langIndex()];}
 function labelForSound(id){return id==='off'?(langIndex()?'Off':'关闭'):tracks[id].label[langIndex()];}
 function updateSceneUI(){
  if(sceneCurrent)sceneCurrent.textContent=labelForScene(scene);
  sceneButtons.forEach(button=>{const active=button.dataset.scene===scene;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));});
 }
 function updateSoundUI(){
  const en=langIndex()===1;
  const status={loading:en?'Loading…':'加载中…',playing:en?'Playing':'正在播放',paused:en?'Paused · Play':'已暂停 · 点击播放',blocked:en?'Tap to enable':'点击页面开启',error:en?'Retry':'点击重试'}[playbackState];
  if(soundMenu){soundMenu.dataset.playbackState=playbackState;soundMenu.dataset.soundEnabled=String(playbackDesired);}
  if(soundCurrent){
   const label=labelForSound(selectedSound);
   soundCurrent.setAttribute('title',selectedSound==='off'?label:label+' · '+status);
   soundCurrent.textContent=playbackState==='blocked'?(en?'Tap to play':'点击开启声音'):(selectedSound==='off'||playbackState==='playing'?label:label+' · '+status);
  }
  soundButtons.forEach(button=>{
   const id=button.dataset.sound,active=id===selectedSound,state=button.querySelector('.sound-state');
   button.classList.toggle('is-selected',active);
   button.setAttribute('aria-pressed',String(active));
   if(state)state.textContent=id==='off'?(en?'Off':'关闭'):(active?status:(en?'Preview':'试听'));
  });
 }
 function setScene(value){
  scene=validScenes.includes(value)?value:'none';world.dataset.scene=scene;
  world.querySelectorAll('[data-scene-layer]').forEach(layer=>layer.classList.toggle('active',layer.dataset.sceneLayer===scene));
  world.classList.toggle('is-visible',scene!=='none');document.body.dataset.scene=scene;
  updateSceneUI();persist();
 }
 function setPlaybackState(state){playbackState=state;updateSoundUI();}
 function pageIsHidden(){return pageHidden||document.hidden;}
 function stopAudio(){
  // Invalidate outstanding play promises before pausing or replacing a source.
  playVersion++;pendingPlay=null;
  const previous=audio;audio=null;
  if(removeAudioListeners){removeAudioListeners();removeAudioListeners=null;}
  if(previous){previous.pause();previous.removeAttribute('src');previous.load();}
 }
 function pauseAudio(){
  const failed=playbackState==='error';
  playVersion++;pendingPlay=null;
  if(audio)audio.pause();
  setPlaybackState(selectedSound==='off'?'off':failed?'error':'paused');
 }
 function playbackFailed(error,element,version){
  if(audio!==element||version!==playVersion||!playbackDesired||pageHidden)return;
  pendingPlay=null;
  if(error&&error.name==='NotAllowedError'){
   // A browser policy block is recoverable with a tap, not a network failure.
   setPlaybackState('blocked');
  }else if(error&&error.name==='AbortError'){
   setPlaybackState('paused');
  }else{
   const alreadyReported=playbackState==='error';
   setPlaybackState('error');
   if(!alreadyReported)showAudioError();
  }
 }
 function createAudio(){
  const element=new Audio();
  element.preload='none';element.loop=true;element.volume=volumeLevel/100;element.src=tracks[selectedSound].url;
  const listeners={
   playing:()=>{
    if(audio!==element)return;
    if(!playbackDesired||pageHidden){element.pause();return;}
    pendingPlay=null;setPlaybackState('playing');
   },
   waiting:()=>{if(audio===element&&playbackDesired&&!element.paused&&!pageHidden)setPlaybackState('loading');},
   pause:()=>{if(audio===element&&element.paused&&playbackState!=='error')setPlaybackState(selectedSound==='off'?'off':'paused');},
   error:()=>playbackFailed(element.error,element,playVersion)
  };
  Object.entries(listeners).forEach(([name,handler])=>element.addEventListener(name,handler));
  removeAudioListeners=()=>Object.entries(listeners).forEach(([name,handler])=>element.removeEventListener(name,handler));
  audio=element;return element;
 }
 function requestPlayback(retryPending=false){
  if(!playbackDesired||selectedSound==='off'||pageIsHidden())return;
  if(audio&&playbackState==='playing'&&!audio.paused)return;
  if(pendingPlay&&!retryPending)return;
  const element=audio||createAudio(),version=++playVersion;
  pendingPlay={element,version};setPlaybackState('loading');
  // Keep play() in this synchronous call stack when invoked by a trusted input.
  // Do not await loading or a previous autoplay attempt before trying the tap.
  let result;
  try{result=element.play();}catch(error){playbackFailed(error,element,version);return;}
  if(result&&typeof result.then==='function')result.then(()=>{
   if(audio!==element||version!==playVersion)return;
   pendingPlay=null;
   if(!playbackDesired||pageHidden){element.pause();return;}
   // The playing event is authoritative; the resolved promise also covers a
   // media element that was already playing when this request was made.
   if(!element.paused&&element.readyState>=3)setPlaybackState('playing');
  }).catch(error=>playbackFailed(error,element,version));
 }
 function chooseSound(id){
  if(id==='off'){
   playbackDesired=false;selectedSound='off';persist();stopAudio();setPlaybackState('off');return;
  }
  if(!tracks[id])return;
  if(selectedSound===id&&playbackDesired&&(playbackState==='playing'||(playbackState==='loading'&&audio&&!audio.paused))){
   playbackDesired=false;persist();pauseAudio();return;
  }
  if(selectedSound!==id||playbackState==='error')stopAudio();
  selectedSound=id;playbackDesired=true;
  // Save the user's choice even if autoplay, connectivity or decoding fails.
  persist();requestPlayback(true);
 }
 function showAudioError(){
  const toast=$('toast'),label=$('toast-label');if(!toast||!label)return;
  label.textContent=langIndex()?'Could not play this recording. Try another sound or retry later.':'录音暂时无法播放，请换一种声音或稍后重试。';
  toast.classList.add('show');window.clearTimeout(audioErrorTimer);audioErrorTimer=window.setTimeout(()=>toast.classList.remove('show'),3500);
 }
 function setVolume(value){
  volumeLevel=Math.max(0,Math.min(100,Number(value)||0));volume.value=String(volumeLevel);
  volumeValue.value=volumeLevel+'%';volumeValue.textContent=volumeLevel+'%';
  if(audio)audio.volume=volumeLevel/100;persist();
 }
 function applyLanguage(){
  const en=langIndex()===1;
  document.querySelectorAll('[data-zh][data-en]').forEach(el=>{el.textContent=en?el.dataset.en:el.dataset.zh;});
  volume.setAttribute('aria-label',en?'Ambient volume':'环境音量');updateSceneUI();updateSoundUI();
 }
 // Close open pickers as soon as a session starts, so hidden menus do not
 // unexpectedly reappear in an expanded state when the user pauses.
 new MutationObserver(()=>{
  if(document.body.dataset.status==='running'){
   if(sceneMenu)sceneMenu.open=false;
   if(soundMenu)soundMenu.open=false;
  }
 }).observe(document.body,{attributes:true,attributeFilter:['data-status']});
 sceneButtons.forEach(button=>button.addEventListener('click',()=>{setScene(button.dataset.scene);if(sceneMenu)sceneMenu.open=false;}));
 soundButtons.forEach(button=>button.addEventListener('click',()=>chooseSound(button.dataset.sound)));
 volume.addEventListener('input',()=>setVolume(volume.value));
 document.addEventListener('click',event=>{
  if(!event.target.closest('.ambience-menu')){if(sceneMenu)sceneMenu.open=false;if(soundMenu)soundMenu.open=false;}
  else if(event.target.closest('#scene-menu')&&soundMenu)soundMenu.open=false;
  else if(event.target.closest('#sound-menu')&&sceneMenu)sceneMenu.open=false;
 });
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(sceneMenu)sceneMenu.open=false;if(soundMenu)soundMenu.open=false;}});
 function retryFromGesture(event){
  if(event.isTrusted===false||!playbackDesired||selectedSound==='off')return;
  // Sound buttons handle their own click so Off, pause and track changes win.
  if(event.target&&event.target.closest&&event.target.closest('[data-sound]'))return;
  if(event.type==='keydown'&&(event.repeat||event.ctrlKey||event.metaKey||event.altKey||['Escape','Tab','Shift','Control','Alt','Meta'].includes(event.key)))return;
  if(playbackState==='blocked'||playbackState==='paused'||(playbackState==='loading'&&audio&&audio.paused))requestPlayback(true);
 }
 document.addEventListener('click',retryFromGesture);
 document.addEventListener('touchend',retryFromGesture,{passive:true});
 document.addEventListener('keydown',retryFromGesture);
 function recoverPlayback(){
  if(!pageIsHidden()&&playbackDesired&&playbackState!=='error'&&(!audio||audio.paused))requestPlayback(true);
 }
 // A background tab may keep playing. Only recover if the browser itself
 // paused the recording; visibility alone must not interrupt ambient sound.
 document.addEventListener('visibilitychange',recoverPlayback);
 window.addEventListener('pagehide',event=>{
  pageHidden=true;pauseAudio();
  if(!event.persisted)stopAudio();
 });
 window.addEventListener('pageshow',()=>{
  pageHidden=false;
  recoverPlayback();
 });
 new MutationObserver(applyLanguage).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 setScene(scene);setVolume(volumeLevel);updateSoundUI();applyLanguage();
 requestPlayback();
})();
