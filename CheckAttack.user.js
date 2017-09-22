// ==UserScript==
// @name        CheckAttack
// @namespace   https://github.com/GeneralAnasazi
// @author      GeneralAnasazi
// @description Plug in anti bash
// @include *ogame.gameforge.com/game/*
// @version 3.3.0.3
// @grant		GM_getValue
// @grant		GM_setValue
// @grant		GM_deleteValue

// ==/UserScript==

// constants
const COOKIE_EXPIRES_DAYS = 1;
const ERROR = 'Error';
const TABID_SPY_REPORT = 20;
const TABID_COMBAT_REPORT = 21; // combat report

const DIV_STATUS_GIF_ID = "id_check_attack_status_div";
const DIV_STATUS_ID = "id_check_attack";
const LINKS_TOOLBAR_BUTTONS_ID = "links";
const SPAN_STATUS_ID = "id_check_attack_status";
// has to set after a renew
const VERSION_SCRIPT = '3.3.0.3';

// debug consts
const DEBUG = false; // set it to true enable debug messages -> log(msg)
const RESET_COOKIES = false;


// **************************************************************************

// globale vars
var attackTracker = null;
var inactivePlayers = null;
var language = document.getElementsByName('ogame-language')[0].content;
var playerName = document.getElementsByName('ogame-player-name')[0].content;
var totalRess = new TotalRessources();

// translation vars (don't translate here)
var captionAttack = "attaque";
var captionAttacks = "attaques";
var loadStatusCR = "loading CR";
var loadStatusSR = "loading SR";
var title1 = "Pas de risque";
var title2 = "de bash";
var title3 = "Risque de bash";


// *** Objects **************************************************************

// async object
var asyncHelper = {
    currentPage: -1,
    errors: 0,
    lastCheck: getBashTimespan(),
    maxErrors: 10,
    maxPage: -1,
    tabId: -1,

    // *** METHODS ***
    // finish the async process and set default values
    clearAsync: function() {
        if (this.started())
        {
            switch(this.tabId)
            {
                case TABID_SPY_REPORT:
                    settings.lastCheckSpyReport = this.lastCheck;
                    break;
                case TABID_COMBAT_REPORT:
                    settings.lastCheckCombatReport = this.lastCheck;
                    break;
            }
            settings.write();
            this.currentPage = -1;
            this.lastCheck = getBashTimespan();
            this.maxPage = -1;
            this.tabId = -1;
        }
    },
    // to initialize an async action
    startAsync: function(tabId) {
        this.currentPage = 1;
        this.lastCheck = getBashTimespan();
        this.maxPage = 0;
        this.tabId = tabId;
        switch (this.tabId)
        {
            case TABID_SPY_REPORT:
                setStatus(loadStatusSR);
                break;
            case TABID_COMBAT_REPORT:
                setStatus(loadStatusCR);
                break;
        }
    },
    // is an async process started
    started: function() {
        return (this.currentPage > -1 && this.maxPage > -1);
    }
};

var localeSettings = {
    decimalSeperator: '',
    thousandSeperator: '',
    load: function() {
        var number = 543.54;
        var localeStr = number.toLocaleString();
        if (localeStr.includes(','))
        {
            this.decimalSeparator = ',';
            this.thousandSeperator = '.';
        }
        else
        {
            this.decimalSeparator = '.';
            this.thousandSeperator = ',';
        }
    },
    parseFloat: function(str) {
        var result = -1;
        var strNumber = str.replace(this.thousandSeperator, '');
        if (this.decimalSeperator == ',')
            strNumber = str.replace(',', '.');
        var isMillion = strNumber.includes('M');
        result = parseFloat(strNumber);
        if (isMillion)
            result = parseFloat(result * 1000000);
        return result;
    }
};

// getTranslation from OGame
var ressourceTitles = {
    metal: '',
    crystal: '',
    deuterium: '',
    isLoaded: function() {
        return (this.metal !== '' && this.crystal !== '' && this.deuterium !== '');
    },
    load: function (arr) {
        try
        {
            log(arr);
            this.metal = arr[1].split(': ')[0];
            this.crystal = arr[2].split(': ')[0];
            this.deuterium = arr[3].split(': ')[0];
        }
        catch (ex)
        {
            console.log('Error on ressourceTitles.load(arr): ' + ex);
        }
    },
    read: function() {
        var obj = loadFromLocalStorage('TranslationRessources');
        if (obj)
        {
            this.metal = obj.metal;
            this.crystal = obj.crystal;
            this.deuterium = obj.deuterium;
        }
    },
    write: function() {
        writeToLocalStorage(this, 'TranslationRessources');
    }
};

