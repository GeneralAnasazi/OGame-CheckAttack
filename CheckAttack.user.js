// ==UserScript==
// @name        CheckAttack
// @namespace   https://github.com/GeneralAnasazi
// @author      GeneralAnasazi
// @description Plug in anti bash
// @include *ogame.gameforge.com/game/*
// @include about:addons
// @version 3.3.0.24
// @grant		GM_getValue
// @grant		GM_setValue
// @grant		GM_deleteValue
// @grant       GM_xmlhttpRequest
// @require     http://ajax.googleapis.com/ajax/libs/jquery/2.1.0/jquery.min.js

// ==/UserScript==
"use strict";
"use moz";


/***** CONSTANTS *************************************************************/
const COOKIE_EXPIRES_DAYS = 1;
const ERROR = 'Error';
const TABID_SPY_REPORT = 20;
const TABID_COMBAT_REPORT = 21; // combat report

const DIV_STATUS_GIF_ID = "id_check_attack_status_div";
const DIV_STATUS_ID = "id_check_attack";
const LINKS_TOOLBAR_BUTTONS_ID = "links";
const SPAN_STATUS_ID = "id_check_attack_status";
// has to be set after an update
const VERSION_SCRIPT = '3.3.0.24';
// set VERSION_SCRIPT_RESET to the same value as VERSION_SCRIPT to force a reset of the local storage
const VERSION_SCRIPT_RESET = '3.3.0.23';

// debug consts
const DEBUG = true; // set it to true enable debug messages -> log(msg)
const RESET_COOKIES = false;


/***** Global Vars ***********************************************************/
var test = false;

// globale vars
var calculateRess = false;
var language = document.getElementsByName('ogame-language')[0].content;
var playerName = document.getElementsByName('ogame-player-name')[0].content;
var sendFleetList = new SendFleetList();
var sendFleetPage = -1;

// translation vars (don't translate here)
var captionAttack = "attaque";
var captionAttacks = "attaques";
var loadStatusCR = "loading CR";
var loadStatusSR = "loading SR";
var title1 = "Pas de risque";
var title2 = "de bash";
var title3 = "Risque de bash";

/***** ENUMERATIONS ***********************************************************/

    var bashState = {
        UNDECLARED: -999,
        OWN_DEFENSE: -3,
        AKS_DEFENSE: -2,
        NOTHING_FOUND: -1,
        INACTIVE_PLAYER: 0,
        ESPIONAGE: 1, // only espionage probe
        ESPIONAGE_NO_DETAILS: 2, // espionage but no details to look for the used ships
        ESPIONAGE_ATTACK: 3, // sended as espionage with battleships
        AKS_ATTACK: 4,
        NO_DETAILS: 5, // no datails and no spy report found -> counts as an attack
        ATTACK: 99
    };

    var missionState = {
        EXPEDITION: 0,
        COLONIZE: 1,
        RECYCLE: 2,
        TRANSPORT: 3,
        STATIONARY: 4,
        ESPIONAGE: 5,
        HOLD: 6,
        ATTACK: 7,
        ALLIANCE_ATTACK: 8,
        DESTROY_MOON: 9
    };

    var unitIds = {
        LITLE_TRANSPORTER: 202,
        BIG_TRANSPORTER: 203,
        LIGHT_HUNTER: 204,
        HEAVY_HUNTER: 205,
        CRUISER: 206,
        BATTLESHIP: 207,
        COLONIZESHIP: 208,
        RECYCLER: 209,
        ESPIONAGE_PROBE: 210,
        BOMBER: 211,
        DESTROYER: 213,
        DEATHSTAR: 214,
        BATTLECRUISER: 215,
        ROCKET_LAUNCHER: 401,
        LIGHT_LASER: 402,
        HEAVY_LASER: 403,
        GAUSS_CANON: 404,
        ION_CANON: 405,
        PLASMA_CANON: 406,
        LITLE_SHIELD_DOME: 407,
        BIG_SHIELD_DOME: 408,
        INTERCEPTOR_ROCKET: 502,
        INTERPLANETARY_ROCKET: 503
    };

/***** Objects ****************************************************************/

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

