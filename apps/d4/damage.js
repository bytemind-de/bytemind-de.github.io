const startUrlParams = new URLSearchParams(window.location.search);
const urlParamColorScheme = startUrlParams.get('color');
const urlParamSingleColumn = startUrlParams.get('singleColumn');
const urlParamDetailedDamage = startUrlParams.get('detailedDamage');

function updateUrlParameter(key, value, reloadPage){
	var currentUrl = new URL(window.location.href);
	var currentUrlParams = new URLSearchParams(currentUrl.search);
	currentUrlParams.set(key, value);
	currentUrl.search = currentUrlParams.toString();
	if (reloadPage){
		window.location.search = currentUrlParams.toString();
	}else{
		window.history.replaceState(null, "", currentUrl.toString());
	}
}

var mainView = document.body.querySelector(".main-view");
var mainHeadline = document.getElementById("main-headline");
var d4IconSvg = document.getElementById("d4-icon");
var optionsMenu = document.body.querySelector(".options-menu");
var contentPage = mainView.querySelector(".content-page");

var colorStyle = "light";		
var optionDarkMode = optionsMenu.querySelector("[name=option-dark-mode]");
optionDarkMode.onchange = function(){ toggleColorStyle(true); };
optionDarkMode.checked = false;
var optionSingleColumn = optionsMenu.querySelector("[name=option-single-column]");
optionSingleColumn.onchange = function(){ toggleSingleColum(true); };
optionSingleColumn.checked = (urlParamSingleColumn && urlParamSingleColumn == "true");
if (optionSingleColumn.checked){
	contentPage.classList.add("force-one-column");
}
var optionDetailedDamage = optionsMenu.querySelector("[name=option-detailed-damage]");
optionDetailedDamage.onchange = function(){ toggleDetailedDamage(true); };
optionDetailedDamage.checked = (!urlParamDetailedDamage || urlParamDetailedDamage == "true");
if (optionDetailedDamage.checked){
	contentPage.classList.remove("hide-damage-details");
}

function toggleOptionsMenu(){
	if (optionsMenu.classList.contains("hidden")){
		optionsMenu.classList.remove("hidden");
	}else{
		optionsMenu.classList.add("hidden");
	}
}
function toggleSingleColum(writeUrlParam){
	if (optionSingleColumn.checked){
		contentPage.classList.add("force-one-column");
		if (writeUrlParam){
			updateUrlParameter("singleColumn", "true");
		}
	}else{
		contentPage.classList.remove("force-one-column");
		if (writeUrlParam){
			updateUrlParameter("singleColumn", "false");
		}
	}
}
function toggleDetailedDamage(writeUrlParam){
	if (optionDetailedDamage.checked){
		contentPage.classList.remove("hide-damage-details");
		if (writeUrlParam){
			updateUrlParameter("detailedDamage", "true");
		}
	}else{
		contentPage.classList.add("hide-damage-details");
		if (writeUrlParam){
			updateUrlParameter("detailedDamage", "false");
		}
	}
}
function setColorStyle(style, writeUrlParam){
	if (style == "light"){
		colorStyle = "light";
		optionDarkMode.checked = false;
		document.documentElement.classList.remove("dark");
		d4IconSvg.querySelectorAll("path")[1].style.fill = "#000";
		if (writeUrlParam){
			updateUrlParameter("color", "light");
		}
	}else{
		colorStyle = "dark";
		optionDarkMode.checked = true;
		document.documentElement.classList.add("dark");
		d4IconSvg.querySelectorAll("path")[1].style.fill = "#EBE9E8";
		if (writeUrlParam){
			updateUrlParameter("color", "dark");
		}
	}
}
function toggleColorStyle(writeUrlParam){
	if (colorStyle == "light") setColorStyle("dark", writeUrlParam);
	else setColorStyle("light", writeUrlParam);
}
if (urlParamColorScheme){
	setColorStyle(urlParamColorScheme);
}else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches){
	setColorStyle("dark");
}else{
	setColorStyle("light");
}
d4IconSvg.addEventListener("click", toggleColorStyle);

var localStorageSupported = ("localStorage" in window && typeof localStorage.getItem == "function");

var addModColor = "color-add-mod";
var addModColorLight = "color-add-mod-light";
var multiModColor = "color-multi-mod";
var multiModColorLight = "color-multi-mod-light";
var reductionModColor = "color-reduction-mod";
var reductionModColorLight = "color-reduction-mod-light";
var vulnerableColor = "color-vulnerable";
var critColor = "color-crit";
var overpowerColor = "color-overpower";

