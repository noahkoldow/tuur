#!/usr/bin/env node
/** Local, offline preview: node scripts/preview-voices.mjs, then open /voices. Optional TUUR_PREVIEW_PORT. */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const appRoot = await realpath(resolve(root, 'apps/mobile/.expo/free-tier-preview'));
const audioRoot = resolve(root, 'apps/mobile/assets/voice-previews');
const mascotAssets = new Map(
  ['mara', 'jonas', 'linus'].flatMap((voice) =>
    ['01-hello', '02-map', '03-listen'].map((scene) => {
      const path = `${voice}/${scene}.png`;
      return [path, path];
    }),
  ),
);
const mascotRoot = resolve(root, 'apps/mobile/assets/mascot/voices');
const host = '127.0.0.1';
const requestedPort = process.env.TUUR_PREVIEW_PORT ?? '57811';
if (!/^\d{4,5}$/.test(requestedPort) || Number(requestedPort) < 1024 || Number(requestedPort) > 65535)
  throw new Error('TUUR_PREVIEW_PORT must be an integer from 1024 to 65535');
const port = Number(requestedPort);
const page = Buffer.from(
  `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#FBF7F0"><title>Tuu zeigt dir tuur</title>
${[...mascotAssets.keys()].map((path) => `<link rel="preload" href="/mascot/${path}" as="image">`).join('\n')}
<style>
:root{color-scheme:light;--red:#ED0516;--ink:#26221F;--muted:#7A716A;--cream:#FBF7F0;--line:#EAE3DB}
*{box-sizing:border-box}body{margin:0;background:#F2ECE3;color:var(--ink);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}button,a{-webkit-tap-highlight-color:transparent}button{font:inherit}button,a{touch-action:manipulation}button:focus-visible,a:focus-visible{outline:3px solid #27211C;outline-offset:4px}button{cursor:pointer}button:disabled{cursor:default}.screen{width:100%;max-width:440px;min-height:100svh;background:var(--cream);margin:auto;padding:20px 24px max(18px,env(safe-area-inset-bottom));overflow:hidden;position:relative}
.topbar{display:flex;align-items:center;justify-content:space-between;min-height:36px}.brand{color:var(--red);font-size:32px;line-height:1;font-weight:900;letter-spacing:-2px;text-decoration:none}.languages{display:flex;gap:2px;background:#F0E9E0;border-radius:30px;padding:3px}.languages button{border:0;background:none;border-radius:24px;padding:8px 12px;min-height:36px;font-size:12px;line-height:1;font-weight:750;color:var(--muted)}.languages button[aria-pressed="true"]{background:#fff;color:var(--ink);box-shadow:0 1px 4px #3E2E1712}
.intro{margin:24px 0 0;text-align:center}.eyebrow{color:#9C7561;font-size:10px;font-weight:750;letter-spacing:2px;text-transform:uppercase}.intro h1{font-size:29px;line-height:1.13;letter-spacing:-1.1px;font-weight:800;min-height:66px;max-width:320px;margin:10px auto 0;text-wrap:balance}
.stage{position:relative;height:clamp(240px,34svh,288px);margin:0 -10px;isolation:isolate}.halo{position:absolute;inset:4% 6% 0;border-radius:50%;background:radial-gradient(ellipse,#F5E2CC 0,#F9EDDB 52%,#FBF7F000 73%)}.screen[data-scene="1"] .halo{background:radial-gradient(ellipse,#DCE8D1 0,#EAF0DF 48%,#FBF7F000 73%)}.ground{position:absolute;bottom:2%;left:24%;width:52%;height:18px;border-radius:50%;background:#DAC5AF40;filter:blur(8px)}.mascot{position:absolute;bottom:0;left:50%;width:min(92%,290px);height:100%;object-fit:contain;opacity:0;transform:translateX(-50%) translateY(12px) scale(.94);transition:opacity .35s ease,transform .5s ease;filter:drop-shadow(0 9px 10px #61401D0A)}
.screen[data-scene="0"] .hello,.screen[data-scene="1"] .planning,.screen[data-scene="2"] .listening{opacity:1;transform:translateX(-50%) translateY(0) scale(1);animation:breathe 3.8s ease-in-out infinite}
.screen[data-playing="true"][data-scene="0"] .hello{animation:hello 2.4s ease-in-out infinite}.screen[data-playing="true"][data-scene="2"] .listening{animation:listen 2s ease-in-out infinite}
.spark{position:absolute;color:#D8AC76;font-size:21px;font-weight:400;animation:sparkle 3.4s ease-in-out infinite}.spark.one{left:12%;top:14%}.spark.two{right:10%;top:38%;font-size:13px;animation-delay:1s}.spark.three{right:21%;top:9%;font-size:9px;animation-delay:2s}
.hello-pill,.place-pill,.audio-pill{position:absolute;z-index:2;background:#FFFEFA;border:1px solid #F1E4D4;border-radius:16px;padding:9px 12px;box-shadow:0 5px 16px #6B4C1C09;font-size:12px;font-weight:700;opacity:0;transform:translateY(8px) rotate(-6deg);transition:opacity .3s,transform .4s}.hello-pill{left:3%;top:32%;font-size:16px}.place-pill{right:0;top:27%;display:flex;align-items:center;gap:7px;transform:translateY(8px) rotate(6deg)}.audio-pill{left:1%;top:42%;display:flex;align-items:center;gap:3px;height:40px;transform:translateY(8px) rotate(-7deg)}.audio-pill i{width:3px;border-radius:3px;background:var(--red);height:8px}.audio-pill i:nth-child(2),.audio-pill i:nth-child(4){height:17px}.audio-pill i:nth-child(3){height:24px}
.screen[data-scene="0"] .hello-pill,.screen[data-scene="1"] .place-pill,.screen[data-scene="2"] .audio-pill{opacity:1;transform:translateY(0) rotate(-5deg)}.screen[data-playing="true"] .audio-pill i{animation:equalize .8s ease-in-out infinite alternate}.audio-pill i:nth-child(2){animation-delay:.2s!important}.audio-pill i:nth-child(3){animation-delay:.4s!important}.audio-pill i:nth-child(4){animation-delay:.1s!important}
.route{position:absolute;inset:18% 0 0;width:100%;height:76%;opacity:0;transition:opacity .4s}.screen[data-scene="1"] .route{opacity:.65}.route path{stroke-dasharray:5 8;animation:route 10s linear infinite}.scene-dots{display:flex;justify-content:center;gap:6px;height:16px;align-items:center;margin:2px 0 18px}.scene-dots span{height:4px;width:13px;border-radius:4px;background:#E5D8C9;transition:width .3s,background .3s}.screen[data-scene="0"] .scene-dots span:nth-child(1),.screen[data-scene="1"] .scene-dots span:nth-child(2),.screen[data-scene="2"] .scene-dots span:nth-child(3){width:27px;background:var(--red)}
.voice-title{margin:0 0 9px;font-size:12px;font-weight:650;color:var(--muted);text-align:center}.voices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.voices button{border:1px solid var(--line);background:#FFFDFA;color:#756D66;border-radius:15px;min-height:45px;padding:10px 5px;font-size:14px;font-weight:650;transition:background .2s,border-color .2s}.voices button[aria-pressed="true"]{color:#B70A18;border-color:#ED0516;background:#FFF1EF;box-shadow:inset 0 0 0 .5px #ED0516}.voices button[aria-pressed="true"]:before{content:"";display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--red);vertical-align:3px;margin-right:7px}
.player{margin-top:16px;padding:0 1px}.play-row{display:flex;align-items:center;justify-content:space-between;gap:14px}.play-toggle{display:flex;gap:10px;align-items:center;border:0;padding:0;background:none;color:var(--ink);min-height:44px;font-size:13px;font-weight:650}.play-disc{display:grid;place-items:center;width:40px;height:40px;background:var(--red);border-radius:50%;color:white}.play-disc svg{width:17px;height:17px;fill:currentColor}.pause-icon{display:none}.screen[data-playing="true"] .pause-icon{display:block}.screen[data-playing="true"] .play-icon{display:none}.clock{font-size:11px;font-variant-numeric:tabular-nums;color:var(--muted);white-space:nowrap}progress{display:block;width:100%;height:4px;margin:11px 0 0;border:0;border-radius:5px;overflow:hidden;appearance:none;background:#E7DDD1}progress::-webkit-progress-bar{background:#E7DDD1;border-radius:5px}progress::-webkit-progress-value{background:var(--red);border-radius:5px}progress::-moz-progress-bar{background:var(--red);border-radius:5px}
.status{color:#84766A;min-height:17px;margin:8px 0 11px;text-align:center;font-size:11px;line-height:1.4}.status.error{color:#9B3D26}.actions{display:grid;gap:7px}.unlock,.continue{display:flex;align-items:center;justify-content:center;gap:8px;min-height:49px;padding:13px 12px;border-radius:15px;font-size:14px;font-weight:700;text-align:center;text-decoration:none}.unlock{background:var(--red);color:white;border:0;box-shadow:0 5px 14px #ED05161C}.unlock:hover{background:#D50413}.unlock svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8}.continue{background:transparent;border:1px solid #DDD2C5;color:#574C42;font-size:12px;transition:color .2s,border-color .2s}.continue:disabled{color:#9E9286;border-color:#E9E1D6}.continue:disabled .lock-icon{display:block}.lock-icon{display:none;width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:1.8}footer{text-align:center;font-size:10px;color:#A09385;margin-top:15px}
@keyframes breathe{0%,100%{transform:translateX(-50%) translateY(0) rotate(-1deg)}50%{transform:translateX(-50%) translateY(-5px) rotate(1deg)}}@keyframes hello{0%,100%{transform:translateX(-50%) translateY(0) rotate(-2deg)}50%{transform:translateX(-50%) translateY(-6px) rotate(2deg)}}@keyframes listen{0%,100%{transform:translateX(-50%) rotate(-2deg)}50%{transform:translateX(-50%) rotate(1.5deg)}}@keyframes sparkle{0%,100%{opacity:.35;transform:scale(.8)}50%{opacity:1;transform:scale(1.1)}}@keyframes equalize{to{transform:scaleY(.45)}}@keyframes route{to{stroke-dashoffset:-130}}
@media(min-width:600px){body{min-height:100svh;display:grid;place-items:center;padding:28px}.screen{min-height:0;border-radius:30px;padding:25px 30px 22px;box-shadow:0 20px 90px #61452E16;border:1px solid #E9DFD2}.stage{height:270px}.intro{margin-top:22px}}
@media(max-height:760px) and (max-width:599px){.screen{padding-top:13px}.intro{margin-top:17px}.intro h1{font-size:26px;min-height:58px}.stage{height:220px}.scene-dots{margin-bottom:12px}.player{margin-top:12px}footer{margin-top:10px}}
@media(min-width:600px) and (max-width:799px) and (max-height:760px){body{padding:12px}.screen{padding:16px 24px}.intro{margin-top:12px}.intro h1{font-size:25px;min-height:54px}.stage{height:165px}.scene-dots{margin-bottom:10px}.voice-title{display:none}.player{margin-top:10px}footer{margin-top:10px}}
@media(min-width:800px){body{padding:24px}.screen{max-width:860px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:40px;padding:28px 36px}.topbar{grid-column:1/-1;grid-row:1}.intro{grid-column:1;grid-row:2;margin-top:28px}.intro h1{font-size:31px;min-height:74px}.stage{grid-column:1;grid-row:3/8;height:320px;margin:0 -10px}.scene-dots{grid-column:1;grid-row:8;margin:5px 0 0}.voice-title{grid-column:2;grid-row:2;align-self:end;margin:0 0 12px}.voices{grid-column:2;grid-row:3}.player{grid-column:2;grid-row:4;margin-top:25px}.status{grid-column:2;grid-row:5;margin:12px 0 18px}.actions{grid-column:2;grid-row:6;gap:10px}.unlock,.continue{min-height:52px}footer{grid-column:2;grid-row:7;margin-top:18px;align-self:start}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}.mascot{transform:translateX(-50%)!important}}
</style></head><body>
<main class="screen" id="screen" data-scene="0" data-playing="false" data-voice="mara">
<nav class="topbar" aria-label="Hörprobe"><a class="brand" href="/voices" aria-label="tuur">tuur</a><div class="languages" role="group" aria-label="Sprache"><button type="button" data-lang="de" aria-pressed="true" lang="de">DE</button><button type="button" data-lang="en" aria-pressed="false" lang="en">EN</button></div></nav>
<header class="intro"><div class="eyebrow" id="eyebrow">Eine kleine Vorschau</div><h1 id="scene-title">Hey, ich bin Tuu.</h1></header>
<div class="stage" aria-hidden="true">
<div class="halo"></div><span class="spark one">✧</span><span class="spark two">✦</span><span class="spark three">✦</span>
<svg class="route" viewBox="0 0 360 240" fill="none"><path d="M18 148C54 94 110 206 156 169S209 43 283 80s68 78 39 91" stroke="#D6AA78" stroke-width="2"/><circle cx="19" cy="146" r="5" fill="#ED0516"/><circle cx="320" cy="171" r="5" fill="#ED0516"/></svg>
<div class="ground"></div><img class="mascot hello" src="/mascot/mara/01-hello.png" alt="" width="512" height="512"><img class="mascot planning" src="/mascot/mara/02-map.png" alt="" width="512" height="512"><img class="mascot listening" src="/mascot/mara/03-listen.png" alt="" width="512" height="512">
<span class="hello-pill" id="hello-pill">Hi!</span><span class="place-pill"><svg width="15" height="17" viewBox="0 0 16 20" fill="none"><path d="M8 19s7-8 7-12A7 7 0 0 0 1 7c0 4 7 12 7 12Z" fill="#ED0516"/><circle cx="8" cy="7" r="2.5" fill="white"/></svg><span id="place-pill">Orte entdecken</span></span><span class="audio-pill"><i></i><i></i><i></i><i></i><i></i></span>
</div>
<div class="scene-dots" aria-hidden="true"><span></span><span></span><span></span></div>
<p class="voice-title" id="voice-title">Wer soll dich begleiten?</p><div class="voices" role="group" aria-labelledby="voice-title"><button type="button" data-voice="mara" aria-pressed="true">Mara</button><button type="button" data-voice="jonas" aria-pressed="false">Jonas</button><button type="button" data-voice="lina" aria-pressed="false">Linus</button></div>
<section class="player" aria-label="Hörprobe"><div class="play-row"><button type="button" class="play-toggle" id="play"><span class="play-disc"><svg class="play-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3 17 10 6 17Z"/></svg><svg class="pause-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3h4v14H5zm7 0h4v14h-4z"/></svg></span><span id="play-label">Hörprobe starten</span></button><span class="clock" id="clock">0:00 / —</span></div><progress id="progress" value="0" max="1" aria-label="Fortschritt der Hörprobe"></progress></section>
<p class="status" id="status" role="status" aria-live="polite">Deine Stadt. Deine Lieblingsstimme.</p>
<div class="actions"><a class="unlock" href="/paywall?intent=pricing"><span id="unlock-label">Audio freischalten</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M10 4l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg></a><button type="button" class="continue" id="continue" disabled><svg class="lock-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="2"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg><span id="continue-label">Ohne Audioguide fortfahren</span></button></div>
<footer id="footer">KI-Stimmen · Kostenlose Hörprobe</footer>
<noscript><p>Für die Hörprobe bitte JavaScript aktivieren. <a href="/">Ohne Audioguide fortfahren</a></p></noscript>
</main>
<script>
(function(){
  'use strict';
  var copy={
    de:{eyebrow:'Eine kleine Vorschau',titles:['Hey, ich bin Tuu.','Jeder Ort erzählt was.','Lust, einfach zuzuhören?'],places:'Orte entdecken',voices:'Wer soll dich begleiten?',start:'Hörprobe starten',pause:'Pause',resume:'Weiterhören',replay:'Nochmal anhören',idle:'Deine Stadt. Deine Lieblingsstimme.',playing:'Schau dich um. Ich erzähle dir mehr.',paused:'Bereit, wenn du es bist.',done:'Und jetzt: raus und entdecken.',error:'Audio gerade nicht verfügbar. Du kannst fortfahren.',loading:'Die Hörprobe lädt …',unlock:'Audio freischalten',continue:'Ohne Audioguide fortfahren',footer:'KI-Stimmen · Kostenlose Hörprobe',progress:'Fortschritt der Hörprobe',language:'Sprache',audio:'Hörprobe'},
    en:{eyebrow:'A little preview',titles:['Hey, I’m Tuu.','Every place has a story.','Fancy just listening?'],places:'Discover places',voices:'Who’s coming along?',start:'Play voice preview',pause:'Pause',resume:'Keep listening',replay:'Listen again',idle:'Your city. Your favourite voice.',playing:'Have a look around. I’ll tell you more.',paused:'Ready when you are.',done:'Now, let’s go exploring.',error:'Audio is unavailable. You can continue.',loading:'Loading your preview …',unlock:'Unlock audio',continue:'Continue without audio guide',footer:'AI voices · Free preview',progress:'Voice preview progress',language:'Language',audio:'Voice preview'}
  };
  var screen=document.getElementById('screen'),play=document.getElementById('play'),next=document.getElementById('continue'),progress=document.getElementById('progress'),status=document.getElementById('status');
  var lang='de',voice='mara',audio=null,completed=false,unlocked=false,failed=false,loading=false,scene=0,stallTimer=null,loadToken=0;
  function words(){return copy[lang];}
  function clock(value){if(!Number.isFinite(value)||value<0)return '—';var seconds=Math.floor(value);return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');}
  function clearStall(){if(stallTimer!==null){clearTimeout(stallTimer);stallTimer=null;}}
  function render(){
    var text=words(),playing=Boolean(audio&&!audio.paused&&!audio.ended),duration=audio&&Number.isFinite(audio.duration)?audio.duration:0,current=audio&&Number.isFinite(audio.currentTime)?audio.currentTime:0,ratio=duration>0?Math.min(1,current/duration):0;
    if(screen.dataset.voice!==voice){
      var artVoice=voice==='lina'?'linus':voice;
      document.querySelector('.mascot.hello').src='/mascot/'+artVoice+'/01-hello.png';
      document.querySelector('.mascot.planning').src='/mascot/'+artVoice+'/02-map.png';
      document.querySelector('.mascot.listening').src='/mascot/'+artVoice+'/03-listen.png';
      screen.dataset.voice=voice;
    }
    scene=ratio<.18?0:ratio<.53?1:2;
    screen.dataset.scene=String(scene);screen.dataset.playing=String(playing&&!loading&&!failed);
    document.documentElement.lang=lang;
    document.getElementById('eyebrow').textContent=text.eyebrow;
    document.getElementById('scene-title').textContent=text.titles[scene];
    document.getElementById('place-pill').textContent=text.places;
    document.getElementById('voice-title').textContent=text.voices;
    document.getElementById('unlock-label').textContent=text.unlock;
    document.getElementById('continue-label').textContent=text.continue;
    document.getElementById('footer').textContent=text.footer;
    document.querySelector('.languages').setAttribute('aria-label',text.language);
    document.querySelector('.player').setAttribute('aria-label',text.audio);
    var label=playing?text.pause:completed&&!failed?text.replay:current>0?text.resume:text.start;
    document.getElementById('play-label').textContent=label;play.setAttribute('aria-label',label+' · '+({mara:'Mara',jonas:'Jonas',lina:'Linus'})[voice]);play.setAttribute('aria-pressed',String(playing));
    document.getElementById('clock').textContent=clock(current)+' / '+(duration?clock(duration):'—');
    progress.value=ratio;progress.setAttribute('aria-label',text.progress);
    var message=failed?text.error:loading?text.loading:completed?text.done:playing?text.playing:current>0?text.paused:text.idle;
    if(status.textContent!==message)status.textContent=message;status.classList.toggle('error',failed);
    next.disabled=!unlocked;
    document.querySelectorAll('[data-voice]').forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset.voice===voice));});
    document.querySelectorAll('[data-lang]').forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset.lang===lang));});
  }
  function failOpen(token){if(token!==loadToken)return;clearStall();loading=false;failed=true;unlocked=true;if(audio)audio.pause();render();}
  function guardLoading(token){clearStall();stallTimer=setTimeout(function(){failOpen(token);},12000);}
  function selectClip(autoplay){
    clearStall();loadToken+=1;var token=loadToken,previous=audio;
    audio=new Audio();var active=audio;
    completed=false;failed=false;loading=false;
    if(previous){previous.pause();previous.removeAttribute('src');previous.load();}
    active.preload='metadata';
    function on(name,callback){active.addEventListener(name,function(){if(token===loadToken)callback();});}
    on('loadedmetadata',render);
    on('durationchange',render);
    on('timeupdate',render);
    on('playing',function(){clearStall();loading=false;render();});
    on('pause',function(){if(!loading)clearStall();render();});
    on('waiting',function(){if(!active.paused){loading=true;guardLoading(token);render();}});
    on('stalled',function(){if(!active.paused){loading=true;guardLoading(token);render();}});
    on('error',function(){failOpen(token);});
    on('ended',function(){clearStall();loading=false;completed=true;unlocked=true;render();});
    active.src='/audio/'+voice+'-'+lang+'.mp3';
    active.load();render();
    if(autoplay)start();
  }
  function start(){
    if(failed){selectClip(true);return;}
    var token=loadToken;
    if(audio.ended){audio.currentTime=0;}
    loading=true;guardLoading(token);render();
    try{var pending=audio.play();if(pending&&pending.catch)pending.catch(function(){failOpen(token);});}catch(error){failOpen(token);}
  }
  play.addEventListener('click',function(){if(audio&&!audio.paused){loading=false;clearStall();audio.pause();render();}else start();});
  document.querySelectorAll('[data-voice]').forEach(function(button){button.addEventListener('click',function(){if(voice===button.dataset.voice)return;var resume=audio&&!audio.paused;voice=button.dataset.voice;selectClip(resume);});});
  document.querySelectorAll('[data-lang]').forEach(function(button){button.addEventListener('click',function(){if(lang===button.dataset.lang)return;var resume=audio&&!audio.paused;lang=button.dataset.lang;selectClip(resume);});});
  next.addEventListener('click',function(){if(unlocked)window.location.assign('/');});
  window.addEventListener('pagehide',function(){clearStall();if(audio)audio.pause();});
  selectClip(false);
})();
</script></body></html>`,
  'utf8',
);

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};
const within = (base, path) => {
  const name = relative(base, path);
  return name !== '..' && !name.startsWith('../') && !name.startsWith('..\\') && !isAbsolute(name);
};
async function serveFile(request, response, path) {
  const info = await stat(path);
  if (!info.isFile()) return false;
  let start = 0;
  let end = info.size - 1;
  let status = 200;
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Content-Type', contentTypes[extname(path).toLowerCase()] ?? 'application/octet-stream');
  if (request.headers.range) {
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
    if (range && (range[1] || range[2])) {
      start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
      end = range[1] && range[2] ? Math.min(Number(range[2]), end) : end;
    }
    if (
      !range ||
      (!range[1] && !range[2]) ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end ||
      start >= info.size
    ) {
      response.writeHead(416, { 'Content-Range': `bytes */${info.size}` });
      response.end();
      return true;
    }
    status = 206;
    response.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
  }
  response.writeHead(status, { 'Content-Length': info.size ? end - start + 1 : 0 });
  if (request.method === 'HEAD' || info.size === 0) response.end();
  else {
    const stream = createReadStream(path, { start, end });
    stream.on('error', () => response.destroy());
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  }
  return true;
}