// settings object
var settings = {
    // last readed message from combat report
    lastCheckCombatReport: getBashTimespan(),
    // last readed message from spy report
    lastCheckSpyReport: getBashTimespan(),
    lastVersion: '',
    isNewVersion: function() {
        return (this.lastVersion != VERSION_SCRIPT);
    },
    load: function() {
        var obj = loadFromLocalStorage('Settings');
        if (obj)
        {
            if (obj.lastCheckCombatReport)
            {
                this.lastCheckCombatReport = new Date(obj.lastCheckCombatReport);
            }
            if (obj.lastCheckSpyReport)
            {
                this.lastCheckSpyReport = new Date(obj.lastCheckSpyReport);
            }
            if (obj.lastVersion)
            {
                this.lastVersion = obj.lastVersion;
            }
        }
    },
    write: function() {
        this.lastVersion = VERSION_SCRIPT;
        writeToLocalStorage(this, 'Settings');
    }
}; // cookie tabSettings


/***** CONSTRUCTORS ***********************************************************/

function Attacks(combatReport) {
    /***** PROPERTIES *****/
    this.attackTimes = [];
    this.coord = '';
    this.count = 0;
    this.defenderName = 'Unknown';
    this.moon = false;
    /***** METHODS *****/
    this.addAttack = function(combatReport) {
        if (combatReport)
        {
            this.attackTimes.push(combatReport.date);
            this.coord = combatReport.coord;
            this.defenderName = combatReport.defenderName;
            this.moon = combatReport.moon;
            this.count++;
        }
    };
    this.checkAttacks = function() {
        var bashSpan = getBashTimespan();
        var i = 0;
        log('checkAttacks ' + this.coord + ' ' + this.defenderName + ' ' + this.attackTimes.length);
        while(i < this.attackTimes.length)
        {
            if (this.attackTimes[i] < bashSpan)
            {
                this.attackTimes.splice(i, 1);
                this.count--;
            }
            else
                i++;
        }
        return this.count;
    };
    this.getTimesStr = function() {
        var result = '';
        for (var i = 0; i < this.attackTimes.length; i++)
        {
            if (result !== '')
                result += '\n';
            result += this.attackTimes[i].toISOString();
        }

        return result;
    };
    this.setValues = function(attack) {
        log(attack);
        for (var i = 0; i < attack.attackTimes.length; i++)
            this.attackTimes.push(new Date(attack.attackTimes[i]));
        this.coord = attack.coord;
        this.count = attack.count;
        this.defenderName = attack.defenderName;
        this.moon = attack.moon;
    };
    this.toHtml = function() {
        var defenderSpan = '<span style="font-weight: bold; color: grey;display: inline-block;float: center;text-align: center">' + this.defenderName + '</span>';
        if (this.moon)
            defenderSpan += '<img src="https://github.com/GeneralAnasazi/OGame-CheckAttack/raw/master/Moon.gif" style="height: 14px; width: 14px;float: right;">';
        return '<a title="' + this.getTimesStr() + ' (time in UTC)" href="' + coordToUrl(this.coord)+'" style="display: inline-block;width: 58px;text-align: left">' + this.coord + '</a>' + defenderSpan + '<br/>';
    };

    // on create
    this.addAttack(combatReport);
}