function showPopUp(content, buttons, options){
	mainView.inert = true;	//lock main
	document.body.classList.add("disable-interaction");
	var popUpOverlay = document.createElement("div");
	popUpOverlay.className = "pop-up-overlay";
	var popUpBox = document.createElement("div");
	popUpBox.className = "pop-up-message-box";
	var popUpCloseBtn = document.createElement("button");
	popUpCloseBtn.className = "pop-up-message-box-close";
	//popUpCloseBtn.innerHTML = "<span>×</span>";
	popUpBox.appendChild(popUpCloseBtn);
	var contentDiv = document.createElement("div");
	contentDiv.className = "pop-up-content";
	popUpBox.appendChild(contentDiv);
	if (typeof content == "string"){
		contentDiv.innerHTML = content;
	}else{
		contentDiv.appendChild(content);
	}
	//close function
	popUpOverlay.popUpClose = function(){
		mainView.inert = false;	//release main
		document.body.classList.remove("disable-interaction");
		popUpOverlay.remove();
	}
	popUpCloseBtn.addEventListener("click", function(ev){
		popUpOverlay.popUpClose();
	});
	if (options?.easyClose){
		popUpOverlay.addEventListener("click", function(ev){
			ev.stopPropagation();
			if (ev.target != this) return;	//ignore bubble events
			popUpOverlay.popUpClose();
		});
	}
	//append and open
	popUpOverlay.appendChild(popUpBox);
	document.body.appendChild(popUpOverlay);			
	return popUpOverlay;
}
function showFormPopUp(formFields, onSubmit){
	var form = document.createElement("form");
	formFields.forEach(function(field, i){
		var formSection = document.createElement("div");
		formSection.className = "form-section";
		if (field.label){
			let ele = document.createElement("label");
			ele.textContent = field.label;
			formSection.appendChild(ele);
		}
		if (field.input){
			let ele = document.createElement("input");
			if (field.pattern){
				ele.pattern = field.pattern;
			}
			if (field.required){
				ele.required = true;
			}
			if (field.title){
				ele.title = field.title;
			}
			ele.name = field.name || ("field" + i);
			ele.value = field.value;
			formSection.appendChild(ele);
		}
		if (field.submit){
			let ele = document.createElement("input");
			ele.type = "submit";
			ele.className = "button-style";
			ele.value = field.name || "Submit";
			formSection.appendChild(ele);
		}
		form.appendChild(formSection);
	});
	form.addEventListener("submit", function(ev){
		ev.preventDefault();
		var formData = new FormData(ev.target);
		if (onSubmit) onSubmit(formData);
		popUp.popUpClose();
	});
	var popUp = showPopUp(form, [], {easyClose: false});
}

function saveAs(filename, dataObj, parentViewEle){
	if (!filename || !dataObj) return;
	var blob = new Blob([JSON.stringify(dataObj)], {
		type: 'text/plain'
	});
	if (navigator.msSaveBlob) return navigator.msSaveBlob(blob, filename);
	var dummyEle = parentViewEle || document.body;
	var a = document.createElement('a');
	a.style.cssText = "max-width: 0px; max-height: 0px; margin: 0; padding: 0;";
	dummyEle.appendChild(a);
	var url = window.URL.createObjectURL(blob);
	a.href = url;
	a.download = filename;
	a.click();
	setTimeout(function(){
		window.URL.revokeObjectURL(url);
		dummyEle.removeChild(a);
	}, 0);
}

function exportAllData(){
	var data = {
		configArray: readConfigsFromLocalStorage()
	};
	var now = (new Date()).toISOString().split(".")[0].replace(/(T|:|\.)/g, "_");
	console.error("exportAllData", data);	//DEBUG
	saveAs("d4-damage-calc-all_" + now + ".json", data);
}
function importConfigurationFromFile(file, onDataCallback){
	const reader = new FileReader();
	reader.onload = () => {
		const content = reader.result;
		if (content){
			var contentJson = JSON.parse(content);
			if (contentJson.singleConfig){
				if (onDataCallback) onDataCallback("singleConfig", contentJson.singleConfig);
			}else if (contentJson.configArray || contentJson.allConfigs){
				if (onDataCallback) onDataCallback("configArray",
					contentJson.configArray || contentJson.allConfigs);
			}else{
				showPopUp("Could not import data.<br>Unknown file format.");
			}
		}
	};
	reader.readAsText(file);
}
function createStoredCalculatorsPopUp(onSelectCallback){
	var storedConfigs = readConfigsFromLocalStorage();
	var keys = Object.keys(storedConfigs);
	if (!keys.length){
		showPopUp("No data found in browser storage.<br>Please import a backup file or save a new configuration.", [], {easyClose: true});
	}else{
		keys = keys.sort();
		//console.error("storedConfigs", storedConfigs);		//DEBUG
		var content = document.createElement("div");
		var list = document.createElement("div");
		list.className = "list-container";
		keys.forEach(function(k){
			var cfg = storedConfigs[k];
			var loadFun = function(ev){
				if (onSelectCallback) onSelectCallback(cfg);
				popUp.popUpClose();
			};
			var item = document.createElement("div");
			item.className = "list-item button-style";
			item.setAttribute("tabindex", "0");
			item.addEventListener("click", loadFun);
			item.addEventListener('keypress', function(ev){
				if (ev.key === 'Enter' && ev.target == item) {
				  loadFun(ev);
				}
			});
			var itemDesc = document.createElement("div");
			itemDesc.className = "list-item-desc";
			itemDesc.textContent = cfg.name;
			item.appendChild(itemDesc);
			var delButton = document.createElement("button");
			delButton.textContent = "─";
			delButton.addEventListener("click", function(ev){
				ev.stopPropagation();
				if (confirm("Delete this entry from browser storage?")){
					deleteConfigFromLocalStorage(cfg.name);
					item.remove();
				}
			});
			item.appendChild(delButton);
			list.appendChild(item);
		});
		var info = document.createElement("p");
		info.innerHTML = "<p>Choose a configuration:</p>";
		var footer = document.createElement("div");
		var btnBox = document.createElement("div");
		btnBox.className = "group center buttons-box";
		var btnClearAll = document.createElement("button");
		btnClearAll.textContent = "CLEAR ALL";
		btnClearAll.addEventListener("click", function(){
			clearData();
			popUp.popUpClose();
		});
		var btnExportAll = document.createElement("button");
		btnExportAll.textContent = "EXPORT ALL";
		btnExportAll.addEventListener("click", function(){
			exportAllData();
			popUp.popUpClose();
		});
		btnBox.appendChild(btnClearAll);
		btnBox.appendChild(btnExportAll);
		footer.appendChild(btnBox);
		content.appendChild(info);
		content.appendChild(list);
		content.appendChild(footer);
		var popUp = showPopUp(content, [], {easyClose: true});
		return popUp;
	}
}