const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'",
  );
  const reply = (code, message) => {
    response.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(request.method === 'HEAD' ? undefined : message);
  };
  if (![`${host}:${port}`, `localhost:${port}`].includes(request.headers.host))
    return reply(403, 'Local preview only');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return reply(405, 'Method not allowed');
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname);
    if (pathname.includes('\\') || pathname.includes('\0')) return reply(400, 'Invalid path');
    if (pathname === '/voices' || pathname === '/voices/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': page.length });
      return response.end(request.method === 'HEAD' ? undefined : page);
    }
    if (pathname.startsWith('/audio/')) {
      if (!/^\/audio\/(mara|jonas|lina)-(de|en)\.mp3$/.test(pathname)) return reply(404, 'Audio not found');
      await serveFile(request, response, resolve(audioRoot, pathname.slice('/audio/'.length)));
      return;
    }
    if (pathname.startsWith('/mascot/')) {
      const filename = mascotAssets.get(pathname.slice('/mascot/'.length));
      if (!filename) return reply(404, 'Mascot not found');
      await serveFile(request, response, resolve(mascotRoot, filename));
      return;
    }
    const candidate = resolve(appRoot, `.${pathname}`);
    if (!within(appRoot, candidate) || pathname.split('/').some((part) => part.startsWith('.')))
      return reply(404, 'Not found');
    try {
      const target = await realpath(candidate);
      if (!within(appRoot, target)) return reply(404, 'Not found');
      if (await serveFile(request, response, target)) return;
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    }
    if (extname(pathname)) return reply(404, 'Asset not found');
    await serveFile(request, response, resolve(appRoot, 'index.html'));
  } catch (error) {
    if (response.headersSent) response.destroy();
    else reply(error instanceof URIError ? 400 : error.code === 'ENOENT' ? 404 : 500, 'Preview unavailable');
  }
});
server.on('error', (error) => {
  console.error(`Preview could not start: ${error.code ?? error.message}`);
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.log(`Voice previews: http://${host}:${port}/voices`);
  console.log(`App pricing demo: http://${host}:${port}/paywall?intent=pricing`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
