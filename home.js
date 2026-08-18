/* OTW HOME V7 — function-safe */
document.addEventListener('DOMContentLoaded', () => {
  initHomeUI();
  loadProfileSafely();
});

async function loadProfileSafely() {
  try {
    const [{ requireAuth }, { getMyProfile }] = await Promise.all([
      import('./guard.js'),
      import('./profile-service.js'),
    ]);
    const session = await requireAuth({ redirect: 'login.html' });
    if (!session) return;
    const profile = await getMyProfile();
    const fullName = profile?.full_name || 'Pengguna';
    const firstName = fullName.trim().split(/\s+/)[0];
    const greeting = document.querySelector('#greeting');
    const avatar = document.querySelector('#avatar');
    if (greeting) greeting.textContent = `Halo, ${firstName}`;
    if (avatar) avatar.textContent = fullName.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase() || 'OT';
  } catch (error) {
    console.error('[OTW] Auth/profile load gagal, UI tetap aktif:', error);
  }
}

function initHomeUI() {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  const panels = { flight: $('#flightPanel'), train: $('#trainPanel'), hotel: $('#hotelPanel') };
  $$('.travel-tab').forEach(tab => tab.addEventListener('click', () => {
    $$('.travel-tab').forEach(x => x.classList.remove('active'));
    Object.values(panels).forEach(x => x?.classList.remove('active'));
    tab.classList.add('active');
    panels[tab.dataset.tab]?.classList.add('active');
  }));

  const state = {
    tripType:'oneway',
    origin:{code:'BTH',city:'Batam',name:'Hang Nadim International Airport'},
    destination:null, departDate:'', returnDate:'', adult:1, child:0, infant:0, cabin:'Ekonomi'
  };
  window.__OTW_SEARCH_STATE__ = state;

  const airports = [
    ['BTH','Batam','Hang Nadim International Airport'],['CGK','Jakarta','Soekarno-Hatta International Airport'],
    ['HLP','Jakarta','Halim Perdanakusuma Airport'],['DPS','Denpasar','I Gusti Ngurah Rai International Airport'],
    ['SUB','Surabaya','Juanda International Airport'],['KNO','Medan','Kualanamu International Airport'],
    ['UPG','Makassar','Sultan Hasanuddin International Airport'],['YIA','Yogyakarta','Yogyakarta International Airport'],
    ['SRG','Semarang','Jenderal Ahmad Yani International Airport'],['PLM','Palembang','Sultan Mahmud Badaruddin II Airport'],
    ['PKU','Pekanbaru','Sultan Syarif Kasim II Airport'],['PDG','Padang','Minangkabau International Airport'],
    ['BDJ','Banjarmasin','Syamsudin Noor International Airport'],['BPN','Balikpapan','Sultan Aji Muhammad Sulaiman Sepinggan Airport'],
    ['SOC','Solo','Adi Soemarmo International Airport'],['PNK','Pontianak','Supadio International Airport'],
    ['TKG','Bandar Lampung','Radin Inten II Airport'],['LOP','Lombok','Zainuddin Abdul Madjid International Airport']
  ].map(([code,city,name])=>({code,city,name}));

  const backdrop = $('#sheetBackdrop');
  const sheets = $$('.bottom-sheet');
  const openSheet = sheet => {
    if(!sheet) return;
    sheets.forEach(s=>{s.classList.remove('show');s.setAttribute('aria-hidden','true')});
    sheet.classList.add('show'); sheet.setAttribute('aria-hidden','false');
    backdrop?.classList.add('show'); document.body.style.overflow='hidden';
  };
  const closeSheets = () => {
    sheets.forEach(s=>{s.classList.remove('show');s.setAttribute('aria-hidden','true')});
    backdrop?.classList.remove('show'); document.body.style.overflow='';
  };
  backdrop?.addEventListener('click',closeSheets);
  $$('[data-close-sheet]').forEach(b=>b.addEventListener('click',closeSheets));

  const returnDateWrap = $('#returnDateWrap');
  const tripTypeLabel = $('#tripTypeLabel');
  $$('.trip-type').forEach(btn=>btn.addEventListener('click',()=>{
    $$('.trip-type').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); state.tripType=btn.dataset.trip;
    const round=state.tripType==='roundtrip';
    if(returnDateWrap) returnDateWrap.hidden=!round;
    if(tripTypeLabel) tripTypeLabel.textContent=round?'Pulang-pergi':'Sekali jalan';
    if(!round){state.returnDate=''; const r=$('#returnDateInput'); if(r) r.value=''; const t=$('#returnDateText'); if(t)t.textContent='Pilih tanggal';}
  }));

  let airportTarget='destination';
  const airportSheet=$('#airportSheet'), airportList=$('#airportList'), airportSearch=$('#airportSearch'), airportSheetTitle=$('#airportSheetTitle');
  function renderAirports(q=''){
    if(!airportList) return;
    q=q.trim().toLowerCase();
    const list=airports.filter(a=>!q||a.code.toLowerCase().includes(q)||a.city.toLowerCase().includes(q)||a.name.toLowerCase().includes(q));
    airportList.innerHTML=list.map(a=>`<button class="airport-option" type="button" data-code="${a.code}"><span class="code">${a.code}</span><span class="airport-main"><strong>${a.city}</strong><small>${a.name}</small></span><span class="select-mark">›</span></button>`).join('');
    airportList.querySelectorAll('.airport-option').forEach(btn=>btn.addEventListener('click',()=>{
      const a=airports.find(x=>x.code===btn.dataset.code); if(!a)return;
      if(airportTarget==='origin'){ if(state.destination?.code===a.code) state.destination=state.origin; state.origin=a; }
      else { if(state.origin.code===a.code)return; state.destination=a; }
      syncRouteUI(); closeSheets();
    }));
  }
  function openAirportSelector(target){airportTarget=target;if(airportSheetTitle)airportSheetTitle.textContent=target==='origin'?'Bandara keberangkatan':'Bandara tujuan';if(airportSearch)airportSearch.value='';renderAirports();openSheet(airportSheet);setTimeout(()=>airportSearch?.focus(),150)}
  $('#originBtn')?.addEventListener('click',()=>openAirportSelector('origin'));
  $('#destinationBtn')?.addEventListener('click',()=>openAirportSelector('destination'));
  airportSearch?.addEventListener('input',e=>renderAirports(e.target.value));
  function syncRouteUI(){
    $('#originCode').textContent=state.origin.code; $('#originCity').textContent=state.origin.city;
    $('#destinationCode').textContent=state.destination?.code||'—'; $('#destinationCity').textContent=state.destination?.city||'Pilih tujuan';
    $('#destinationCode').classList.toggle('muted-code',!state.destination);
  }
  $('#swapRouteBtn')?.addEventListener('click',()=>{if(!state.destination)return;const t=state.origin;state.origin=state.destination;state.destination=t;syncRouteUI()});

  const departWrap=$('#departDateWrap'), returnWrap=$('#returnDateWrap'), departInput=$('#departDateInput'), returnInput=$('#returnDateInput');
  const departText=$('#departDateText'), returnText=$('#returnDateText');
  const now=new Date(), todayStr=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  if(departInput)departInput.min=todayStr; if(returnInput)returnInput.min=todayStr;
  const formatDate=value=>{if(!value)return'Pilih tanggal';const d=new Date(`${value}T00:00:00`);return new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric'}).format(d)};
  function triggerDatePicker(input){
    if(!input)return;
    try{input.focus({preventScroll:true});if(typeof input.showPicker==='function'){input.showPicker();return;}}catch(e){console.warn('[OTW] showPicker fallback',e)}
    input.click();
  }
  departWrap?.addEventListener('click',e=>{if(e.target!==departInput)triggerDatePicker(departInput)});
  returnWrap?.addEventListener('click',e=>{if(e.target!==returnInput)triggerDatePicker(returnInput)});
  departWrap?.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();triggerDatePicker(departInput)}});
  returnWrap?.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();triggerDatePicker(returnInput)}});
  departInput?.addEventListener('change',()=>{state.departDate=departInput.value;if(departText)departText.textContent=formatDate(state.departDate);if(returnInput)returnInput.min=state.departDate||todayStr;if(state.returnDate&&state.returnDate<state.departDate){state.returnDate='';if(returnInput)returnInput.value='';if(returnText)returnText.textContent='Pilih tanggal';}});
  returnInput?.addEventListener('change',()=>{state.returnDate=returnInput.value;if(returnText)returnText.textContent=formatDate(state.returnDate)});

  const passengerSheet=$('#passengerSheet');
  const counts={adult:$('#adultCount'),child:$('#childCount'),infant:$('#infantCount')};
  $('#passengerBtn')?.addEventListener('click',()=>{counts.adult.textContent=state.adult;counts.child.textContent=state.child;counts.infant.textContent=state.infant;openSheet(passengerSheet)});
  $$('[data-counter]').forEach(btn=>btn.addEventListener('click',()=>{const type=btn.dataset.counter, step=Number(btn.dataset.step), el=counts[type];if(!el)return;let next=Number(el.textContent)+step;next=type==='adult'?Math.max(1,Math.min(9,next)):Math.max(0,Math.min(8,next));if(type==='infant')next=Math.min(next,Number(counts.adult.textContent));el.textContent=next;}));
  $('#confirmPassengerBtn')?.addEventListener('click',()=>{state.adult=Number(counts.adult.textContent);state.child=Number(counts.child.textContent);state.infant=Number(counts.infant.textContent);const parts=[`${state.adult} Dewasa`];if(state.child)parts.push(`${state.child} Anak`);if(state.infant)parts.push(`${state.infant} Bayi`);$('#passengerText').textContent=parts.join(', ');closeSheets()});

  const cabinSheet=$('#cabinSheet');
  $('#cabinBtn')?.addEventListener('click',()=>openSheet(cabinSheet));
  $$('.cabin-option').forEach(btn=>btn.addEventListener('click',()=>{$$('.cabin-option').forEach(b=>b.classList.remove('active'));btn.classList.add('active');state.cabin=btn.dataset.cabin;$('#cabinText').textContent=state.cabin;closeSheets()}));

  $('#searchFlightBtn')?.addEventListener('click',()=>{
    if(!state.destination){openAirportSelector('destination');return}
    if(!state.departDate){triggerDatePicker(departInput);return}
    if(state.tripType==='roundtrip'&&!state.returnDate){triggerDatePicker(returnInput);return}
    const p=new URLSearchParams({origin:state.origin.code,destination:state.destination.code,depart:state.departDate,trip:state.tripType,adults:state.adult,children:state.child,infants:state.infant,cabin:state.cabin});
    if(state.returnDate)p.set('return',state.returnDate);
    location.href=`search-flight.html?${p.toString()}`;
  });

  $('#profileBtn')?.addEventListener('click',()=>alert('Halaman profil akan dibangun setelah Home final.'));
  $('#profileNav')?.addEventListener('click',()=>alert('Halaman profil akan dibangun setelah Home final.'));
}
