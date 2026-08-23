import { supabase } from "./supabase.js";
import { requireAuth } from "./guard.js";

const $=(s)=>document.querySelector(s);
const $$=(s)=>[...document.querySelectorAll(s)];

const session=await requireAuth({redirect:"login.html",splash:"index.html"});
if(!session) await new Promise(()=>{});

const user=session.user;
const STORAGE_KEY="letsgo_user_settings";

const defaults={
  orderUpdates:true,
  tripReminder:true,
  serviceInfo:false,
  cabin:"Ekonomi",
  airport:"BTH"
};

let settings={...defaults,...readSettings()};

function readSettings(){
  try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}")}catch{return{}}
}

function saveSettings(){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(settings));
  toast("Pengaturan disimpan.");
}

function toast(message){
  const el=$("#toast");
  el.textContent=message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>el.classList.remove("show"),1800);
}

function initials(name,email){
  const text=(name||email||"LG").trim();
  const p=text.split(/\s+/).filter(Boolean);
  return p.length>1?`${p[0][0]}${p[p.length-1][0]}`.toUpperCase():text.slice(0,2).toUpperCase();
}

async function loadProfile(){
  $("#accountEmail").textContent=user.email||"—";

  try{
    const {data}=await supabase.from("profiles").select("*").eq("id",user.id).maybeSingle();
    const name=data?.full_name||data?.name||user.user_metadata?.full_name||user.email?.split("@")[0]||"Pengguna LetsGo";
    $("#accountName").textContent=name;
    $("#avatarInitial").textContent=initials(name,user.email);
  }catch{
    const name=user.user_metadata?.full_name||user.email?.split("@")[0]||"Pengguna LetsGo";
    $("#accountName").textContent=name;
    $("#avatarInitial").textContent=initials(name,user.email);
  }
}

function renderSettings(){
  $("#orderUpdatesToggle").checked=Boolean(settings.orderUpdates);
  $("#tripReminderToggle").checked=Boolean(settings.tripReminder);
  $("#serviceInfoToggle").checked=Boolean(settings.serviceInfo);
  $("#cabinValue").textContent=settings.cabin;
  $("#airportValue").textContent=settings.airport;
}

function bindToggle(id,key){
  $(`#${id}`)?.addEventListener("change",e=>{
    settings[key]=e.target.checked;
    saveSettings();
  });
}

function openChoice({title,kicker="PREFERENSI",options,current,onSelect}){
  $("#modalTitle").textContent=title;
  $("#modalKicker").textContent=kicker;
  const box=$("#modalOptions");
  box.innerHTML="";

  options.forEach(option=>{
    const btn=document.createElement("button");
    btn.type="button";
    btn.className=`modal-option ${option.value===current?"active":""}`;
    btn.innerHTML=`<strong>${option.label}</strong><span>${option.value===current?"✓":""}</span>`;
    btn.onclick=()=>{
      onSelect(option.value);
      closeModal();
    };
    box.appendChild(btn);
  });

  $("#choiceModal").classList.remove("hidden");
  document.body.style.overflow="hidden";
}

function closeModal(){
  $("#choiceModal").classList.add("hidden");
  document.body.style.overflow="";
}

bindToggle("orderUpdatesToggle","orderUpdates");
bindToggle("tripReminderToggle","tripReminder");
bindToggle("serviceInfoToggle","serviceInfo");

$("#cabinBtn")?.addEventListener("click",()=>{
  openChoice({
    title:"Kelas penerbangan default",
    options:[
      {label:"Ekonomi",value:"Ekonomi"},
      {label:"Premium Economy",value:"Premium Economy"},
      {label:"Bisnis",value:"Bisnis"}
    ],
    current:settings.cabin,
    onSelect(value)=>{
      settings.cabin=value;
      renderSettings();
      saveSettings();
    }
  });
});

$("#airportBtn")?.addEventListener("click",()=>{
  openChoice({
    title:"Bandara utama",
    options:[
      {label:"Batam · Hang Nadim",value:"BTH"},
      {label:"Jakarta · Soekarno-Hatta",value:"CGK"},
      {label:"Medan · Kualanamu",value:"KNO"},
      {label:"Surabaya · Juanda",value:"SUB"},
      {label:"Bali · Ngurah Rai",value:"DPS"}
    ],
    current:settings.airport,
    onSelect(value)=>{
      settings.airport=value;
      renderSettings();
      saveSettings();
    }
  });
});

$("#profileBtn")?.addEventListener("click",()=>location.href="profile.html");
$("#securityBtn")?.addEventListener("click",()=>location.href="security.html");
$("#documentsBtn")?.addEventListener("click",()=>location.href="documents.html");
$("#privacyBtn")?.addEventListener("click",()=>location.href="about.html#privacy");
$("#helpBtn")?.addEventListener("click",()=>location.href="help.html");
$("#aboutBtn")?.addEventListener("click",()=>location.href="about.html");
$("#backBtn")?.addEventListener("click",()=>history.length>1?history.back():location.href="profile.html");
$("#homeBtn")?.addEventListener("click",()=>location.href="home.html");
$("#closeModalBtn")?.addEventListener("click",closeModal);
$("#choiceModal")?.addEventListener("click",e=>{if(e.target===$("#choiceModal"))closeModal()});

renderSettings();
loadProfile();
