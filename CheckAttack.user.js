// ==UserScript==
// @name        CheckAttack
// @namespace   GeneralAnasazi
// @author	GeneralAnasazi
// @description Plug in anti bash
// @include     *ogame.gameforge.com/game/*
// @version     3.0
// @grant       None

// ==/UserScript==

// constants
const TABID_SPY = 20;
const TABID_COMBAT_REPORT = 21; // combat report

// **************************************************************************

//TODO: "read getMessage asyncron"

// globale vars
var debug = false; // set it to true enable debug messages -> log(msg)
var language = document.getElementsByName('ogame-language')[0].content;
var playerId = document.getElementsByName('ogame-player-id')[0].content;
var playerName = document.getElementsByName('ogame-player-name')[0].content;
var server  = document.getElementsByName('ogame-universe')[0].content;
// settings object
var settings = {
    // last readed message from combat report
    lastCheckCombatReport: getToday(),
    getLastCheckCombatReport: function() {return new Date(this.lastCheckCombatReport);},
    // last readed message from spy report
    lastCheckSpyReport: getToday(),
    getLastCheckSpyReport: function() {return new Date(this.lastCheckSpyReport);},
    load: function() {
        var obj = getCookie('tabSettings');
        if (obj != {})
        {
            if (obj.lastCheckCombatReport)
            {
                this.lastCheckCombatReport = new Date(obj.lastCheckCombatReport);
            }
            if (obj.lastCheckSpyReport)
            {
                this.lastCheckSpyReport = new Date(obj.lastCheckSpyReport);
            }
        }
    },
    write: function() {
        $.cookie('tabSettings', JSON.stringify(this), {expires: 366});
    }
}; // cookie tabSettings

// translation vars (don't translate here)
var title1 = 'Pas de risque';
var title2 = 'de bash';
var title3 = 'Risque de bash';
var captionAttack = 'attaque';
var captionAttacks = 'attaques';

// **************************************************************************


// translate the viewed vars
function translate()
{
    switch (language)
    {
        case 'de':
            setTranslationVars('Verlauf des Risikos', 'jmd. zu Bashen', 'Risiko jmd. zu Bashen', 'Angriff', 'Angriffe');
            break;
        case 'en':
            setTranslationVars('Way to risk', 'to bash', 'Risk to bash', 'attack', 'attacks');
            break;
        default:
            setTranslationVars('Way to risk', 'to bash', 'Risk to bash', 'attack', 'attacks');
            break;
    }
}

// log a message to console, if debug is true
function log(msg)
{
    if (debug)
        console.log(msg);
}

// loading the "page" page from the message page
function getMessage(page, tabId) {
	return $.ajax({
		type: 'POST',
		url: '/game/index.php?page=messages',
		data: 'messageId=-1&tabid='+tabId+'&action=107&pagination='+page+'&ajax=1',
		dataType: 'html',
		context: document.body,
		global: false,
		async:false,
		success: function(data) {
			return data;
		}
	}).responseText;
}

function setTranslationVars(aTitle1, aTitle2, aTitle3, aCaptionAttack, aCaptionAttacks)
{
    title1 = aTitle1;
    title2 = aTitle2;
    title3 = aTitle3;
    captionAttack = aCaptionAttack;
    captionAttacks = aCaptionAttacks;
}

function coordToUrl(coord)
{
	 var coordClean = coord.substring(1, coord.length-1);
	 var coordTab = coordClean.split(":");
	 return '/game/index.php?page=galaxy&galaxy='+coordTab[0]+'&system='+coordTab[1]+'&position='+coordTab[2] ;
}

function formateTitle(date,cpt)
{
    var hours   = date.getHours();
    var minutes  = date.getMinutes();
	return hours+'h'+minutes+' le '+ date + ' (p '+cpt+')';
}

function getToday()
{
    var result = new Date();
    result.setDate(result.getDate());
    result.setHours(0,0,0,0);
    return result;
}

function isYesterdayOrBefore(date)
{
    return getToday() > date;
}

function isAppendedToday(date, isSpyReport)
{
    var lastCheckSettings = settings.lastCheckCombatReport;
    if (isSpyReport)
        lastCheckSettings = settings.lastCheckSpyReport;

    var lastCheck = getToday();
    // performance boost
    if (lastCheck < lastCheckSettings)
    {
        lastCheck = lastCheckSettings;
        log('use lastCheck from settings');
    }
    log('LastCheck: ' + lastCheck + ' LastCheckSettings: ' + lastCheckSettings);
    return date > lastCheck;
}

