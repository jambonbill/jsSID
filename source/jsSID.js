//jsSID by Hermit (Mihaly Horvath) : a javascript SID emulator and player for the Web Audio API
//(Year 2016) http://hermit.sidrip.com

function playSID(sidurl,subtune) { //convenience function to create default-named jsSID object and play in one call, easily includable as inline JS function call in HTML
 if (typeof SIDplayer === 'undefined') SIDplayer = new jsSID(16384,0.0005); //create the object if doesn't exist yet
 SIDplayer.loadstart(sidurl,subtune);
}

function jsSID (bufferlen, background_noise)
{
 this.author='Hermit'; this.sourcecode='http://hermit.sidrip.com'; this.version='0.9.1'; this.year='2016';
 
 //create Web Audio context and scriptNode at jsSID object initialization
 if ( typeof AudioContext !== 'undefined') { var jsSID_audioCtx = new AudioContext(); }
 else { var jsSID_audioCtx = new webkitAudioContext(); }
 var samplerate = jsSID_audioCtx.sampleRate; 
 if (typeof jsSID_audioCtx.createJavaScriptNode === 'function') 
 { var jsSID_scriptNode = jsSID_audioCtx.createJavaScriptNode(bufferlen,0,1); }
 else { var jsSID_scriptNode = jsSID_audioCtx.createScriptProcessor(bufferlen,0,1); }
 
 jsSID_scriptNode.onaudioprocess = function(e) { //scriptNode will be replaced by AudioWorker in new browsers sooner or later
  var outBuffer = e.outputBuffer; var outData = outBuffer.getChannelData(0); 
  for (var sample = 0; sample < outBuffer.length; sample++) { outData[sample]=play(); } 
 }
 
 
 //user functions callable from outside
 this.loadstart = function(sidurl,subt) { this.loadinit(sidurl,subt); if (startcallback!==null) startcallback(); this.playcont(); }
 this.loadinit = function(sidurl,subt) { loaded=0; this.pause(); initSID(); subtune=subt; //stop playback before loading new tune
  var request = new XMLHttpRequest(); request.open('GET',sidurl,true); request.responseType = 'arraybuffer';
  request.onload = function() { var filedata = new Uint8Array(request.response); //request.onreadystatechange=function(){ if (this.readyState!==4) return; ... could be used too
   var i,strend, offs=filedata[7]; loadaddr=filedata[8]+filedata[9]? filedata[8]*256+filedata[9] : filedata[offs]+filedata[offs+1]*256;
   for (i=0; i<32; i++) timermode[31-i] = filedata[0x12+(i>>3)] & Math.pow(2,7-i%8); for(i=0;i<memory.length;i++) memory[i]=0;
   for (i=offs+2; i<filedata.byteLength; i++) { if (loadaddr+i-(offs+2)<memory.length) memory[loadaddr+i-(offs+2)]=filedata[i]; } 
   strend=1; for(i=0; i<32; i++) { if(strend!=0) strend=SIDtitle[i]=filedata[0x16+i]; else strend=SIDtitle[i]=0; } 
   strend=1; for(i=0; i<32; i++) { if(strend!=0) strend=SIDauthor[i]=filedata[0x36+i]; else strend=SIDauthor[i]=0; } 
   strend=1; for(i=0; i<32; i++) { if(strend!=0) strend=SIDinfo[i]=filedata[0x56+i]; else strend=SIDinfo[i]=0; } 
   initaddr=filedata[0xA]+filedata[0xB]? filedata[0xA]*256+filedata[0xB] : loadaddr; playaddr=playaddf=filedata[0xC]*256+filedata[0xD]; 
   subtune_amount=filedata[0xF]; preferred_SID_model[0] = (filedata[0x77]&0x30)>=0x20? 8580 : 6581; 
   preferred_SID_model[1] = (filedata[0x77]&0xC0)>=0x80 ? 8580 : 6581; preferred_SID_model[2] = (filedata[0x76]&3)>=3 ? 8580 : 6581; 
   SID_address[1] = filedata[0x7A]>=0x42 && (filedata[0x7A]<0x80 || filedata[0x7A]>=0xE0) ? 0xD000+filedata[0x7A]*16 : 0;
   SID_address[2] = filedata[0x7B]>=0x42 && (filedata[0x7B]<0x80 || filedata[0x7B]>=0xE0) ? 0xD000+filedata[0x7B]*16 : 0;
   SIDamount=1+(SID_address[1]>0)+(SID_address[2]>0);
   loaded=1;  if (loadcallback!==null) loadcallback();  init(subtune); };   
  request.send(null); 
 } 
 this.start = function(subt) { init(subt); if (startcallback!==null) startcallback(); this.playcont(); }
 this.playcont = function() { jsSID_scriptNode.connect(jsSID_audioCtx.destination); }
 this.pause = function() { if (loaded && initialized) jsSID_scriptNode.disconnect(jsSID_audioCtx.destination); }
 this.stop = function() { this.pause(); init(subtune); }
 this.gettitle = function() { return String.fromCharCode.apply(null,SIDtitle); }
 this.getauthor = function() { return String.fromCharCode.apply(null,SIDauthor); }
 this.getinfo = function() { return String.fromCharCode.apply(null,SIDinfo); }
 this.getsubtunes = function () { return subtune_amount; }
 this.getprefmodel = function() { return preferred_SID_model[0]; }
 this.getmodel = function() { return SID_model; }
 this.getoutput = function() { return (output/OUTPUT_SCALEDOWN)*(memory[0xD418]&0xF); }
 this.getplaytime = function() { return parseInt(playtime); } 
 this.setmodel = function(model) { SID_model = model; }
 this.setvolume = function(vol) { volume = vol; }
 this.setloadcallback = function(fname) { loadcallback=fname; }
 this.setstartcallback = function(fname) { startcallback=fname; }
 this.setendcallback = function(fname,seconds) { endcallback=fname; playlength=seconds; }
 
 var //emulated machine constants
 C64_PAL_CPUCLK = 985248, //Hz
 PAL_FRAMERATE = 50, //NTSC_FRAMERATE = 60;
 SID_CHANNEL_AMOUNT = 3,
 OUTPUT_SCALEDOWN = 0x10000 * SID_CHANNEL_AMOUNT * 16;
 var SIDamount_vol=[0,  1, 0.6, 0.4]; //how much to attenuate with more 2SID/3SID to avoid master-output overflows
 
 //SID playback related arrays/variables
 var SIDtitle = new Uint8Array(0x20); var SIDauthor = new Uint8Array(0x20); var SIDinfo = new Uint8Array(0x20); var timermode = new Uint8Array(0x20);
 var loadaddr=0x1000, initaddr=0x1000, playaddf=0x1003, playaddr=0x1003, subtune = 0, subtune_amount=1, playlength=0; //framespeed = 1; 
 var preferred_SID_model=[8580.0,8580.0,8580.0]; var SID_model=8580.0; var SID_address=[0xD400,0,0];
 var memory = new Uint8Array(65536); //for(var i=0;i<memory.length;i++) memory[i]=0;
 var loaded=0, initialized=0, finished=0, loadcallback=null, startcallback=null; endcallback=null, playtime=0, ended=0;
 var clk_ratio = C64_PAL_CPUCLK/samplerate;
 var frame_sampleperiod = samplerate/PAL_FRAMERATE; //samplerate/(PAL_FRAMERATE*framespeed);
 var framecnt=1, volume=1.0, CPUtime=0, pPC;
 var SIDamount=1, mix=0;
 
 function init(subt) { 
  if (loaded) { initialized=0; subtune = subt; initCPU(initaddr); initSID(); A=subtune; memory[1]=0x37; memory[0xDC05]=0;
   for(var timeout=100000;timeout>=0;timeout--) { if (CPU()) break; } 
   if (timermode[subtune] || memory[0xDC05]) { //&& playaddf {   //CIA timing
    if (!memory[0xDC05]) {memory[0xDC04]=0x24; memory[0xDC05]=0x40;} frame_sampleperiod = (memory[0xDC04]+memory[0xDC05]*256)/clk_ratio; }
   else frame_sampleperiod = samplerate/PAL_FRAMERATE; //Vsync timing
   //frame_sampleperiod = (memory[0xDC05]!=0 || (!timermode[subtune] && playaddf))? samplerate/PAL_FRAMERATE : (memory[0xDC04] + memory[0xDC05]*256) / clk_ratio; 
   if(playaddf==0) playaddr = ((memory[1]&3)<2)? memory[0xFFFE]+memory[0xFFFF]*256 : memory[0x314]+memory[0x315]*256; 
   else { playaddr=playaddf; if (playaddr>=0xE000 && memory[1]==0x37) memory[1]=0x35; } //player under KERNAL (Crystal Kingdom Dizzy)
   initCPU(playaddr); framecnt=1; finished=0; CPUtime=0; playtime=0; ended=0; initialized=1;  }
 }
 
 function play() { //called internally by the Web Audio API scriptNode callback; handles SID-register reading/processing and SID emulation
  if (loaded && initialized) { framecnt--; playtime+=1/samplerate;
   if (framecnt<=0) { framecnt=frame_sampleperiod; finished=0; PC=playaddr; SP=0xFF; }
   if (finished==0) {
    while(CPUtime<=clk_ratio) { pPC=PC;
     if (CPU()>=0xFE) { finished=1; break; }  else CPUtime+=cycles;
     if ( (memory[1]&3)>1 && pPC<0xE000 && (PC==0xEA31 || PC==0xEA81)) { finished=1; break; } //IRQ player ROM return handling
     if ( (addr==0xDC05 || addr==0xDC04) && (memory[1]&3) && timermode[subtune] ) frame_sampleperiod = (memory[0xDC04] + memory[0xDC05]*256) / clk_ratio; //Galway/Rubicon workaround
     if(storadd>=0xD420 && storadd<0xD800 && (memory[1]&3)) {  //CJ in the USA workaround (writing above $d420, except SID2/SID3)
      if ( !(SID_address[1]<=storadd && storadd<SID_address[1]+0x1F) && !(SID_address[2]<=storadd && storadd<SID_address[2]+0x1F) )
       memory[storadd&0xD41F]=memory[storadd]; }
     if(addr==0xD404 && !(memory[0xD404]&1)) ADSRstate[0]&=0x3E; if(addr==0xD40B && !(memory[0xD40B]&1)) ADSRstate[1]&=0x3E; if(addr==0xD412 && !(memory[0xD412]&1)) ADSRstate[2]&=0x3E; //Whittaker player workaround
    }  CPUtime-=clk_ratio;
  }} 
  if (playlength>0 && parseInt(playtime)==parseInt(playlength) && endcallback!==null && ended==0) {ended=1; endcallback();}
  mix = SID(0,0xD400); if (SID_address[1]) mix += SID(1,SID_address[1]); if(SID_address[2]) mix += SID(2,SID_address[2]);
  return mix * volume * SIDamount_vol[SIDamount] + (Math.random()*background_noise-background_noise/2); 
 }
 
 
 var //CPU (and CIA/VIC-IRQ) emulation constants and variables
 flagsw=[0x01,0x21,0x04,0x24,0x00,0x40,0x08,0x28], branchflag=[0x80,0x40,0x01,0x02];
 var PC=0, A=0, T=0, X=0, Y=0, SP=0xFF, IR=0, addr=0, ST=0x00, cycles=0, storadd=0; //STATUS-flags: N V - B D I Z C
 function initCPU (mempos) { PC=mempos; A=0; X=0; Y=0; ST=0; SP=0xFF; } 
 
 function CPU () //the CPU emulation for SID/PRG playback (ToDo: CIA/VIC-IRQ/NMI/RESET vectors, BCD-mode)
 {
  IR=memory[PC]; cycles=2; storadd=0; //'cycle': ensure smallest 6510 runtime (for implied/register instructions)
  if(IR&1) {  //nybble2:  1/5/9/D:accu.instructions, 3/7/B/F:illegal opcodes
   switch (IR&0x1F) { //addressing modes (begin with more complex cases), PC wraparound not handled inside to save codespace
    case 1: case 3: addr = memory[memory[++PC]+X] + memory[memory[PC]+X+1]*256; cycles=6; break; //(zp,x)
    case 0x11: case 0x13: addr = memory[memory[++PC]] + memory[memory[PC]+1]*256 + Y; cycles=6; break; //(zp),y
    case 0x19: case 0x1F: addr = memory[++PC] + memory[++PC]*256 + Y; cycles=5; break; //abs,y
    case 0x1D: addr = memory[++PC] + memory[++PC]*256 + X; cycles=5; break; //abs,x
    case 0xD: case 0xF: addr = memory[++PC] + memory[++PC]*256; cycles=4; break; //abs
    case 0x15: addr = memory[++PC] + X; cycles=4; break; //zp,x
    case 5: case 7: addr = memory[++PC]; cycles=3; break; //zp
    case 0x17: addr = memory[++PC] + Y; cycles=4; break; //zp,y for LAX/SAX illegal opcodes
    case 9: case 0xB: addr = ++PC; cycles=2;  }  addr&=0xFFFF;  //immediate
   switch (IR&0xE0) {
    case 0x60: T=A; A+=memory[addr]+(ST&1); ST&=20; ST|=(A&128)|(A>255); A&=0xFF; ST|=(!A)<<1 | (!((T^memory[addr])&0x80) && ((T^A)&0x80))>>1; break; //ADC
    case 0xE0: T=A; A-=memory[addr]+!(ST&1); ST&=20; ST|=(A&128)|(A>=0); A&=0xFF; ST|=(!A)<<1 | (((T^memory[addr])&0x80) && ((T^A)&0x80))>>1; break; //SBC
    case 0xC0: T=A-memory[addr]; ST&=124;ST|=(!(T&0xFF))<<1|(T&128)|(T>=0); break; //CMP
    case 0x00: A|=memory[addr]; ST&=125;ST|=(!A)<<1|(A&128); break; //ORA 
    case 0x20: A&=memory[addr]; ST&=125;ST|=(!A)<<1|(A&128); break; //AND
    case 0x40: A^=memory[addr]; ST&=125;ST|=(!A)<<1|(A&128); break; //EOR
    case 0xA0: A=memory[addr]; ST&=125;ST|=(!A)<<1|(A&128); if((IR&3)==3) X=A; break; //LDA / LAX (illegal, used by my 1 rasterline player)
    case 0x80: memory[addr]=A & (((IR&3)==3)?X:0xFF); storadd=addr;  } }  //STA / SAX (illegal)
  else if(IR&2) {  //nybble2:  2:illegal/LDX, 6:A/X/INC/DEC, A:Accu-shift/reg.transfer/NOP, E:shift/X/INC/DEC
   switch (IR&0x1F) { //addressing modes
    case 0x1E: addr = memory[++PC] + memory[++PC]*256 + ( ((IR&0xC0)!=0x80) ? X:Y ); cycles=5; break; //abs,x / abs,y
    case 0xE: addr = memory[++PC] + memory[++PC]*256; cycles=4; break; //abs
    case 0x16: addr = memory[++PC] + ( ((IR&0xC0)!=0x80) ? X:Y ); cycles=4; break; //zp,x / zp,y
    case 6: addr = memory[++PC]; cycles=3; break; //zp
    case 2: addr = ++PC; cycles=2;  }  addr&=0xFFFF;  //imm.
   switch (IR&0xE0) {
    case 0x00: ST&=0xFE; case 0x20: if((IR&0xF)==0xA) { A=(A<<1)+(ST&1); ST&=60;ST|=(A&128)|(A>255); A&=0xFF; ST|=(!A)<<1; } //ASL/ROL (Accu)
      else { T=(memory[addr]<<1)+(ST&1); ST&=60;ST|=(T&128)|(T>255); T&=0xFF; ST|=(!T)<<1; memory[addr]=T; cycles+=2; }  break; //RMW (Read-Write-Modify)
    case 0x40: ST&=0xFE; case 0x60: if((IR&0xF)==0xA) { T=A; A=(A>>1)+(ST&1)*128; ST&=60;ST|=(A&128)|(T&1); A&=0xFF; ST|=(!A)<<1; } //LSR/ROR (Accu)
      else { T=(memory[addr]>>1)+(ST&1)*128; ST&=60;ST|=(T&128)|(memory[addr]&1); T&=0xFF; ST|=(!T)<<1; memory[addr]=T; cycles+=2; }  break; //RMW
    case 0xC0: if(IR&4) { memory[addr]--; memory[addr]&=0xFF; ST&=125;ST|=(!memory[addr])<<1|(memory[addr]&128); cycles+=2; } //DEC
      else {X--; X&=0xFF; ST&=125;ST|=(!X)<<1|(X&128);}  break; //DEX
    case 0xA0: if((IR&0xF)!=0xA) X=memory[addr];  else if(IR&0x10) {X=SP;break;}  else X=A;  ST&=125;ST|=(!X)<<1|(X&128);  break; //LDX/TSX/TAX
    case 0x80: if(IR&4) {memory[addr]=X;storadd=addr;}  else if(IR&0x10) SP=X;  else {A=X; ST&=125;ST|=(!A)<<1|(A&128);}  break; //STX/TXS/TXA
    case 0xE0: if(IR&4) { memory[addr]++; memory[addr]&=0xFF; ST&=125;ST|=(!memory[addr])<<1|(memory[addr]&128); cycles+=2; }  } } //INC/NOP
  else if((IR&0xC)==8) {  //nybble2:  8:register/status
   switch (IR&0xF0) {
    case 0x60: SP++; SP&=0xFF; A=memory[0x100+SP]; ST&=125;ST|=(!A)<<1|(A&128); cycles=4; break; //PLA
    case 0xC0: Y++; Y&=0xFF; ST&=125;ST|=(!Y)<<1|(Y&128); break; //INY
    case 0xE0: X++; X&=0xFF; ST&=125;ST|=(!X)<<1|(X&128); break; //INX
    case 0x80: Y--; Y&=0xFF; ST&=125;ST|=(!Y)<<1|(Y&128); break; //DEY
    case 0x00: memory[0x100+SP]=ST; SP--; SP&=0xFF; cycles=3; break; //PHP
    case 0x20: SP++; SP&=0xFF; ST=memory[0x100+SP]; cycles=4; break; //PLP
    case 0x40: memory[0x100+SP]=A; SP--; SP&=0xFF; cycles=3; break; //PHA
    case 0x90: A=Y; ST&=125;ST|=(!A)<<1|(A&128); break; //TYA
    case 0xA0: Y=A; ST&=125;ST|=(!Y)<<1|(Y&128); break; //TAY
    default: if(flagsw[IR>>5]&0x20) ST|=(flagsw[IR>>5]&0xDF); else ST&=255-(flagsw[IR>>5]&0xDF);  } } //CLC/SEC/CLI/SEI/CLV/CLD/SED
  else {  //nybble2:  0: control/branch/Y/compare  4: Y/compare  C:Y/compare/JMP
   if ((IR&0x1F)==0x10) { PC++; T=memory[PC]; if(T&0x80) T-=0x100; //BPL/BMI/BVC/BVS/BCC/BCS/BNE/BEQ  relative branch 
    if(IR&0x20) {if (ST&branchflag[IR>>6]) {PC+=T;cycles=3;}} else {if (!(ST&branchflag[IR>>6])) {PC+=T;cycles=3;}}  } 
   else {  //nybble2:  0:Y/control/Y/compare  4:Y/compare  C:Y/compare/JMP
    switch (IR&0x1F) { //addressing modes
     case 0: addr = ++PC; cycles=2; break; //imm. (or abs.low for JSR/BRK)
     case 0x1C: addr = memory[++PC] + memory[++PC]*256 + X; cycles=5; break; //abs,x
     case 0xC: addr = memory[++PC] + memory[++PC]*256; cycles=4; break; //abs
     case 0x14: addr = memory[++PC] + X; cycles=4; break; //zp,x
     case 4: addr = memory[++PC]; cycles=3;  }  addr&=0xFFFF;  //zp
    switch (IR&0xE0) {
     case 0x00: memory[0x100+SP]=PC%256; SP--;SP&=0xFF; memory[0x100+SP]=PC/256;  SP--;SP&=0xFF; memory[0x100+SP]=ST; SP--;SP&=0xFF; 
       PC = memory[0xFFFE]+memory[0xFFFF]*256-1; cycles=7; break; //BRK
     case 0x20: if(IR&0xF) { ST &= 0x3D; ST |= (memory[addr]&0xC0) | ( !(A&memory[addr]) )<<1; } //BIT
      else { memory[0x100+SP]=(PC+2)%256; SP--;SP&=0xFF; memory[0x100+SP]=(PC+2)/256;  SP--;SP&=0xFF; PC=memory[addr]+memory[addr+1]*256-1; cycles=6; }  break; //JSR
     case 0x40: if(IR&0xF) { PC = addr-1; cycles=3; } //JMP
      else { if(SP>=0xFF) return 0xFE; SP++;SP&=0xFF; ST=memory[0x100+SP]; SP++;SP&=0xFF; T=memory[0x100+SP]; SP++;SP&=0xFF; PC=memory[0x100+SP]+T*256-1; cycles=6; }  break; //RTI
     case 0x60: if(IR&0xF) { PC = memory[addr]+memory[addr+1]*256-1; cycles=5; } //JMP() (indirect)
      else { if(SP>=0xFF) return 0xFF; SP++;SP&=0xFF; T=memory[0x100+SP]; SP++;SP&=0xFF; PC=memory[0x100+SP]+T*256-1; cycles=6; }  break; //RTS
     case 0xC0: T=Y-memory[addr]; ST&=124;ST|=(!(T&0xFF))<<1|(T&128)|(T>=0); break; //CPY
     case 0xE0: T=X-memory[addr]; ST&=124;ST|=(!(T&0xFF))<<1|(T&128)|(T>=0); break; //CPX
     case 0xA0: Y=memory[addr]; ST&=125;ST|=(!Y)<<1|(Y&128); break; //LDY
     case 0x80: memory[addr]=Y; storadd=addr;  }  }  }  //STY
  PC++; PC&=0xFFFF; return 0; //memory[addr]&=0xFF; 
 } 
 
  
 var //SID emulation constants and variables
 GATE_BITMASK=0x01, SYNC_BITMASK=0x02, RING_BITMASK=0x04, TEST_BITMASK=0x08, TRI_BITMASK=0x10, SAW_BITMASK=0x20, PULSE_BITMASK=0x40, NOISE_BITMASK=0x80,
 HOLDZERO_BITMASK=0x10, DECAYSUSTAIN_BITMASK=0x40, ATTACK_BITMASK=0x80, 
 FILTSW = [1,2,4,1,2,4,1,2,4], LOWPASS_BITMASK=0x10, BANDPASS_BITMASK=0x20, HIGHPASS_BITMASK=0x40, OFF3_BITMASK=0x80;
 var ADSRstate = [0,0,0,0,0,0,0,0,0], ratecnt = [0,0,0,0,0,0,0,0,0], envcnt = [0,0,0,0,0,0,0,0,0], expcnt = [0,0,0,0,0,0,0,0,0], prevSR = [0,0,0,0,0,0,0,0,0];
 var phaseaccu = [0,0,0,0,0,0,0,0,0], prevaccu = [0,0,0,0,0,0,0,0,0], sourceMSBrise=[0,0,0], sourceMSB=[0,0,0]; 
 var noise_LFSR = [0x7FFFF8,0x7FFFF8,0x7FFFF8,0x7FFFF8,0x7FFFF8,0x7FFFF8,0x7FFFF8,0x7FFFF8,0x7FFFF8];
 var prevwfout = [0,0,0,0,0,0,0,0,0], prevwavdata = [0,0,0,0,0,0,0,0,0], combiwf;
 var prevlowpass=[0,0,0], prevbandpass=[0,0,0], cutoff_ratio_8580 = -2*3.14*(12500/256)/samplerate, cutoff_ratio_6581 = -2*3.14*(20000/256)/samplerate;
 var prevgate, chnadd, ctrl, wf, test, period, step, SR, accuadd, MSB, tmp, pw, lim, wfout, cutoff, resonance, filtin, output;
 //registers: 0:freql1  1:freqh1  2:pwml1  3:pwmh1  4:ctrl1  5:ad1   6:sr1  7:freql2  8:freqh2  9:pwml2 10:pwmh2 11:ctrl2 12:ad2  13:sr 14:freql3 15:freqh3 16:pwml3 17:pwmh3 18:ctrl3 19:ad3  20:sr3  
 //           21:cutoffl 22:cutoffh 23:flsw_reso 24:vol_ftype 25:potX 26:potY 27:OSC3 28:ENV3
 function initSID() { for(var i=0xD400;i<=0xD7FF;i++) memory[i]=0; for(var i=0xDE00;i<=0xDFFF;i++) memory[i]=0;
  for(var i=0;i<9;i++) {ADSRstate[i]=HOLDZERO_BITMASK; ratecnt[i]=envcnt[i]=expcnt[i]=prevSR[i]=0;} }
 
 function SID (num,SIDaddr) //the SID emulation itself ('num' is the number of SID to iterate (0..2)
 {  
  filtin=0; output=0;
  for (var channel = num*SID_CHANNEL_AMOUNT;  channel < (num+1)*SID_CHANNEL_AMOUNT;  channel++) 
  {
   prevgate=(ADSRstate[channel]&GATE_BITMASK); chnadd=SIDaddr+(channel-num*SID_CHANNEL_AMOUNT)*7, ctrl=memory[chnadd+4]; wf=ctrl&0xF0; test=ctrl&TEST_BITMASK; SR=memory[chnadd+6]; tmp=0;
   //ADSR envelope generator:
   if ( prevgate != (ctrl&GATE_BITMASK) ) { //gatebit-change?   
    if (prevgate) { ADSRstate[channel] &= 0xFF-(GATE_BITMASK|ATTACK_BITMASK|DECAYSUSTAIN_BITMASK); } //falling edge
    else { ADSRstate[channel] = (GATE_BITMASK|ATTACK_BITMASK|DECAYSUSTAIN_BITMASK); //rising edge, also sets hold_zero_bit=0
     if ( (SR&0xF) > (prevSR[channel]&0xF) ) tmp=1; } }  prevSR[channel]=SR; //if(SR&0xF) ratecnt[channel]+=5;  //assume SR->GATE write order: workaround to have crisp soundstarts by triggering delay-bug
   ratecnt[channel] += clk_ratio; if (ratecnt[channel] >= 0x8000) ratecnt[channel] -= 0x8000; //can wrap around (ADSR delay-bug: short 1st frame)
   if (ADSRstate[channel]&ATTACK_BITMASK) { step = memory[chnadd+5]>>4; period = ADSRperiods[step]; }
   else if (ADSRstate[channel]&DECAYSUSTAIN_BITMASK) { step = memory[chnadd+5]&0xF; period = ADSRperiods[step]; }
   else { step = SR&0xF; period = ADSRperiods[step]; }     step=ADSRstep[step]; 
   if (ratecnt[channel] >= period && ratecnt[channel] < period+clk_ratio && tmp==0) { //ratecounter shot (matches rateperiod) (in genuine SID ratecounter is LFSR)
    ratecnt[channel] -= period;  //compensation for timing instead of simply setting 0 on rate-counter overload
    if ( (ADSRstate[channel]&ATTACK_BITMASK)  ||  ++expcnt[channel] == ADSR_exptable[ envcnt[channel] ] ) {
     if ( !(ADSRstate[channel]&HOLDZERO_BITMASK) ) {
      if (ADSRstate[channel]&ATTACK_BITMASK) { envcnt[channel]+=step; if (envcnt[channel]>=0xFF) { envcnt[channel]=0xFF; ADSRstate[channel] &= 0xFF-ATTACK_BITMASK; } }
      else if ( !(ADSRstate[channel]&DECAYSUSTAIN_BITMASK)  ||  envcnt[channel] > (SR>>4)+(SR&0xF0) )
      { envcnt[channel]-=step; if (envcnt[channel]<=0 && envcnt[channel]+step!=0) { envcnt[channel]=0; ADSRstate[channel] |= HOLDZERO_BITMASK; } }  }
     expcnt[channel] = 0;  }  }
   envcnt[channel]&=0xFF; //'envcnt' may wrap around in some cases, mostly 0 -> FF (e.g.: Cloudless Rain, Boombox Alley)
   //WAVE generation codes (phase accumulator and waveform-selector):
   accuadd=(memory[chnadd]+memory[chnadd+1]*256)*clk_ratio; 
   if (  test  ||  ( (ctrl&SYNC_BITMASK) && sourceMSBrise[num] )  ) { phaseaccu[channel]=0; }
   else { phaseaccu[channel] += accuadd; if (phaseaccu[channel]>0xFFFFFF) phaseaccu[channel] -= 0x1000000; } 
   MSB = phaseaccu[channel]&0x800000; sourceMSBrise[num] = ( MSB > (prevaccu[channel]&0x800000))?1:0; //phaseaccu[channel] &= 0xFFFFFF;
   if (wf&NOISE_BITMASK) { tmp=noise_LFSR[channel];
    if (((phaseaccu[channel]&0x100000) != (prevaccu[channel]&0x100000)) || accuadd>=0x100000) { //clock LFSR all time if clockrate exceeds observable at given samplerate
     step=(tmp&0x400000)^((tmp&0x20000)<<5) ; tmp = ((tmp<<1)+(step>0||test)) & 0x7FFFFF; noise_LFSR[channel]=tmp; }   
    wfout = (wf&0x70)?0: ((tmp&0x100000)>>5)+((tmp&0x40000)>>4)+((tmp&0x4000)>>1)+((tmp&0x800)<<1)+((tmp&0x200)<<2)+((tmp&0x20)<<5)+((tmp&0x04)<<7)+((tmp&0x01)<<8); }
   else if (wf&PULSE_BITMASK) { 
    pw=(memory[chnadd+2]+(memory[chnadd+3]&0xF)*256)*16; tmp=accuadd>>9; if (0<pw && pw<tmp) pw=tmp; tmp^=0xFFFF; if(pw>tmp) pw=tmp; tmp=phaseaccu[channel]>>8;
    if (wf==PULSE_BITMASK) { step=256/(accuadd>>16); //simple pulse, most often used waveform, make it sound as clean as possible without oversampling
     if (test) wfout=0xFFFF;
     else if (tmp < pw) { lim = (0xFFFF-pw)*step; if (lim>0xFFFF) lim=0xFFFF; wfout = lim - (pw-tmp)*step; if (wfout<0) wfout=0; } //rising edge
     else { lim = pw*step; if (lim>0xFFFF) lim=0xFFFF; wfout = (0xFFFF-tmp)*step - lim; if (wfout>=0) wfout=0xFFFF; wfout&=0xFFFF; }  } //falling edge
    else { //combined pulse
     wfout = (tmp >= pw || test) ? 0xFFFF:0; //(this would be enough for simple but aliased-at-high-pitches pulse)
     if (wf&TRI_BITMASK) { 
      if (wf&SAW_BITMASK) { wfout = (wfout)? combinedWF(channel,PulseTriSaw_8580,tmp>>4,1) : 0; } //pulse+saw+triangle (waveform nearly identical to tri+saw)
      else { tmp=phaseaccu[channel]^(ctrl&RING_BITMASK?sourceMSB[num]:0); wfout = (wfout)? combinedWF(channel,PulseSaw_8580,(tmp^(tmp&0x800000?0xFFFFFF:0))>>11,0) : 0; } } //pulse+triangle
     else if (wf&SAW_BITMASK) wfout = (wfout)? combinedWF(channel,PulseSaw_8580,tmp>>4,1) : 0;  }  } //pulse+saw
   else if (wf&SAW_BITMASK) { wfout=phaseaccu[channel]>>8; //saw (this row would be enough for simple but aliased-at-high-pitch saw)
    if (wf&TRI_BITMASK) wfout = combinedWF(channel,TriSaw_8580,wfout>>4,1); //saw+triangle
    else { step=accuadd/0x1200000; wfout += wfout*step; if (wfout>0xFFFF) wfout = 0xFFFF-(wfout-0x10000)/step; }  } //simple cleaned (bandlimited) saw 
   else if (wf&TRI_BITMASK) { tmp=phaseaccu[channel]^(ctrl&RING_BITMASK?sourceMSB[num]:0); wfout = (tmp^(tmp&0x800000?0xFFFFFF:0)) >> 7; }
   if (wf) prevwfout[channel] = wfout; else { wfout = prevwfout[channel]; } //emulate waveform 00 floating wave-DAC 
   prevaccu[channel] = phaseaccu[channel]; sourceMSB[num] = MSB;
   if (memory[SIDaddr+0x17]&FILTSW[channel]) filtin += (wfout-0x8000)*(envcnt[channel]/256); 
   else if ((channel%SID_CHANNEL_AMOUNT)!=2 || !(memory[SIDaddr+0x18]&OFF3_BITMASK)) output += (wfout-0x8000)*(envcnt[channel]/256);  
  }
  if(memory[1]&3) memory[SIDaddr+0x1B]=wfout>>8; memory[SIDaddr+0x1C]=envcnt[3]; //OSC3, ENV3 (some players rely on it)   
  //FILTER:
  cutoff = (memory[SIDaddr+0x15]&7)/8 + memory[SIDaddr+0x16] + 0.2; 
  if (SID_model==8580.0) { cutoff = 1-Math.exp(cutoff*cutoff_ratio_8580); resonance = Math.pow( 2, ( (4-(memory[SIDaddr+0x17]>>4) ) / 8) ); }
  else { if (cutoff<24) cutoff=0.035; else cutoff = 1-1.263*Math.exp(cutoff*cutoff_ratio_6581); resonance = (memory[SIDaddr+0x17]>0x5F)? 8/(memory[SIDaddr+0x17]>>4) : 1.41; }
  tmp = filtin + prevbandpass[num]*resonance + prevlowpass[num]; if (memory[SIDaddr+0x18]&HIGHPASS_BITMASK) output-=tmp;
  tmp = prevbandpass[num] - tmp*cutoff; prevbandpass[num]=tmp;  if (memory[SIDaddr+0x18]&BANDPASS_BITMASK) output-=tmp;
  tmp = prevlowpass[num] + tmp*cutoff; prevlowpass[num]=tmp;  if (memory[SIDaddr+0x18]&LOWPASS_BITMASK) output+=tmp;   
  return (output/OUTPUT_SCALEDOWN)*(memory[SIDaddr+0x18]&0xF); // master output
 }

 function combinedWF(channel,wfarray,index,differ6581) //on 6581 most combined waveforms are essentially halved 8580-like waves
 { if(differ6581 && SID_model==6581.0) index&=0x7FF; combiwf = (wfarray[index]+prevwavdata[channel])/2; prevwavdata[channel]=wfarray[index]; return combiwf; }
 
 function createCombinedWF(wfarray,bitmul,bitstrength,treshold) { //I found out how the combined waveform works (neighboring bits affect each other recursively)
  for (var i=0; i<4096; i++) { wfarray[i]=0; //neighbour-bit strength and DAC MOSFET treshold is approximately set by ears'n'trials
   for (var j=0; j<12;j++) { var bitlevel=0;
    for (var k=0; k<12; k++) { bitlevel += ( bitmul/Math.pow(bitstrength,Math.abs(k-j)) ) * (((i>>k)&1)-0.5) ; }
    wfarray[i] += (bitlevel>=treshold)? Math.pow(2,j) : 0;  }
   wfarray[i]*=12;  }
 }
 TriSaw_8580 = new Array(4096);  createCombinedWF(TriSaw_8580,0.8,2.4,0.64); //precalculate combined waveform
 PulseSaw_8580 = new Array(4096);  createCombinedWF(PulseSaw_8580,1.4,1.9,0.68);
 PulseTriSaw_8580 = new Array(4096); createCombinedWF(PulseTriSaw_8580,0.8,2.5,0.64); 
 
 var period0 = Math.max(clk_ratio,9);
 var ADSRperiods = [period0,32*1,63*1,95*1,149*1,220*1,267*1,313*1,392*1,977*1,1954*1,3126*1,3907*1,11720*1,19532*1,31251*1];
 var ADSRstep = [Math.ceil(period0/9),1,1,1,1,1,1,1,1,1,1,1,1,1,1,1];
 var ADSR_exptable = [ 1,30,30,30,30,30,30,16,16,16,16,16,16,16,16,8,8,8,8,8,8,8,8,8,8,8,8,4,4,4,4,4, //pos0:1  pos6:30  pos14:16  pos26:8
  4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,2,2,2,2,2,2,2,2,2, 2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,1, //pos54:4 //pos93:2
  1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
  1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
  1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1];
 
}