function AttackTracker() {
    /***** PROPERTIES *****/
    this.attacks = [];

    /***** METHODS *****/
    this.addAttack = function(combatReport) {
        var idx = this.attacks.findIndex(x => x.coord == combatReport.coord && x.moon == combatReport.moon);
        if (idx > -1)
        {
            log('attack found at ' + idx);
            log(this.attacks[idx]);
            log(combatReport);
            this.attacks[idx].addAttack(combatReport);
        }
        else
            this.attacks.push(new Attacks(combatReport));
    };
    this.checkAttacks = function() {
        var i = 0;
        while ( i < this.attacks.length)
        {
            if (this.attacks[i].checkAttacks() > 0)
                i++;
            else
                this.attacks.slice(i, 1);
        }
    };
    this.clear = function() {
        this.attacks = [];
    };
    this.read = function() {
        this.clear();
        var obj = loadFromLocalStorage('AttackTracker');
        if (obj)
        {
            for (var i = 0; i < obj.attacks.length; i++)
            {
                var att = new Attacks();
                att.setValues(obj.attacks[i]);
                this.attacks.push(att);
            }
        }
    };
    this.sortAttacks = function() {
        this.attacks.sort(function(left, right){
            var result = 0;
            if (left.count < right.count)
                result = 1;
            else if (left.count > right.count)
                result = -1;
            else
            {
                result = left.coord.localeCompare(right.coord);
            }
            return result;
        });
    };
    this.toHtml = function() {
        var result = '';
        for (var i = 0; i < this.attacks.length; i++)
        {
            result += this.attacks[i].toHtml();
        }
        return result;
    };
    this.write = function() {
        this.sortAttacks();
        writeToLocalStorage(this, 'AttackTracker');
    };

    // on create
    this.read();
}

function CombatReport(msg) {
    this.attackerName = 'Unknown';
    this.coord = null;
    this.date = null;
    this.debrisField = 0;
    this.defenderName = 'Unknown';
    this.moon = false;
    this.ressources = null;
    this.load = function(msg) {
        var result = false;
        try
        {
            if (msg)
            {
                // get coord
                var locTab = msg.getElementsByClassName('txt_link')[0];
                if (locTab)
                    this.coord = locTab.innerHTML;
                // get isPlanet or isMoon
                var figure = msg.getElementsByClassName('planetIcon moon')[0];
                if (figure)
                    this.moon = true;

                this.date = getDateFromMessage(msg, false);
                this.defenderName = getDefender(msg);

                var combatLeftSide = msg.getElementsByClassName('combatLeftSide')[0];
                if (combatLeftSide)
                {
                    //TODO: Bei über einer Million werden die Daten abgeschnitten -> Bug fix
                    var spanList = combatLeftSide.getElementsByTagName('span');
                    if (spanList[0] && spanList.length > 2) //attacker
                    {
                        var arr = spanList[0].innerHTML.split(': ');
                        this.attackerName = arr[1].replace('(', '').replace(')', '');
                        this.ressources = new Ressources(spanList[1]);
                        this.debrisField = parseInt(spanList[2].innerHTML.split(': ')[1].replace('.',''));
                    }
                }
            }
        }
        catch (ex)
        {
            console.log('Error on CombatReport.load(msg): ' + ex);
        }
        return result;
    };
    this.setValues = function(obj) {
        this.attackerName = obj.attackerName;
        this.coord = obj.coord;
        this.date = new Date(obj.date);
        this.debrisField = obj.debrisField;
        this.defenderName = obj.defenderName;
        this.ressources = new Ressources();
        this.ressources.setValues(obj.ressources);
    };
    // load from message
    this.load(msg);
}

function Ressources(span) {
    this.metal = 0;
    this.crystal = 0;
    this.deuterium = 0;
    this.total = 0;
    this.clear = function() {
        this.metal = 0;
        this.crystal = 0;
        this.deuterium = 0;
        this.total = 0;
    };
    this.load = function(span) {
        if (span)
        {
            try
            {
                var arr = span.getAttribute('title').split('<br/>');
                this.metal = localeSettings.parseFloat(arr[1].split(': ')[1]);
                this.crystal = localeSettings.parseFloat(arr[2].split(': ')[1]);
                this.deuterium = localeSettings.parseFloat(arr[3].split(': ')[1]);
                this.total = localeSettings.parseFloat(span.innerHTML.split(': ')[1]);
                if (!ressourceTitles.isLoaded())
                {
                    ressourceTitles.load(arr);
                }
            }
            catch (ex)
            {
                console.log('Error Ressources.load(span):' + ex);
            }
        }
    };
    this.setValues = function(obj) {
        this.metal = obj.metal;
        this.crystal = obj.crystal;
        this.deuterium = obj.deuterium;
        this.total = obj.total;
    };
    this.toHtml = function(title, className) {
        var result = '';
        if (title && className)
        {
            var titelStyle = 'font-size: 10px;color: #4f85bb;font-weight: bold;background: black;border: 1px solid #383838;border-radius: 4px;padding: 1px;text-align: center;display: block';
            var spanAttr = 'style="padding: 9px;"';

            result += '<div class="' + className + '" style="font-size: 9px;color: grey;font-weight: bold;background: #111111;padding: 5px">';
            result += getSpanHtml(title, 'class="textCenter" style="'+ titelStyle +'"') + '</br>';
            result += getSpanHtml(ressourceTitles.metal + ': ' + this.metal.toLocaleString(), spanAttr) + '</br>';
            result += getSpanHtml(ressourceTitles.crystal + ': ' + this.crystal.toLocaleString(), spanAttr) + '</br>';
            result += getSpanHtml(ressourceTitles.deuterium + ': ' + this.deuterium.toLocaleString(), spanAttr) + '</br>';

            result +='</div>';
        }
        return result;
    };

    this.load(span);
}