function readConfigsFromLocalStorage(){
	try {
		var storedDataStr = localStorage.getItem("d4-calc-data") || "{}";
		var storedData = JSON.parse(storedDataStr);
		return storedData.configurations || {};
	}catch(err){
		showPopUp("Failed to read from localStorage. Error: " + (err.message || err.name || err));
	}
}
function writeAllConfigsToLocalStorage(configs, keepOld){
	try {
		var storedDataStr = localStorage.getItem("d4-calc-data") || "{}";
		var storedData = JSON.parse(storedDataStr);
		if (keepOld){
			if (!storedData.configurations) storedData.configurations = {};
			Object.keys(configs).forEach(function(key){
				storedData.configurations[key] = configs[key];
			})
		}else{
			storedData.configurations = configs;
		}
		localStorage.setItem("d4-calc-data", JSON.stringify(storedData));
		showPopUp("All configurations restored from file.", [], {easyClose: true});
	}catch(err){
		showPopUp("Failed to write to localStorage. Error: " + (err.message || err.name || err));
	}
}
function writeConfigToLocalStorage(name, config){
	try {
		var storedDataStr = localStorage.getItem("d4-calc-data") || "{}";
		var storedData = JSON.parse(storedDataStr);
		if (!storedData.configurations) storedData.configurations = {};
		if (!name) name = "Unnamed";
		var key = name.replace(/\s+/g, "_").trim().toLowerCase();
		storedData.configurations[key] = {name: name, data: config};
		localStorage.setItem("d4-calc-data", JSON.stringify(storedData));
	}catch(err){
		showPopUp("Failed to write to localStorage. Error: " + (err.message || err.name || err));
	}
}
function deleteConfigFromLocalStorage(name){
	try {
		if (!name) return true;
		var storedDataStr = localStorage.getItem("d4-calc-data");
		if (!storedDataStr) return true;
		var storedData = JSON.parse(storedDataStr);
		if (!storedData.configurations) return true;
		Object.entries(storedData.configurations).forEach(([key, conf]) => {
			if (conf.name == name) delete storedData.configurations[key];
		});
		localStorage.setItem("d4-calc-data", JSON.stringify(storedData));
		return true;
	}catch(err){
		showPopUp("Failed to edit localStorage. Error: " + (err.message || err.name || err));
	}
}
function clearData(){
	if (!confirm("Are you sure you want to remove all cached data?")){
		return;
	}
	localStorage.removeItem("d4-calc-data");
}
	