function getDateFromMessage(msg, isSpy)
{
    var result = new Date(2000, 0, 1);
    if (msg)
    {
        var className = 'msg_date';
        if (isSpy)
        {
            className = 'msg_date fright';
        }
        var mesgtab = msg.getElementsByClassName(className);
        var date = mesgtab[0];
        if (date)
        {
            var dateStr = String(date.innerHTML);
            var datePart  = dateStr.split(" ")[0].split(".");
            var timePart = dateStr.split(" ")[1].split(":");

            var day = datePart[0];
            var month = datePart[1];
            var year = datePart[2];

            var hour = timePart[0];
            var minutes = timePart[1];
            var seconds = timePart[2];
            result = new Date(year, month - 1, day, hour, minutes, seconds);
        }
    }
    return result;
}

function getDefender(msg)
{
    // get Defender
    var result = 'Unknown';

    var defenderDiv = msg.getElementsByClassName('combatRightSide');
    if (defenderDiv[0])
    {
        var toolTip = defenderDiv[0].getElementsByClassName('msg_ctn msg_ctn2 overmark tooltipRight')[0];
        if (!toolTip)
            toolTip = defenderDiv[0].getElementsByClassName('msg_ctn msg_ctn2 undermark tooltipRight')[0];
        if (toolTip)
        {
            result = toolTip.innerHTML;
            result = result.split(': ')[1].replace('(', '').replace(')', '');
        }
    }
    if (result == 'Unknown' && defenderDiv)
        log(defenderDiv);
    return result;
}

// save function to read and parse a JSON cookie
function getCookie(name)
{
    var result = {};
    //log('read cookie: ' + name);
    var cookie = $.cookie(name);
    if (cookie)
    {
        try
        {
            result = $.parseJSON(cookie);
        }
        catch (exception)
        {
            // errors will be shown every time, but will not stop the script
            console.log('ERROR: ' + exception);
        }
    }
    return result;
}

function resetCookies()
{
    // on each new Date the cookies has to be cleared
    var today = getToday();
    if ((today > settings.lastCheckCombatReport && today > settings.lastCheckSpyReport))
    {
        log('reset cookies');
        $.cookie('tabCoord', JSON.stringify({}), {expires: 1});
        $.cookie('tabCoordHeures', JSON.stringify({}), {expires: 1});
        $.cookie('tabDefenderNames', JSON.stringify({}), {expires: 1});
        $.cookie('tabInactivePlayers', JSON.stringify({}), {expires: 1});

        // to prevent that the cooies will be reseted every time
        settings.lastCheckCombatReport = today;
        settings.lastCheckSpyReport = today;
        settings.write();
    }
}

// initialize the script and load some informations from existing cookies
function startScript()
{
    // button for checking
    var btn = document.createElement("a");
    btn.innerHTML="Check Raid";
    btn.className="menubutton";
    btn.href ="javascript:"; 				// i don't like href="#" it can make the page moving
    btn.addEventListener('click', function(){ loadInfo() ;}, false);
    var li=document.createElement("li");
    li.appendChild(btn);
    var barre = document.getElementById("menuTableTools");
    barre.appendChild(li);

    // create and hidden div for result storing and parsing
    var div = document.createElement("div");
    div.id ="verificationAttaque";
    div.style.visibility = "hidden";
    document.body.appendChild(div);

    translate();
    settings.load();
    log(settings);
    //settings.write();
    //log(settings);
    resetCookies();

    var tabCoordCookie = $.cookie("tabCoord");
    if (typeof(tabCoordCookie) != 'undefined')
    {
        display();
    }
}