function TotalRessources()  {
    this.combatReports = [];
    this.lastCombatReport = getBashTimespan();
    this.ressources = new Ressources();

    /*** METHODS *********************/
    this.append = function(combatReport) {
        if (combatReport && combatReport.ressources && combatReport.date > settings.lastCheckCombatReport)
        {
            this.combatReports.push(combatReport);
            if (combatReport.ressources.metal)
                this.ressources.metal += combatReport.ressources.metal;
            if (combatReport.ressources.crystal)
                this.ressources.crystal += combatReport.ressources.crystal;
            if (combatReport.ressources.deuterium)
                this.ressources.deuterium += combatReport.ressources.deuterium;
            if (combatReport.ressources.total)
                this.ressources.total += combatReport.ressources.total;
        }
    };
    this.calc = function(date) {
        this.ressources.clear();
        this.sortByDateDesc();
        log(this.combatReports);
        for (var i = 0; i < this.combatReports.length; i++)
        {
            if ((this.combatReports[i].date > date && this.combatReports[i].ressources))
            {
                if (this.combatReports[i].ressources.metal && !Number.isNaN(this.combatReports[i].ressources.metal))
                    this.ressources.metal += this.combatReports[i].ressources.metal;
                if (this.combatReports[i].ressources.crystal && !Number.isNaN(this.combatReports[i].ressources.crystal))
                    this.ressources.crystal += this.combatReports[i].ressources.crystal;
                if (this.combatReports[i].ressources.deuterium && !Number.isNaN(this.combatReports[i].ressources.deuterium))
                    this.ressources.deuterium += this.combatReports[i].ressources.deuterium;
                if (this.combatReports[i].ressources.total && !Number.isNaN(this.combatReports[i].ressources.total))
                    this.ressources.total += this.combatReports[i].ressources.total;
            }
        }
    };
    this.clear = function() {
        this.combatReports = [];
        this.ressources.clear();
    };
    this.load = function() {
        var obj = loadFromLocalStorage('TotalRaidRessources');
        if (obj)
        {
            // Combat Reports
            for (var i = 0; i < obj.combatReports.length; i++)
            {
                var report = new CombatReport();
                report.setValues(obj.combatReports[i]);
                this.combatReports.push(report);
            }
            // Ressources
            this.ressources.setValues(obj.ressources);
            this.lastCombatReport = new Date(obj.lastCombatReport);
        }
        ressourceTitles.read();
    };
    this.save = function() {
        writeToLocalStorage(this, 'TotalRaidRessources');
        ressourceTitles.write();
    };
    this.sortByDateDesc = function() {
        this.combatReports.sort(compareByDate);
    };
    this.toHtml = function(title, className) {
        log(this);

        if (this.ressources.metal)
            return this.ressources.toHtml(title, className);
        else
            return '';
    };
}

/***** SCRIPT METHODS *********************************************************************/

//TODO: translation new vars
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
    if (DEBUG)
        console.log(msg);
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

function compareByDate(left, right) {
    var result = 0;
    if (left.date < right.date)
        result = -1;
    else if (left.date > right.date)
        result = 1;
    // descending order
    result = result * -1;
    return result;
}

function createDiv(id, className)
{
    var div = document.createElement('div');
    if (id && id !== '')
        div.id = id;
    if (className && className !== '')
        div.className = className;
    return div;
}

function createHiddenDiv()
{
    // create and hidden div for result storing and parsing
    var div = createDiv("verificationAttaque");
    div.style.visibility = "hidden";
    document.body.appendChild(div);
}

function createSpanStatus(msg)
{
    var span = document.createElement('span');
    span.id = SPAN_STATUS_ID;
    span.innerHTML = msg;
    if (msg.includes(ERROR))
        span.style.color = 'red';
    return span;
}

