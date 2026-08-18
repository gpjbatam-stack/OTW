(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const money = n => new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n)||0);
  const TABLE = "pricing_settings";
  const HISTORY = "pricing_history";
  let sb, currentUser, initial = "";

  function getClient(){
    if (window.supabaseClient) return window.supabaseClient;
    if (window.sb) return window.sb;
    if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY && window.supabase?.createClient)
      return window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    return null;
  }
  function toast(msg, err=false){ const t=$("toast"); t.textContent=msg;t.className="toast show"+(err?" error":"");setTimeout(()=>t.className="toast",2800); }
  function values(){
    return {
      id:1,
      enabled:$("pricingEnabled").checked,
      markup_percent:Number($("markupPercent").value)||0,
      minimum_markup:Number($("minimumMarkup").value)||0,
      service_fee:Number($("serviceFee").value)||0,
      service_fee_enabled:$("serviceEnabled").checked,
      maximum_markup_percent:Number($("maximumMarkupPercent").value)||0,
      rounding:Number($("rounding").value)||1000,
      updated_at:new Date().toISOString(),
      updated_by:currentUser?.id||null
    };
  }
  function fingerprint(v=values()){ const x={...v};delete x.updated_at;delete x.updated_by;return JSON.stringify(x); }
  function roundTo(v, step){step=Number(step)||1;return Math.ceil(v/step)*step;}
  function calculate(){
    const v=values(), supplier=Number($("supplierPrice").value)||0;
    const raw=supplier*(v.markup_percent/100);
    const markup=Math.max(raw,v.minimum_markup);
    const service=v.service_fee_enabled?v.service_fee:0;
    const total=roundTo(supplier+markup+service,v.rounding);
    const revenue=total-supplier;
    const effective=supplier?revenue/supplier*100:0;
    $("formulaPercent").textContent=v.markup_percent+"%";
    $("rSupplier").textContent=money(supplier); $("rMarkup").textContent=money(markup);
    $("rMarkupPct").textContent="("+v.markup_percent+"%)"; $("rService").textContent=money(service);
    $("rTotal").textContent=money(total); $("revenuePreview").textContent=money(revenue);
    $("effectiveMargin").textContent=effective.toFixed(1)+"%";
    const alert=$("marginAlert"), risky=v.maximum_markup_percent>0 && v.markup_percent>v.maximum_markup_percent;
    alert.className="margin-alert "+(risky?"bad":"good");
    alert.innerHTML=risky?'<span>!</span><div><b>Markup melewati guardrail</b><small>Turunkan markup atau naikkan batas maksimum.</small></div>':'<span>✓</span><div><b>Margin sehat</b><small>Konfigurasi menghasilkan margin positif.</small></div>';
    const dirty=fingerprint()!==initial;
    $("saveState").innerHTML=dirty?"<i style='background:#f59e0b'></i>Belum disimpan":"<i></i>Tersimpan";
  }
  function apply(v){
    $("pricingEnabled").checked=v.enabled ?? true;
    $("markupPercent").value=v.markup_percent ?? 5;
    $("minimumMarkup").value=v.minimum_markup ?? 0;
    $("serviceFee").value=v.service_fee ?? 150000;
    $("serviceEnabled").checked=v.service_fee_enabled ?? true;
    $("maximumMarkupPercent").value=v.maximum_markup_percent ?? 15;
    $("rounding").value=String(v.rounding ?? 1000);
    initial=fingerprint(values()); calculate();
  }
  async function auth(){
    sb=getClient();
    if(!sb) throw new Error("Supabase client belum tersedia. Pastikan supabase.js dimuat.");
    const {data:{session}}=await sb.auth.getSession();
    if(!session){location.replace("admin-login.html");return false}
    currentUser=session.user; $("sideEmail").textContent=currentUser.email||"Admin OTW";
    const {data:admin,error}=await sb.from("app_admins").select("*").eq("user_id",currentUser.id).maybeSingle();
    if(error || !admin || admin.is_active===false){await sb.auth.signOut();location.replace("admin-login.html");return false}
    return true;
  }
  async function load(){
    const {data,error}=await sb.from(TABLE).select("*").eq("id",1).maybeSingle();
    if(error && error.code!=="PGRST116") throw error;
    apply(data||{});
    $("loadingBox").classList.add("hidden");$("content").classList.remove("hidden");
    loadHistory();
  }
  async function save(){
    const v=values();
    if(v.markup_percent<0 || v.markup_percent>100) return toast("Markup harus 0–100%.",true);
    if(v.maximum_markup_percent && v.markup_percent>v.maximum_markup_percent) return toast("Markup melebihi batas maksimum.",true);
    const buttons=[$("saveBtnTop"),$("saveBtnMobile")];buttons.forEach(b=>{b.disabled=true;b.textContent="Menyimpan…"});
    const {error}=await sb.from(TABLE).upsert(v,{onConflict:"id"});
    if(error){buttons.forEach(b=>{b.disabled=false;b.textContent="Simpan Perubahan"});return toast(error.message,true)}
    await sb.from(HISTORY).insert({setting_id:1,markup_percent:v.markup_percent,minimum_markup:v.minimum_markup,service_fee:v.service_fee,service_fee_enabled:v.service_fee_enabled,changed_by:currentUser.id});
    initial=fingerprint(v);calculate();loadHistory();toast("Konfigurasi pricing berhasil disimpan.");
    buttons.forEach(b=>{b.disabled=false;b.textContent="Simpan Perubahan"});
  }
  async function loadHistory(){
    const box=$("historyList");
    const {data,error}=await sb.from(HISTORY).select("*").order("created_at",{ascending:false}).limit(5);
    if(error){box.innerHTML='<div class="empty">Histori belum tersedia.</div>';return}
    if(!data?.length){box.innerHTML='<div class="empty">Belum ada histori perubahan.</div>';return}
    box.innerHTML=data.map(x=>`<div class="history-item"><div><b>Markup ${Number(x.markup_percent||0)}% · ${money(x.service_fee||0)} layanan</b><br><span>${x.service_fee_enabled?"Biaya layanan aktif":"Biaya layanan nonaktif"} · Minimum ${money(x.minimum_markup||0)}</span></div><time>${new Date(x.created_at).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"})}</time></div>`).join("");
  }
  async function boot(){
    try{
      if(!await auth()) return;
      await load();
      ["pricingEnabled","markupPercent","minimumMarkup","serviceFee","serviceEnabled","maximumMarkupPercent","rounding","supplierPrice"].forEach(id=>$(id).addEventListener("input",calculate));
      $("saveBtnTop").onclick=$("saveBtnMobile").onclick=save;$("refreshBtn").onclick=loadHistory;
      $("logoutBtn").onclick=async()=>{await sb.auth.signOut();location.replace("admin-login.html")};
    }catch(e){$("loadingBox").textContent="Gagal memuat Pricing Control: "+e.message;toast(e.message,true)}
  }
  document.addEventListener("DOMContentLoaded",boot);
})();