// search inactive players in the spy tab and save the inactive players in a cookie
function searchInactivePlayers()
{
    log('start search inactive players');
    var inactivePlayers = getCookie("tabInactivePlayers");
    var div = document.getElementById("verificationAttaque");
    if (!div) return;

    div.innerHTML = getMessage(1, TABID_SPY);
    var litab = document.getElementsByClassName('paginator');
    var li = litab[litab.length -1];
    var pageCount = li.getAttribute("data-page");
    var ok = true;
    var lastCheck = getToday();

    for (var page = 1; page <= pageCount; page++)
    {
        // the first page is loaded, there is no need to do it again
        if (page > 1)
            div.innerHTML = getMessage(page, TABID_SPY);

        var messageList = document.getElementsByClassName('msg ');
        if (messageList)
        {
            for (var i = 0; i < messageList.length; i++)
            {
                var msgDate = getDateFromMessage(messageList[i], true);
                if (page == 1 && i === 0)
                    lastCheck = msgDate;

                if (isAppendedToday(msgDate, true))
                {
                    //<span class="status_abbr_longinactive">&nbsp;&nbsp;Felcken</span>
                    var inactiveSpan = messageList[i].getElementsByClassName('status_abbr_longinactive');
                    if (!inactiveSpan[0])
                        inactiveSpan = messageList[i].getElementsByClassName('status_abbr_inactive');
                    if (inactiveSpan[0])
                    {
                        //read player name
                        var initplayerName = inactiveSpan[0].innerHTML + '';
                        var playerName = initplayerName.replace('&nbsp;', '');

                        // check if an inner html there
                        if (playerName.substring(0, 1) == '<')
                        {
                            var idx = playerName.lastIndexOf('&nbsp;');
                            playerName = playerName.substr(idx + 6, playerName.length - (idx + 6));
                        }
                        playerName = playerName.replace('&nbsp;', '');
                        if (playerName.substring(0, 1) != '(' && playerName.substring(0, 1) != '<')
                            inactivePlayers[playerName] = 'i';
                    }
                }
                else
                {
                    log('Message Date: ' + msgDate + ' - Settings: ' + settings.lastCheckSpyReport);
                    ok = false;
                    break;
                }
            }
            if (!ok)
                break;
        }
    }
    log(inactivePlayers);
    settings.lastCheckSpyReport = lastCheck;
    log(settings);
    log('end searchInactivePlayers');
    $.cookie("tabInactivePlayers", JSON.stringify(inactivePlayers), {expires: 1});
    return lastCheck;
}

function loadInfo()
{

	// display a loading gif
	var info = document.createElement("div");
	info.className="adviceWrapper";
	info.innerHTML='<div style="algin:center;text-align: center;"><img src="https://raw.githubusercontent.com/GrosLapin/scriptOgame/master/ajax-loader.gif" /></div>';
	info.id="id_check_attaque";

	var link = document.getElementById("links");
	var conteneur =  document.getElementById('id_check_attaque');
	if (typeof(conteneur) == 'undefined' || conteneur === null)
	{
		link.appendChild(info);
	}
	else
	{
		link.replaceChild(info,conteneur);
	}


	// seting some constant like the number of page in the message section
    var div =  document.getElementById("verificationAttaque");
    var message = getMessage(1, TABID_COMBAT_REPORT);
    div.innerHTML = message;
    if (div.innerHTML === 'undefined')
        return;

    var litab = document.getElementsByClassName('paginator');
    var li = litab[litab.length -1];
    var maxPage = li.getAttribute("data-page");

    var cpt = 1;
    var ok = true;
    // load cookies for faster execution, if checked today
    var tabCoord = getCookie("tabCoord");
    var tabCoordHeures = getCookie("tabCoordHeures");
    var tabDefenderNames = getCookie("tabDefenderNames");
    var lastCheck = getToday();


    searchInactivePlayers();
    var inactivePlayers = getCookie("tabInactivePlayers");
    log(inactivePlayers);

    // main loop
    while (cpt <= maxPage && ok )
    {
        if (!message)
            break;
		// store the HTML in hidden div
        div.innerHTML = message;
        var lutab = document.getElementsByClassName('ctn_with_trash');
        var lu = lutab[lutab.length -1];
        var collEnfants = document.getElementsByClassName('msg');

		// 1 of 2 child are not of your bisness, and the first is the < << >> > button so start at 3 and +2
        for (var i = 0; i < collEnfants.length; i++)
        {
            var msg = collEnfants[i];
            var defenderName = getDefender(msg);
            var date = getDateFromMessage(msg, false);
            if (cpt == 1 && i === 0)
                lastCheck = date;

            if ((inactivePlayers[defenderName] != 'i' || inactivePlayers == {}) && defenderName != playerName)
            {
                if (isAppendedToday(date, false))
                {
                    log('Append Date(loadInfo): ' + date + '  Settings: ' + settings.lastCheckCombatReport);
                    var locTab = msg.getElementsByClassName('txt_link');
                    var coord = locTab[0].innerHTML;
                    if (!tabCoord[coord])
                    {
                        tabCoord[coord] = 1;
                        tabCoordHeures[coord] = formateTitle(date,cpt)+'\n';
                        tabDefenderNames[coord] = defenderName;
                    }
                    else
                    {
                        tabCoord[coord] += 1;
                        tabCoordHeures[coord] += formateTitle(date,cpt)+'\n';
                    }
                }
                else
                {
                    log('Message Date: ' + date + ' Settings: ' + settings.lastCheckCombatReport);
                    ok = false;
                    break;
                }
            }
        }

        cpt++;
        message = getMessage(cpt, TABID_COMBAT_REPORT);
    }
    // end of collecting data time for some display
    log('CoordsToCookies');
    $.cookie("tabCoord", JSON.stringify(tabCoord), {expires: 1});
    $.cookie("tabCoordHeures", JSON.stringify(tabCoordHeures), {expires: 1});
    $.cookie("tabDefenderNames", JSON.stringify(tabDefenderNames), {expires: 1});
    // write settings
    settings.lastCheckCombatReport = lastCheck;
    settings.write();
    log('start display loadInfo');
    display();
}

