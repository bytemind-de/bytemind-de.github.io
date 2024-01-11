//Code Pen: https://codepen.io/MyXoToD/pen/psLen
//Code Pen Ref.: http://dribbble.com/shots/1015985-Clock
//Tweaks and Javascript: FQ / bytemind.de

var container = document.getElementById("clock-container");
var hour = document.getElementById("clock-hour");
var minute = document.getElementById("clock-minute");
var second = document.getElementById("clock-second");

var digital = document.getElementById("clock-digital");
var date = document.getElementById("clock-date");
var dateTimer;

container.addEventListener("click", function(){
	clearTimeout(dateTimer);
	date.classList.add("visible");
	digital.classList.add("visible");
	dateTimer = setTimeout(function(){
		date.classList.remove("visible");
		digital.classList.remove("visible");
	}, 5000);
});

var clockInterval = undefined;

function startClock(){
	clearInterval(clockInterval);
	clockInterval = setInterval(function(){
		var d = new Date();
		var s = d.getSeconds();
		var m = d.getMinutes();
		var h = d.getHours();
		hour.style.transform = "rotate(" + Math.floor(360/12 * h) + "deg)";
		minute.style.transform = "rotate(" + Math.floor((h * 360) + (360/60 * m)) + "deg)";
		second.style.transform = "rotate(" + Math.floor((m * 360) + (360/60 * s)) + "deg)";
		date.textContent = d.toLocaleDateString();
		digital.textContent = d.toLocaleTimeString();
	}, 1000);
}
function stopClock(){
	clearInterval(clockInterval);
}

startClock();