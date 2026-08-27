import { supabase } from "./supabase.js";

function readJson(keys){
  for(const key of keys){
    try{
      const raw=sessionStorage.getItem(key);
      if(raw) return JSON.parse(raw);
    }catch{}
  }
  return null;
}

function writeSelected(value){
  const raw=JSON.stringify(value);
  // Keep both namespaces compatible with the current booking pages.
  sessionStorage.setItem("otw_selected_flight",raw);
  sessionStorage.setItem("letsgo_selected_flight",raw);
  sessionStorage.setItem("otw_selected_offer_id",value?.offerId||"");
  sessionStorage.setItem("letsgo_selected_offer_id",value?.offerId||"");
}

function normalizeSearch(){
  const s=readJson(["otw_search","letsgo_search"]);
  if(!s?.origin||!s?.destination||!s?.departDate) return null;
  return {
    origin:String(s.origin).toUpperCase(),
    destination:String(s.destination).toUpperCase(),
    departDate:s.departDate,
    returnDate:s.returnDate||undefined,
    passengers:{
      adult:Number(s.passengers?.adult??1),
      child:Number(s.passengers?.child??0),
      infant:Number(s.passengers?.infant??0)
    },
    cabinClass:s.cabinClass||"ECONOMY",
    route:s.route||"ALL",
    airlines:Array.isArray(s.airlines)?s.airlines:undefined
  };
}

function segmentSignature(offer){
  const seg=Array.isArray(offer?.segments)?offer.segments[0]:null;
  return {
    flight:String(seg?.flightNumber||"").toUpperCase(),
    carrier:String(seg?.carrier||"").toUpperCase(),
    origin:String(seg?.origin||"").toUpperCase(),
    destination:String(seg?.destination||"").toUpperCase(),
    departure:String(seg?.departureLocalTime||seg?.departureTime||"").slice(0,16)
  };
}

function scoreOffer(candidate, selected){
  const a=segmentSignature(candidate), b=segmentSignature(selected);
  let score=0;
  if(a.flight&&b.flight&&a.flight===b.flight) score+=8;
  if(a.carrier&&b.carrier&&a.carrier===b.carrier) score+=3;
  if(a.origin&&b.origin&&a.origin===b.origin) score+=2;
  if(a.destination&&b.destination&&a.destination===b.destination) score+=2;
  if(a.departure&&b.departure&&a.departure===b.departure) score+=6;
  if(Number(candidate?.stops??-1)===Number(selected?.stops??-2)) score+=1;
  return score;
}

/**
 * Re-searches the guest itinerary after authentication.
 * jetwize-search will now see the JWT and persist trusted quotes for this user.
 * If the provider rotates offerId, replace the selected guest offer with the
 * closest authenticated offer before booking continues.
 */
export async function refreshGuestQuoteAfterAuth(){
  const selected=readJson(["otw_selected_flight","letsgo_selected_flight"]);
  const search=normalizeSearch();
  if(!selected||!search) return {ok:true,skipped:true};

  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.user) throw new Error("Sesi login belum tersedia untuk verifikasi harga.");

  const {data,error}=await supabase.functions.invoke("jetwize-search",{body:search});
  if(error) throw error;

  const results=Array.isArray(data?.results)?data.results:[];
  if(!results.length) throw new Error("Penerbangan yang dipilih tidak tersedia lagi. Silakan lakukan pencarian ulang.");

  let matched=results.find(x=>x?.offerId&&x.offerId===selected?.offerId);
  if(!matched){
    matched=results
      .map(x=>({x,score:scoreOffer(x,selected)}))
      .sort((a,b)=>b.score-a.score)[0];
    if(!matched||matched.score<8) {
      throw new Error("Harga atau penerbangan telah berubah. Silakan lakukan pencarian ulang.");
    }
    matched=matched.x;
  }

  const refreshed={
    ...selected,
    ...matched,
    selectedAt:new Date().toISOString(),
    searchSnapshot:{...search}
  };
  writeSelected(refreshed);
  sessionStorage.setItem("letsgo_quote_refreshed_at",new Date().toISOString());
  return {ok:true,offerId:refreshed.offerId};
}