/** Main object to handle the data */
var main = {
    combatReports: new CombatReportList(),
    recycleReports: new RecycleReportList(),
    spyReports: new SpyReportList(),
    totalRessources: new TotalRessources(),
    // async help var
    reading: false,

    /***** METHODS */
    calc: function() {
        log('start calc');
        this.totalRessources.clear();
        this.totalRessources.calcReports(this.combatReports.reports, getBashTimespan());
        this.totalRessources.calcReports(this.recycleReports.reports, getBashTimespan());
        this.totalRessources.calcTotal();
        this.totalRessources.save();
        calculateRess = false;
    },
    load: function() {
        this.combatReports.loadFromLocalStorage();
        this.recycleReports.loadFromLocalStorage();
        this.spyReports.loadFromLocalStorage();
        this.totalRessources.load();
    },
    save: function() {
        this.spyReports.saveToLocalStorage();
        if (this.combatReports.saveToLocalStorage() || this.recycleReports.saveToLocalStorage() || calculateRess)
        {
            this.calc();
        }
    },
    start: function() {
        this.reading = true;
    },
    stop: function() {
        if (this.reading && this.combatReports.detailsLoadCount == -1)
        {
            this.save();
            this.reading = false;
            asyncHelper.clearAsync();
            display();
        }
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
    total: 'Total',
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

var unitCosts = {};
unitCosts[unitIds.LITLE_TRANSPORTER] = {metal: 2000, crystal: 2000, deuterium: 0};
unitCosts[unitIds.BIG_TRANSPORTER] = {metal: 6000, crystal: 6000, deuterium: 0};
unitCosts[unitIds.LIGHT_HUNTER] = {metal: 3000, crystal: 1000, deuterium: 0};
unitCosts[unitIds.HEAVY_HUNTER] = {metal: 6000, crystal: 4000, deuterium: 0};
unitCosts[unitIds.CRUISER] = {metal: 20000, crystal: 7000, deuterium: 2000};
unitCosts[unitIds.BATTLESHIP] = {metal: 45000, crystal: 15000, deuterium: 0};
unitCosts[unitIds.COLONIZESHIP] = {metal: 10000, crystal: 20000, deuterium: 10000};
unitCosts[unitIds.RECYCLER] = {metal: 10000, crystal: 6000, deuterium: 2000};
unitCosts[unitIds.ESPIONAGE_PROBE] = {metal: 2000, crystal: 2000, deuterium: 0};
unitCosts[unitIds.BOMBER] = {metal: 50000, crystal: 25000, deuterium: 15000};
unitCosts[unitIds.DESTROYER] = {metal: 60000, crystal: 50000, deuterium: 15000};
unitCosts[unitIds.DEATHSTAR] = {metal: 5000000, crystal: 4000000, deuterium: 1000000};
unitCosts[unitIds.BATTLECRUISER] = {metal: 30000, crystal: 40000, deuterium: 15000};
unitCosts[unitIds.ROCKET_LAUNCHER] = {metal: 2000, crystal: 0, deuterium: 0};
unitCosts[unitIds.LIGHT_LASER] = {metal: 1500, crystal: 500, deuterium: 0};
unitCosts[unitIds.HEAVY_LASER] = {metal: 6000, crystal: 2000, deuterium: 0};
unitCosts[unitIds.GAUSS_CANON] = {metal: 20000, crystal: 15000, deuterium: 2000};
unitCosts[unitIds.ION_CANON] = {metal: 2000, crystal: 6000, deuterium: 0};
unitCosts[unitIds.PLASMA_CANON] = {metal: 50000, crystal: 50000, deuterium: 30000};
unitCosts[unitIds.LITLE_SHIELD_DOME] = {metal: 10000, crystal: 10000, deuterium: 0};
unitCosts[unitIds.BIG_SHIELD_DOME] = {metal: 50000, crystal: 50000, deuterium: 0};
unitCosts[unitIds.INTERCEPTOR_ROCKET] = {metal: 8000, crystal: 0, deuterium: 2000};
unitCosts[unitIds.INTERPLANETARY_ROCKET] = {metal: 12500, crystal: 2500, deuterium: 10000};

/***** prototype functions ****************************************************************/

Date.prototype.addMSecs = function(msecs) {
    this.setTime(this.getTime() + msecs);
    return this;
};

Date.prototype.addHours = function(hours) {
    this.addMSecs(hours * 60 * 60 * 1000);
    return this;
};

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
    this.defenderInactive = false;
    this.defenderName = 'Unknown';
    this.details = null;
    this.fleetIds = null;
    this.info = null;
    this.isAttacker = null;
    this.isDefender = null;
    this.ressources = null;
    this.ressourcesLoot = null;
    this.ressourcesLost = null;
    this.status = bashState.UNDECLARED;
    /***** METHODS *****/ {
    this.calcLosses = function(units, repairedDefense) {
        var result = new Ressources();
        for (var id in units)
        {
            if (unitCosts[id])
            {
                if (id < 400)
                    result.add(unitCosts[id], parseInt(units[id]));
                else if (repairedDefense)
                {
                    var defenseValue = parseInt(units[id]) - parseInt(repairedDefense[id]);
                    result.add(unitCosts[id], defenseValue);
                }
            }
        }
        return result;
    };
    this.calcLost = function() {
        var result = new Ressources();
        if (this.details)
        {
            try
            {
                if (!this.fleetIds)
                    this.getFleetId();

                var idx = this.details.combatRounds.length - 1;
                var losses = this.details.combatRounds[idx].attackerLosses;
                if (this.isDefender)
                    losses = this.details.combatRounds[idx].defenderLosses;
                var repairedDefense = null;
                if (this.isDefender)
                    repairedDefense = this.details.repairedDefense;

                if (losses)
                {
                    for (var i = 0; i < this.fleetIds.length; i++)
                    {
                        var fleetId = this.fleetIds[i];
                        var ress = this.calcLosses(losses[fleetId], repairedDefense);
                        result.add(ress);
                    }
                    this.ressourcesLost = result;
                }
            }
            catch (ex)
            {
                console.log("Error on CombatReport.calcLost: " + ex);
                log(this);
            }
        }
        return result;
    };
    this.detailsLoaded = function(spyReportList) {
        if (this.details)
        {
            this.details.attackerJSON = undefined; // parsed and not needed
            this.details.defenderJSON = undefined; // parsed and not needed
            try
            {
                this.getFleetId();
                this.calcLost();
                // get loot
                this.ressourcesLoot = new Ressources();
                this.ressourcesLoot.metal = this.details.loot.metal;
                this.ressourcesLoot.crystal = this.details.loot.crystal;
                this.ressourcesLoot.deuterium = this.details.loot.deuterium;
            }
            catch (ex)
            {
                console.log("Error on CombatReport.detailsLoaded: " + ex);
                log(this);
            }
        }
        this.status = spyReportList.getStatus(this);
        this.defenderInactive = this.status == bashState.INACTIVE_PLAYER;
    };
    this.getDefender = function(msg) {
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
        return trim(result);
    };
    this.getDetails = function() {
        if (this.info.id && !this.details)
        {
            getMessageDetailsAsync(this.info.id);
        }
    };
    this.getFleetId = function() {
        var result = [];
        if (this.fleetIds)
            return this.fleetIds;
        if (this.details)
        {
            this.isDefender = false;
            var fleetId = -1;
            for (var id in this.details.attacker)
            {
                if (this.details.attacker[id].ownerName == playerName)
                {
                    fleetId = parseInt(this.details.attacker[id].fleetID);
                    this.isAttacker = true;
                    result.push(fleetId);
                }
            }
            for (var defenderId in this.details.defender)
            {
                var defender = this.details.defender[defenderId];
                if (defender.ownerName == playerName)
                {
                    fleetId = parseInt(defender.fleetID);
                    result.push(fleetId);
                    this.isDefender = true;
                }
            }
            this.fleetIds = result;
        }
        return result;
    };
    this.isBash = function() {
        //TODO: exclude uni with espionage attacks
        return parseInt(this.status) > parseInt(bashState.ESPIONAGE_NO_DETAILS);
    };
    this.load = function(msg) {
        var result = false;
        try
        {
            if (msg)
            {
                this.info = new ReportInfo(msg);
                this.defenderName = this.getDefender(msg);
                if (this.defenderName == playerName)
                    this.isDefender = true;

                var combatLeftSide = msg.getElementsByClassName('combatLeftSide')[0];
                if (combatLeftSide && this.defenderName != 'Unknown')
                {
                    //TODO: Bei über einer Million werden die Daten abgeschnitten -> Bug fix
                    var spanList = combatLeftSide.getElementsByTagName('span');
                    if (spanList[0] && spanList.length > 2) //attacker
                    {
                        var arr = spanList[0].innerHTML.split(': ');
                        this.attackerName = trim(arr[1].replace('(', '').replace(')', ''));
                        this.ressources = new Ressources(spanList[1]);
                        this.debrisField = extractRess(spanList[2].innerHTML);
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
    this.onlyEspionageProbe = function() {
        var result = false;
        if (this.details)
        {
            for (var i = 0; i < this.fleetIds; i++)
            {
                var fleetId = this.fleetIds[i];
                var shipList = this.details.attacker[fleetId];
                if (shipList)
                {
                    result = true;
                    for (var id in shipList.shipDetails)
                    {
                        if (unitIds.ESPIONAGE_PROBE != id)
                        {
                            result = result && parseInt(shipList.shipDetails[id]) === 0;
                        }
                    }
                }
            }
        }
        else
        {
            result = true;
        }
        return result;
    };
    this.setValues = function(obj) {
		if (obj.attackerName)
			this.attackerName = trim(obj.attackerName);
        this.debrisField = obj.debrisField;
        this.defenderInactive = obj.defenderInactive;
		if (obj.defenderName)
	        this.defenderName = trim(obj.defenderName);
        this.details = obj.details;
        this.fleetIds = obj.fleetIds;
        this.info = new ReportInfo();
        this.info.setValues(obj.info);
        this.isAttacker = obj.isAttacker;
        this.isDefender = obj.isDefender;
        if (obj.ressources)
        {
            this.ressources = new Ressources();
            this.ressources.setValues(obj.ressources);
        }
        if (obj.ressourcesLost)
        {
            this.ressourcesLost = new Ressources();
            this.ressourcesLost.setValues(obj.ressourcesLost);
        }
        if (obj.ressourcesLoot)
        {
            this.ressourcesLoot = new Ressources();
            this.ressourcesLoot.setValues(obj.ressourcesLoot);
        }
        this.status = obj.status;
    };}
    // load from message
    if (msg)
        this.load(msg);
}

function CombatReportList() {
	ReportList.call(this, 'CombatReportList', getBashTimespan(-6 * 24 * 60)); // 7 days are stored

    this.detailsLoadCount = -1;

    this.add = function(report) {
		var result = this.reports.findIndex(el => el.info.equal(report.info)) == -1;
		if (result)
		{
            this.reports.push(report);
            this.updated = true;
            if (!report.details)
            {
                report.getDetails();
                this.detailsLoadCount++;
            }
        }
        return result;
    };
    /** get the bash attacks */
    this.getAttacks = function() {
        var result = new AttackTracker();
        result.clear();
        var bashTimespan = getBashTimespan();

        for (var i = 0; i < this.reports.length; i++)
        {
            //this.combatReports[i].defenderName != playerName && // exclude attacks of your self and attacks from
            if (this.reports[i].isBash()) // exclude total destroyed in the first round
            {
                if (this.reports[i].info.date >= bashTimespan)
                    result.addAttack(this.reports[i]);
                else
                    break;
            }
        }
        result.sortAttacks();
        return result;
    };
	//implement abstract function from ReportList
	this.setValues = function(obj) {
		for (var i = 0; i < obj.reports.length; i++)
		{
			var report = new CombatReport();
			report.setValues(obj.reports[i]);
			this.add(report);
		}
	};

}
CombatReportList.prototype = Object.create(ReportList.prototype);
CombatReportList.prototype.constructor = CombatReportList;

function RecycleReport(msg) {
    Report.call(this); // inherited

	/*** METHODS ************************************************/
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
		this._setValues(report); //inherited
    };

    this.parseMessage(msg);
}
RecycleReport.prototype = Object.create(Report.prototype);
RecycleReport.prototype.constructor = RecycleReport;

function RecycleReportList() {
    ReportList.call(this, 'RecycleReportList', getBashTimespan(-6 * 24 * 60));  // 7 days are stored

    this.setValues = function(obj) {
        for (var i = 0; i < obj.reports.length; i++)
        {
            var report = new RecycleReport();
            report.setValues(obj.reports[i]);
            this.reports.push(report);
        }
    };
}
RecycleReportList.prototype = Object.create(ReportList.prototype);
RecycleReportList.prototype.constructor = RecycleReportList;

/** Default report object */
function Report() {
	this.info = null;
	this.ressources = undefined; // can be used (have a look for super -> call)

	//pseudo private
    this._setValues = function(report) {
        this.info = new ReportInfo();
        this.info.setValues(report.info);
        if (report.ressources)
        {
            this.ressources = new Ressources();
            this.ressources.setValues(report.ressources);
        }
    };

}

function ReportInfo(msg) {
    this.id = null;
    this.coord = '';
    this.date = null;
    this.moon = false;
    /***** METHODS *****/ {
    this.equal = function(info) {
        return this.coord == info.coord && this.date.getTime() == info.date.getTime() &&
            this.moon == info.moon;
    };
    this.parseMessage = function(msg) {
        if (msg)
        {
            this.id = msg.getAttribute('data-msg-id');
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
                if (result.startsWith('<figure class'))
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
            var msgtab = msg.getElementsByClassName('msg_date');
            var date = msgtab[0];
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
                console.log("Error on ReportInfo.readDate(msg): Can't read the date " + msgtab);
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
            this.id = obj.id;
            this.moon = obj.moon;
        }
    };}

    this.parseMessage(msg);
}

function ReportList(storageKey, deleteDate) {
    this._deleteDate = deleteDate;
    this._storageKey = storageKey;
    this.reports = [];
    this.updated = false;

	this.add = function(report) {
		var isNew = this.reports.findIndex(el => el.info.equal(report.info)) == -1;
		if (isNew)
		{
            this.reports.push(report);
            this.updated = true;
        }
        return isNew;
	};
	this.addRange = function(reportList) {
        if (reportList && reportList.reports)
		{
			for (var i = 0; i < reportList.reports.length; i++)
			{
				this.updated = this.updated || this.add(reportList.reports[i]);
			}
		}
	};
	this.clear = function() {
        this.reports = [];
        this.updated = true;
    };
    this.count = function() { return this.reports.length; };
    this.deleteOldReports = function(date) {
        deleteOldReports(this.reports, date);
    };
	this.loadFromLocalStorage = function() {
		if (this._storageKey)
		{
			var obj = loadFromLocalStorage(this._storageKey);
			if (obj)
			{
				// this function has to be implemented in other objects (abstract function)
                this.setValues(obj);
                this.updated = false;
			}
		}
	};
	this.remove = function(report) {
		var idx = this.reports.findIndex(el => el.info.equal(report.info));
		if (idx > -1)
		{
            this.reports.splice(idx, 1);
            this.updated = true;
		}
	};
	this.saveToLocalStorage = function() {
        var result = false;
		if (this._storageKey)
		{
            this.sortByDateDesc();
            this.deleteOldReports(this._deleteDate);
            if (this.updated)
            {
                writeToLocalStorage(this, this._storageKey);
                result = true;
            }
            this.updated = false;
        }
        return result;
    };
    this.sortByDateDesc = function() {
        this.reports.sort(compareByDate);
    };
}

function Ressources(span) {
    this.metal = 0;
    this.crystal = 0;
    this.deuterium = 0;
    this.total = 0;

    this.add = function(ress, multiplier) {
        if (!multiplier)
            multiplier = 1;
        this.metal += ress.metal * multiplier;
        this.crystal += ress.crystal * multiplier;
        this.deuterium += ress.deuterium * multiplier;
        //this.total += ress.total;
    };
    this.calcTotal = function() {
        this.total = this.metal + this.crystal + this.deuterium;
    };
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
        if (obj)
        {
            this.metal = obj.metal;
            this.crystal = obj.crystal;
            this.deuterium = obj.deuterium;
            this.total = obj.total;
        }
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
            result += getSpanHtml(ressourceTitles.total + ': ' + this.total.toLocaleString(), spanAttr) + '</br>';

            result +='</div>';
        }
        return result;
    };

    this.load(span);
}

function SendFleet(storageKey) {
    this.deuterium = null;
    this.infoFrom = null; // reportInfo
    this.infoTo = null; // reportInfo
    this.mission = null; // missionState
    this.page = null;
    this.ships = {};
    this.storageKey = null;

    this.delete = function() {
        deleteValueLocalStorage(this.storageKey);
    };
    this.parse = function(page) {
        //on send ships read all the data to know what is sended
        try
        {
            this.page = page;
            switch (page)
            {
                case 1:
                    this.parseShips();
                    break;
                case 3:
                    this.parseMission();
                    break;
            }
        }
        catch (ex)
        {
            alert(ex);
        }
    };
    this.parseMission = function() {
        var ul = document.getElementById("missions");
        if (ul)
        {
            var li = ul.getElementsByClassName("on")[0];
            if (li)
            {
                var attr = li.getAttribute("id");
                switch(attr)
                {
                    case "button15":
                        this.mission = missionState.EXPEDITION;
                        break;
                    case "button7":
                        this.mission = missionState.COLONIZE;
                        break;
                    case "button8":
                        this.mission = missionState.RECYCLE;
                        break;
                    case "button3":
                        this.mission = missionState.TRANSPORT;
                        break;
                    case "button4":
                        this.mission = missionState.STATIONARY;
                        break;
                    case "button6":
                        this.mission = missionState.ESPIONAGE;
                        break;
                    case "button5":
                        this.mission = missionState.HOLD;
                        break;
                    case "button1":
                        this.mission = missionState.ATTACK;
                        break;
                    case "button2":
                        this.mission = missionState.ALLIANCE_ATTACK;
                        break;
                    case "button9":
                        this.mission = missionState.DESTROY_MOON;
                        break;
                }
            }
        }
        var divWrap = document.getElementById("wrap");
        if (divWrap)
        {
            var consumption = document.getElementById("consumption").getElementsByTagName("span")[0];
            if (consumption && consumption.textContent)
            {
                this.deuterium = extractRess(consumption.textContent.split(" ")[0]);
            }
            this.parseReportInfo(divWrap);
        }
    };
    this.parseReportInfo = function(div) {
        var inputList = div.getElementsByClassName("value");
        if(inputList.length > 0)
        {
            this.infoTo = new ReportInfo();
            this.infoTo.coord = "[" + inputList[0].textContent.split('[')[1].split(']')[0] + "]";
            this.infoTo.readMoon(inputList[0]);
            var arrivalTime = parseInt(document.getElementById("aks").getAttribute("data-arrival-time"));
            this.infoTo.date = new Date(arrivalTime);
        }
    };
    this.parseShips = function() {
        this.parseShipValues("military");
        this.parseShipValues("civil");
    };
    this.parseShipValues = function(divId) {
        var div = document.getElementById(divId);
        if (div)
        {
            var inputList = div.getElementsByClassName("fleetValues");
            for (var i = 0; i < inputList.length; i++)
            {
                var shipId = parseInt(inputList[i].getAttribute("id").split('_')[1]);
                this.ships[shipId] = parseInt(inputList[i].value);
            }
        }
    };
    this.read = function() {
        var obj = loadFromLocalStorage(this.storageKey);
        if (obj)
        {
            this.setValues(obj);
        }
    };
    this.setValues = function(obj) {
        this.deuterium = obj.deuterium;
        if (obj.infoFrom)
        {
            this.infoFrom = new ReportInfo();
            this.infoFrom.setValues(obj.infoFrom);
        }
        if (obj.infoTo)
        {
            this.infoTo = new ReportInfo();
            this.infoTo.setValues(obj.infoTo);
        }
        this.mission = obj.mission;
        this.page = obj.page;
        this.ships = obj.ships;
        this.storageKey = obj.storageKey;
    };
    this.write = function() {
        writeToLocalStorage(this, this.storageKey);
    };

    if (storageKey)
    {
        this.storageKey = storageKey;
        this.read();
    }
}

function SendFleetList() {
    this.sendFleets = [];

    this.add = function(sendFleet) {
        this.sendFleets.push(sendFleet);
    };
    this.getSendFleetFromReport = function(report) {
        var result = null;
        var startDate = report.info.date.getTime() - 5000;
        var endDate = report.info.date.getTime() + 5000;
        var idx = this.sendFleets.findIndex(el => el.infoTo.date.getTime() > startDate && el.infoTo.date.getTime() < endDate);
        if (idx > -1)
            result = this.sendFleets[idx];
        return result;
    };
    this.read = function() {
        var obj = loadFromLocalStorage('SendFleetList');
        if (obj)
        {
            for (var i = 0; i < obj.sendFleets.length; i++)
            {
                var sendFleet = new SendFleet();
                sendFleet.setValues(obj.sendFleets[i]);
                this.sendFleets.push(sendFleet);
            }
        }
        log(this);
    };
    this.setValues = function(obj) {
    };
    this.write = function() {
        //writeToLocalStorage(this, 'SendFleetList');
    };
}

function SpyReport(msg) {
    Report.call(this);
    this.inactive = null; // initialized with null -> other values(true/false) and readed or loaded
    this.playerName = 'Unknown';

    /***** METHODS *****/ {
    this.readMessage = function(msg) {
        this.info = new ReportInfo(msg);

        //is inactive
        var inactiveSpan = msg.getElementsByClassName('status_abbr_longinactive')[0];
        if (!inactiveSpan)
            inactiveSpan = msg.getElementsByClassName('status_abbr_inactive')[0];
        if (inactiveSpan)
        {
            //read player name
            this.playerName = trim(inactiveSpan.textContent);
            this.inactive = true;
        }
        else // active
        {
            var activeSpan = msg.getElementsByClassName('status_abbr_active')[0];
            if (activeSpan)
                this.playerName = trim(activeSpan.textContent);
        }
    };
    this.setValues = function(report) {
        this._setValues(report);
        this.inactive = report.inactive;
		if (report.playerName)
			this.playerName = trim(report.playerName);
    };}

    // read informations from param(s)
    if (msg)
        this.readMessage(msg);
}
SpyReport.prototype = Object.create(Report.prototype);
SpyReport.prototype.constructor = RecycleReport;


function SpyReportList() {
    ReportList.call(this, 'SpyReportList', getBashTimespan(-60));

    /***** METHODS *****/ {
    //** returns the bash state of the report */
    this.getStatus = function(report) {
        var result = bashState.NOTHING_FOUND;
        var idx = -1;
        if (report.defenderName && report.defenderName != 'Unknown' && report.info)
        {
            if (report.defenderName == playerName)
            {
                return bashState.OWN_DEFENSE;
            }

            idx = this.reports.findIndex(el => el.info.equal(report.info));
            if (idx > -1)
            {
                // spy report has the same time and coords as the combat report
                if (report.onlyEspionageProbe())
                    result = bashState.ESPIONAGE;
                else
                    result = bashState.ESPIONAGE_ATTACK;
            }
            else
            {
                if (this.isInactive(report))
                {
                    result = bashState.INACTIVE_PLAYER;
                }
                else if (report.details)
                {
                    var fleetIds = report.getFleetId();
                    for (var i = 0; i < fleetIds.length; i++)
                    {
                        var fleetId = fleetIds[i];
                        if (report.details.attacker[fleetId])
                        {
                            if (report.details.attacker[fleetId].ownerName != report.attackerName)
                                result = bashState.AKS_ATTACK;
                            else if (result != bashState.AKS_ATTACK)
                                result = bashState.ATTACK;
                        }
                        else if (report.details.defender[fleetId] && result == bashState.NOTHING_FOUND)
                        {
                            result = bashState.AKS_DEFENSE;
                        }
                    }
                }
            }
        }
        else if (!report.details)
        {
            //try to look for a spy report at the same time
            idx = this.reports.findIndex(el => el.info.equal(report.info));
            if (idx > -1)
                result = bashState.ESPIONAGE_NO_DETAILS;
            else
            {
                if (this.isInactive(report))
                    result = bashState.INACTIVE_PLAYER;
                else
                    result = bashState.NO_DETAILS;
            }
        }
        return result;
    };
    this.isInactive = function(report) {
        var result = false;
        // try to find the nearest spy report (max 1 day backwards)
        var lastSearchDate = getBashTimespan();
        lastSearchDate.addHours(-1);
        var filterArr = this.reports.filter(el => report.info.date.getTime() > el.info.date.getTime() &&
                                            (el.info.coord == report.info.coord || el.playerName == report.defenderName) &&
                                            el.info.date.getTime() > lastSearchDate.getTime());
        filterArr.sort(compareByDate); // sort date in descending order
        // has filter results and is inactive
        if (filterArr[0] && filterArr[0].inactive)
        {
            result = true;
        }
        return result;
    };
    this.setValues = function(obj) {
        for (var i = 0; i < obj.reports.length; i++)
        {
            var report = new SpyReport();
            report.setValues(obj.reports[i]);
            this.add(report);
        }
    };}
}
SpyReportList.prototype = Object.create(ReportList.prototype);
SpyReportList.prototype.constructor = RecycleReportList;

function TotalRessources() {
    this.ressources = new Ressources(); // Raid Ressources
    this.lostRessources = new Ressources();
    this.totalRessources = new Ressources();

    /*** METHODS *********************/ {
        this.calcReports = function(reportList, date) {
            log('calcReports: ' + date);
            for (var i = 0; i < reportList.length; i++)
            {
                if (reportList[i].info.date > date && reportList[i].ressourcesLoot)
                {
					this.ressources.add(reportList[i].ressourcesLoot);
                    if (reportList[i].ressourcesLost)
                        this.lostRessources.add(reportList[i].ressourcesLost);
                    if (calculateRess)
                        reportList[i].status = main.spyReports.getStatus(reportList[i]);
                }
            }
            this.ressources.calcTotal();
            this.lostRessources.calcTotal();
        };
        this.calcTotal = function() {
            this.totalRessources.clear();
            this.totalRessources.metal = this.ressources.metal - this.lostRessources.metal;
            this.totalRessources.crystal = this.ressources.crystal - this.lostRessources.crystal;
            this.totalRessources.deuterium = this.ressources.deuterium - this.lostRessources.deuterium;
            this.totalRessources.calcTotal();
        };
        this.clear = function() {
            this.ressources.clear();
            this.lostRessources.clear();
        };
        this.load = function() {
            var obj = loadFromLocalStorage('TotalRaidRessources');
            if (obj)
            {
                // Ressources
                this.ressources.setValues(obj.ressources);
                this.lostRessources.setValues(obj.lostRessources);
                this.totalRessources.setValues(obj.totalRessources);
            }
            ressourceTitles.read();
        };
        this.save = function() {
            writeToLocalStorage(this, 'TotalRaidRessources');
            ressourceTitles.write();
        };
        this.toHtml = function(title, className, type) {
            switch (type)
            {
                case "RaidRessources":
                    return this.ressources.toHtml(title, className);
                case "LostRessources":
                    return this.lostRessources.toHtml(title, className);
                case "Total":
                    return this.totalRessources.toHtml(title, className);
            }
        };
    }
}

/***** SCRIPT METHODS *********************************************************************/

function testIt() {
    if (test)
    {
        try
        {
            main.calc();
            settings.lastCheckCombatReport = getBashTimespan();
            settings.lastCheckSpyReport = getBashTimespan();
        }
        catch (ex)
        {
            console.log("Error Test Function: " + ex);
        }
    }
}

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
        case 'fr':
            setTranslationVars('Pas de risque', 'de bash', 'Risque de bash', 'attaque', 'attaques');
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

function addEventSendFleet(fleetPage)
{
    var elementId = "continue";
    if (fleetPage == 3)
        elementId = "start";

    var sendFleetButton = document.getElementById(elementId);
    if (sendFleetButton)
    {
        sendFleetButton.addEventListener("click", checkAttackSendShips, false);
        sendFleetPage = fleetPage;
    }
}

function addEventListenersToPage()
{
    if(/page=fleet3/.test(location.href))
        addEventSendFleet(3);
    else if(/page=fleet2/.test(location.href))
        addEventSendFleet(2);
    else if(/page=fleet1/.test(location.href))
        addEventSendFleet(1);
    else
        sendFleetPage = -1;
}

function coordToUrl(coord)
{
	 var coordClean = coord.substring(1, coord.length-1);
	 var coordTab = coordClean.split(":");
	 return '/game/index.php?page=galaxy&galaxy='+coordTab[0]+'&system='+coordTab[1]+'&position='+coordTab[2] ;
}

function checkAttackSendShips()
{
    //on send ships read all the data to know what is sended
    var sendFleet;
    if (sendFleetPage == 1)
    {
        sendFleet = new SendFleet();
        sendFleet.storageKey = 'SendFleetMemory';
    }
    else if (sendFleetPage > 1)
        sendFleet = new SendFleet('SendFleetMemory');
    else
        return;
    sendFleet.parse(sendFleetPage);
    if (sendFleetPage > -1)
    {
        if (sendFleetPage < 3)
            sendFleet.write();
        else
        {
            sendFleet.storageKey = null;
            sendFleetList.add(sendFleet);
            sendFleetList.write();
        }
    }
}

function checkRaidFinished()
{
    try
    {
        main.stop();
    }
    catch (ex)
    {
        console.log(ex);
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

function createHiddenDiv(id)
{
    // create and hidden div for result storing and parsing
    var div = createDiv(id);
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

function deleteOldReports(reportList, lastDate)
{
    var i = reportList.length - 1;
    while (i > 0)
    {
        if (reportList[i].info.date.getTime() < lastDate.getTime())
        {
            reportList.splice(i, 1);
        }
        i--;
    }
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
        log(main);
        var attackTracker = main.combatReports.getAttacks();
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
        htmlCount += main.totalRessources.toHtml('Raid-Ressources', 'attackContent', 'RaidRessources');
        htmlCount += main.totalRessources.toHtml('Lost-Ressources', 'attackContent', 'LostRessources');
        htmlCount += main.totalRessources.toHtml('Total-Ressources', 'attackContent', 'Total');

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

function flatten(obj) {
    var result = Object.create(obj);
    for(var key in result) {
        result[key] = result[key];
    }
    return result;
}

function getBashTimespan(addMinutes)
{
    var date = new Date();
    date.setDate(date.getDate() - 1);
    if (addMinutes)
        date.setTime(date.getTime() + addMinutes * 60 * 1000);
    return date;
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
        try
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
                    log('Error on getMessageAsync');
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
                            if (result == 1 && asyncHelper.currentPage <= asyncHelper.maxPage) // load the other pages recursiv
                            {
                                if (asyncHelper.currentPage <= asyncHelper.maxPage)
                                    getMessageAsync();
                            }
                            else if (result === 0 || asyncHelper.currentPage > asyncHelper.maxPage)
                            {
                                switch (asyncHelper.tabId)
                                {
                                    case TABID_SPY_REPORT:
                                        main.spyReports.saveToLocalStorage();
                                        asyncHelper.clearAsync();
                                        asyncHelper.startAsync(TABID_COMBAT_REPORT);
                                        getMessageAsync();
                                        break;
                                    case TABID_COMBAT_REPORT:
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
                        console.log("Error on getMessageAsync() -> success: " + ex);
                    }
                }
            });
        }
        catch (ex)
        {
            console.log("Error on getMessageAsync: " + ex);
        }
    }
}

function getMessageDetailsAsync(msgId) {
    try
    {
        return $.ajax({
            type:     'GET',
            url:      '/game/index.php?page=messages',
            data:     'messageId='+msgId+'&tabid='+TABID_COMBAT_REPORT+'&ajax=1',
            dataType: 'html',
            context:  document.body,
            global:   false,
            async:    true,
            error:    function(jqXHR, exception) {
                console.log(jqXHR);
                console.log(exception);
                setStatus('Error on getMessageDetailsAsync: ' + exception);
            },
            success:  function(data) {
                var result = -1;
                try
                {
                    var div = document.getElementById("parseCombatReportDetail");
                    if (div)
                    {
                        div.innerHTML = data;

                        var detailMessage = div.getElementsByClassName('detail_msg')[0];
                        if (detailMessage)
                        {
                            var combatReportId = parseInt(detailMessage.getAttribute('data-msg-id'));
                            var idx = main.combatReports.reports.findIndex(cr => parseInt(cr.info.id) == combatReportId);
                            var detailReport = detailMessage.getElementsByClassName('detailReport')[0];
                            if (idx > -1)
                            {
                                if (detailReport)
                                {
                                    var firstSplit = data.split(".parseJSON('")[1];
                                    if (firstSplit)
                                    {
                                        var json = firstSplit.split("');")[0];
                                        main.combatReports.reports[idx].details = jQuery.parseJSON(json);
                                        main.combatReports.reports[idx].detailsLoaded(main.spyReports);
                                    }
                                }
                            }
                        }
                        div.innerHTML = '';
                    }
                    else
                        console.log('div "parseCombatReportDetail" not found');

                    main.combatReports.detailsLoadCount--;
                }
                catch(ex)
                {
                    main.combatReports.detailsLoadCount--;
                    console.log('Error on getMessageDetailsAsync('+msgId+'): ' + ex);
                }
                finally
                {
                    main.stop();
                }
            }
        });
    }
    catch (ex)
    {
        console.log('Error on getMessageDetailsAsync: ' + ex);
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
    }
    return date > fLastCheck;
}

function loadData()
{
    localeSettings.load();
    translate();
    settings.load();
    main.load();
    versionCheck();

    if (main.spyReports.count === 0)
    {
        settings.lastCheckSpyReport = getBashTimespan();
        loadInfo();
    }
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

    calculateRess = true;
    main.start();
    displayLoadingGif();

    // start search for inactive players -> async
    asyncHelper.startAsync(TABID_SPY_REPORT); // set the start values for the async process
    getMessageAsync();
}

function onLoadPage()
{
    var result = false;
    if(/page=message/.test(location.href))
    {
        var fleetsDiv = document.getElementById('fleetsTab');
        if (fleetsDiv && !main.reading)
        {
            log('start loading');
            main.start();
            try
            {
                var msgList = fleetsDiv.getElementsByClassName('msg');
                if (msgList[0])
                {
                    for (var i = 0; i < msgList.length; i++)
                    {
                        // is a combat report page loaded
                        if (msgList[i].getElementsByClassName('combatLeftSide')[0])
                        {
                            var combatReport = new CombatReport(msgList[i]);
                            main.combatReports.add(combatReport);
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
                                var recycleReport = new RecycleReport(msgList[i]);
                                if (recycleReport.ressources)
                                    main.recycleReports.add(recycleReport);
                            }
                        }
                    }
                    main.stop();
                    result = true;
                }
            }
            catch (ex)
            {
                console.log('Error on onLoadPage(): ' + ex);
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

        for (var i = 0; i < collEnfants.length; i++)
        {
            var combatReport = new CombatReport(collEnfants[i]);
            if (page == 1 && i === 0)
                asyncHelper.lastCheck = combatReport.info.date;

            if (!isAppendedToday(combatReport.info.date, isSpyReport))
            {
                result = false;
                break;
            }
            main.combatReports.add(combatReport);
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
    var report = new SpyReport(msg);
    return main.spyReports.add(report);
}

function readSpyReports(page)
{
    var result = true;

    var messageList = document.getElementsByClassName('msg ');
    if (messageList)
    {
        for (var i = 0; i < messageList.length; i++)
        {
            var msgDate = new ReportInfo(messageList[i]);
            if (page == 1 && i === 0)
            {
                asyncHelper.lastCheck = msgDate.date;
            }

            if (isAppendedToday(msgDate.date, true))
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
    if (!RESET_COOKIES || true)
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

// initialize the script and load some informations from Locale Storage
function startScript()
{
    try
    {
        addEventListenersToPage();

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
        createHiddenDiv("verificationAttaque");
        createHiddenDiv("parseCombatReportDetail");

        loadData();
        setInterval(onLoadPage, 400);
        display();

        testIt();
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

function versionCheck()
{
    //settings.lastVersion = "3.3.0.22"; // debug test
    if (settings.isNewVersion())
    {
        log('New Version detected!');
        var comp = compareVersion(VERSION_SCRIPT, VERSION_SCRIPT_RESET);
        if (comp <= 0) // no reset
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
}

function writeToLocalStorage(obj, key)
{
    var json = JSON.stringify(obj);
    try
    {
        var testObj = JSON.parse(json);
        GM_setValue('CheckAttack_' + key, json);
    }
    catch (ex) {} // do nothing, but prevent error messages
}

// execute script
startScript();
