/* Photographic ambience and real field recordings. No synthesized noise. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const world=$('ambient-world'),volume=$('ambient-volume'),volumeValue=$('ambient-volume-value');
 const sceneMenu=$('scene-menu'),soundMenu=$('sound-menu');
 if(!world||!volume||!volumeValue)return;
 const KEY='breathing-ambience-v2',LEGACY_KEY='breathing-ambience-v1';
 const sceneLabels={none:['关闭','Off'],sunset:['日落湖畔','Sunset lake'],ocean:['海浪与晚霞','Ocean at dusk'],mountain:['云海山顶','Sea of clouds'],cabin:['雨夜林中小屋','Forest cabin']};
 const tracks={
  ocean:{label:['海浪轻拍沙滩','Gentle ocean waves'],url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Oceanwavescrushing.ogg'},
  rain:{label:['轻柔雨声','Soft rainfall'],url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Sound_of_light_rainfall.ogg'},
  birds:{label:['清晨林间鸟鸣','Morning forest birds'],url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Birdsong_morning_01.ogg'}
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
 let audio=null,playing=false;
 function persist(){try{window.localStorage.setItem(KEY,JSON.stringify({scene,sound:selectedSound,volume:volumeLevel}));return true;}catch(_){return false;}}
 function langIndex(){return document.documentElement.lang==='en'?1:0;}
 function labelForScene(id){return sceneLabels[id][langIndex()];}
 function labelForSound(id){return id==='off'?(langIndex()?'Off':'关闭'):tracks[id].label[langIndex()];}
 function updateSceneUI(){
  if(sceneCurrent)sceneCurrent.textContent=labelForScene(scene);
  sceneButtons.forEach(button=>{const active=button.dataset.scene===scene;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));});
 }
 function updateSoundUI(){
  if(soundCurrent){
   const label=labelForSound(selectedSound);
   soundCurrent.textContent=playing?label:(selectedSound==='off'?label:(langIndex()?label+' · Play':label+' · 点击播放'));
  }
  soundButtons.forEach(button=>{
   const id=button.dataset.sound,active=id===selectedSound,state=button.querySelector('.sound-state');
   button.classList.toggle('is-selected',active);
   if(state)state.textContent=id==='off'?(langIndex()?'Off':'关闭'):(active?(playing?(langIndex()?'Playing':'正在播放'):(langIndex()?'Play':'点击播放')):(langIndex()?'Preview':'试听'));
  });
 }
 function setScene(value){
  scene=validScenes.includes(value)?value:'none';world.dataset.scene=scene;
  world.querySelectorAll('[data-scene-layer]').forEach(layer=>layer.classList.toggle('active',layer.dataset.sceneLayer===scene));
  world.classList.toggle('is-visible',scene!=='none');document.body.dataset.scene=scene;
  updateSceneUI();persist();
 }
 function stopAudio(reset=true){
  if(audio){audio.pause();if(reset){try{audio.currentTime=0}catch(_){}}audio.onerror=null;audio.removeAttribute('src');audio.load();audio=null;}
  playing=false;
 }
 async function chooseSound(id){
  if(id==='off'){stopAudio();selectedSound='off';updateSoundUI();persist();return;}
  if(!tracks[id])return;
  if(selectedSound===id&&audio){
   if(playing){audio.pause();playing=false;}
   else{try{await audio.play();playing=true;}catch(_){playing=false;showAudioError();}}
   updateSoundUI();persist();return;
  }
  stopAudio();selectedSound=id;audio=new Audio();audio.preload='none';audio.loop=true;audio.volume=volumeLevel/100;audio.src=tracks[id].url;
  audio.addEventListener('error',()=>{playing=false;updateSoundUI();showAudioError();});
  try{await audio.play();playing=true;updateSoundUI();persist();}
  catch(_){playing=false;updateSoundUI();showAudioError();}
 }
 function showAudioError(){
  const toast=$('toast'),label=$('toast-label');if(!toast||!label)return;
  label.textContent=langIndex()?'Could not load this recording. Check your connection and try again.':'录音加载失败，请检查网络后重试。';
  toast.classList.add('show');window.setTimeout(()=>toast.classList.remove('show'),3500);
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
 sceneButtons.forEach(button=>button.addEventListener('click',()=>{setScene(button.dataset.scene);if(sceneMenu)sceneMenu.open=false;}));
 soundButtons.forEach(button=>button.addEventListener('click',()=>chooseSound(button.dataset.sound)));
 volume.addEventListener('input',()=>setVolume(volume.value));
 document.addEventListener('click',event=>{
  if(!event.target.closest('.ambience-menu')){if(sceneMenu)sceneMenu.open=false;if(soundMenu)soundMenu.open=false;}
  else if(event.target.closest('#scene-menu')&&soundMenu)soundMenu.open=false;
  else if(event.target.closest('#sound-menu')&&sceneMenu)sceneMenu.open=false;
 });
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(sceneMenu)sceneMenu.open=false;if(soundMenu)soundMenu.open=false;}});
 new MutationObserver(applyLanguage).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 setScene(scene);setVolume(volumeLevel);updateSoundUI();applyLanguage();
 // Restore the selected track in the menu only; never autoplay after reload.
})();