function deleteValueLocalStorage(key)
{
    GM_deleteValue('CheckAttack_' + key);
}

function display() {
	log('start to display');
    log(attackTracker);
    var maxRaid = 6;

    try
    {
        attackTracker.sortAttacks();
        var coordByNbAttaque = {};
        var isGood =true;

        for (var i = 0; i < attackTracker.attacks.length; i++)
        {
            var attack = attackTracker.attacks[i];
            if (!coordByNbAttaque[attack.count])
                coordByNbAttaque[attack.count] = attack.toHtml();
            else
                coordByNbAttaque[attack.count] += attack.toHtml();

            // show alert
            if ( attack.count >= maxRaid )
            {
                isGood = false;
            }
        }
        //linear-gradient(to bottom, #959595 0%,#0d0d0d 10%,#010101 70%,#0a0a0a 80%,#4e4e4e 90%,#383838 95%,#1b1b1b 100%)
        var htmlCount = '<div class="textCenter" style="font-weight: bold;background: linear-gradient(to bottom, #959595 0%,#0d0d0d 7%,#010101 85%,#0a0a0a 91%,#4e4e4e 93%,#383838 97%,#1b1b1b 100%);' +
            'border: 2px solid black;border-radius: 5px;padding: 1px;text-align: center;color: #4f85bb;height:38px;display: block; font-size: 14px;padding: 7px">';
        if ( isGood )
        {
            htmlCount += title1 + '<br/>';
            htmlCount += '<span style="color: #4f85bb; font-size: 11px;">'+title2+'</span><br/>';
        }
        else
        {
            htmlCount += '<span style="font-weight: bold; color: rgb(128, 0, 0); font-size: 14px;">'+title3+'</span>';
        }
        htmlCount += '</div>';

        // start content div
        htmlCount += '<div class="attackContent" style="font-size: 9px;color: #4f85bb;font-weight: bold;background: #111111;padding: 8px;">';
        for (var count in coordByNbAttaque )
        {
            if (count < maxRaid)
            {
                htmlCount += '<span style="font-weight: bold; font-size: 10px; padding: 3px;display: inline-block;">';
                if (count == "1")
                {
                    htmlCount += count +' '+captionAttack+'  </span><br/>' + coordByNbAttaque[count] + ' <br/>';
                }
                else
                {
                    htmlCount += count +' '+captionAttacks+'  </span><br/>' + coordByNbAttaque[count] + ' <br/>';
                }
            }
            else
            {
                htmlCount += '<span style="font-weight: bold; color: rgb(128, 0, 0);">';
                htmlCount += count +' '+captionAttacks+'  <br />' + coordByNbAttaque[count] + ' <br/>';
                htmlCount +='</span>';
            }
        }

        htmlCount += '</div>';
        htmlCount += totalRess.toHtml('Raid-Ressources', 'attackContent');

        var info = createDiv(DIV_STATUS_ID, "content-box-s");
        info.style.width = '170px';
        info.style.borderRadius = '5px';
        info.style.border = '1px solid black';
        info.innerHTML=htmlCount;

        replaceElement(LINKS_TOOLBAR_BUTTONS_ID, DIV_STATUS_ID, info);
    }
    catch (ex)
    {
        console.log('Error on display(): ' + ex);
    }
}

function displayLoadingGif()
{
    // display a loading gif
    var info = document.createElement("div");
    info.className = "adviceWrapper";
    info.innerHTML =
        '<div style="algin:center;text-align: center;" id="' + DIV_STATUS_GIF_ID + '">' +
            '<img src="https://raw.githubusercontent.com/GrosLapin/scriptOgame/master/ajax-loader.gif" /></br>' +
        '</div>';
    info.id = DIV_STATUS_ID;
    var span = createSpanStatus('start loading...');
    info.getElementsByTagName('div')[0].appendChild(span);

    replaceElement(LINKS_TOOLBAR_BUTTONS_ID, DIV_STATUS_ID, info);
}