function buildCalculator(containerEle, options){
	var Calculator = {
		id: ("calc-" + Date.now() + Math.round(Math.random() * 1000000)),
		container: containerEle,
		restoreData: restoreData,
		getData: getData
	};

	var baseDamageEle = containerEle.querySelector("[name=base-damage]");
	var skillDamageEle = containerEle.querySelector("[name=skill-damage]");
	var mainStatEle = containerEle.querySelector("[name=main-stat]");
	var baseLifeEle = containerEle.querySelector("[name=char-base-life]");
	var maxLifeEle = containerEle.querySelector("[name=char-max-life]");
	var vulnerableDamageEle = containerEle.querySelector("[name=vulnerable-damage]");
	var vulnerableDamageAddEle = containerEle.querySelector("[name=vulnerable-damage-add]");
	var overpowerDamageEle = containerEle.querySelector("[name=overpower-damage]");
	var overpowerDamageAddEle = containerEle.querySelector("[name=overpower-damage-add]");
	var isFortified = containerEle.querySelector("[name=char-is-fortified]");
	var critDamageEle = containerEle.querySelector("[name=critical-damage]");
	var critDamageAddEle = containerEle.querySelector("[name=critical-damage-add]");
	var critChanceEle = containerEle.querySelector("[name=critical-hit-chance]");
	
	var addModifiersContainer = containerEle.querySelector("[name=add-modifiers-container]");
	var addModifierBtn = containerEle.querySelector("[name=add-modifier-btn]");
	var multiModifiersContainer = containerEle.querySelector("[name=multi-modifiers-container]");
	var multiModifierBtn = containerEle.querySelector("[name=multi-modifier-btn]");
	var reductionModifiersContainer = containerEle.querySelector("[name=reduction-modifiers-container]");
	var reductionModifierBtn = containerEle.querySelector("[name=reduction-modifier-btn]");
	
	var resultContainer = containerEle.querySelector("[name=result-container]");
	var calculateBtn = containerEle.querySelector("[name=calculate-dmg-btn]");
	var doCalcCrit = containerEle.querySelector("[name=do-calc-crit]");
	var doCalcVulnerable = containerEle.querySelector("[name=do-calc-vulnerable]");
	var doCalcOverpower = containerEle.querySelector("[name=do-calc-overpower]");
	
	var saveBtn = containerEle.querySelector("[name=save-btn]");
	var loadBtn = containerEle.querySelector("[name=load-btn]");
	var exportBtn = containerEle.querySelector("[name=export-btn]");
	var importDataSelector = containerEle.querySelector(".import-data-selector");
	var closeBtn = containerEle.querySelector("[name=close-btn]");
	
	var titleField = containerEle.querySelector("[name=calc-title]");
	var titleSection = titleField.closest('.section');
	var infoFooter = containerEle.querySelector("[name=info-footer]");
	
	var currentConfigName = "";
	
	function chooseTitle(){
		showFormPopUp([
			{label: "Enter a name for this configuration:", input: true, name: "name", required: true,
				value: currentConfigName, title: "Please use [a-zA-Z0-9\\s_\\-]", pattern: "[a-zA-Z0-9\\s_\\-]+"},
			{submit: true, name: "Set"}
		], function(formData){
			var newTitle = formData.get("name").trim();
			if (newTitle){
				setTitle(newTitle);
			}
		});
	}
	function setTitle(newTitle){
		currentConfigName = newTitle;
		titleField.textContent = newTitle;
	}
	function getTitle(){
		return currentConfigName;
	}
	
	function addAdditiveMod(){
		var modName = prompt("Enter a name for this '+' modifier:");
		if (!modName) return;
		addDynamicMod(addModifiersContainer, modName, "add-mod-val");
	}
	function addMultiplierMod(){
		var modName = prompt("Enter a name for this '×' modifier:");
		if (!modName) return;
		addDynamicMod(multiModifiersContainer, modName, "multi-mod-val");
	}
	function addReductionMod(){
		var modName = prompt("Enter a name for this damage reduction modifier:");
		if (!modName) return;
		addDynamicMod(reductionModifiersContainer, modName, "reduction-mod-val");
	}
	function addDynamicMod(parentEle, modName, className, value, disabled){
		var newAddMod = document.createElement("div");
		newAddMod.className = "group limit-label damage-item";
		if (disabled){
			newAddMod.classList.add("hidden");
		}
		newAddMod.dataset.info = modName;
		var newAddModLabel = document.createElement("label");
		var newAddModLabelSpan = document.createElement("span");
		newAddModLabel.appendChild(newAddModLabelSpan);
		newAddModLabelSpan.textContent = modName + ":";
		newAddModLabelSpan.addEventListener("click", function(){
			showFormPopUp([
				{input: true, label: "Name:", name: "name", required: true,
					value: newAddModLabelSpan.textContent.replace(/:$/, ""), title: "Name for this modifier."},
				{submit: true, name: "Ok"}
			], function(formData){
				var newName = formData.get("name").trim();
				if (newName){
					newAddMod.dataset.info = newName;
					newAddModLabelSpan.textContent = newName + ":";
				}
			});
		});
		var newAddModInput = document.createElement("input");
		newAddModInput.type = "number";
		newAddModInput.className = "highlight " + className;
		newAddModInput.value = value || 0;
		var newAddModRemove = document.createElement("button");
		newAddModRemove.textContent = "─";
		newAddModRemove.title = "remove";
		newAddModRemove.addEventListener("click", function(){
			newAddMod.remove();
		});
		var newAddModHide = document.createElement("button");
		newAddModHide.innerHTML = "&#128065;";
		newAddModHide.title = "disable";
		newAddModHide.addEventListener("click", function(){
			if (newAddMod.classList.contains("hidden")){
				newAddMod.classList.remove("hidden");
			}else{
				newAddMod.classList.add("hidden");
			}
		});
		newAddMod.appendChild(newAddModLabel);
		newAddMod.appendChild(newAddModInput);
		newAddMod.appendChild(newAddModHide);
		newAddMod.appendChild(newAddModRemove);
		parentEle.appendChild(newAddMod);
		bytemind.dragdrop.addMoveHandler(newAddMod, parentEle, newAddModLabel);
	}
	
	function getAdditiveModPcts(includeHidden){
		var factors = [];
		addModifiersContainer.querySelectorAll(".add-mod-val").forEach(ele => {
			if (ele.value && (includeHidden || !ele.parentElement.classList.contains("hidden"))){
				factors.push({
					pct: +ele.value,
					info: ele.parentElement.dataset.info,
					disabled: ele.parentElement.classList.contains("hidden")
				});
			}
		});
		return factors;
	}
	function getMultiModPcts(includeHidden){
		var factors = [];
		multiModifiersContainer.querySelectorAll(".multi-mod-val").forEach(ele => {
			if (ele.value && (includeHidden || !ele.parentElement.classList.contains("hidden"))){
				factors.push({
					pct: +ele.value,
					info: ele.parentElement.dataset.info,
					disabled: ele.parentElement.classList.contains("hidden")
				});
			}
		});
		return factors;
	}
	function getReductionModPcts(includeHidden){
		var factors = [];
		reductionModifiersContainer.querySelectorAll(".reduction-mod-val").forEach(ele => {
			if (ele.value && (includeHidden || !ele.parentElement.classList.contains("hidden"))){
				factors.push({
					pct: +ele.value,
					info: ele.parentElement.dataset.info,
					disabled: ele.parentElement.classList.contains("hidden")
				});
			}
		});
		return factors;
	}
	
	function addResult(info, val, modFactor, colorClass, tooltip, isDetail){
		if (!colorClass) colorClass = "";
		var grp = document.createElement("div");
		grp.className = "group flat limit-label-2";
		if (isDetail){
			grp.classList.add("detail");
		}
		grp.innerHTML = (
			"<label>" + info + (modFactor? (" (×" + Number(modFactor).toFixed(2) + ")") : "") 
			+ ":</label><span>" 
			+ "<b class='" + colorClass + "'>" + Math.round(val).toLocaleString() + "</b></span>"
		);
		if (tooltip){
			grp.title = tooltip;
		}
		resultContainer.appendChild(grp);
	}
	function addCustom(str, addClass){
		var div = document.createElement("div");
		div.className = "group";
		if (addClass) div.className += " " + addClass;
		div.innerHTML = str;
		resultContainer.appendChild(div);
	}
	
	function calculateDamage(){
		resultContainer.innerHTML = "";
		resultContainer.parentElement.style.removeProperty('display');
		
		var totalDamage = 0;
		var baseDamage = baseDamageEle.value || 0;
		var hasModifier = doCalcVulnerable.checked || doCalcCrit.checked || doCalcOverpower.checked;
		
		var skillDamageFactor = (skillDamageEle.value || 0.0) / 100;
		totalDamage = baseDamage * skillDamageFactor;
		addResult("Skill base damage", totalDamage, skillDamageFactor, undefined,
			"Average base damage done with the given weapon and skill.");
		addCustom("<hr>", "flat");
		
		var mainStatFactor = 1.0 + (mainStatEle.value || 0.0) / 1000;
		totalDamage = totalDamage * mainStatFactor;		//baseDamage * skillDamageFactor * ...
		addResult("Main stat.", totalDamage, mainStatFactor, undefined,
			"Damage including main stat factor.");
		addCustom("<hr>", "flat");
			
		var addModFactor = 1.0;
		var addModFactorVulnerable = 1.0;
		var addModFactorCrit = 1.0;
		var addModFactorOverpower = 1.0;
		var addModFactorMax = 1.0;
		var addModPcts = getAdditiveModPcts();
		var addModBaseDamage = totalDamage;
		if (addModPcts.length){
			addModPcts.forEach(function(addMod){
				var thisFactor = (addMod.pct/100);
				var thisDamage = addModBaseDamage * thisFactor;
				addModFactor += thisFactor;
				addResult("+ " + addMod.info, thisDamage, undefined, addModColorLight,
					"Contribution of this add. value alone.", true);
			});
			addModFactorMax = addModFactor;
		}
		let newBaseDamage = baseDamage * skillDamageFactor * mainStatFactor * addModFactor;
		if (hasModifier){
			addResult("Base damage after add. mod.", newBaseDamage, addModFactor, addModColor,
				"Base damage for hits after all additive modifiers have been applied.");
		}
		//calculate extra
		var vulnerableAddBaseDamage;
		var critAddBaseDamage;
		var overpowerAddBaseDamage;
		var overpowerAddLifeAndFfDamage;
		var overpowerAddDmgPercentLife;
		var overpowerAddDmgPercentFortify;
		if (doCalcVulnerable.checked && vulnerableDamageAddEle.value){
			let thisFactor = (vulnerableDamageAddEle.value/100);
			vulnerableAddBaseDamage = addModBaseDamage * thisFactor;
			addModFactorVulnerable = thisFactor;
			addModFactorMax += thisFactor;
		}
		if (doCalcCrit.checked && critDamageAddEle.value){
			let thisFactor = (critDamageAddEle.value/100);
			critAddBaseDamage = addModBaseDamage * thisFactor;
			addModFactorCrit = thisFactor;
			addModFactorMax += thisFactor;
		}
		if (doCalcOverpower.checked && overpowerDamageAddEle.value){
			let thisFactorAdd = (overpowerDamageAddEle.value/100);
			//Changes for season 2 (assuming current life = 100%):
			//Overpower attacks gain +2% damage per 1% of your Base Life that you have in bonus life above your Base Life.
			//Overpower attacks gain +2% damage per 1% of your Base Life you have in Fortify.
			//discussion: https://us.forums.blizzard.com/en/d4/t/new-formula-for-overpower-damage-in-120/128302/40
			overpowerAddDmgPercentLife = (maxLifeEle.value - baseLifeEle.value)/baseLifeEle.value * 100 * 2;
			overpowerAddDmgPercentFortify = isFortified.checked? ((maxLifeEle.value/baseLifeEle.value) * 100 * 2) : 0.0;
			let bonusLifeFactor = overpowerAddDmgPercentLife/100;
			let fortifyFactor = overpowerAddDmgPercentFortify/100;
			overpowerAddBaseDamage = addModBaseDamage * thisFactorAdd;
			overpowerAddLifeAndFfDamage = addModBaseDamage * (bonusLifeFactor + fortifyFactor);
			addModFactorOverpower = (thisFactorAdd + bonusLifeFactor + fortifyFactor);
			addModFactorMax += addModFactorOverpower;
		}
		//display extra
		if (doCalcVulnerable.checked && vulnerableDamageAddEle.value){
			let thisFactor = addModFactorMax/(addModFactorMax - addModFactorVulnerable);
			addResult("+ Damage to vulnerable", vulnerableAddBaseDamage, thisFactor, vulnerableColor,
				"Contribution of additive vulnerable damage. Value [x] is the damage as rescaled factor.", true);
		}
		if (doCalcCrit.checked && critDamageAddEle.value){
			let thisFactor = addModFactorMax/(addModFactorMax - addModFactorCrit);
			addResult("+ Critical hit damage", critAddBaseDamage, thisFactor, critColor,
				"Contribution of additive critical hit damage. Value [x] is the damage as rescaled factor.", true);
		}
		if (doCalcOverpower.checked && overpowerDamageAddEle.value){
			let thisFactor = addModFactorMax/(addModFactorMax - addModFactorOverpower);
			addResult("+ Overpower dmg. (max. HP)", (overpowerAddBaseDamage + overpowerAddLifeAndFfDamage), thisFactor, overpowerColor,
				"Contribution of additive overpower damage (" + overpowerDamageAddEle.value + "%), " 
				+ "bonus life (" + Math.round(overpowerAddDmgPercentLife) + "%) and fortify (" + Math.round(overpowerAddDmgPercentFortify) + "%). " 
				+ "Value [x] at the end is the sum as rescaled factor.", true);
		}
		totalDamage *= addModFactorMax;	//baseDamage * skillDamageFactor * mainStatFactor * ...
		addResult("Max. damage after add. mod.", totalDamage, addModFactorMax, addModColor,
			"Max. damage for most powerful hit after all additive modifiers have been applied.");
		
		addCustom("<hr>", "flat");
		
		var multiModPcts = getMultiModPcts();
		var multiModFactor = 1.0;
		var multiModBaseDamage = totalDamage;
		if (multiModPcts.length){
			multiModPcts.forEach(function(multiMod){
				var thisFactor = 1.0 + (multiMod.pct/100);
				var thisDamage = multiModBaseDamage * thisFactor;
				multiModFactor *= thisFactor;
				addResult("× " + multiMod.info, thisDamage, undefined, multiModColorLight,
					"Contribution to base dmg. of this multiplier alone with regard to previous section.", true);
			});
			let newBaseDamage = baseDamage * skillDamageFactor * mainStatFactor * addModFactor * multiModFactor;
			if (hasModifier){
				addResult("Base damage after multipliers", newBaseDamage, multiModFactor, multiModColor,
					"Base damage after all additive modifiers have been applied.");
			}
			totalDamage *= multiModFactor;
			addResult("Max. damage after multipliers", totalDamage, multiModFactor, multiModColor,
				"Max. damage after all additive modifiers have been applied.");
			addCustom("<hr>", "flat");
		}
		
		if (doCalcVulnerable.checked){
			//var vulnerableDamageAdditiveAsFactor = 1.0 + ((vulnerableDamageAddEle.value || 0.0) / addModFactor) / 100;	//it is in add. pool now
			var vulnerableDamageFactor = (1.0 + (vulnerableDamageEle.value || 0.0) / 100);
			let vulnerableBaseDamage = baseDamage * skillDamageFactor * mainStatFactor * (addModFactor + addModFactorVulnerable)
				* multiModFactor * vulnerableDamageFactor;
			totalDamage *= vulnerableDamageFactor;
			addResult("Base dmg. to vulnerable enemy", vulnerableBaseDamage, vulnerableDamageFactor, vulnerableColor,
				"Base damage done to vulnerable enemies (no crit, no overpower) including previous modifiers.");
			addCustom("<hr>", "flat");
		}
		if (doCalcCrit.checked){
			//var critDamageAdditiveAsFactorIncVul = 1.0 + ((critDamageAddEle.value || 0.0) / (addModFactor * vulnerableDamageAdditiveAsFactor)) / 100;	//it is in add. pool now
			var critDamageFactor = (1.0 + (critDamageEle.value || 0.0) / 100);
			let previousBaseDamage = baseDamage * skillDamageFactor * mainStatFactor * addModFactor * multiModFactor;
			let critBaseDamage = baseDamage * skillDamageFactor * mainStatFactor * (addModFactor + addModFactorCrit) * multiModFactor * critDamageFactor;
			totalDamage *= critDamageFactor;
			addResult("Base dmg. with critical hit", critBaseDamage, critDamageFactor, critColor,
				"Base damage done with critical hits (no vulnerable, no overpower) including previous modifiers.");
			var critChancePct = critChanceEle.value || 0;
			//var critChanceFactor = (1.0 - critChancePct/100) + (critChancePct/100 * critDamageFactor);
			//var averageHitDamageFactoringCritChance = critChanceFactor * critBaseDamage;
			var averageHitDamageFactoringCritChance = (1.0 - critChancePct/100) * previousBaseDamage + (critChancePct/100 * critBaseDamage);
			var critChanceFactor = averageHitDamageFactoringCritChance / previousBaseDamage;
			addResult("Avg. base dmg. with crit chance", averageHitDamageFactoringCritChance, critChanceFactor, critColor,
				"Average damage of a critical hit (no vulnerable, no overpower), factoring in the critical hit chance, e.g. 30% crit chance means (70% base damage + 30% crit damge).");
			addCustom("<hr>", "flat");
		}
		if (doCalcOverpower.checked){
			var overpowerDamageFactor = (1.0 + (overpowerDamageEle.value || 0.0) / 100);
			let overpowerBaseDamage = baseDamage * skillDamageFactor * mainStatFactor * (addModFactor + addModFactorOverpower)
				* multiModFactor * overpowerDamageFactor;
			totalDamage *= overpowerDamageFactor;
			addResult("Base dmg. with overpower", overpowerBaseDamage, overpowerDamageFactor, overpowerColor,
				"Base damage done with overpower hits without modifiers like crit. or vulnerable.");
			addCustom("<hr>", "flat");
		}
		if (!hasModifier){
			addResult("Total max. damage per hit", totalDamage, undefined, undefined,
				"Total max. damage possible per hit with the given modifiers");
		}else{
			addResult("Total max. damage per hit", totalDamage, undefined, undefined,
				"Total max. damage per hit with the given modifiers");
		}
		addCustom("<hr>", "flat");
		
		var reductionModPcts = getReductionModPcts();
		var reductionModFactor = 1.0;
		if (reductionModPcts.length){
			reductionModPcts.forEach(function(reductMod){
				var thisFactor = 1.0 - (reductMod.pct/100);
				reductionModFactor *= thisFactor;
				addResult(reductMod.info, totalDamage * reductionModFactor, thisFactor, reductionModColor,
					"Max. damage after this and all previous reduction factors have been applied.");
			});
			totalDamage *= reductionModFactor;	//baseDamage * skillDamageFactor * mainStatFactor * addModFactorMax * multiModFactor ...
		}
	}
	
	function getData(){
		var data = {
			calculatorName: getTitle(),
			baseDamage: baseDamageEle.value,
			skillDamage: skillDamageEle.value,
			mainStat: mainStatEle.value,
			baseLife: baseLifeEle.value,
			maxLife: maxLifeEle.value,
			isFortified: isFortified.checked,
			vulnerableDamage: vulnerableDamageEle.value,
			vulnerableDamageAdd: vulnerableDamageAddEle.value,
			overpowerDamage: overpowerDamageEle.value,
			overpowerDamageAdd: overpowerDamageAddEle.value,
			critDamage: critDamageEle.value,
			critDamageAdd: critDamageAddEle.value,
			critChance: critChanceEle.value,
			additiveModifiers: getAdditiveModPcts(true),
			damageMultipliers: getMultiModPcts(true),
			damageReduction: getReductionModPcts(true)
		}
		return data;
	}
	function restoreData(data, calculatorName){
		resultContainer.innerHTML = "";
		baseDamageEle.value = data.baseDamage || 100;
		skillDamageEle.value = data.skillDamage || 50;
		mainStatEle.value = data.mainStat || 100;
		baseLifeEle.value = data.baseLife || 100;
		maxLifeEle.value = data.maxLife || 150;
		isFortified.checked = data.isFortified;
		vulnerableDamageEle.value = data.vulnerableDamage || 20;
		vulnerableDamageAddEle.value = data.vulnerableDamageAdd || 0;
		overpowerDamageEle.value = data.overpowerDamage || 50;
		overpowerDamageAddEle.value = data.overpowerDamageAdd || 0;
		critDamageEle.value = data.critDamage || 50;
		critDamageAddEle.value = data.critDamageAdd || 0;
		critChanceEle.value = data.critChance || 5;
		addModifiersContainer.innerHTML = "";
		if (data.additiveModifiers?.length){
			data.additiveModifiers.forEach(function(itm){
				addDynamicMod(addModifiersContainer, itm.info, "add-mod-val", itm.pct, itm.disabled);
			});
		}
		multiModifiersContainer.innerHTML = "";
		if (data.damageMultipliers?.length){
			data.damageMultipliers.forEach(function(itm){
				addDynamicMod(multiModifiersContainer, itm.info, "multi-mod-val", itm.pct, itm.disabled);
			});
		}
		reductionModifiersContainer.innerHTML = "";
		if (data.damageReduction?.length){
			data.damageReduction.forEach(function(itm){
				addDynamicMod(reductionModifiersContainer, itm.info, "reduction-mod-val", itm.pct, itm.disabled);
			});
		}
		setTitle(calculatorName || data.calculatorName || "Unnamed Calculator");
	}
	
	function saveData(){
		var data = getData();
		showFormPopUp([
			{label: "Enter a name for this configuration:", input: true, name: "name",
				value: currentConfigName, title: "Allowed characters: a-Z,0-9,_,- and space",
				pattern: "[a-zA-Z0-9\\s_\\-]+", required: true},
			{submit: true, name: "Save"}
		], function(formData){
			var name = formData.get("name").trim();
			setTitle(name);
			writeConfigToLocalStorage(name, data);
			showPopUp("Configuration has been saved to browser storage.", [], {easyClose: true});
		});
	}
	function loadData(){
		createStoredCalculatorsPopUp(function(cfg){
			restoreData(cfg.data, cfg.name);
			//showPopUp("Configuration '" + cfg.name + "' restored from browser storage.", [], {easyClose: true});
			//resultContainer.parentElement.style.removeProperty("display");
		});
	}
	
	function exportData(){
		var data = {
			singleConfig: getData()
		};
		var now = (new Date()).toISOString().split(".")[0].replace(/(T|:|\.)/g, "_");
		console.error("exportData", data);	//DEBUG
		saveAs("d4-damage-calc-config_" + now + ".json", data);
	}
	function importData(file){
		importConfigurationFromFile(file, function(fileType, data){
			if (fileType == "singleConfig"){
				//load data from file to this calculator
				restoreData(data);
			}else if (fileType == "configArray"){
				//add all configurations from file to storage
				if (confirm("Warning: This will overwrite existing configurations with the same name! Continue?")){
					var keepOld = true;
					writeAllConfigsToLocalStorage(contentJson.allConfigs, keepOld);
				}
			}
		});
	}
	
	titleSection.addEventListener('click', chooseTitle);
				
	addModifierBtn.addEventListener('click', addAdditiveMod);
	multiModifierBtn.addEventListener('click', addMultiplierMod);
	reductionModifierBtn.addEventListener('click', addReductionMod);
	calculateBtn.addEventListener('click', calculateDamage);
	saveBtn.addEventListener('click', saveData);
	loadBtn.addEventListener('click', loadData);
	exportBtn.addEventListener('click', exportData);
	importDataSelector.addEventListener('change', function(ev){
		const file = ev.target.files[0];
		if (file){
			importData(file);
		}
	});
	closeBtn.addEventListener("click", function(){
		closeCalculator(Calculator.id);
	});
	
	
	//Restore data?
	if (options?.cfg){
		restoreData(cfg.data, cfg.name);
	}
	//Add some DEMO values?
	if (options?.addDemoContent){
		addDynamicMod(addModifiersContainer, "Damage vs Elites", "add-mod-val", 15);
		addDynamicMod(addModifiersContainer, "Damage vs Healthy", "add-mod-val", 90);
		addDynamicMod(multiModifiersContainer, "Enemies take more damage", "multi-mod-val", 12);
		addDynamicMod(reductionModifiersContainer, "Global damage reduction", "reduction-mod-val", 66);
	}
	//Show/hide footer?
	if (!options?.showFooter){
		infoFooter.remove();
	}
	
	return Calculator;
}

