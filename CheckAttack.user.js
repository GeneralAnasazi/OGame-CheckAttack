// ==UserScript==
// @name        CheckAttack
// @namespace   https://github.com/GeneralAnasazi
// @author      GeneralAnasazi
// @description Plug in anti bash
// @include *ogame.gameforge.com/game/*
// @version 3.3.0.11
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
const VERSION_SCRIPT = '3.3.0.11';
// set VERSION_SCRIPT_RESET to the same value as VERSION_SCRIPT to force a reset of the local storage
const VERSION_SCRIPT_RESET = '3.3.0.11';

// debug consts
const DEBUG = false; // set it to true enable debug messages -> log(msg)
const RESET_COOKIES = false;


// **************************************************************************
var test = false;

// globale vars
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
            this.decimalSeperator = ',';
            this.thousandSeperator = '.';
        }
        else
        {
            this.decimalSeperator = '.';
            this.thousandSeperator = ',';
        }
    },
    parseFloat: function(str) {
        var result = -1;
        var strNumber = str.replace(this.thousandSeperator, '');
        if (this.decimalSeperator == ',')
        {
            strNumber = strNumber.replace(',', '.');
        }
        var isMillion = strNumber.includes('M');
        result = parseFloat(strNumber);
        if (isMillion)
        {
            log('is Million: ' + strNumber + ' Result: ' + result);
            result = result * 1000 * 1000;
        }
        log('end result: ' + result);
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
    lastVersion: '0',
    isNewVersion: function() {
        return compareVersion(this.lastVersion, VERSION_SCRIPT) < 0;
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
    showDialog: function() {

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
            this.attackTimes.push(combatReport.info.date);
            this.coord = combatReport.info.coord;
            this.defenderName = combatReport.defenderName;
            this.moon = combatReport.info.moon;
            this.count++;
        }
    };
    this.getTimesStr = function() {
        var result = '';
        if (this.attackTimes)
        {
            for (var i = 0; i < this.attackTimes.length; i++)
            {
                if (result !== '')
                    result += '\n';
                result += this.attackTimes[i].toISOString();
            }
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
        var idx = this.attacks.findIndex(el => el.coord == combatReport.info.coord && el.moon == combatReport.info.moon);
        if (idx > -1)
        {
            this.attacks[idx].addAttack(combatReport);
        }
        else
            this.attacks.push(new Attacks(combatReport));
    };
    this.clear = function() {
        this.attacks = [];
    };
    this.sortAttacks = function() {
        if (this.attacks)
        {
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
        }
    };
    this.read = function() {
        this.clear();
        var obj = loadFromLocalStorage('AttackTracker');
        if (obj)
        {
            for (var i = 0; i < obj.attacks.length; i++)
            {
                if (obj.attacks[i])
                {
                    var att = new Attacks();
                    att.setValues(obj.attacks[i]);
                    this.attacks.push(att);
                }
            }
        }
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
}

function CombatReport(msg) {
    this.attackerName = 'Unknown';
    this.debrisField = 0;
    this.defenderName = 'Unknown';
    this.info = null;
    this.ressources = null;
    this.load = function(msg) {
        var result = false;
        try
        {
            if (msg)
            {
                this.info = new ReportInfo(msg);
                this.defenderName = getDefender(msg);

                var combatLeftSide = msg.getElementsByClassName('combatLeftSide')[0];
                if (combatLeftSide && this.defenderName != 'Unknown')
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
        this.debrisField = obj.debrisField;
        this.defenderName = obj.defenderName;
        this.info = new ReportInfo();
        this.info.setValues(obj.info);
        this.ressources = new Ressources();
        this.ressources.setValues(obj.ressources);
    };
    // load from message
    this.load(msg);
}

function CollectingReport(msg) {
    this.info = null;
    this.ressources = null;

    this.parseMessage = function(msg) {
        if (msg)
        {
            this.info = new ReportInfo(msg);

            var span = msg.getElementsByClassName('msg_content');
            if (span[0])
            {
                var text = span[0].innerHTML;
                var sentences = text.split('. ');
                if (sentences.length > 2 && sentences[sentences.length - 1].includes(ressourceTitles.metal))
                {
                    var words = sentences[2].split(' ');
                    this.ressources = new Ressources();
                    var i = words.length - 1;
                    var metal = ressourceTitles.metal + ': ';
                    var crystal = ressourceTitles.metal + ': ';
                    var deuterium = ressourceTitles.deuterium + ': '; // usally not needed but nobody knows what's happend in the future
                    while (i > -1)
                    {
                        if (words[i] == ressourceTitles.metal)
                        {
                            metal += words[i-1];
                            i -= 2;
                        }
                        else if (words[i] == ressourceTitles.crystal)
                        {
                            crystal += words[i-1];
                            i -= 2;
                        }
                        else if (words[i] == ressourceTitles.deuterium)
                        {
                            deuterium += words[i-1];
                            i -= 2;
                        }
                        else
                            i--;
                    }
                    if (deuterium == ressourceTitles.deuterium + ': ')
                        deuterium += '0';
                    this.ressources.metal = extractRess(metal);
                    this.ressources.crystal = extractRess(crystal);
                    this.ressources.deuterium = extractRess(deuterium);
                    this.ressources.total = this.ressources.metal + this.ressources.crystal + this.ressources.deuterium;
                }
            }
        }
    };
    this.setValues = function(report) {
        this.info = new ReportInfo();
        this.info.setValues(report.info);
        this.ressources = new Ressources();
        this.ressources.setValues(report.ressources);
    };

    this.parseMessage(msg);
}

function ReportInfo(msg) {
    this.coord = '';
    this.date = null;
    this.moon = false;
    /***** METHODS *****/
    this.equal = function(info) {
        return this.coord == info.coord && this.date.getTime() == info.date.getTime() &&
            this.moon == info.moon;
    };
    this.parseMessage = function(msg) {
        if (msg)
        {
            this.coord = this.readCoord(msg);
            this.date = this.readDate(msg);
            this.moon = this.readMoon(msg);
        }
    };
    this.readCoord = function(msg) {
        var result = '';
        if (msg)
        {
            var locTab = msg.getElementsByClassName('txt_link')[0];
            if (locTab)
            {
                result = locTab.innerHTML;
                if (result.startsWith('<figure class="planetIcon tf'))
                {
                    result = locTab.text;
                    if (result)
                        result = result.split(' ')[1];
                }
            }
        }
        return result;
    };
    this.readDate = function(msg) {
        var result = new Date(2000, 0, 1);
        if (msg)
        {
            var className = 'msg_date';
            if (false)
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
    };
    this.readMoon = function(msg) {
        // get isPlanet or isMoon
        var result = false;
        if (msg.getElementsByClassName('planetIcon moon')[0])
            result = true;
        return result;
    };
    this.setValues = function(obj) {
        if (obj)
        {
            this.coord = obj.coord;
            this.date = new Date(obj.date);
            this.moon = obj.moon;
        }
    };

    this.parseMessage(msg);
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
        if (span && span.innerHTML)
        {
            try
            {
                var arr = span.getAttribute('title').split('<br/>');
                if (arr.length > 3)
                {
                    this.metal = extractRess(arr[1]);
                    this.crystal = extractRess(arr[2]);
                    this.deuterium = extractRess(arr[3]);
                    this.total = extractRess(span.innerHTML);
                    if (!ressourceTitles.isLoaded())
                    {
                        ressourceTitles.load(arr);
                    }
                }
            }
            catch (ex)
            {
                console.log('Error Ressources.load(span): ' + ex);
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
    this.collectingReports = [];
    this.combatReports = [];
    this.inactivePlayersLength = -1;
    this.lastCalcLength = -1;
    this.lastCollectingLength = -1;
    this.lastCombatReport = getBashTimespan();
    this.ressources = new Ressources();

    /*** METHODS *********************/
    this.add = function(report) {
        var idx;
        if (report.attackerName)
        {
            idx = this.combatReports.findIndex(el => el.info.equal(report.info));
            if (idx == -1)
                this.combatReports.push(report);
        }
        else
        {
            idx = this.collectingReports.findIndex(el => el.info.equal(report.info));
            if (idx == -1)
            {
                this.collectingReports.push(report);
            }
        }
        return idx == -1;
    };
    this.append = function(report) {
        var result = false;
        //this function is a litle bit tricky -> all reports with ressources and the info can be added (like inheritance in other languages)
        if (report && report.ressources)
        {
            if (this.add(report)) // report exists
            {
                result = true;
                if (report.ressources.metal)
                    this.ressources.metal += report.ressources.metal;
                if (report.ressources.crystal)
                    this.ressources.crystal += report.ressources.crystal;
                if (report.ressources.deuterium)
                    this.ressources.deuterium += report.ressources.deuterium;
                if (report.ressources.total)
                    this.ressources.total += report.ressources.total;
            }
        }
        return result;
    };
    this.calc = function(date) {
        var result = false;
        if (!date)
            date = getBashTimespan();
        if (this.lastCalcLength != this.combatReports.length || this.lastCollectingLength != this.collectingReports.length)
        {
            this.lastCalcLength = this.combatReports.length;
            this.lastCollectingLength = this.collectingReports.length;
            this.ressources.clear();
            this.sortByDateDesc();
            log(this.combatReports);
            this.calcReports(this.combatReports, date);
            this.calcReports(this.collectingReports, date);
            result = true;
        }
        return result;
    };
    this.calcReports = function(reportList, date) {
        for (var i = 0; i < reportList.length; i++)
        {
            if (reportList[i].info.date > date && reportList[i].ressources)
            {
                if (reportList[i].ressources.metal && !Number.isNaN(reportList[i].ressources.metal))
                    this.ressources.metal += reportList[i].ressources.metal;
                if (reportList[i].ressources.crystal && !Number.isNaN(reportList[i].ressources.crystal))
                    this.ressources.crystal += reportList[i].ressources.crystal;
                if (reportList[i].ressources.deuterium && !Number.isNaN(reportList[i].ressources.deuterium))
                    this.ressources.deuterium += reportList[i].ressources.deuterium;
                if (reportList[i].ressources.total && !Number.isNaN(reportList[i].ressources.total))
                    this.ressources.total += reportList[i].ressources.total;
            }
        }
    };
    this.clear = function() {
        this.combatReports = [];
        this.ressources.clear();
    };
    this.getAttacks = function() {
        if (!inactivePlayers)
        {
            console.log('Error on TotalRessources.getAttacks(): inactivePlayers(null) are not loaded');
            return null;
        }

        var result = new AttackTracker();
        result.clear();
        var bashTimespan = getBashTimespan();

        for (var i = 0; i < this.combatReports.length; i++)
        {
            if ((inactivePlayers[this.combatReports[i].defenderName] != 'i' || inactivePlayers == {}) &&
                // exclude attacks of your self and attacks from
                this.combatReports[i].defenderName != playerName &&
                this.combatReports[i].defenderName != 'Unknown') // exclude Spy Attacks and total destroyed in the first round
            {
                if (this.combatReports[i].info.date >= bashTimespan)
                    result.addAttack(this.combatReports[i]);
                else
                    break;
            }
        }
        result.sortAttacks();
        return result;
    };
    this.load = function() {
        var obj = loadFromLocalStorage('TotalRaidRessources');
        if (obj)
        {
            // CollectingReports
            var i; var report;
            for (i = 0; i < obj.collectingReports.length; i++)
            {
                report = new CollectingReport();
                report.setValues(obj.collectingReports[i]);
                this.collectingReports.push(report);
            }
            // Combat Reports
            for (i = 0; i < obj.combatReports.length; i++)
            {
                report = new CombatReport();
                report.setValues(obj.combatReports[i]);
                this.combatReports.push(report);
            }
            // Ressources
            this.ressources.setValues(obj.ressources);
            this.lastCombatReport = new Date(obj.lastCombatReport);
            this.inactivePlayersLength = obj.inactivePlayersLength;
            this.lastCalcLength = obj.lastCalcLength;
            this.lastCollectingLength = obj.lastCollectingLength;
        }
        ressourceTitles.read();
    };
    this.save = function() {
        this.lastCalcLength = this.combatReports.length;
        this.lastCollectingLength = this.collectingReports.length;
        writeToLocalStorage(this, 'TotalRaidRessources');
        ressourceTitles.write();
    };
    this.sortByDateDesc = function() {
        this.combatReports.sort(compareByDate);
        this.collectingReports.sort(compareByDate);
    };
    this.toHtml = function(title, className) {
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

function addCssLink(url)
{
    var link = document.createElement('link');
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('type', 'text/css .css');
    link.setAttribute('href', url);
    document.getElementsByTagName('head')[0].appendChild(link);
}

function coordToUrl(coord)
{
	 var coordClean = coord.substring(1, coord.length-1);
	 var coordTab = coordClean.split(":");
	 return '/game/index.php?page=galaxy&galaxy='+coordTab[0]+'&system='+coordTab[1]+'&position='+coordTab[2] ;
}

function checkRaidFinished()
{
    if (totalRess.calc(getBashTimespan()))
    {
        totalRess.save();
        display();
    }
}

function compareByDate(left, right) {
    var result = 0;
    if (left.info.date < right.info.date)
        result = -1;
    else if (left.info.date > right.info.date)
        result = 1;
    // descending order
    result = result * -1;
    return result;
}

function compareVersion(version1, version2)
{
    var diff = parseInt(replaceAll(version1, '.', '')) - parseInt(replaceAll(version2, '.', ''));
    return  diff < 0 ? -1 : diff > 0 ? 1 : 0;
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
    var maxRaid = 6;

    try
    {
        log(totalRess);
        var attackTracker = totalRess.getAttacks();
        log(attackTracker);
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
        var htmlCount = '<div class="textCenter" style="font-weight: bold; background: linear-gradient(to bottom, #959595 0%,#0d0d0d 7%,#010101 85%,#0a0a0a 91%,#4e4e4e 93%,#383838 97%,#1b1b1b 100%);' +
            'border: 2px solid black; border-radius: 5px; padding: 1px; text-align: center; color: #4f85bb; height:38px; display: block; font-size: 14px; padding: 7px;">';
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

        var keys = Object.keys(coordByNbAttaque);
        keys.sort(function(a, b) { return b-a; });

        for (var k = 0; k < keys.length; k++)
        {
            var count = keys[k];
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

        // insert a Div as a placeholder to increase the scrollbar range, if needed
        var rect = info.getBoundingClientRect();
        var contentDiv = document.getElementById('contentWrapper');
        var toolBar = document.getElementById('links');
        if (contentDiv && toolBar && toolBar.clientHeight > contentDiv.clientHeight)
        {
            var divHeight = rect.bottom - contentDiv.clientHeight;
            var placeholder = createDiv('checkAttackPlaceholder');
            placeholder.style.width = '100px';
            placeholder.style.height = toolBar.clientHeight + 'px';
            contentDiv.appendChild(placeholder);
        }
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

function extractRess(res)
{
    if (/, /.test(res))
        res =trim(res.split(', ')[0]);
    if(/:/.test(res))
        res =trim(res.split(':')[1]);
    else
        res=trim(res);


    if(/^[0-9]{1,3}\.[0-9]{3}$/.test(res))
        res=res.replace(/\./g,'');
    else if (/^([0-9]{1,3}(\.|,))?[0-9]{1,3}(Md|Bn|Mrd)/.test(res))
        res=res.replace(/,/g,'.').replace(/Md|Bn|Mrd/g,'')*1000000000;
    else if (/^([0-9]{1,3}(\.|,))?[0-9]{1,3}(M|m)/.test(res))
        res=res.replace(/,/g,'.').replace(/(M|m)/g,'')*1000000;
    else
        res = res.replace(/\./g,'');


    return parseInt(res);
}

function getBashTimespan()
{
    var date = new Date();
    date.setDate(date.getDate() - 1);
    return date;
}

function getCoord(msg)
{
    var result = '';
    if (msg)
    {
        // get coord
        var locTab = msg.getElementsByClassName('txt_link')[0];
        if (locTab)
            result = locTab.innerHTML;
    }
    return result;
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
                                    checkRaidFinished();
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

    // start search for inactive players -> async
    getMessageAsync();
}

function onLoadPage()
{
    var result = false;
    if(/page=message/.test(location.href))
    {
        var fleetsDiv = document.getElementById('fleetsTab');
        if (fleetsDiv)
        {
            var msgList = fleetsDiv.getElementsByClassName('msg');
            if (msgList[0])
            {
                var combatReportAdded = false;
                for (var i = 0; i < msgList.length; i++)
                {
                    // is a combat report page loaded
                    if (msgList[i].getElementsByClassName('combatLeftSide')[0])
                    {
                        var combatReport = new CombatReport(msgList[i]);
                        if (combatReport.attackerName != 'Unknown')
                        {
                            combatReportAdded = combatReportAdded || totalRess.append(combatReport);
                        }
                    }
                    else // look for other reports
                    {
                        var apiKey = msgList[i].getAttribute('data-api-key');
                        if (apiKey && apiKey.startsWith('sr-'))
                        {
                            readSpyReport(msgList[i]);
                        }
                        if (msgList[i].getElementsByClassName('planetIcon tf')[0])
                        {
                            var collReport = new CollectingReport(msgList[i]);
                            if (collReport.ressources)
                                combatReportAdded = combatReportAdded || totalRess.append(collReport);
                        }
                    }
                }
                if (combatReportAdded)
                    checkRaidFinished();
                if (inactivePlayers && totalRess.inactivePlayersLength != Object.keys(inactivePlayers).length)
                {
                    totalRess.inactivePlayersLength = Object.keys(inactivePlayers).length;
                    writeToLocalStorage(inactivePlayers, "InactivePlayers");
                    totalRess.save();
                    log('write inactive players');
                }
                result = true;
            }
        }
    }
    return result;
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
            log(combatReport);
            if (page == 1 && i === 0)
                asyncHelper.lastCheck = combatReport.info.date;

            if (!isAppendedToday(combatReport.info.date, isSpyReport))
            {
                result = false;
                break;
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

function readSpyReport(msg)
{
    //<span class="status_abbr_longinactive">&nbsp;&nbsp;Felcken</span>
    var inactiveSpan = msg.getElementsByClassName('status_abbr_longinactive');
    if (!inactiveSpan[0])
        inactiveSpan = msg.getElementsByClassName('status_abbr_inactive');
    if (inactiveSpan[0])
    {
        //read player name
        var initplayerName = inactiveSpan[0].innerHTML;
        if (initplayerName)
        {
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
                readSpyReport(messageList[i]);
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

//TODO: create prototype
function replaceAll(str, searchStr, replacement)
{
    return str.split(searchStr).join(replacement);
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

    settings.lastCheckCombatReport = getBashTimespan();
    settings.write();

    deleteValueLocalStorage('AttackTracker'); // not more used in local storage
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
        //addCssLink('https://github.com/GeneralAnasazi/OGame-CheckAttack/blob/master/CheckAttackStyles.css');
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
        if (settings.isNewVersion())
        {
            log('New Version detected!');
            if (compareVersion(settings.lastVersion, VERSION_SCRIPT_RESET) <= 0 && false) // no reset
            {
                resetCookies();
            }
            else
                settings.write();
        }
        else if (RESET_COOKIES) // for debug
        {
            resetCookies();
        }

        totalRess.load();

        inactivePlayers = loadFromLocalStorage("InactivePlayers");
        // secure that the inactive players will be load after the update
        if (!inactivePlayers)
        {
            settings.lastCheckSpyReport = getBashTimespan();
            inactivePlayers = {};
        }

        setInterval(onLoadPage, 400);
        log(settings);
        display();
    }
    catch(ex)
    {
        console.log("Error on startScript(): " + ex);
    }
}

function trim(string)
{
    return string.replace(/(^\s*)|(\s*$)/g,'');
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
