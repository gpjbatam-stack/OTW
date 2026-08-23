const $ = (s) => document.querySelector(s);

function go(url){
  window.location.href = url;
}

$("#backBtn")?.addEventListener("click",()=>{
  if(history.length > 1) history.back();
  else go("home.html");
});

$("#homeBtn")?.addEventListener("click",()=>go("home.html"));
$("#helpBtn")?.addEventListener("click",()=>go("help.html"));
