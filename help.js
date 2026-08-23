import { getOptionalSession } from "./guard.js";

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

const session = await getOptionalSession({ splash:"index.html" });

function go(url){ window.location.href = url; }
function protectedGo(url){
  if(session) return go(url);
  go(`login.html?next=${encodeURIComponent(url)}`);
}

function toast(message){
  const el=$("#toast");
  if(!el) return;
  el.textContent=message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>el.classList.remove("show"),2000);
}

$("#backBtn")?.addEventListener("click",()=>history.length>1?history.back():go("home.html"));
$("#homeBtn")?.addEventListener("click",()=>go("home.html"));
$("#ordersBtn")?.addEventListener("click",()=>protectedGo("orders.html"));
$("#documentsBtn")?.addEventListener("click",()=>protectedGo("documents.html"));
$("#accountBtn")?.addEventListener("click",()=>session?go("profile.html"):go("login.html?next=profile.html"));

$$(".faq-question").forEach(btn=>{
  btn.addEventListener("click",()=>{
    const item=btn.closest(".faq-item");
    const open=item.classList.toggle("open");
    btn.setAttribute("aria-expanded",String(open));
  });
});

const search=$("#helpSearch");
const clear=$("#clearSearchBtn");
const empty=$("#emptySearch");
const count=$("#resultCount");

function filterFaq(query="", topic=""){
  const q=query.trim().toLowerCase();
  let visible=0;

  $$(".faq-item").forEach(item=>{
    const haystack=[
      item.textContent,
      item.dataset.keywords||"",
      item.dataset.topic||""
    ].join(" ").toLowerCase();

    const matchesQuery=!q||haystack.includes(q);
    const matchesTopic=!topic||item.dataset.topic===topic;
    const show=matchesQuery&&matchesTopic;

    item.classList.toggle("hidden",!show);
    if(show) visible++;
  });

  count.textContent=`${visible} jawaban`;
  empty.classList.toggle("hidden",visible!==0);
}

search?.addEventListener("input",()=>{
  clear.classList.toggle("hidden",!search.value);
  filterFaq(search.value);
});

clear?.addEventListener("click",()=>{
  search.value="";
  clear.classList.add("hidden");
  filterFaq();
  search.focus();
});

$("#resetSearchBtn")?.addEventListener("click",()=>{
  search.value="";
  clear.classList.add("hidden");
  filterFaq();
});

$$("[data-topic]").forEach(btn=>{
  if(!btn.classList.contains("topic-card")) return;
  btn.addEventListener("click",()=>{
    const topic=btn.dataset.topic;
    search.value="";
    clear.classList.add("hidden");
    filterFaq("",topic);
    $("#faqSection")?.scrollIntoView({behavior:"smooth",block:"start"});
    toast(`Menampilkan bantuan ${btn.querySelector("strong")?.textContent||""}.`);
  });
});
