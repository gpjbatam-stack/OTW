let sb=null, rows=[], filtered=[];
const $=(s,r=document)=>r.querySelector(s);
const rupiah=v=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(v||0));
const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
function toast(m){const e=$("#toast");e.textContent=m;e.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove("show"),2200)}
async function getSupabase(){
  try{
    const mod=await import("./supabase.js");
    const candidates=[mod.supabase,mod.default,mod.supabaseClient,window.supabaseClient,window.otwSupabase];
    return candidates.find(x=>x&&typeof x.from==="function")||null;
  }catch(e){
    return [window.supabaseClient,window.otwSupabase].find(x=>x&&typeof x.from==="function")||null;
  }
}
function selling(r){const auto=Math.max(Number(r.reference_price||0)*(1+Number(r.buffer_percent||0)/100),Number(r.minimum_price||0));return r.manual_selling_price==null?auto:Number(r.manual_selling_price)}
function margin(r){return selling(r)-Number(r.reference_price||0)}
async function load(){
  setSync("Memuat...");
  if(!sb){sb=await getSupabase()}
  if(!sb){setSync("Supabase belum terhubung",false);toast("Tidak dapat membaca ./supabase.js");return}
  const {data,error}=await sb.from("addon_pricing").select("*").order("airline_name").order("addon_type").order("addon_name");
  if(error){setSync("Gagal sinkron",false);toast(error.message);return}
  rows=data||[];buildAirlines();applyFilters();setSync("Tersinkron");
}
function setSync(t,ok=true){$("#syncState span").textContent=t;$("#syncState i").style.background=ok?"#0fb476":"#d94d5a"}
function buildAirlines(){const cur=$("#airlineFilter").value;const names=[...new Set(rows.map(r=>r.airline_name).filter(Boolean))].sort();$("#airlineFilter").innerHTML='<option value="">Semua maskapai</option>'+names.map(n=>`<option ${n===cur?"selected":""}>${esc(n)}</option>`).join("")}
function applyFilters(){
 const q=$("#searchInput").value.trim().toLowerCase(),air=$("#airlineFilter").value,type=$("#typeFilter").value,status=$("#statusFilter").value;
 filtered=rows.filter(r=>(!q||`${r.airline_name} ${r.airline_code} ${r.addon_name} ${r.addon_code}`.toLowerCase().includes(q))&&(!air||r.airline_name===air)&&(!type||r.addon_type===type)&&(!status||(status==="active"?r.is_active:!r.is_active)));
 render();stats();
}
function stats(){
 $("#statTotal").textContent=rows.length;const active=rows.filter(r=>r.is_active);$("#statActive").textContent=active.length;
 $("#statBuffer").textContent=rows.length?(rows.reduce((a,r)=>a+Number(r.buffer_percent||0),0)/rows.length).toFixed(1)+"%":"0%";
 $("#statAvg").textContent=active.length?rupiah(active.reduce((a,r)=>a+selling(r),0)/active.length):rupiah(0);$("#statTotalNote").textContent=rows.length?"Konfigurasi database":"Belum ada data";
}
function render(){
 $("#emptyState").classList.toggle("hidden",filtered.length>0);
 $("#tableBody").innerHTML=filtered.map(r=>`<tr><td class="item"><strong>${esc(r.airline_name)} · ${esc(r.addon_name)}</strong><small>${esc(r.airline_code)} / ${esc(r.addon_type)} / ${esc(r.addon_code)}</small></td><td class="money-val">${rupiah(r.reference_price)}</td><td>${Number(r.buffer_percent||0).toFixed(1)}%</td><td>${rupiah(r.minimum_price)}</td><td class="selling">${rupiah(selling(r))}${r.manual_selling_price!=null?' <small>MANUAL</small>':''}</td><td class="${margin(r)>=0?"margin":""}">${rupiah(margin(r))}</td><td><span class="pill ${r.is_active?"":"off"}">${r.is_active?"Aktif":"Nonaktif"}</span></td><td><button class="edit" data-id="${r.id}">Edit</button></td></tr>`).join("");
 $("#mobileList").innerHTML=filtered.map(r=>`<article class="mobile-card"><div class="mc-top"><div><strong>${esc(r.addon_name)}</strong><small>${esc(r.airline_name)} · ${esc(r.airline_code)} · ${esc(r.addon_type)}</small></div><span class="pill ${r.is_active?"":"off"}">${r.is_active?"Aktif":"Nonaktif"}</span></div><div class="mc-price"><div><small>Referensi</small><b>${rupiah(r.reference_price)}</b></div><div><small>Buffer</small><b>${Number(r.buffer_percent||0).toFixed(1)}%</b></div><div><small>Harga tayang</small><b class="selling">${rupiah(selling(r))}</b></div></div><div class="mc-bottom"><span class="${margin(r)>=0?"margin":""}">Buffer ${rupiah(margin(r))}</span><button class="edit" data-id="${r.id}">Edit</button></div></article>`).join("");
 document.querySelectorAll(".edit").forEach(b=>b.onclick=()=>openEdit(b.dataset.id));
}
function openNew(){resetForm();$("#drawerTitle").textContent="Tambah add-on";$("#deleteBtn").classList.add("hidden");openDrawer()}
function openEdit(id){const r=rows.find(x=>x.id===id);if(!r)return;$("#rowId").value=r.id;$("#airlineCode").value=r.airline_code;$("#airlineName").value=r.airline_name;$("#addonType").value=r.addon_type;$("#addonCode").value=r.addon_code;$("#addonName").value=r.addon_name;$("#weightKg").value=r.weight_kg??"";$("#referencePrice").value=Number(r.reference_price||0);$("#bufferPercent").value=Number(r.buffer_percent||0);$("#minimumPrice").value=Number(r.minimum_price||0);$("#manualPrice").value=r.manual_selling_price??"";$("#isActive").checked=!!r.is_active;$("#notes").value=r.notes||"";$("#drawerTitle").textContent="Edit add-on";$("#deleteBtn").classList.remove("hidden");updatePreview();openDrawer()}
function resetForm(){$("#addonForm").reset();$("#rowId").value="";$("#bufferPercent").value=15;$("#minimumPrice").value=0;$("#isActive").checked=true;updatePreview()}
function openDrawer(){$("#drawer").classList.remove("hidden");document.body.style.overflow="hidden"}
function closeDrawer(){$("#drawer").classList.add("hidden");document.body.style.overflow=""}
function updatePreview(){const ref=Number($("#referencePrice").value||0),buf=Number($("#bufferPercent").value||0),min=Number($("#minimumPrice").value||0),manual=$("#manualPrice").value;const auto=Math.max(ref*(1+buf/100),min),sell=manual===""?auto:Number(manual);$("#autoPreview").textContent=rupiah(auto);$("#sellingPreview").textContent=rupiah(sell);$("#riskBox").classList.toggle("hidden",sell>=ref);$("#weightWrap").classList.toggle("hidden",$("#addonType").value!=="BAGGAGE")}
async function save(e){
 e.preventDefault();if(!sb)return toast("Supabase belum terhubung.");
 const id=$("#rowId").value,payload={airline_code:$("#airlineCode").value.trim().toUpperCase(),airline_name:$("#airlineName").value.trim(),addon_type:$("#addonType").value,addon_code:$("#addonCode").value.trim().toUpperCase(),addon_name:$("#addonName").value.trim(),weight_kg:$("#addonType").value==="BAGGAGE"&&$("#weightKg").value!==""?Number($("#weightKg").value):null,reference_price:Number($("#referencePrice").value||0),buffer_percent:Number($("#bufferPercent").value||0),minimum_price:Number($("#minimumPrice").value||0),manual_selling_price:$("#manualPrice").value===""?null:Number($("#manualPrice").value),is_active:$("#isActive").checked,notes:$("#notes").value.trim()||null};
 const sell=payload.manual_selling_price??Math.max(payload.reference_price*(1+payload.buffer_percent/100),payload.minimum_price);
 if(sell<payload.reference_price&&!confirm("Harga tayang lebih rendah dari harga referensi. Tetap simpan?"))return;
 $("#saveBtn").disabled=true;$("#saveBtn").textContent="Menyimpan...";
 const q=id?sb.from("addon_pricing").update(payload).eq("id",id):sb.from("addon_pricing").insert(payload);
 const {error}=await q;$("#saveBtn").disabled=false;$("#saveBtn").textContent="Simpan perubahan";
 if(error)return toast(error.message);toast("Pricing berhasil disimpan.");closeDrawer();await load();
}
async function remove(){
 const id=$("#rowId").value;if(!id||!confirm("Hapus add-on ini secara permanen?"))return;
 const {error}=await sb.from("addon_pricing").delete().eq("id",id);if(error)return toast(error.message);toast("Add-on dihapus.");closeDrawer();await load();
}
["searchInput","airlineFilter","typeFilter","statusFilter"].forEach(id=>$("#"+id).addEventListener(id==="searchInput"?"input":"change",applyFilters));
["referencePrice","bufferPercent","minimumPrice","manualPrice","addonType"].forEach(id=>$("#"+id).addEventListener("input",updatePreview));
$("#addBtn").onclick=openNew;$("#refreshBtn").onclick=load;$("#closeDrawer").onclick=closeDrawer;$("#cancelBtn").onclick=closeDrawer;$("#addonForm").onsubmit=save;$("#deleteBtn").onclick=remove;$("#drawer").onclick=e=>{if(e.target===$("#drawer"))closeDrawer()};
$("#mobileMenu").onclick=()=>toast("Navigasi admin desktop disederhanakan pada tampilan mobile.");
load();