function getBashTimespan()
{
    var date = new Date();
    date.setDate(date.getDate() - 1);
    return date;
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
        else
        {
            console.log("Error on getDateFromMessage(msg, isSpy): Can't read the date " + mesgtab);
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
    return result;
}

function getMaxPage()
{
    var result = -1;
    var litab = document.getElementsByClassName('paginator');
    var li = litab[litab.length -1];
    if (li)
        result = li.getAttribute("data-page");
    return result;
}

// loading the page async from the server
function getMessageAsync() {
    if (asyncHelper.started())
    {
        return $.ajax({
            type:     'POST',
            url:      '/game/index.php?page=messages',
            data:     'messageId=-1&tabid='+asyncHelper.tabId+'&action=107&pagination='+asyncHelper.currentPage+'&ajax=1',
            dataType: 'html',
            context:  document.body,
            global:   false,
            async:    true,
            error:    function(jqXHR, exception) {
                console.log(jqXHR);
                console.log(exception);
                setStatus('Error: ' + exception);
            },
            success:  function(data) {
                var result = -1;
                try
                {
                    var div = document.getElementById("verificationAttaque");
                    if (div)
                    {
                        div.innerHTML = data;
                        if (asyncHelper.currentPage == 1)
                            asyncHelper.maxPage = getMaxPage();

                        switch (asyncHelper.tabId)
                        {
                            case TABID_SPY_REPORT:
                                result = readSpyReports(asyncHelper.currentPage) ? 1 : 0;
                                asyncHelper.currentPage++;
                                setStatus(loadStatusSR);
                                break;
                            case TABID_COMBAT_REPORT:
                                result = readCombatReports(asyncHelper.currentPage) ? 1 : 0;
                                asyncHelper.currentPage++;
                                setStatus(loadStatusCR);
                                break;
                        }
                        if (result == 1) // load the other pages recursiv
                        {
                            if (asyncHelper.currentPage <= asyncHelper.maxPage)
                                getMessageAsync();
                        }
                        else if (result === 0 || asyncHelper.currentPage > asyncHelper.maxPage)
                        {
                            switch (asyncHelper.tabId)
                            {
                                case TABID_SPY_REPORT:
                                    writeToLocalStorage(inactivePlayers, "InactivePlayers");
                                    asyncHelper.clearAsync();
                                    asyncHelper.startAsync(TABID_COMBAT_REPORT);
                                    getMessageAsync();
                                    break;
                                case TABID_COMBAT_REPORT:
                                    asyncHelper.clearAsync();
                                    // messages are loaded -> view the result
                                    attackTracker.write();
                                    totalRess.calc(getBashTimespan());
                                    totalRess.save();
                                    display();
                                    break;
                            }
                        }
                    }
                    else
                    {
                        console.log('div "verificationAttaque" not found');
                    }
                }
                catch(ex)
                {
                    console.log(ex);
                }
            }
        });
    }
}

function getSpanHtml(innerHtml, attributes) {
    var result = '<span';
    if (attributes)
        result += ' ' + attributes;
    result += '>' + innerHtml + '</span>';
    return result;
}

//local storage functions
function GM_getValue(key, defaultVal)
{
    var retValue = localStorage.getItem(key);
    if ( !retValue )
    {
        return defaultVal;
    }
    return retValue;
}

function GM_setValue(key, value)
{
    localStorage.setItem(key, value);
}

function GM_deleteValue(value)
{
    localStorage.removeItem(value);
}

function isAppendedToday(date, isSpyReport)
{
    var lastCheckSettings = settings.lastCheckCombatReport;
    if (isSpyReport)
        lastCheckSettings = settings.lastCheckSpyReport;

    var fLastCheck = getBashTimespan();
    // performance boost
    if (fLastCheck < lastCheckSettings)
    {
        fLastCheck = lastCheckSettings;
        log("use lastCheck from settings " + fLastCheck);
    }
    return date > fLastCheck;
}

function loadFromLocalStorage(key)
{
    var result = null;
    var json = GM_getValue('CheckAttack_' + key, 'no value');
    if (json != 'no value')
    {
        try
        {
            result = JSON.parse(json);
        }
        catch (ex)
        {
            console.log('Error on loadFromLocalStorage(' + key + '): ' + ex);
        }
    }
    return result;
}

function loadInfo()
{
    // check for no other clicks and lock this procedure
    if (asyncHelper.started())
        return;

    displayLoadingGif();
    asyncHelper.startAsync(TABID_SPY_REPORT); // set the start values for the async process
    attackTracker.checkAttacks();

    // start search for inactive players -> async
    getMessageAsync();
}

function readCombatReports(page)
{
    var result = true;
    try
    {
        var isSpyReport = false;
        var collEnfants = document.getElementsByClassName('msg');

        // 1 of 2 child are not of your bisness, and the first is the < << >> > button so start at 3 and +2
        for (var i = 0; i < collEnfants.length; i++)
        {
            var msg = collEnfants[i];
            var combatReport = new CombatReport(msg);
            if (page == 1 && i === 0)
                asyncHelper.lastCheck = combatReport.date;

            if ((inactivePlayers[combatReport.defenderName] != 'i' || inactivePlayers == {}) &&
                // exclude attacks of your self and attacks from
                combatReport.defenderName != playerName &&
                combatReport.defenderName != 'Unknown') // exclude Spy Attacks and total destroyed in the first round
            {
                if (isAppendedToday(combatReport.date, isSpyReport))
                {
                    attackTracker.addAttack(combatReport);
                }
                else
                {
                    result = false;
                    break;
                }
            }
            if (combatReport.attackerName != 'Unknown')
                totalRess.append(combatReport);
        }
    }
    catch(ex)
    {
        console.log("Error on readCombatReports(page): " + ex);
        result = false;
    }
    return result;
}

function readSpyReports(page)
{
    var result = true;

    var messageList = document.getElementsByClassName('msg ');
    if (messageList)
    {
        for (var i = 0; i < messageList.length; i++)
        {
            var msgDate = getDateFromMessage(messageList[i], true);
            if (page == 1 && i === 0)
            {
                asyncHelper.lastCheck = msgDate;
            }

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
                result = false;
                break;
            }
        }
    }
    else
    {
        console.log("Error on readSpyReports(page): MessageList not found");
    }

    return result;
}

