import { supabase } from "./supabase.js";
import { readUserSettings, isNotificationEnabled } from "./user-settings.js";
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let user=null,notifications=[],activeFilter="all",channel=null,userSettings=null;
function esc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function relativeTime(value){if(!value)return"";const sec=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000));if(sec<60)return"Baru saja";if(sec<3600)return`${Math.floor(sec/60)} menit lalu`;if(sec<86400)return`${Math.floor(sec/3600)} jam lalu`;if(sec<604800)return`${Math.floor(sec/86400)} hari lalu`;return new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",year:"numeric"}).format(new Date(value))}
function toast(m){const e=$("#toast");e.textContent=m;e.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove("show"),2200)}
function show(state){$("#loadingCard").classList.toggle("hidden",state!=="loading");$("#notificationList").classList.toggle("hidden",state!=="list");$("#emptyState").classList.toggle("hidden",state!=="empty");$("#errorState").classList.toggle("hidden",state!=="error")}
function category(n){const t=String(n.type||"").toLowerCase();if(["payment","paid","payment_due"].includes(t))return"payment";if(["overdue","danger"].includes(t))return"danger";if(["payment_reminder","warning"].includes(t))return"warning";return"trip"}
function icon(type){if(type==="payment")return`<svg viewBox="0 0 24 24"><path d="M3 6h18v12H3z"/><path d="M3 10h18M16 15h2"/></svg>`;if(type==="warning"||type==="danger")return`<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/></svg>`;return`<svg viewBox="0 0 24 24"><path d="M2 16.5 22 12 2 7.5l4.5 4.5L2 16.5Z"/></svg>`}
function filtered(){if(activeFilter==="unread")return notifications.filter(n=>!n.is_read);if(activeFilter==="payment")return notifications.filter(n=>["payment","warning","danger"].includes(category(n)));if(activeFilter==="trip")return notifications.filter(n=>category(n)==="trip");return notifications}
function render(){const unread=notifications.filter(n=>!n.is_read).length;$("#unreadCount").textContent=unread;const rows=filtered();if(!rows.length){show("empty");return}$("#notificationList").innerHTML=rows.map(n=>{const type=category(n);return`<article class="notification-card ${n.is_read?"":"unread"}" data-id="${esc(n.id)}" data-order="${esc(n.order_code||"")}" data-type="${type}"><span class="notification-icon">${icon(type)}</span><div class="notification-copy"><strong>${esc(n.title||"Update perjalanan")}</strong><p>${esc(n.message||"")}</p><div class="notification-meta"><span>${relativeTime(n.created_at)}</span>${n.order_code?`<span class="order-chip">${esc(n.order_code)}</span>`:""}</div></div>${n.is_read?"":'<span class="unread-dot"></span>'}</article>`}).join("");show("list")}
async function ensureUser(){const {data,error}=await supabase.auth.getUser();if(error||!data?.user){location.replace("login.html?next=notifications.html");return false}user=data.user;return true}
async function load(){show("loading");try{if(!user&&!(await ensureUser()))return;try{await supabase.rpc("sync_my_letsgo_notifications")}catch(e){console.warn("[LetsGo notification sync]",e)}const {data,error}=await supabase.from("notifications").select("id,user_id,order_id,order_code,title,message,type,is_read,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(100);if(error)throw error;userSettings=readUserSettings(user.id);notifications=(data||[]).filter(n=>isNotificationEnabled(n,userSettings));render()}catch(e){console.error(e);$("#errorMessage").textContent=e?.message||"Silakan coba lagi.";show("error")}}
async function updateReadState(queryBuilder){
  const readAt=new Date().toISOString();
  let result=await queryBuilder({is_read:true,read_at:readAt});
  if(result.error){
    const message=String(result.error.message||"").toLowerCase();
    if(message.includes("read_at")||message.includes("column")){
      result=await queryBuilder({is_read:true});
    }
  }
  return result;
}
async function markRead(id){
  const {error}=await updateReadState(payload=>supabase.from("notifications").update(payload).eq("id",id).eq("user_id",user.id));
  if(error)throw error;
  const n=notifications.find(x=>x.id===id);if(n)n.is_read=true;
}
async function markAll(){try{
  const {error}=await updateReadState(payload=>supabase.from("notifications").update(payload).eq("user_id",user.id).eq("is_read",false));
  if(error)throw error;notifications.forEach(n=>n.is_read=true);render();toast("Semua notifikasi sudah dibaca.")
}catch(e){console.warn("[LetsGo Notifications] mark all read:",e);toast("Notifikasi belum dapat diperbarui.")}}
async function startRealtime(){if(!user)return;if(channel)await supabase.removeChannel(channel);channel=supabase.channel(`letsgo-notifications-${user.id}`).on("postgres_changes",{event:"*",schema:"public",table:"notifications",filter:`user_id=eq.${user.id}`},()=>load()).subscribe()}
$("#backBtn")?.addEventListener("click",()=>history.length>1?history.back():location.href="home.html");$("#markAllBtn")?.addEventListener("click",markAll);$("#retryBtn")?.addEventListener("click",load);
$("#tabs")?.addEventListener("click",e=>{const b=e.target.closest("[data-filter]");if(!b)return;activeFilter=b.dataset.filter;$$("[data-filter]").forEach(x=>x.classList.toggle("active",x===b));render()});
$("#notificationList")?.addEventListener("click",async e=>{const card=e.target.closest("[data-id]");if(!card)return;try{await markRead(card.dataset.id)}catch(error){console.warn("[LetsGo Notifications] mark read:",error)}const code=card.dataset.order;location.href=code?`detail-pesanan.html?id=${encodeURIComponent(code)}`:"orders.html"});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")load()});window.addEventListener("pagehide",()=>{if(channel)supabase.removeChannel(channel)});
(async()=>{if(await ensureUser()){await load();await startRealtime()}})();
window.addEventListener("storage",event=>{if(user&&event.key===`letsgo_user_settings_${user.id}`)load()});