var calculatorTemplate = document.getElementById("calculator-template").innerHTML;

var activeCalculators = {};
contentPage.querySelectorAll(".content-box").forEach(ele => ele.remove());
contentPage.classList.add("empty");

function addNewContentBox(){
	var c = document.createElement("div");
	c.className = "content-box calculator-instance";
	c.innerHTML = calculatorTemplate;
	contentPage.appendChild(c);
	return c;
}
function addNewCalculator(addDemoContent, showFooter){
	var cb = addNewContentBox();
	var calc = buildCalculator(cb, {
		addDemoContent: addDemoContent,
		showFooter: showFooter
	});
	activeCalculators[calc.id] = calc;
	var numOfCalcs = Object.keys(activeCalculators).length;
	if (numOfCalcs == 0){
		contentPage.classList.add("empty");
		contentPage.classList.remove("single-instance");
	}else if (numOfCalcs == 1){
		contentPage.classList.remove("empty");
		contentPage.classList.add("single-instance");
	}else{
		contentPage.classList.remove("single-instance");
		contentPage.classList.remove("empty");
	}
	return calc;
}
function loadStoredCalculator(){
	createStoredCalculatorsPopUp(function(cfg){
		//create a new calculator and restore data
		if (cfg?.data){
			var calc = addNewCalculator();
			calc.restoreData(cfg.data, cfg.name);
		}
	});
}
function closeCalculator(calcId){
	var calc = activeCalculators[calcId];
	if (calc){
		calc.container.remove();
		delete activeCalculators[calcId];
	}
	var numOfCalcs = Object.keys(activeCalculators).length;
	if (numOfCalcs == 0){
		contentPage.classList.add("empty");
		contentPage.classList.remove("single-instance");
	}else if (numOfCalcs == 1){
		contentPage.classList.remove("empty");
		contentPage.classList.add("single-instance");
	}else{
		contentPage.classList.remove("single-instance");
		contentPage.classList.remove("empty");
	}
}

var noConImportDataSelector = contentPage.querySelector(".no-content-menu .import-data-selector");
noConImportDataSelector.addEventListener('change', function(ev){
	const file = ev.target.files[0];
	if (file){
		importConfigurationFromFile(file, function(fileType, data){
			if (fileType == "singleConfig"){
				//create new calculator and add data
				if (data){
					var calc = addNewCalculator();
					calc.restoreData(data);
				}
			}else if (fileType == "configArray"){
				//add all configurations from file to storage
				if (confirm("Warning: This will overwrite existing configurations with the same name! Continue?")){
					var keepOld = true;
					writeAllConfigsToLocalStorage(data, keepOld);
				}
			}
		});
	}
});

//Show a default calculator at start:
//addNewCalculator(true, true);