function replaceElement(idParent, idElement, element)
{
    var link = document.getElementById(idParent);
    var conteneur =  document.getElementById(idElement);
    if (!conteneur)
        link.appendChild(element);
    else
        link.replaceChild(element, conteneur);
}

function resetCookies()
{
    // resetCookies is only for debug operations or to transfor old date format to the new one
    log('reset cookies');
    if (!RESET_COOKIES)
    {
        settings.lastCheckSpyReport = getBashTimespan();
        deleteValueLocalStorage('InactivePlayers');
    }

    // to prevent that the cooies will be reseted every time
    settings.lastCheckCombatReport = getBashTimespan();
    settings.write();

    //deleteValueLocalStorage('Settings');
    //if (settings.lastVersion === '')
    deleteValueLocalStorage('AttackTracker');
    deleteValueLocalStorage('TotalRaidRessources');
}

function setStatus(msg)
{
    var text = msg;
    if (asyncHelper.started())
        text += ' page ' + asyncHelper.currentPage;
    if (!msg.includes(ERROR))
        text += '...';
    var span = createSpanStatus(text);
    replaceElement(DIV_STATUS_GIF_ID, SPAN_STATUS_ID, span);
}

// initialize the script and load some informations from existing cookies
function startScript()
{
    try
    {
        // button for checking
        var btn = document.createElement("a");
        btn.innerHTML="Check Raid";
        btn.className="menubutton";
        btn.href ="javascript:"; 				// i don't like href="#" it can make the page moving
        btn.addEventListener('click', function(){ loadInfo() ;}, false);
        var li=document.createElement("li");
        li.appendChild(btn);
        var menu = document.getElementById("menuTableTools");
        menu.appendChild(li);
        createHiddenDiv();

        localeSettings.load();
        translate();
        settings.load();
        attackTracker = new AttackTracker();
        if (settings.isNewVersion())
        {
            log('New Version detected!');
            resetCookies();
            attackTracker.read();
        }
        else if (RESET_COOKIES) // for debug
        {
            resetCookies();
        }

        totalRess.load();

        log('before load inactive players');
        inactivePlayers = loadFromLocalStorage("InactivePlayers");
        // secure that the inactive players will be load after the update
        if (!inactivePlayers)
        {
            settings.lastCheckSpyReport = getBashTimespan();
            inactivePlayers = {};
        }

        log(settings);
        display();
    }
    catch(ex)
    {
        console.log("Error on startScript(): " + ex);
    }
}

function writeToLocalStorage(obj, key)
{
    var json = JSON.stringify(obj);
    var canSave = true;
    try
    {
        var testObj = JSON.parse(json);
    }
    catch (ex)
    {
        canSave = false;
    }
    if (canSave)
    {
        GM_setValue('CheckAttack_' + key, json);
    }
}

// execute script
startScript();