function display() {
	log('start to display');
    var maxRaid = 6;

    //load coords from cookie
    var tabCoord = getCookie("tabCoord");
    log(tabCoord);

    //load attack times from cookie
    var tabCoordHeures = getCookie("tabCoordHeures");
    log(tabCoordHeures);

    //load defender names from cookie
    var tabDefenderNames = getCookie("tabDefenderNames");
    log(tabDefenderNames);

    var isGood =true;
    var coordByNbAttaque = {};

    for (var coord in tabCoord )
    {
        var defenderSpan = '<span style="font-weight: bold; color: rgb(0, 128, 0); font-size: 11px;">'+tabDefenderNames[coord]+': </span>';

        var coordHeure = '';
        if (tabCoordHeures)
            coordHeure = tabCoordHeures[coord];
        // pour l'affichage en div
        if (typeof coordByNbAttaque[tabCoord[coord]] == 'undefined')
        {
            coordByNbAttaque[tabCoord[coord]] = defenderSpan+'<a title="'+coordHeure+'" href="'+coordToUrl(coord)+'" >'+coord +'</a><br/> ';
        }
        else
        {
            coordByNbAttaque[tabCoord[coord]] +=defenderSpan+'<a title="'+coordHeure+'" href="'+coordToUrl(coord)+'">'+coord +'</a><br/>  ';
        }

        // pour l'alert
        if ( tabCoord[coord] >= maxRaid )
        {
            isGood =false;
        }

    }

    var htmlCount = '<div ><span class="overlay" style="color: #FFF;text-decoration: none;font: 11px Verdana,Arial,Helvetica,sans-serif;width: 150px;text-align: center;background: transparent -moz-linear-gradient(center top , #171D23 0px, #101419 100%) repeat scroll 0% 0%;border: 1px solid #3F3D13;border-radius: 5px;padding: 5px;display: block;">';

    if ( isGood )
    {
        htmlCount += '<span style="font-weight: bold; color: rgb(0, 128, 0); font-size: 16px;">'+title1+'</span><br/>';
        htmlCount += '<span style="font-weight: bold; color: rgb(0, 128, 0); font-size: 11px;">'+title2+'</span><br/>';
        htmlCount += '<br/><br/>';
    }
    else
    {
        htmlCount += '<span style="font-weight: bold; color: rgb(128, 0, 0); font-size: 16px;">'+title3+'</span>';
        htmlCount += '<br/><br/>';
    }

    for (var count in coordByNbAttaque )
    {
        if ( count == "1")
        {
            htmlCount += count +' '+captionAttack+' :  <br />' + coordByNbAttaque[count] + ' <br/>';
        }
        else if (count < maxRaid )
        {
            htmlCount += count +' '+captionAttacks+' :  <br />' + coordByNbAttaque[count] + ' <br/>';
        }
        else
        {
            htmlCount += '<span style="font-weight: bold; color: rgb(128, 0, 0); font-size: 11px;">';
            htmlCount += count +' '+captionAttacks+' :  <br />' + coordByNbAttaque[count] + ' <br/>';
            htmlCount +='</span>';
        }
    }

    htmlCount += '</span></div>';

    var info = document.createElement("div");
    info.className="adviceWrapper";
    info.innerHTML=htmlCount;
    info.id="id_check_attaque";

    var link = document.getElementById("links");
    var conteneur =  document.getElementById('id_check_attaque');
    if (typeof(conteneur) == 'undefined' || conteneur === null)
    {
        link.appendChild(info);
    }
    else
    {
        link.replaceChild(info,conteneur);
    }
}


// execute script
startScript();
